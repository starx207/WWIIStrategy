import { Nationality } from '@ww2/shared/nationality';

export namespace EconomyActions {
  const ACTION_SOURCE = '[Economy]';

  /** Collect end-of-turn income for a nation, based on current territory control. */
  export class CollectIncome {
    static readonly type = `${ACTION_SOURCE} Collect Income`;
    constructor(public readonly nationality: Nationality) {}
  }

  /** Deduct IPCs from a nation's treasury (purchases, research dice). */
  export class SpendIpc {
    static readonly type = `${ACTION_SOURCE} Spend IPC`;
    constructor(
      public readonly nationality: Nationality,
      public readonly amount: number,
    ) {}
  }

  /** Add IPCs to a nation's treasury. */
  export class AddIpc {
    static readonly type = `${ACTION_SOURCE} Add IPC`;
    constructor(
      public readonly nationality: Nationality,
      public readonly amount: number,
    ) {}
  }

  /** Transfer a defeated power's entire treasury to the captor (capital capture). */
  export class SeizeTreasury {
    static readonly type = `${ACTION_SOURCE} Seize Treasury`;
    constructor(
      public readonly from: Nationality,
      public readonly to: Nationality,
    ) {}
  }
}
