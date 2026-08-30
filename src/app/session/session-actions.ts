import { Nationality } from '@ww2/shared/nationality';
import { HouseRules, Player } from './session-state';

export namespace SessionActions {
  export class StartNewGame {
    static readonly type = '[Session] Start New Game';
    constructor(
      public readonly players: Player[],
      public readonly nationAssignments: Partial<Record<Nationality, string>>,
      public readonly houseRules: HouseRules,
    ) {}
  }

  export class IncrementRound {
    static readonly type = '[Session] Increment Round';
  }

  export class SetLoadedFileName {
    static readonly type = '[Session] Set Loaded File Name';
    constructor(public readonly fileName: string | null) {}
  }
}
