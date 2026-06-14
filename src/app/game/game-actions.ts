import { GamePhase } from './game-phase';
import { TurnPhase } from './turn-phase';

export namespace GameActions {
  const ACTION_SOURCE = '[Game]';

  export class SetGamePhase {
    static readonly type = `${ACTION_SOURCE} Set Game Phase`;

    constructor(public gamePhase: GamePhase) {}
  }

  export class SetTurnPhase {
    static readonly type = `${ACTION_SOURCE} Set Turn Phase`;

    constructor(public turnPhase: TurnPhase) {}
  }

  export class AdvanceGamePhase {
    static readonly type = `${ACTION_SOURCE} Advance Game Phase`;
  }

  export class AdvanceTurnPhase {
    static readonly type = `${ACTION_SOURCE} Advance Turn Phase`;
  }
}
