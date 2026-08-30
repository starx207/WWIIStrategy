import { Injectable, inject } from '@angular/core';
import { Action, State, StateContext, Store } from '@ngxs/store';
import { Nationality } from '@ww2/shared/nationality';
import { MapSelectors } from '@ww2/map/map-selectors';
import { STARTING_TREASURY_BY_NATION } from './data/starting-treasury';
import { calculateIncome } from './rules/income';
import { EconomyActions } from './economy-actions';

export interface EconomyStateModel {
  treasuryByNationality: Record<Nationality, number>;
}

const DEFAULT_STATE: EconomyStateModel = {
  treasuryByNationality: { ...STARTING_TREASURY_BY_NATION },
};

type EconomyStateContext = StateContext<EconomyStateModel>;

@State<EconomyStateModel>({
  name: 'economy',
  defaults: DEFAULT_STATE,
})
@Injectable()
export class EconomyState {
  private readonly store = inject(Store);

  @Action(EconomyActions.CollectIncome)
  collectIncome(ctx: EconomyStateContext, action: EconomyActions.CollectIncome) {
    const landControl = this.store.selectSnapshot(MapSelectors.landTerritoryControllerByName);
    const income = calculateIncome(action.nationality, landControl);
    this.adjustTreasury(ctx, action.nationality, income);
  }

  @Action(EconomyActions.SpendIpc)
  spendIpc(ctx: EconomyStateContext, action: EconomyActions.SpendIpc) {
    this.adjustTreasury(ctx, action.nationality, -action.amount);
  }

  @Action(EconomyActions.AddIpc)
  addIpc(ctx: EconomyStateContext, action: EconomyActions.AddIpc) {
    this.adjustTreasury(ctx, action.nationality, action.amount);
  }

  @Action(EconomyActions.SeizeTreasury)
  seizeTreasury(ctx: EconomyStateContext, action: EconomyActions.SeizeTreasury) {
    const treasuries = ctx.getState().treasuryByNationality;
    const seized = treasuries[action.from];
    ctx.patchState({
      treasuryByNationality: {
        ...treasuries,
        [action.to]: treasuries[action.to] + seized,
        [action.from]: 0,
      },
    });
  }

  private adjustTreasury(ctx: EconomyStateContext, nationality: Nationality, delta: number) {
    const treasuries = ctx.getState().treasuryByNationality;
    ctx.patchState({
      treasuryByNationality: {
        ...treasuries,
        [nationality]: Math.max(0, treasuries[nationality] + delta),
      },
    });
  }
}
