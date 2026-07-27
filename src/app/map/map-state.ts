import { Injectable } from '@angular/core';
import { Action, State, StateContext } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { Nationality } from '@ww2/shared/nationality';
import {
  INITIAL_LAND_TERRITORY_CONTROL,
  INITIAL_UNITS_BY_TERRITORY_NAME,
} from './initial-map-layout';
import { LandTerritoryName, TerritoryName } from '../territories/territory-names';
import { MapActions } from './map-actions';
import { Coordinate } from 'ol/coordinate';
import { MovementPhase } from '@ww2/game/turn-phase';
import {
  determineAircraftPathCombatTypes,
  determineMovementStepCombatType,
} from './rules/destination-rules';
import { AIR_UNIT_TYPES } from '@ww2/shared/unit-type';

export type SquadMovementStepCombatType = 'none' | 'combat' | 'under-fire';

export interface SquadMovementStep {
  territoryName: TerritoryName;
  coordinate: Coordinate;
  combatType: SquadMovementStepCombatType;
  isValidEnd: boolean;
}

export interface SquadMovementPlan {
  squadId: string;
  phase: MovementPhase;
  startingTerritoryName: TerritoryName;
  path: SquadMovementStep[];
}

export interface MapStateModel {
  unitsByTerritoryName: Partial<Record<TerritoryName, MilitaryUnit[]>>;
  // TODO: Once we implement capturing territory, it will be important that the control does not transfer until the END of the turn.
  //       This is because movement rules for aircraft require friendly territories for airfields, so if we transfer control immediately upon capture,
  //       it would allow aircraft to land there, which is not the intended behavior. We'll likely need some sort of "captured territory" state that transfers to
  //       this mapping at the end of the turn.
  landTerritoryControllerByName: Record<LandTerritoryName, Nationality>;
  squadLayoutCoordinatesBySquadId: Record<string, Coordinate>;
  selectedSquad?: {
    id: string;
    unitIds: string[];
  };
  movementPlansBySquadId: Record<string, SquadMovementPlan>;
}

const DEFAULT_STATE: MapStateModel = {
  unitsByTerritoryName: INITIAL_UNITS_BY_TERRITORY_NAME,
  landTerritoryControllerByName: INITIAL_LAND_TERRITORY_CONTROL,
  squadLayoutCoordinatesBySquadId: {},
  movementPlansBySquadId: {},
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
        isValidEnd: true,
        combatType: 'none',
      },
    ];

    context.patchState({
      movementPlansBySquadId: {
        ...state.movementPlansBySquadId,
        [selectedSquadId]: {
          ...selectedPlan,
          path: withRecomputedCombatTypes(
            findUnitForSelectedSquad(state)!,
            appendedSteps,
            state.unitsByTerritoryName,
          ),
        },
      },
    });
  }

  @Action(MapActions.UndoSquadMovementStep)
  undoSquadMovementStep(context: MapStateContext) {
    const state = context.getState();
    const selectedSquadId = state.selectedSquad?.id;
    const selectedPlan = selectedSquadId
      ? state.movementPlansBySquadId[selectedSquadId]
      : undefined;

    if (!selectedSquadId || !selectedPlan || selectedPlan.path.length === 0) {
      return;
    }

    // Removing the last step can change which step is the aircraft's combat destination, so
    // recompute the remaining path's combat types rather than just slicing.
    const remainingSteps = selectedPlan.path.slice(0, -1);
    const unit = findUnitForSelectedSquad(state);

    context.patchState({
      movementPlansBySquadId: {
        ...state.movementPlansBySquadId,
        [selectedSquadId]: {
          ...selectedPlan,
          path: unit
            ? withRecomputedCombatTypes(unit, remainingSteps, state.unitsByTerritoryName)
            : remainingSteps,
        },
      },
    });
  }

  @Action(MapActions.ClearSelectedSquadMovementPlan)
  clearSelectedSquadMovementPlan(context: MapStateContext) {
    const state = context.getState();
    const selectedSquadId = state.selectedSquad?.id;

    if (!selectedSquadId || !state.movementPlansBySquadId[selectedSquadId]) {
      return;
    }

    const { [selectedSquadId]: _clearedPlan, ...movementPlansBySquadId } =
      state.movementPlansBySquadId;
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
}

function withRecomputedCombatTypes(
  unit: MilitaryUnit,
  steps: SquadMovementStep[],
  unitsByTerritoryName: MapStateModel['unitsByTerritoryName'],
): SquadMovementStep[] {
  const territories = steps.map((step) => step.territoryName);
  const combatTypes = [...AIR_UNIT_TYPES].includes(unit.type)
    ? determineAircraftPathCombatTypes({ unit, territories, unitsByTerritoryName })
    : territories.map((territory) =>
        determineMovementStepCombatType({ unit, territory, unitsByTerritoryName }),
      );

  return steps.map((step, index) => ({ ...step, combatType: combatTypes[index] }));
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
