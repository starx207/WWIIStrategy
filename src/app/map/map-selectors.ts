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
import { parseSquadId, planMovingUnits } from './rules/movement-execution';
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

/**
 * A unit carried by the selected transport squad, tagged by when it boarded. `carried-over` units
 * loaded on a previous turn and may elect to stay aboard during a combat unload; `loaded-this-phase`
 * units have a planned load this phase and, in the combat phase, cannot stay aboard when unloading.
 */
export interface TransportCargoUnit {
  id: string;
  type: UnitType;
  provenance: 'carried-over' | 'loaded-this-phase';
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
 * them. This resolves each planned load to the boarding units (honoring a detachment's `unitIds`, so
 * a subset load only accounts for the units actually boarding) so the map can hide them at their
 * origin and show their types on the target transport's cargo badge right away. Also used to charge
 * planned loads against a transport's remaining capacity so it can't be overcommitted.
 */
export function collectPlannedLoads(
  movementPlansBySquadId: Record<string, SquadMovementPlan>,
  unitsByTerritoryName: Partial<Record<TerritoryName, MilitaryUnit[]>>,
): {
  hiddenUnitIds: Set<string>;
  cargoTypesByTransportId: Record<string, UnitType[]>;
} {
  const hiddenUnitIds = new Set<string>();
  const cargoTypesByTransportId: Record<string, UnitType[]> = {};
  for (const plan of Object.values(movementPlansBySquadId)) {
    const terminal = plan.path[plan.path.length - 1];
    if (terminal?.cargo?.role !== 'load') {
      continue;
    }
    const squad = parseSquadId(plan.squadId);
    if (!squad) {
      continue;
    }
    const boarding = planMovingUnits(
      unitsByTerritoryName[plan.startingTerritoryName] ?? [],
      squad,
      plan,
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
    const plannedLoads = collectPlannedLoads(
      state.movementPlansBySquadId,
      state.unitsByTerritoryName,
    );
    const hiddenUnitIds = new Set([
      ...allCargoUnitIds(state.cargoByCarrierUnitId),
      ...allAmphibiousUnitIds(state.amphibiousAssaultsByTerritory),
      ...plannedLoads.hiddenUnitIds,
    ]);
    // Units allocated to a detachment (subset) plan are peeled out of their stack into that plan's
    // own squad, so the stack renders as the unallocated remainder plus one squad per detachment.
    const detachmentByUnitId = new Map<string, string>();
    for (const [squadId, plan] of Object.entries(state.movementPlansBySquadId)) {
      for (const unitId of plan.unitIds ?? []) {
        detachmentByUnitId.set(unitId, squadId);
      }
    }
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
            detachmentByUnitId,
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
    const activePlanKey = state.selectedSquad?.activePlanKey;
    return activePlanKey ? state.movementPlansBySquadId[activePlanKey] : undefined;
  }

  /**
   * How many units of the selected stack are available to split into the next order (the
   * unallocated remainder). Zero when no eligible split is possible: nothing selected, a
   * transport/carrier (cargo splitting is a separate workstream), or an order already underway
   * (its first step locks the detachment). The detachment picker shows only when this exceeds 1.
   */
  @Selector([MapState])
  static selectedSquadDetachableCount(state: MapStateModel): number {
    const selected = state.selectedSquad;
    if (!selected) {
      return 0;
    }
    const parsed = parseSquadId(selected.id);
    if (
      !parsed ||
      parsed.unitType === UnitType.TRANSPORT ||
      parsed.unitType === UnitType.AIRCRAFT_CARRIER
    ) {
      return 0;
    }
    const plan = state.movementPlansBySquadId[selected.activePlanKey];
    if ((plan?.path.length ?? 0) > 0) {
      return 0;
    }
    return selected.unitIds.length;
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
    if ((state.movementPlansBySquadId[selected.activePlanKey]?.path.length ?? 0) > 0) {
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

    const selectedPlan = state.movementPlansBySquadId[selectedSquad.activePlanKey];
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

    const selectedPlan = state.movementPlansBySquadId[selectedSquad.activePlanKey];
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

    const plan = state.movementPlansBySquadId[selectedSquad.activePlanKey];

    if (LAND_UNIT_TYPES.includes(parsed.unitType)) {
      // A land squad that has already spent movement can no longer load (its move is committed).
      if ((plan?.path.length ?? 0) > 0) {
        return empty;
      }
      // Baseline: any adjacent sea zone whose transport could accept at least one unit of this type.
      // The exact chosen split count is applied as a reactive filter in the map component
      // (GameMap.loadTargets), since a selector can't read the transient detachment-count signal.
      const adjacent = ADJACENT_TERRITORIES_BY_NAME[selectedTerritory] ?? [];
      const committedUnitIds = new Set(state.combatCommittedUnitIds);
      const plannedCargoTypesByTransportId = collectPlannedLoads(
        state.movementPlansBySquadId,
        state.unitsByTerritoryName,
      ).cargoTypesByTransportId;
      const load = adjacent.filter((territory) =>
        findLoadableTransport({
          fromTerritory: selectedTerritory,
          seaZone: territory,
          cargoUnitCount: 1,
          cargoUnitType: parsed.unitType,
          nation,
          unitsByTerritory: state.unitsByTerritoryName,
          cargoByCarrierUnitId: state.cargoByCarrierUnitId,
          committedUnitIds,
          plannedCargoTypesByTransportId,
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

  /**
   * The units the selected transport squad is carrying (or about to carry via a planned load this
   * phase), tagged by provenance, for the unload picker. Empty unless a transport squad with cargo is
   * selected. Carried-over units already sit in the transport's sea zone; loaded-this-phase units are
   * still at their origin as deferred load plans, so both are resolved from their respective places.
   */
  @Selector([MapState])
  static selectedTransportCargo(state: MapStateModel): TransportCargoUnit[] {
    const selected = state.selectedSquad;
    if (!selected) {
      return [];
    }
    const parsed = parseSquadId(selected.id);
    const selectedTerritory = selected.id.split('|')[1] as TerritoryName | undefined;
    if (!parsed || parsed.unitType !== UnitType.TRANSPORT || !selectedTerritory) {
      return [];
    }

    const transportIds = new Set(selected.unitIds);
    const seaUnitsById = new Map(
      (state.unitsByTerritoryName[selectedTerritory] ?? []).map((unit) => [unit.id, unit]),
    );

    // Carried-over cargo: ids already recorded against this squad's transports, physically co-located
    // with the transport in its sea zone.
    const carriedOver: TransportCargoUnit[] = [];
    for (const transportId of selected.unitIds) {
      for (const cargoId of state.cargoByCarrierUnitId[transportId] ?? []) {
        const unit = seaUnitsById.get(cargoId);
        if (unit) {
          carriedOver.push({ id: unit.id, type: unit.type, provenance: 'carried-over' });
        }
      }
    }

    // Loaded-this-phase: deferred load plans whose terminal step targets one of this squad's transports.
    const loadedThisPhase: TransportCargoUnit[] = [];
    for (const plan of Object.values(state.movementPlansBySquadId)) {
      const terminal = plan.path[plan.path.length - 1];
      if (terminal?.cargo?.role !== 'load' || !transportIds.has(terminal.cargo.transportId)) {
        continue;
      }
      const squad = parseSquadId(plan.squadId);
      if (!squad) {
        continue;
      }
      const boarding = planMovingUnits(
        state.unitsByTerritoryName[plan.startingTerritoryName] ?? [],
        squad,
        plan,
      );
      for (const unit of boarding) {
        loadedThisPhase.push({ id: unit.id, type: unit.type, provenance: 'loaded-this-phase' });
      }
    }

    return [...carriedOver, ...loadedThisPhase];
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
  detachmentByUnitId: Map<string, string> = new Map(),
): MilitaryUnitSquad<MilitaryUnit>[] {
  // Loaded cargo (and units staged for an amphibious assault) are shown on their carrier / not at all.
  const renderableUnits = units.filter((unit) => !hiddenUnitIds.has(unit.id));

  // Group by detachment plan key when a unit is allocated to one, else by nationality|type. This
  // yields the base remainder squad plus one squad per detachment sharing the territory.
  const groups = renderableUnits.reduce<SquadGroups>((currentGroups, unit) => {
    const groupKey = detachmentByUnitId.get(unit.id) ?? `${unit.nationality}|${unit.type}`;
    currentGroups[groupKey] = [...(currentGroups[groupKey] ?? []), unit];
    return currentGroups;
  }, {});

  // Cargo units are hidden from squads but stay in the territory's unit array, so their types are
  // resolvable here by looking up each carrying unit's loaded ids against `units`.
  const unitById = new Map(units.map((unit) => [unit.id, unit]));

  return Object.entries(groups)
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
    .map(([groupKey, squadUnits]) => {
      // A detachment group's key is already a full squad id (`map-squad|…|d<n>`); a base group's key
      // is `nationality|type`. Nationality/type are the same across the group, so read them off a
      // member. Transports/carriers are never split, so a detachment group never carries cargo.
      const isDetachmentGroup = groupKey.startsWith('map-squad|');
      const { nationality, type: unitType } = squadUnits[0];
      const squadId = isDetachmentGroup
        ? groupKey
        : `map-squad|${territoryName}|${nationality}|${unitType}`;
      const cargo: UnitType[] =
        !isDetachmentGroup &&
        (unitType === UnitType.AIRCRAFT_CARRIER || unitType === UnitType.TRANSPORT)
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
      return new MilitaryUnitSquad(squadUnits, squadId, undefined, cargo);
    });
}
