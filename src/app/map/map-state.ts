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
    id: string;
    unitIds: string[];
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
    const selectedSquad = {
      id: action.squad.id,
      unitIds: action.squad.units.map((unit) => unit.id),
    };
    const startingTerritoryName = findTerritoryForUnitId(state, selectedSquad.unitIds[0]);
    const existingPlan = state.movementPlansBySquadId[selectedSquad.id];

    context.patchState({
      selectedSquad,
      movementPlansBySquadId:
        existingPlan || !startingTerritoryName
          ? state.movementPlansBySquadId
          : {
              ...state.movementPlansBySquadId,
              [selectedSquad.id]: {
                squadId: selectedSquad.id,
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
    const selectedSquadId = selectedSquad?.id;
    const selectedPlan = selectedSquadId
      ? state.movementPlansBySquadId[selectedSquadId]
      : undefined;

    if (!selectedSquadId || !selectedPlan) {
      return;
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
      movementPlansBySquadId: {
        ...state.movementPlansBySquadId,
        [selectedSquadId]: {
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
    const selectedSquadId = selected?.id;
    const selectedPlan = selectedSquadId
      ? state.movementPlansBySquadId[selectedSquadId]
      : undefined;

    if (!selectedSquadId || !selectedPlan || selectedPlan.path.length === 0) {
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
        [selectedSquadId]: {
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
    const selectedPlan = selectedSquad ? state.movementPlansBySquadId[selectedSquad.id] : undefined;
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
        [selectedSquad.id]: {
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

    // Clear the selected squad's plan plus any loads onto it (a transport owns its whole operation),
    // so clearing a transport also releases the units it had queued to board.
    const toRemove = new Set<string>(associatedLoadPlanSquadIds(state, selected.unitIds));
    if (state.movementPlansBySquadId[selected.id]) {
      toRemove.add(selected.id);
    }
    if (toRemove.size === 0) {
      return;
    }

    const movementPlansBySquadId = Object.fromEntries(
      Object.entries(state.movementPlansBySquadId).filter(([squadId]) => !toRemove.has(squadId)),
    );
    context.patchState({ movementPlansBySquadId });
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
