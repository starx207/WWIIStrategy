import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { Alliance } from '@ww2/shared/nationality';
import { SessionSelectors } from '../../session/session-selectors';
import { VICTORY_CONDITION_LABEL } from '../data/victory-cities';
import { TurnFlowService } from '../../game/turn-flow.service';

@Component({
  selector: 'ww2-victory-screen',
  imports: [],
  templateUrl: './victory-screen.html',
  styleUrl: './victory-screen.scss',
})
export class VictoryScreen {
  private readonly router = inject(Router);
  private readonly store = inject(Store);
  private readonly turnFlow = inject(TurnFlowService);

  private readonly houseRules = this.store.selectSignal(SessionSelectors.houseRules);

  protected readonly result = this.turnFlow.victoryResult;

  protected readonly winnerLabel = computed(() => {
    switch (this.result()?.winner) {
      case Alliance.AXIS:
        return 'Axis';
      case Alliance.ALLIES:
        return 'Allies';
      default:
        return '';
    }
  });

  protected readonly winnerClass = computed(() =>
    this.result()?.winner === Alliance.AXIS ? 'axis' : 'allies',
  );

  protected readonly conditionLabel = computed(
    () => VICTORY_CONDITION_LABEL[this.houseRules().victoryCondition],
  );

  protected toMenu(): void {
    this.router.navigateByUrl('/');
  }
}
