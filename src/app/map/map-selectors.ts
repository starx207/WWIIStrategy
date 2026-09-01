import { Selector } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { MapState, MapStateModel, SquadMovementPlan } from './map-state';
import { LandTerritoryName, TerritoryName } from '../territories/territory-names';
import { Nationality } from '@ww2/shared/nationality';
import { UnitType } from '@ww2/shared/unit-type';
import { CargoByCarrierUnitId, allCargoUnitIds } from './rules/carrier-cargo';
import { allAmphibiousUnitIds } from './rules/amphibious';
import { calculateAdjacentDestinations } from './rules/movement-calculator';
import { createResolvedRuleContext } from './rule-context.factory';
import { RuleState } from '@ww2/settings/settings-state';
import { SettingsSelectors } from '@ww2/settings/settings-selectors';
import { getMaxMovement } from './effective-map-unit.reducer';
import { Coordinate } from 'ol/coordinate';
import { GameSelectors } from '@ww2/game/game-selectors';
import { TurnPhase } from '@ww2/game/turn-phase';

export type SelectedSquadState = NonNullable<MapStateModel['selectedSquad']>;

type SquadGroups = Record<string, MilitaryUnit[]>;

export class MapSelectors {
  @Selector([MapState])
  static squadsByTerritoryName(
    state: MapStateModel,
  ): Record<TerritoryName, MilitaryUnitSquad<MilitaryUnit>[]> {
    const hiddenUnitIds = new Set([
      ...allCargoUnitIds(state.cargoByCarrierUnitId),
      ...allAmphibiousUnitIds(state.amphibiousAssaultsByTerritory),
    ]);
    return Object.fromEntries(
      Object.entries(state.unitsByTerritoryName)
        .map(([territoryName, units]) => [
          territoryName,
          createMapSquads(
            territoryName as TerritoryName,
            units ?? [],
            state.cargoByCarrierUnitId,
            hiddenUnitIds,
          ),
        ])
        .filter(([, squads]) => squads.length > 0),
    ) as Record<TerritoryName, MilitaryUnitSquad<MilitaryUnit>[]>;
  }

  @Selector([MapState])
  static cargoByCarrierUnitId(state: MapStateModel): CargoByCarrierUnitId {
    return state.cargoByCarrierUnitId;
  }

  @Selector([MapState])
  static amphibiousAssaultsByTerritory(
    state: MapStateModel,
  ): Partial<Record<LandTerritoryName, string[]>> {
    return state.amphibiousAssaultsByTerritory;
  }

  @Selector([MapState])
  static selectedSquad(state: MapStateModel): SelectedSquadState | undefined {
    return state.selectedSquad;
  }

  @Selector([MapState])
  static movementPlansBySquadId(state: MapStateModel): Record<string, SquadMovementPlan> {
    return state.movementPlansBySquadId;
  }

  @Selector([MapState])
  static squadLayoutCoordinatesBySquadId(state: MapStateModel): Record<string, Coordinate> {
    return state.squadLayoutCoordinatesBySquadId;
  }

  @Selector([MapState])
  static movementPlans(state: MapStateModel): SquadMovementPlan[] {
    return Object.values(state.movementPlansBySquadId);
  }

  @Selector([MapState])
  static selectedSquadMovementPlan(state: MapStateModel): SquadMovementPlan | undefined {
    const selectedSquadId = state.selectedSquad?.id;
    return selectedSquadId ? state.movementPlansBySquadId[selectedSquadId] : undefined;
  }

  @Selector([MapState])
  static hasMovementPlansWithPath(state: MapStateModel): boolean {
    return Object.values(state.movementPlansBySquadId).some((plan) => plan.path.length > 0);
  }

  @Selector([MapState, SettingsSelectors.rules, GameSelectors.turnPhase])
  static selectedSquadRemainingMovement(
    state: MapStateModel,
    rulesState: RuleState,
    turnPhase: TurnPhase,
  ): number {
    const selectedSquad = state.selectedSquad;
    if (!selectedSquad || selectedSquad.unitIds.length === 0) {
      return 0;
    }

    const selectedPlan = state.movementPlansBySquadId[selectedSquad.id];
    if (!selectedPlan) {
      return 0;
    }

    const { unit } = findTerritoryForUnitId(state, selectedSquad.unitIds[0]);
    if (!unit) {
      return 0;
    }

    return Math.max(
      0,
      getMaxMovement(unit, createResolvedRuleContext(state, turnPhase, rulesState)) -
        selectedPlan.path.length,
    );
  }

  @Selector([MapState, SettingsSelectors.rules, GameSelectors.turnPhase])
  static selectedSquadNextAdjacentDestinations(
    state: MapStateModel,
    rulesState: RuleState,
    turnPhase: TurnPhase,
  ): TerritoryName[] {
    const selectedSquad = state.selectedSquad;
    if (!selectedSquad || selectedSquad.unitIds.length === 0) {
      return [];
    }

    const selectedPlan = state.movementPlansBySquadId[selectedSquad.id];
    const { unit } = findTerritoryForUnitId(state, selectedSquad.unitIds[0]);
    if (!unit) {
      return [];
    }

    return calculateAdjacentDestinations(
      unit,
      selectedPlan,
      createResolvedRuleContext(state, turnPhase, rulesState),
    );
  }

  @Selector([MapState])
  static invalidMovementPlanCount(state: MapStateModel): number {
    return Object.values(state.movementPlansBySquadId).filter((plan) => !plan.isValid).length;
  }

  @Selector([MapState])
  static landTerritoryControllerByName(
    state: MapStateModel,
  ): Record<LandTerritoryName, Nationality> {
    return state.landTerritoryControllerByName;
  }

  @Selector([MapState])
  static unitsByTerritoryName(
    state: MapStateModel,
  ): Partial<Record<TerritoryName, MilitaryUnit[]>> {
    return state.unitsByTerritoryName;
  }

  @Selector([MapState])
  static pendingCapturesByTerritory(
    state: MapStateModel,
  ): Partial<Record<LandTerritoryName, Nationality>> {
    return state.pendingCapturesByTerritory;
  }
}

function findTerritoryForUnitId(
  state: MapStateModel,
  unitId: string,
): { territoryName?: TerritoryName; unit?: MilitaryUnit } {
  for (const [territoryName, units] of Object.entries(state.unitsByTerritoryName)) {
    if (!units) {
      continue;
    }
    const foundUnit = units.find((unit) => unit.id === unitId);
    if (foundUnit) {
      return { territoryName: territoryName as TerritoryName, unit: foundUnit };
    }
  }
  return {};
}

function createMapSquads(
  territoryName: TerritoryName,
  units: MilitaryUnit[],
  cargoByCarrierUnitId: CargoByCarrierUnitId,
  hiddenUnitIds: Set<string>,
): MilitaryUnitSquad<MilitaryUnit>[] {
  // Loaded cargo (and units staged for an amphibious assault) are shown on their carrier / not at all.
  const renderableUnits = units.filter((unit) => !hiddenUnitIds.has(unit.id));

  const groups = renderableUnits.reduce<SquadGroups>((currentGroups, unit) => {
    const groupKey = `${unit.nationality}|${unit.type}`;
    currentGroups[groupKey] = [...(currentGroups[groupKey] ?? []), unit];
    return currentGroups;
  }, {});

  // Cargo units are hidden from squads but stay in the territory's unit array, so their types are
  // resolvable here by looking up each carrying unit's loaded ids against `units`.
  const unitById = new Map(units.map((unit) => [unit.id, unit]));

  return Object.entries(groups)
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
    .map(([groupKey, squadUnits]) => {
      const [nationality, unitType] = groupKey.split('|');
      const cargo: UnitType[] =
        unitType === UnitType.AIRCRAFT_CARRIER || unitType === UnitType.TRANSPORT
          ? squadUnits.flatMap((carrier) =>
              (cargoByCarrierUnitId[carrier.id] ?? []).flatMap((cargoId) => {
                const cargoUnit = unitById.get(cargoId);
                return cargoUnit ? [cargoUnit.type] : [];
              }),
            )
          : [];
      return new MilitaryUnitSquad(
        squadUnits,
        `map-squad|${territoryName}|${nationality}|${unitType}`,
        undefined,
        cargo,
      );
    });
}
