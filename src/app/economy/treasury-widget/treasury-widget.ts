import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { Store } from '@ngxs/store';
import { Nationality } from '@ww2/shared/nationality';
import { NATIONALITY_SHORT_LABEL } from '@ww2/shared/nationality-label';
import { GameSelectors } from '@ww2/game/game-selectors';
import { NATIONALITIES_IN_TURN_ORDER, nationalityForGamePhase } from '@ww2/game/game-phase';
import { EconomySelectors } from '../economy-selectors';

@Component({
  selector: 'ww2-treasury-widget',
  imports: [],
  templateUrl: './treasury-widget.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './treasury-widget.scss',
})
export class TreasuryWidget {
  private readonly store = inject(Store);

  protected readonly nationalities = NATIONALITIES_IN_TURN_ORDER;
  private readonly treasuries = this.store.selectSignal(EconomySelectors.treasuryByNationality);
  private readonly incomes = this.store.selectSignal(EconomySelectors.incomeByNationality);
  private readonly gamePhase = this.store.selectSignal(GameSelectors.gamePhase);

  protected readonly activeNation = computed(() => nationalityForGamePhase(this.gamePhase()));

  protected label(nationality: Nationality): string {
    return NATIONALITY_SHORT_LABEL[nationality];
  }

  protected treasury(nationality: Nationality): number {
    return this.treasuries()[nationality];
  }

  protected income(nationality: Nationality): number {
    return this.incomes()[nationality];
  }
}
