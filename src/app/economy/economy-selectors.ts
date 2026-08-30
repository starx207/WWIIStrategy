import { Selector } from '@ngxs/store';
import { NATIONALITIES, Nationality } from '@ww2/shared/nationality';
import { MapState, MapStateModel } from '@ww2/map/map-state';
import { EconomyState, EconomyStateModel } from './economy-state';
import { calculateIncome } from './rules/income';

export class EconomySelectors {
  @Selector([EconomyState])
  static treasuryByNationality(state: EconomyStateModel): Record<Nationality, number> {
    return state.treasuryByNationality;
  }

  /** Projected end-of-turn income for every nation, derived from current territory control. */
  @Selector([MapState])
  static incomeByNationality(mapState: MapStateModel): Record<Nationality, number> {
    const landControl = mapState.landTerritoryControllerByName;
    return NATIONALITIES.reduce(
      (incomes, nationality) => {
        incomes[nationality] = calculateIncome(nationality, landControl);
        return incomes;
      },
      {} as Record<Nationality, number>,
    );
  }
}
