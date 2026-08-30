import { Nationality } from '@ww2/shared/nationality';
import { UnitType } from '@ww2/shared/unit-type';

export namespace ProductionActions {
  const ACTION_SOURCE = '[Production]';

  /** Add one unit of the given type to a nation's purchase cart. */
  export class AddToCart {
    static readonly type = `${ACTION_SOURCE} Add To Cart`;
    constructor(
      public readonly nationality: Nationality,
      public readonly unitType: UnitType,
    ) {}
  }

  /** Remove one unit of the given type from a nation's purchase cart. */
  export class RemoveFromCart {
    static readonly type = `${ACTION_SOURCE} Remove From Cart`;
    constructor(
      public readonly nationality: Nationality,
      public readonly unitType: UnitType,
    ) {}
  }

  /** Empty a nation's purchase cart without buying. */
  export class ClearCart {
    static readonly type = `${ACTION_SOURCE} Clear Cart`;
    constructor(public readonly nationality: Nationality) {}
  }

  /**
   * Commit the cart: debit the cart's IPC cost from the treasury and move the purchased units into
   * the pending-placement queue for the Mobilize/Place phase. No-op if the nation can't afford it.
   */
  export class ConfirmPurchase {
    static readonly type = `${ACTION_SOURCE} Confirm Purchase`;
    constructor(public readonly nationality: Nationality) {}
  }
}
