import { Injectable } from '@angular/core';
import { Action, State, StateContext } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { NATION_ALLIANCE, Nationality } from '@ww2/shared/nationality';
import {
  INITIAL_CARGO_BY_CARRIER_UNIT_ID,
  INITIAL_LAND_TERRITORY_CONTROL,
  INITIAL_UNITS_BY_TERRITORY_NAME,
} from './initial-map-layout';
import { CargoByCarrierUnitId } from './rules/carrier-cargo';
import { LandTerritoryName, TerritoryName } from '../territories/territory-names';
import { MapActions } from './map-actions';
import { Coordinate } from 'ol/coordinate';
import { MovementPhase, TurnPhase } from '@ww2/game/turn-phase';
import {
  determineAircraftPathCombatTypes,
  determineMovementStepCombatType,
  territoryHasEngageableEnemy,
} from './rules/destination-rules';
import { AIR_UNIT_TYPES } from '@ww2/shared/unit-type';
import { isMovementPlanValid } from './rules/movement-validity';
import { executeAmphibiousCombatMovePlans, executeMovementPlans } from './rules/movement-execution';
import { resolveAutomaticCaptures } from './rules/auto-capture';
import { collectCombatCommittedUnitIds } from './rules/combat-commitments';

export type SquadMovementStepCombatType = 'none' | 'combat' | 'under-fire';

/**
 * Marks a movement step as a deferred amphibious logistics action rather than an ordinary move:
 * a land squad's terminal step into an adjacent sea zone means "load onto this transport"; a
 * transport's terminal step onto an adjacent land territory means "unload cargo here". These are
 * applied at phase exit (see `executeMovementPlans`), so they stay undoable like any other step.
 */
export type SquadMovementStepCargo = { role: 'load'; transportId: string } | { role: 'unload' };

export interface SquadMovementStep {
  territoryName: TerritoryName;
  coordinate: Coordinate;
  combatType: SquadMovementStepCombatType;
  // Aircraft only: the player manually designated this step as the combat engagement, overriding
  // the auto "last engageable enemy" pick. Survives path recompute so the choice sticks.
  manualCombat?: boolean;
  // Present on a terminal load/unload step; see SquadMovementStepCargo.
  cargo?: SquadMovementStepCargo;
}

export interface SquadMovementPlan {
  squadId: string;
  phase: MovementPhase;
  startingTerritoryName: TerritoryName;
  path: SquadMovementStep[];
  isValid: boolean;
  // A detachment (split): the specific units this plan moves. Absent = the whole stack (all
  // same-nation/type units at the origin) — the legacy whole-squad move, unchanged. When present,
  // the plan is keyed by a detachment-suffixed squad id (`map-squad|terr|nat|type|d<n>`).
  unitIds?: string[];
}

export interface MapStateModel {
  unitsByTerritoryName: Partial<Record<TerritoryName, MilitaryUnit[]>>;
  // TODO: Once we implement capturing territory, it will be important that the control does not transfer until the END of the turn.
  //       This is because movement rules for aircraft require friendly territories for airfields, so if we transfer control immediately upon capture,
  //       it would allow aircraft to land there, which is not the intended behavior. We'll likely need some sort of "captured territory" state that transfers to
  //       this mapping at the end of the turn.
  landTerritoryControllerByName: Record<LandTerritoryName, Nationality>;
  // Captures recorded during combat; transferred into landTerritoryControllerByName at end of turn.
  pendingCapturesByTerritory: Partial<Record<LandTerritoryName, Nationality>>;
  // Fighters loaded on carriers / land units loaded on transports: carrying unit id -> cargo ids.
  cargoByCarrierUnitId: CargoByCarrierUnitId;
  // Land units staged for an amphibious assault on a hostile coast: territory -> attacking unit ids.
  amphibiousAssaultsByTerritory: Partial<Record<LandTerritoryName, string[]>>;
  squadLayoutCoordinatesBySquadId: Record<string, Coordinate>;
  selectedSquad?: {
    // The derived squad clicked: a base stack id `map-squad|terr|nat|type` (the unallocated
    // remainder) or a detachment id `…|d<n>` (a subset already moving).
    id: string;
    // The units of that derived squad — for a base id this is the remainder (units allocated to
    // sibling detachment plans are hidden by `createMapSquads`), so a split can never re-use them.
    unitIds: string[];
    // The plan this squad's orders read/write. Starts equal to `id`; the first step of a split
    // migrates it to a freshly-minted detachment key.
    activePlanKey: string;
  };
  movementPlansBySquadId: Record<string, SquadMovementPlan>;
  // Units that combat-moved or staged an amphibious assault this turn — locked out of non-combat
  // movement. Cleared at the start of each nation's turn.
  combatCommittedUnitIds: string[];
}

const DEFAULT_STATE: MapStateModel = {
  unitsByTerritoryName: INITIAL_UNITS_BY_TERRITORY_NAME,
  landTerritoryControllerByName: INITIAL_LAND_TERRITORY_CONTROL,
  pendingCapturesByTerritory: {},
  cargoByCarrierUnitId: INITIAL_CARGO_BY_CARRIER_UNIT_ID,
  amphibiousAssaultsByTerritory: {},
  squadLayoutCoordinatesBySquadId: {},
  movementPlansBySquadId: {},
  combatCommittedUnitIds: [],
};

type MapStateContext = StateContext<MapStateModel>;

@State<MapStateModel>({
  name: 'map',
  defaults: DEFAULT_STATE,
})
@Injectable()
export class MapState {
  @Action(MapActions.SelectSquad)
  selectSquad(context: MapStateContext, action: MapActions.SelectSquad) {
    const state = context.getState();
    const squadId = action.squad.id;
    const selectedSquad = {
      id: squadId,
      unitIds: action.squad.units.map((unit) => unit.id),
      // Selecting a moving detachment edits its own plan; selecting a base stack starts a new order.
      activePlanKey: squadId,
    };
    const startingTerritoryName = findTerritoryForUnitId(state, selectedSquad.unitIds[0]);
    const existingPlan = state.movementPlansBySquadId[selectedSquad.activePlanKey];

    context.patchState({
      selectedSquad,
      // Eagerly create an empty plan under the base id so destination highlighting works before the
      // first step. Never do this for a detachment key (its plan already exists, and an empty plan
      // without unitIds under a suffixed key would move nothing).
      movementPlansBySquadId:
        existingPlan || !startingTerritoryName || isDetachmentSquadId(squadId)
          ? state.movementPlansBySquadId
          : {
              ...state.movementPlansBySquadId,
              [selectedSquad.activePlanKey]: {
                squadId: selectedSquad.activePlanKey,
                phase: action.phase,
                startingTerritoryName,
                path: [],
                isValid: true,
              },
            },
    });
  }

  @Action(MapActions.PlanSquadMovementStep)
  planSquadMovementStep(context: MapStateContext, action: MapActions.PlanSquadMovementStep) {
    const state = context.getState();
    const selectedSquad = state.selectedSquad;
    if (!selectedSquad) {
      return;
    }

    let activePlanKey = selectedSquad.activePlanKey;
    let plans = state.movementPlansBySquadId;
    let selectedPlan = plans[activePlanKey];
    if (!selectedPlan) {
      return;
    }

    // The split is decided on the FIRST step of an order, and only from a base stack (a detachment
    // that is already moving just keeps appending). Split off a detachment when the player asked to
    // move fewer than the remaining units, or when this stack already has sibling detachments (in
    // which case even a "move all the rest" order must bind its own units so execution doesn't grab
    // the whole stack and double-move the siblings' units).
    if (selectedPlan.path.length === 0 && !isDetachmentSquadId(activePlanKey)) {
      const baseId = activePlanKey;
      const remainder = selectedSquad.unitIds.length;
      const count = Math.max(1, Math.min(action.detachmentCount ?? remainder, remainder));
      if (count < remainder || hasSiblingDetachments(baseId, plans)) {
        const { [baseId]: _emptyBasePlan, ...rest } = plans;
        const detachmentKey = nextDetachmentKey(baseId, rest);
        activePlanKey = detachmentKey;
        plans = rest;
        selectedPlan = {
          squadId: detachmentKey,
          phase: selectedPlan.phase,
          startingTerritoryName: selectedPlan.startingTerritoryName,
          path: [],
          isValid: true,
          unitIds: selectedSquad.unitIds.slice(0, count),
        };
      }
    }

    // Aircraft only fight in a single destination, so combat type depends on the whole path (see
    // determineAircraftPathCombatTypes). Append the new step, then recompute the entire path.
    const appendedSteps: SquadMovementStep[] = [
      ...selectedPlan.path,
      {
        territoryName: action.territoryName,
        coordinate: [...action.coordinate],
        combatType: 'none',
        ...(action.cargo ? { cargo: action.cargo } : {}),
      },
    ];

    const unit = findUnitForSelectedSquad(state)!;
    const newPlan = {
      ...selectedPlan,
      path: withRecomputedCombatTypes(
        unit,
        appendedSteps,
        state.unitsByTerritoryName,
        state.landTerritoryControllerByName,
      ),
    };
    const isValid = isMovementPlanValid({
      unit: unit,
      plan: newPlan,
      unitsByTerritoryName: state.unitsByTerritoryName,
      landTerritoryControllerByName: state.landTerritoryControllerByName,
    });

    context.patchState({
      selectedSquad: { ...selectedSquad, activePlanKey },
      movementPlansBySquadId: {
        ...plans,
        [activePlanKey]: {
          ...newPlan,
          isValid: isValid,
        },
      },
    });
  }

  @Action(MapActions.UndoSquadMovementStep)
  undoSquadMovementStep(context: MapStateContext) {
    const state = context.getState();
    const selected = state.selectedSquad;
    const activePlanKey = selected?.activePlanKey;
    const selectedPlan = activePlanKey ? state.movementPlansBySquadId[activePlanKey] : undefined;

    if (!selected || !activePlanKey || !selectedPlan || selectedPlan.path.length === 0) {
      // Nothing to pop on the transport's own plan — but a load lives on the boarding land squad's
      // plan (that squad is hidden while aboard), so let Undo on the transport reverse the most
      // recent load, keeping load/move/unload undoable as one operation.
      if (selected) {
        const loadPlanIds = associatedLoadPlanSquadIds(state, selected.unitIds);
        if (loadPlanIds.length > 0) {
          const toRemove = loadPlanIds[loadPlanIds.length - 1];
          const { [toRemove]: _removedLoad, ...movementPlansBySquadId } =
            state.movementPlansBySquadId;
          context.patchState({ movementPlansBySquadId });
        }
      }
      return;
    }

    // Removing the last step can change which step is the aircraft's combat destination, so
    // recompute the remaining path's combat types rather than just slicing.
    const remainingSteps = selectedPlan.path.slice(0, -1);
    const unit = findUnitForSelectedSquad(state);

    // Undoing a detachment's last step dissolves it: drop the plan so its units rejoin the
    // remainder, and point the selection back at the base stack (recreating its empty highlight
    // plan) so the player can immediately re-order the reunited stack.
    if (remainingSteps.length === 0 && isDetachmentSquadId(activePlanKey)) {
      const baseId = baseSquadIdOf(activePlanKey);
      const { [activePlanKey]: _dissolved, ...rest } = state.movementPlansBySquadId;
      context.patchState({
        selectedSquad: { ...selected, activePlanKey: baseId },
        movementPlansBySquadId: rest[baseId]
          ? rest
          : {
              ...rest,
              [baseId]: {
                squadId: baseId,
                phase: selectedPlan.phase,
                startingTerritoryName: selectedPlan.startingTerritoryName,
                path: [],
                isValid: true,
              },
            },
      });
      return;
    }

    const newPlan = {
      ...selectedPlan,
      path: unit
        ? withRecomputedCombatTypes(
            unit,
            remainingSteps,
            state.unitsByTerritoryName,
            state.landTerritoryControllerByName,
          )
        : remainingSteps,
    };
    const isValid =
      unit &&
      isMovementPlanValid({
        unit: unit,
        plan: newPlan,
        unitsByTerritoryName: state.unitsByTerritoryName,
        landTerritoryControllerByName: state.landTerritoryControllerByName,
      });

    context.patchState({
      movementPlansBySquadId: {
        ...state.movementPlansBySquadId,
        [activePlanKey]: {
          ...newPlan,
          isValid: isValid ?? false,
        },
      },
    });
  }

  @Action(MapActions.SetAircraftCombatNode)
  setAircraftCombatNode(context: MapStateContext, action: MapActions.SetAircraftCombatNode) {
    const state = context.getState();
    const selectedSquad = state.selectedSquad;
    const selectedPlan = selectedSquad
      ? state.movementPlansBySquadId[selectedSquad.activePlanKey]
      : undefined;
    const unit = findUnitForSelectedSquad(state);

    if (
      !selectedSquad ||
      !selectedPlan ||
      !unit ||
      selectedSquad.id !== action.squadId ||
      selectedPlan.phase !== TurnPhase.COMBAT_MOVEMENT ||
      ![...AIR_UNIT_TYPES].includes(unit.type)
    ) {
      return;
    }

    const step = selectedPlan.path[action.stepIndex];
    if (
      !step ||
      step.combatType === 'combat' ||
      !territoryHasEngageableEnemy({
        unit,
        territory: step.territoryName,
        unitsByTerritoryName: state.unitsByTerritoryName,
      })
    ) {
      return;
    }

    const steps = selectedPlan.path.map((planStep, index) => ({
      ...planStep,
      manualCombat: index === action.stepIndex,
    }));

    const newPlan = {
      ...selectedPlan,
      path: withRecomputedCombatTypes(
        unit,
        steps,
        state.unitsByTerritoryName,
        state.landTerritoryControllerByName,
      ),
    };
    const isValid = isMovementPlanValid({
      unit: unit,
      plan: newPlan,
      unitsByTerritoryName: state.unitsByTerritoryName,
      landTerritoryControllerByName: state.landTerritoryControllerByName,
    });

    context.patchState({
      movementPlansBySquadId: {
        ...state.movementPlansBySquadId,
        [selectedSquad.activePlanKey]: {
          ...newPlan,
          isValid: isValid,
        },
      },
    });
  }

  @Action(MapActions.ClearSelectedSquadMovementPlan)
  clearSelectedSquadMovementPlan(context: MapStateContext) {
    const state = context.getState();
    const selected = state.selectedSquad;
    if (!selected) {
      return;
    }

    // Clear the active order's plan plus any loads onto it (a transport owns its whole operation),
    // so clearing a transport also releases the units it had queued to board.
    const toRemove = new Set<string>(associatedLoadPlanSquadIds(state, selected.unitIds));
    if (state.movementPlansBySquadId[selected.activePlanKey]) {
      toRemove.add(selected.activePlanKey);
    }
    if (toRemove.size === 0) {
      return;
    }

    const movementPlansBySquadId = Object.fromEntries(
      Object.entries(state.movementPlansBySquadId).filter(([squadId]) => !toRemove.has(squadId)),
    );
    // If we cleared a detachment, its units rejoin the remainder — repoint the selection at the base
    // stack so the reunited stack is immediately orderable again.
    const activePlanKey = isDetachmentSquadId(selected.activePlanKey)
      ? baseSquadIdOf(selected.activePlanKey)
      : selected.activePlanKey;
    context.patchState({
      movementPlansBySquadId,
      selectedSquad: { ...selected, activePlanKey },
    });
  }

  @Action(MapActions.ClearAllMovementPlans)
  clearAllMovementPlans(context: MapStateContext) {
    context.patchState({ movementPlansBySquadId: {} });
  }

  @Action(MapActions.SetSquadLayoutCoordinates)
  setSquadLayoutCoordinates(
    context: MapStateContext,
    action: MapActions.SetSquadLayoutCoordinates,
  ) {
    const state = context.getState();

    context.patchState({
      squadLayoutCoordinatesBySquadId: {
        ...state.squadLayoutCoordinatesBySquadId,
        ...copyCoordinatesBySquadId(action.coordinatesBySquadId),
      },
    });
  }

  @Action(MapActions.RecalculateSquadLayoutCoordinates)
  recalculateSquadLayoutCoordinates(context: MapStateContext) {
    context.patchState({ squadLayoutCoordinatesBySquadId: {} });
  }

  @Action(MapActions.MobilizeUnit)
  mobilizeUnit(context: MapStateContext, action: MapActions.MobilizeUnit) {
    const state = context.getState();
    const existing = state.unitsByTerritoryName[action.territoryName] ?? [];
    context.patchState({
      unitsByTerritoryName: {
        ...state.unitsByTerritoryName,
        [action.territoryName]: [...existing, action.unit],
      },
    });
  }

  @Action(MapActions.ApplyMovementPlans)
  applyMovementPlans(context: MapStateContext, action: MapActions.ApplyMovementPlans) {
    const state = context.getState();
    const { unitsByTerritoryName, cargoByCarrierUnitId, remainingPlans } = executeMovementPlans(
      state.unitsByTerritoryName,
      state.movementPlansBySquadId,
      action.phase,
      state.cargoByCarrierUnitId,
    );

    context.patchState({
      unitsByTerritoryName,
      cargoByCarrierUnitId,
      movementPlansBySquadId: remainingPlans,
      selectedSquad: undefined,
    });
  }

  @Action(MapActions.SetTerritoryUnits)
  setTerritoryUnits(context: MapStateContext, action: MapActions.SetTerritoryUnits) {
    const state = context.getState();
    context.patchState({
      unitsByTerritoryName: {
        ...state.unitsByTerritoryName,
        [action.territoryName]: action.units,
      },
    });
  }

  @Action(MapActions.AddUnitsToTerritory)
  addUnitsToTerritory(context: MapStateContext, action: MapActions.AddUnitsToTerritory) {
    const state = context.getState();
    const existing = state.unitsByTerritoryName[action.territoryName] ?? [];
    context.patchState({
      unitsByTerritoryName: {
        ...state.unitsByTerritoryName,
        [action.territoryName]: [...existing, ...action.units],
      },
    });
  }

  @Action(MapActions.RecordTerritoryCapture)
  recordTerritoryCapture(context: MapStateContext, action: MapActions.RecordTerritoryCapture) {
    const state = context.getState();
    context.patchState({
      pendingCapturesByTerritory: {
        ...state.pendingCapturesByTerritory,
        [action.territoryName]: action.nationality,
      },
    });
  }

  @Action(MapActions.ApplyPendingCaptures)
  applyPendingCaptures(context: MapStateContext) {
    const state = context.getState();
    context.patchState({
      landTerritoryControllerByName: {
        ...state.landTerritoryControllerByName,
        ...state.pendingCapturesByTerritory,
      },
      pendingCapturesByTerritory: {},
    });
  }

  @Action(MapActions.RemoveMovementPlansForDestination)
  removeMovementPlansForDestination(
    context: MapStateContext,
    action: MapActions.RemoveMovementPlansForDestination,
  ) {
    const state = context.getState();
    const remainingPlans: Record<string, SquadMovementPlan> = {};
    for (const [squadId, plan] of Object.entries(state.movementPlansBySquadId)) {
      const destination = plan.path.at(-1)?.territoryName;
      if (destination !== action.territoryName) {
        remainingPlans[squadId] = plan;
      }
    }
    context.patchState({ movementPlansBySquadId: remainingPlans });
  }

  @Action(MapActions.RemoveMovementPlans)
  removeMovementPlans(context: MapStateContext, action: MapActions.RemoveMovementPlans) {
    const state = context.getState();
    const toRemove = new Set(action.squadIds);
    const remainingPlans: Record<string, SquadMovementPlan> = {};
    for (const [squadId, plan] of Object.entries(state.movementPlansBySquadId)) {
      if (!toRemove.has(squadId)) {
        remainingPlans[squadId] = plan;
      }
    }
    context.patchState({ movementPlansBySquadId: remainingPlans });
  }

  @Action(MapActions.ResolveAutomaticCaptures)
  resolveAutomaticCaptures(context: MapStateContext, action: MapActions.ResolveAutomaticCaptures) {
    const state = context.getState();
    const result = resolveAutomaticCaptures({
      nation: action.nationality,
      unitsByTerritoryName: state.unitsByTerritoryName,
      movementPlansBySquadId: state.movementPlansBySquadId,
      landControl: state.landTerritoryControllerByName,
      pendingCapturesByTerritory: state.pendingCapturesByTerritory,
      amphibiousAssaultsByTerritory: state.amphibiousAssaultsByTerritory,
    });

    context.patchState({
      unitsByTerritoryName: result.unitsByTerritoryName,
      pendingCapturesByTerritory: result.pendingCapturesByTerritory,
      movementPlansBySquadId: result.movementPlansBySquadId,
      amphibiousAssaultsByTerritory: result.amphibiousAssaultsByTerritory,
    });
  }

  @Action(MapActions.RecordCombatCommitments)
  recordCombatCommitments(context: MapStateContext, action: MapActions.RecordCombatCommitments) {
    const state = context.getState();
    context.patchState({
      combatCommittedUnitIds: collectCombatCommittedUnitIds({
        nation: action.nationality,
        plans: Object.values(state.movementPlansBySquadId),
        unitsByTerritory: state.unitsByTerritoryName,
        amphibiousAssaultsByTerritory: state.amphibiousAssaultsByTerritory,
      }),
    });
  }

  @Action(MapActions.ClearCombatCommitments)
  clearCombatCommitments(context: MapStateContext) {
    context.patchState({ combatCommittedUnitIds: [] });
  }

  @Action(MapActions.ClearAmphibiousAssault)
  clearAmphibiousAssault(context: MapStateContext, action: MapActions.ClearAmphibiousAssault) {
    const state = context.getState();
    const { [action.territoryName]: _cleared, ...rest } = state.amphibiousAssaultsByTerritory;
    context.patchState({ amphibiousAssaultsByTerritory: rest });
  }

  @Action(MapActions.ApplyAmphibiousCombatMovePlans)
  applyAmphibiousCombatMovePlans(
    context: MapStateContext,
    action: MapActions.ApplyAmphibiousCombatMovePlans,
  ) {
    const state = context.getState();
    const result = executeAmphibiousCombatMovePlans({
      unitsByTerritoryName: state.unitsByTerritoryName,
      movementPlansBySquadId: state.movementPlansBySquadId,
      cargoByCarrierUnitId: state.cargoByCarrierUnitId,
      amphibiousAssaultsByTerritory: state.amphibiousAssaultsByTerritory,
      landControl: state.landTerritoryControllerByName,
      nation: action.nationality,
    });

    context.patchState({
      unitsByTerritoryName: result.unitsByTerritoryName,
      cargoByCarrierUnitId: result.cargoByCarrierUnitId,
      amphibiousAssaultsByTerritory: result.amphibiousAssaultsByTerritory,
      movementPlansBySquadId: result.remainingPlans,
    });
  }
}

/** Squad ids of the deferred load plans whose boarding units are aboard one of `transportUnitIds`
 * (a transport squad's units). Insertion order ≈ chronological, so the last is the most recent. */
function associatedLoadPlanSquadIds(state: MapStateModel, transportUnitIds: string[]): string[] {
  const ids = new Set(transportUnitIds);
  const squadIds: string[] = [];
  for (const [squadId, plan] of Object.entries(state.movementPlansBySquadId)) {
    const terminal = plan.path[plan.path.length - 1];
    if (terminal?.cargo?.role === 'load' && ids.has(terminal.cargo.transportId)) {
      squadIds.push(squadId);
    }
  }
  return squadIds;
}

function withRecomputedCombatTypes(
  unit: MilitaryUnit,
  steps: SquadMovementStep[],
  unitsByTerritoryName: MapStateModel['unitsByTerritoryName'],
  landTerritoryControllerByName: MapStateModel['landTerritoryControllerByName'],
): SquadMovementStep[] {
  const territories = steps.map((step) => step.territoryName);
  const combatTypes = [...AIR_UNIT_TYPES].includes(unit.type)
    ? determineAircraftPathCombatTypes({
        unit,
        territories,
        unitsByTerritoryName,
        preferredCombatIndex: steps.findIndex((step) => step.manualCombat),
      })
    : territories.map((territory) =>
        determineMovementStepCombatType({ unit, territory, unitsByTerritoryName }),
      );

  return steps.map((step, index) => {
    // Load/unload logistics steps never represent troop combat *into* that territory (a land squad's
    // step is a sea zone; a transport's is a coast it drops cargo on). An unload onto a hostile coast
    // is an amphibious assault, so it reads as 'combat' (drawn red, staged during Conduct Combat);
    // every other cargo step is 'none'.
    if (step.cargo) {
      const hostileUnload =
        step.cargo.role === 'unload' &&
        isHostileUnloadTarget(step.territoryName, unit.nationality, landTerritoryControllerByName);
      return { ...step, combatType: hostileUnload ? 'combat' : 'none' };
    }
    return { ...step, combatType: combatTypes[index] };
  });
}

/** Whether an unload target coast is controlled by an enemy of the unloading nation. */
function isHostileUnloadTarget(
  territory: TerritoryName,
  nation: Nationality,
  landTerritoryControllerByName: MapStateModel['landTerritoryControllerByName'],
): boolean {
  const controller = landTerritoryControllerByName[territory as LandTerritoryName];
  return controller !== undefined && NATION_ALLIANCE[controller] !== NATION_ALLIANCE[nation];
}

function copyCoordinatesBySquadId(
  coordinatesBySquadId: Record<string, Coordinate>,
): Record<string, Coordinate> {
  return Object.fromEntries(
    Object.entries(coordinatesBySquadId).map(([squadId, coordinate]) => [squadId, [...coordinate]]),
  );
}

/** A detachment plan key (`map-squad|terr|nat|type|d<n>`) carries a 5th segment; a base stack id
 * (`map-squad|terr|nat|type`) has exactly four. */
function isDetachmentSquadId(squadId: string): boolean {
  return squadId.split('|').length > 4;
}

/** The base stack id underlying any squad id — drops a detachment suffix, leaves a base id alone. */
function baseSquadIdOf(squadId: string): string {
  return squadId.split('|').slice(0, 4).join('|');
}

/** Whether the stack already has one or more detachment plans split off it. */
function hasSiblingDetachments(baseId: string, plans: Record<string, SquadMovementPlan>): boolean {
  const prefix = `${baseId}|d`;
  return Object.keys(plans).some((key) => key.startsWith(prefix));
}

/** The next free detachment key for a stack (`…|d1`, `…|d2`, …). */
function nextDetachmentKey(baseId: string, plans: Record<string, SquadMovementPlan>): string {
  let n = 1;
  while (plans[`${baseId}|d${n}`]) {
    n += 1;
  }
  return `${baseId}|d${n}`;
}

function findTerritoryForUnitId(state: MapStateModel, unitId?: string): TerritoryName | undefined {
  if (!unitId) {
    return undefined;
  }

  for (const [territoryName, units] of Object.entries(state.unitsByTerritoryName)) {
    if (units?.some((unit) => unit.id === unitId)) {
      return territoryName as TerritoryName;
    }
  }
  return undefined;
}

function findUnitForSelectedSquad(state: MapStateModel): MilitaryUnit | undefined {
  const selectedSquad = state.selectedSquad;
  if (!selectedSquad) {
    return undefined;
  }

  const unitId = selectedSquad.unitIds[0];
  for (const units of Object.values(state.unitsByTerritoryName)) {
    const unit = units?.find((unit) => unit.id === unitId);
    if (unit) {
      return unit;
    }
  }
  return undefined;
}
