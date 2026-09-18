import { Selector } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { MapState, MapStateModel, SquadMovementPlan } from './map-state';
import { LandTerritoryName, TerritoryName } from '../territories/territory-names';
import { ADJACENT_TERRITORIES_BY_NAME } from '../territories/territory-adjacency';
import { NATION_ALLIANCE, Nationality } from '@ww2/shared/nationality';
import { LAND_UNIT_TYPES, UnitType } from '@ww2/shared/unit-type';
import { CargoByCarrierUnitId, allCargoUnitIds } from './rules/carrier-cargo';
import {
  allAmphibiousUnitIds,
  canUnloadTo,
  findLoadableTransport,
  plannedTransportSeaPosition,
} from './rules/amphibious';
import { calculateAdjacentDestinations } from './rules/movement-calculator';
import { parseSquadId } from './rules/movement-execution';
import { createResolvedRuleContext } from './rule-context.factory';
import { RuleState } from '@ww2/settings/settings-state';
import { SettingsSelectors } from '@ww2/settings/settings-selectors';
import { getMaxMovement } from './effective-map-unit.reducer';
import { Coordinate } from 'ol/coordinate';
import { GameSelectors } from '@ww2/game/game-selectors';
import { GamePhase, nationalityForGamePhase } from '@ww2/game/game-phase';
import { TurnPhase } from '@ww2/game/turn-phase';
import { INITIAL_LAND_TERRITORY_CONTROL } from './initial-map-layout';

export type SelectedSquadState = NonNullable<MapStateModel['selectedSquad']>;

/** Territories the selected squad can load onto / unload into, split by kind for distinct map cues. */
export interface SquadCargoDestinations {
  load: TerritoryName[];
  unload: TerritoryName[];
}

type SquadGroups = Record<string, MilitaryUnit[]>;

/** Whether a transport squad will hold cargo when its plan executes — already loaded, or a load
 * step planned this phase targets one of its transports. */
function transportWillHaveCargo(state: MapStateModel, transportUnitIds: string[]): boolean {
  if (transportUnitIds.some((id) => (state.cargoByCarrierUnitId[id] ?? []).length > 0)) {
    return true;
  }
  const ids = new Set(transportUnitIds);
  return Object.values(state.movementPlansBySquadId).some((plan) => {
    const terminal = plan.path[plan.path.length - 1];
    return terminal?.cargo?.role === 'load' && ids.has(terminal.cargo.transportId);
  });
}

function isHostileCoast(
  state: MapStateModel,
  territory: TerritoryName,
  nation: Nationality,
): boolean {
  const controller = state.landTerritoryControllerByName[territory as LandTerritoryName];
  return controller !== undefined && NATION_ALLIANCE[controller] !== NATION_ALLIANCE[nation];
}

/**
 * A deferred load step (a land squad's plan whose terminal step targets a transport) doesn't
 * physically move its units until phase exit — but the transport should already read as carrying
 * them. This resolves each planned load to the boarding units so the map can hide them at their
 * origin and show their types on the target transport's cargo badge right away.
 */
function collectPlannedLoads(state: MapStateModel): {
  hiddenUnitIds: Set<string>;
  cargoTypesByTransportId: Record<string, UnitType[]>;
} {
  const hiddenUnitIds = new Set<string>();
  const cargoTypesByTransportId: Record<string, UnitType[]> = {};
  for (const plan of Object.values(state.movementPlansBySquadId)) {
    const terminal = plan.path[plan.path.length - 1];
    if (terminal?.cargo?.role !== 'load') {
      continue;
    }
    const squad = parseSquadId(plan.squadId);
    if (!squad) {
      continue;
    }
    const boarding = (state.unitsByTerritoryName[plan.startingTerritoryName] ?? []).filter(
      (unit) => unit.nationality === squad.nationality && unit.type === squad.unitType,
    );
    const transportId = terminal.cargo.transportId;
    for (const unit of boarding) {
      hiddenUnitIds.add(unit.id);
      (cargoTypesByTransportId[transportId] ??= []).push(unit.type);
    }
  }
  return { hiddenUnitIds, cargoTypesByTransportId };
}

export class MapSelectors {
  @Selector([MapState])
  static squadsByTerritoryName(
    state: MapStateModel,
  ): Record<TerritoryName, MilitaryUnitSquad<MilitaryUnit>[]> {
    const plannedLoads = collectPlannedLoads(state);
    const hiddenUnitIds = new Set([
      ...allCargoUnitIds(state.cargoByCarrierUnitId),
      ...allAmphibiousUnitIds(state.amphibiousAssaultsByTerritory),
      ...plannedLoads.hiddenUnitIds,
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
            plannedLoads.cargoTypesByTransportId,
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

  /**
   * Whether Undo / Clear Squad should be enabled for the selected squad: it has its own planned
   * steps, or (for a transport) a deferred load onto it — which lives on the boarding land squad's
   * plan but is reversible from the transport (see UndoSquadMovementStep).
   */
  @Selector([MapState])
  static selectedSquadCanUndo(state: MapStateModel): boolean {
    const selected = state.selectedSquad;
    if (!selected) {
      return false;
    }
    if ((state.movementPlansBySquadId[selected.id]?.path.length ?? 0) > 0) {
      return true;
    }
    const ids = new Set(selected.unitIds);
    return Object.values(state.movementPlansBySquadId).some((plan) => {
      const terminal = plan.path[plan.path.length - 1];
      return terminal?.cargo?.role === 'load' && ids.has(terminal.cargo.transportId);
    });
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

  /**
   * Territories the selected squad could load onto / unload into, tagged by kind so the map can
   * color them distinctly. `load` = adjacent sea zones holding a same-nation transport with room
   * (offered only while the land squad still has unspent movement). `unload` = coasts adjacent to the
   * transport's *planned* final sea position, once it will hold cargo — **friendly** coasts during
   * non-combat move, **hostile** coasts (an amphibious assault) during combat move. Disjoint from
   * `selectedSquadNextAdjacentDestinations` (cross-kind moves are never ordinary destinations) —
   * mirrors the guards in `GameMap.tryLoadOrUnload`.
   */
  @Selector([MapState, GameSelectors.gamePhase, GameSelectors.turnPhase])
  static selectedSquadCargoDestinations(
    state: MapStateModel,
    gamePhase: GamePhase,
    turnPhase: TurnPhase,
  ): SquadCargoDestinations {
    const empty: SquadCargoDestinations = { load: [], unload: [] };
    const selectedSquad = state.selectedSquad;
    if (!selectedSquad || selectedSquad.unitIds.length === 0) {
      return empty;
    }

    const parsed = parseSquadId(selectedSquad.id);
    const selectedTerritory = selectedSquad.id.split('|')[1] as TerritoryName | undefined;
    const nation = nationalityForGamePhase(gamePhase);
    if (!parsed || !selectedTerritory || !nation) {
      return empty;
    }

    const plan = state.movementPlansBySquadId[selectedSquad.id];

    if (LAND_UNIT_TYPES.includes(parsed.unitType)) {
      // A land squad that has already spent movement can no longer load (its move is committed).
      if ((plan?.path.length ?? 0) > 0) {
        return empty;
      }
      const adjacent = ADJACENT_TERRITORIES_BY_NAME[selectedTerritory] ?? [];
      const load = adjacent.filter((territory) =>
        findLoadableTransport({
          fromTerritory: selectedTerritory,
          seaZone: territory,
          cargoUnitCount: selectedSquad.unitIds.length,
          nation,
          unitsByTerritory: state.unitsByTerritoryName,
          cargoByCarrierUnitId: state.cargoByCarrierUnitId,
        }),
      );
      return { load, unload: [] };
    }

    if (parsed.unitType === UnitType.TRANSPORT) {
      // One unload target per plan; the player undoes to change it.
      if (plan && plan.path.at(-1)?.cargo) {
        return empty;
      }
      if (!transportWillHaveCargo(state, selectedSquad.unitIds)) {
        return empty;
      }
      const seaPosition = plannedTransportSeaPosition(plan, selectedTerritory);
      const adjacent = ADJACENT_TERRITORIES_BY_NAME[seaPosition] ?? [];
      // Combat move authors amphibious assaults (hostile coasts); non-combat move lands cargo on
      // friendly coasts. The materialization pass for each phase routes the unload accordingly.
      const wantHostile = turnPhase === TurnPhase.COMBAT_MOVEMENT;
      const unload = adjacent.filter(
        (territory) =>
          canUnloadTo(seaPosition, territory) &&
          isHostileCoast(state, territory, nation) === wantHostile,
      );
      return { load: [], unload };
    }

    return empty;
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

  /** Units that combat-moved or staged an amphibious assault this turn — locked out of non-combat
   * movement. See MapActions.RecordCombatCommitments. */
  @Selector([MapState])
  static combatCommittedUnitIds(state: MapStateModel): string[] {
    return state.combatCommittedUnitIds;
  }

  /**
   * Land territories captured this game — current controller differs from
   * `INITIAL_LAND_TERRITORY_CONTROL` — that the controlling nation has since emptied of its own
   * units. Rendered on the map as a small emblem marker so a captured-then-vacated territory
   * still reads as under that nation's control, rather than looking untouched. A territory held
   * by the same nation since the start of the game never qualifies, regardless of occupancy.
   */
  @Selector([MapState])
  static capturedControlMarkers(
    state: MapStateModel,
  ): Partial<Record<LandTerritoryName, Nationality>> {
    const markers: Partial<Record<LandTerritoryName, Nationality>> = {};
    for (const [territory, controller] of Object.entries(state.landTerritoryControllerByName) as [
      LandTerritoryName,
      Nationality,
    ][]) {
      if (controller === INITIAL_LAND_TERRITORY_CONTROL[territory]) {
        continue;
      }
      const hasControllerUnit = (state.unitsByTerritoryName[territory] ?? []).some(
        (unit) => unit.nationality === controller,
      );
      if (!hasControllerUnit) {
        markers[territory] = controller;
      }
    }
    return markers;
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
  plannedCargoTypesByTransportId: Record<string, UnitType[]> = {},
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
          ? squadUnits.flatMap((carrier) => [
              ...(cargoByCarrierUnitId[carrier.id] ?? []).flatMap((cargoId) => {
                const cargoUnit = unitById.get(cargoId);
                return cargoUnit ? [cargoUnit.type] : [];
              }),
              // Units with a planned (not-yet-executed) load onto this transport already read as
              // aboard, so they show on its cargo badge while their origin tile hides them.
              ...(plannedCargoTypesByTransportId[carrier.id] ?? []),
            ])
          : [];
      return new MilitaryUnitSquad(
        squadUnits,
        `map-squad|${territoryName}|${nationality}|${unitType}`,
        undefined,
        cargo,
      );
    });
}
