import { Component, computed, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { GameSelectors } from '@ww2/game/game-selectors';
import { GameActions } from '@ww2/game/game-actions';
import { nationalityForGamePhase } from '@ww2/game/game-phase';
import { TURN_PHASE_LABEL, TurnPhase } from '@ww2/game/turn-phase';
import { MapActions } from '@ww2/map/map-actions';
import { NATIONALITY_LABEL } from '@ww2/shared/nationality-label';
import { SessionSelectors, playerForNation } from '../../session/session-selectors';

@Component({
  selector: 'ww2-phase-control',
  imports: [],
  templateUrl: './phase-control.html',
  styleUrl: './phase-control.scss',
})
export class PhaseControl {
  private readonly store = inject(Store);

  private readonly gamePhase = this.store.selectSignal(GameSelectors.gamePhase);
  private readonly turnPhase = this.store.selectSignal(GameSelectors.turnPhase);
  private readonly players = this.store.selectSignal(SessionSelectors.players);
  private readonly nationAssignments = this.store.selectSignal(SessionSelectors.nationAssignments);

  protected readonly activeNation = computed(() => nationalityForGamePhase(this.gamePhase()));

  protected readonly nationLabel = computed(() => {
    const nation = this.activeNation();
    return nation ? NATIONALITY_LABEL[nation] : 'Victory Check';
  });

  protected readonly playerName = computed(() => {
    const nation = this.activeNation();
    if (!nation) {
      return '';
    }
    return playerForNation(nation, this.players(), this.nationAssignments())?.name ?? '';
  });

  protected readonly phaseLabel = computed(() => TURN_PHASE_LABEL[this.turnPhase()]);

  protected nextPhase(): void {
    // Execute non-combat movement as we leave that phase (combat movement is executed by the
    // combat orchestrator during Conduct Combat, so its plans are not applied here).
    if (this.turnPhase() === TurnPhase.NON_COMBAT_MOVEMENT) {
      this.store.dispatch(new MapActions.ApplyMovementPlans(TurnPhase.NON_COMBAT_MOVEMENT));
    }
    this.store.dispatch(new GameActions.AdvanceTurnPhase());
  }
}
