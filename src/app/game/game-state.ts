import { Injectable } from '@angular/core';
import { Action, State, StateContext } from '@ngxs/store';
import { GameActions } from './game-actions';
import { GamePhase } from './game-phase';
import { TurnPhase } from './turn-phase';
import { MenuOption } from '../menu-actions';

export interface GameStateModel {
  gamePhase: GamePhase;
  turnPhase: TurnPhase;
  contextualMenu: MenuOption[];
}

const DEFAULT_STATE: GameStateModel = {
  gamePhase: GamePhase.SOVIET_TURN,
  turnPhase: TurnPhase.PURCHASE_UNITS,
  contextualMenu: [],
};

const GAME_PHASE_ORDER = Object.values(GamePhase).filter(
  (value) => typeof value === 'number',
) as GamePhase[];
const TURN_PHASE_ORDER = Object.values(TurnPhase) as TurnPhase[];

type GameStateContext = StateContext<GameStateModel>;

@State<GameStateModel>({
  name: 'game',
  defaults: DEFAULT_STATE,
})
@Injectable()
export class GameState {
  @Action(GameActions.SetGamePhase)
  setGamePhase(ctx: GameStateContext, action: GameActions.SetGamePhase) {
    ctx.patchState({
      gamePhase: action.gamePhase,
    });
  }

  @Action(GameActions.SetTurnPhase)
  setTurnPhase(ctx: GameStateContext, action: GameActions.SetTurnPhase) {
    ctx.patchState({
      turnPhase: action.turnPhase,
    });
  }

  @Action(GameActions.AdvanceGamePhase)
  advanceGamePhase(ctx: GameStateContext) {
    ctx.patchState({
      gamePhase: getNextGamePhase(ctx.getState().gamePhase),
    });
  }

  @Action(GameActions.AdvanceTurnPhase)
  advanceTurnPhase(ctx: GameStateContext) {
    const state = ctx.getState();
    const nextTurnPhase = getNextTurnPhase(state.turnPhase);

    ctx.patchState({
      turnPhase: nextTurnPhase,
      gamePhase:
        nextTurnPhase === TurnPhase.PURCHASE_UNITS
          ? getNextGamePhase(state.gamePhase)
          : state.gamePhase,
    });
  }

  @Action(GameActions.SetContextualMenu)
  setContextualMenu(ctx: GameStateContext, action: GameActions.SetContextualMenu) {
    const menuOptions = action.menuOptions.map((option) => ({
      ...option,
      disabled: option.disabled ?? false,
    }));
    ctx.patchState({
      contextualMenu: menuOptions,
    });
  }

  @Action(GameActions.SetContextualMenuOptionDisabled)
  setContextualMenuOptionDisabled(
    ctx: GameStateContext,
    action: GameActions.SetContextualMenuOptionDisabled,
  ) {
    const { optionIds, disabled } = action;

    const contextualMenu = ctx
      .getState()
      .contextualMenu.map((option) =>
        option.id !== 'header-label' && optionIds.includes(option.id)
          ? { ...option, disabled }
          : option,
      );
    ctx.patchState({
      contextualMenu,
    });
  }
}

function getNextGamePhase(gamePhase: GamePhase): GamePhase {
  return getNextPhase(GAME_PHASE_ORDER, gamePhase);
}

function getNextTurnPhase(turnPhase: TurnPhase): TurnPhase {
  return getNextPhase(TURN_PHASE_ORDER, turnPhase);
}

function getNextPhase<T>(phaseOrder: readonly T[], currentPhase: T): T {
  const currentIndex = phaseOrder.indexOf(currentPhase);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % phaseOrder.length;
  return phaseOrder[nextIndex];
}
