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

export interface SquadMovementStep {
  territoryName: TerritoryName;
  coordinate: Coordinate;
}

export interface SquadMovementPlan {
  squadId: string;
  startingTerritoryName: TerritoryName;
  path: SquadMovementStep[];
}

export interface MapStateModel {
  unitsByTerritoryName: Partial<Record<TerritoryName, MilitaryUnit[]>>;
  landTerritoryControllerByName: Record<LandTerritoryName, Nationality>;
  selectedSquad?: {
    id: string;
    unitIds: string[];
  };
  movementPlansBySquadId: Record<string, SquadMovementPlan>;
}

const DEFAULT_STATE: MapStateModel = {
  unitsByTerritoryName: INITIAL_UNITS_BY_TERRITORY_NAME,
  landTerritoryControllerByName: INITIAL_LAND_TERRITORY_CONTROL,
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
                startingTerritoryName,
                path: [],
              },
            },
    });
  }

  @Action(MapActions.PlanSquadMovementStep)
  planSquadMovementStep(context: MapStateContext, action: MapActions.PlanSquadMovementStep) {
    const state = context.getState();
    const selectedSquadId = state.selectedSquad?.id;
    const selectedPlan = selectedSquadId
      ? state.movementPlansBySquadId[selectedSquadId]
      : undefined;

    if (!selectedSquadId || !selectedPlan) {
      return;
    }

    context.patchState({
      movementPlansBySquadId: {
        ...state.movementPlansBySquadId,
        [selectedSquadId]: {
          ...selectedPlan,
          path: [
            ...selectedPlan.path,
            {
              territoryName: action.territoryName,
              coordinate: [...action.coordinate],
            },
          ],
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

    context.patchState({
      movementPlansBySquadId: {
        ...state.movementPlansBySquadId,
        [selectedSquadId]: {
          ...selectedPlan,
          path: selectedPlan.path.slice(0, -1),
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
