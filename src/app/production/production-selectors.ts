import { Selector } from '@ngxs/store';
import { Nationality } from '@ww2/shared/nationality';
import { UnitType } from '@ww2/shared/unit-type';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { ProductionState, ProductionStateModel } from './production-state';

export class ProductionSelectors {
  @Selector([ProductionState])
  static purchaseCartByNationality(
    state: ProductionStateModel,
  ): Partial<Record<Nationality, UnitType[]>> {
    return state.purchaseCartByNationality;
  }

  @Selector([ProductionState])
  static pendingPlacementsByNationality(
    state: ProductionStateModel,
  ): Partial<Record<Nationality, MilitaryUnit[]>> {
    return state.pendingPlacementsByNationality;
  }
}
