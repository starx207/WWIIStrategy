import { Selector } from '@ngxs/store';
import { GameState, GameStateModel } from './game-state';

export class GameSelectors {
  @Selector([GameState])
  static gamePhase(state: GameStateModel) {
    return state.gamePhase;
  }

  @Selector([GameState])
  static turnPhase(state: GameStateModel) {
    return state.turnPhase;
  }

  @Selector([GameState])
  static contextualMenu(state: GameStateModel) {
    return state.contextualMenu;
  }
}
