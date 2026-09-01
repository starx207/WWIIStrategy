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

  /**
   * Projected end-of-turn income for every nation. Overlays captures recorded during combat
   * (`pendingCapturesByTerritory`) onto the live control map so a capture is reflected here in
   * real time, even though control doesn't actually transfer (and income isn't actually collected)
   * until end of turn. `calculateIncome`'s capital-capture check applies to the overlaid map too, so
   * a captured capital's victim projects 0 income immediately.
   */
  @Selector([MapState])
  static incomeByNationality(mapState: MapStateModel): Record<Nationality, number> {
    const projectedControl = {
      ...mapState.landTerritoryControllerByName,
      ...mapState.pendingCapturesByTerritory,
    };
    return NATIONALITIES.reduce(
      (incomes, nationality) => {
        incomes[nationality] = calculateIncome(nationality, projectedControl);
        return incomes;
      },
      {} as Record<Nationality, number>,
    );
  }
}
