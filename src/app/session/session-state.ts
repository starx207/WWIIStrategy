import { Injectable } from '@angular/core';
import { Action, State, StateContext } from '@ngxs/store';
import { Nationality } from '@ww2/shared/nationality';
import { TechnologyId } from '@ww2/settings/settings-state';
import { VictoryCondition } from '@ww2/victory/data/victory-cities';
import { SessionActions } from './session-actions';

export interface Player {
  id: string;
  name: string;
}

export interface HouseRules {
  /** Technologies players are permitted to research this game. */
  allowedTechIds: TechnologyId[];
  /** Victory-city count required to win (minor 8, major 10, total 12). */
  victoryCondition: VictoryCondition;
}

export interface SessionStateModel {
  /** True once a game has been started or loaded. Route guard uses this to gate `/game`. */
  started: boolean;
  players: Player[];
  /** Maps each nation to the id of the player controlling it. */
  nationAssignments: Partial<Record<Nationality, string>>;
  houseRules: HouseRules;
  roundNumber: number;
  /** Name of the file a game was loaded from, used to default the save dialog. */
  loadedFileName: string | null;
}

export const ALL_TECH_IDS: TechnologyId[] = ['jet-fighters', 'heavy-bombers', 'super-submarines'];

const DEFAULT_STATE: SessionStateModel = {
  started: false,
  players: [],
  nationAssignments: {},
  houseRules: { allowedTechIds: [...ALL_TECH_IDS], victoryCondition: 'minor' },
  roundNumber: 1,
  loadedFileName: null,
};

type SessionStateContext = StateContext<SessionStateModel>;

@State<SessionStateModel>({
  name: 'session',
  defaults: DEFAULT_STATE,
})
@Injectable()
export class SessionState {
  @Action(SessionActions.StartNewGame)
  startNewGame(ctx: SessionStateContext, action: SessionActions.StartNewGame) {
    ctx.setState({
      started: true,
      players: action.players,
      nationAssignments: action.nationAssignments,
      houseRules: action.houseRules,
      roundNumber: 1,
      loadedFileName: null,
    });
  }

  @Action(SessionActions.IncrementRound)
  incrementRound(ctx: SessionStateContext) {
    ctx.patchState({ roundNumber: ctx.getState().roundNumber + 1 });
  }

  @Action(SessionActions.SetLoadedFileName)
  setLoadedFileName(ctx: SessionStateContext, action: SessionActions.SetLoadedFileName) {
    ctx.patchState({ loadedFileName: action.fileName });
  }
}
