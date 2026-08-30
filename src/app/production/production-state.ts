import { Injectable, inject } from '@angular/core';
import { Action, State, StateContext, Store } from '@ngxs/store';
import { Nationality } from '@ww2/shared/nationality';
import { UnitType } from '@ww2/shared/unit-type';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { createUnit } from '@ww2/shared/unit-factory';
import { UNIT_COST_BY_TYPE } from '@ww2/economy/data/unit-cost';
import { EconomySelectors } from '@ww2/economy/economy-selectors';
import { EconomyActions } from '@ww2/economy/economy-actions';
import { MapActions } from '@ww2/map/map-actions';
import { ProductionActions } from './production-actions';

export interface ProductionStateModel {
  purchaseCartByNationality: Partial<Record<Nationality, UnitType[]>>;
  pendingPlacementsByNationality: Partial<Record<Nationality, MilitaryUnit[]>>;
}

const DEFAULT_STATE: ProductionStateModel = {
  purchaseCartByNationality: {},
  pendingPlacementsByNationality: {},
};

/** Total IPC cost of a cart of unit types. */
export function cartCost(cart: UnitType[]): number {
  return cart.reduce((total, unitType) => total + UNIT_COST_BY_TYPE[unitType], 0);
}

type ProductionStateContext = StateContext<ProductionStateModel>;

@State<ProductionStateModel>({
  name: 'production',
  defaults: DEFAULT_STATE,
})
@Injectable()
export class ProductionState {
  private readonly store = inject(Store);

  @Action(ProductionActions.AddToCart)
  addToCart(ctx: ProductionStateContext, action: ProductionActions.AddToCart) {
    const carts = ctx.getState().purchaseCartByNationality;
    const cart = carts[action.nationality] ?? [];
    ctx.patchState({
      purchaseCartByNationality: {
        ...carts,
        [action.nationality]: [...cart, action.unitType],
      },
    });
  }

  @Action(ProductionActions.RemoveFromCart)
  removeFromCart(ctx: ProductionStateContext, action: ProductionActions.RemoveFromCart) {
    const carts = ctx.getState().purchaseCartByNationality;
    const cart = carts[action.nationality] ?? [];
    const index = cart.indexOf(action.unitType);
    if (index === -1) {
      return;
    }
    const updated = [...cart.slice(0, index), ...cart.slice(index + 1)];
    ctx.patchState({
      purchaseCartByNationality: {
        ...carts,
        [action.nationality]: updated,
      },
    });
  }

  @Action(ProductionActions.ClearCart)
  clearCart(ctx: ProductionStateContext, action: ProductionActions.ClearCart) {
    const carts = ctx.getState().purchaseCartByNationality;
    ctx.patchState({
      purchaseCartByNationality: { ...carts, [action.nationality]: [] },
    });
  }

  @Action(ProductionActions.ConfirmPurchase)
  confirmPurchase(ctx: ProductionStateContext, action: ProductionActions.ConfirmPurchase) {
    const state = ctx.getState();
    const cart = state.purchaseCartByNationality[action.nationality] ?? [];
    if (cart.length === 0) {
      return;
    }

    const cost = cartCost(cart);
    const treasury =
      this.store.selectSnapshot(EconomySelectors.treasuryByNationality)[action.nationality] ?? 0;
    if (cost > treasury) {
      return; // Can't afford; leave the cart untouched.
    }

    const newUnits = cart.map((unitType) => createUnit(unitType, action.nationality));
    const pending = state.pendingPlacementsByNationality[action.nationality] ?? [];

    ctx.patchState({
      purchaseCartByNationality: { ...state.purchaseCartByNationality, [action.nationality]: [] },
      pendingPlacementsByNationality: {
        ...state.pendingPlacementsByNationality,
        [action.nationality]: [...pending, ...newUnits],
      },
    });

    this.store.dispatch(new EconomyActions.SpendIpc(action.nationality, cost));
  }

  @Action(ProductionActions.PlaceUnit)
  placeUnit(ctx: ProductionStateContext, action: ProductionActions.PlaceUnit) {
    const state = ctx.getState();
    const pending = state.pendingPlacementsByNationality[action.nationality] ?? [];
    const unit = pending.find((candidate) => candidate.id === action.unitId);
    if (!unit) {
      return;
    }

    ctx.patchState({
      pendingPlacementsByNationality: {
        ...state.pendingPlacementsByNationality,
        [action.nationality]: pending.filter((candidate) => candidate.id !== action.unitId),
      },
    });

    this.store.dispatch(new MapActions.MobilizeUnit(action.territoryName, unit));
  }
}
