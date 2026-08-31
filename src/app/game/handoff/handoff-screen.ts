import { Component, computed, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { Alliance } from '@ww2/shared/nationality';
import { NATIONALITY_LABEL } from '@ww2/shared/nationality-label';
import { MapSelectors } from '@ww2/map/map-selectors';
import { countVictoryCities } from '@ww2/victory/rules/victory';
import { VICTORY_CITY_THRESHOLD } from '@ww2/victory/data/victory-cities';
import { SessionSelectors, playerForNation } from '../../session/session-selectors';
import { TurnFlowService } from '../turn-flow.service';

@Component({
  selector: 'ww2-handoff-screen',
  imports: [],
  templateUrl: './handoff-screen.html',
  styleUrl: './handoff-screen.scss',
})
export class HandoffScreen {
  private readonly store = inject(Store);
  private readonly turnFlow = inject(TurnFlowService);

  private readonly players = this.store.selectSignal(SessionSelectors.players);
  private readonly nationAssignments = this.store.selectSignal(SessionSelectors.nationAssignments);
  private readonly landControl = this.store.selectSignal(
    MapSelectors.landTerritoryControllerByName,
  );
  private readonly houseRules = this.store.selectSignal(SessionSelectors.houseRules);

  protected readonly round = this.store.selectSignal(SessionSelectors.roundNumber);
  protected readonly nextNation = this.turnFlow.pendingNextNation;

  protected readonly nextNationLabel = computed(() => {
    const nation = this.nextNation();
    return nation ? NATIONALITY_LABEL[nation] : '';
  });

  protected readonly nextPlayerName = computed(() => {
    const nation = this.nextNation();
    if (!nation) {
      return '';
    }
    return playerForNation(nation, this.players(), this.nationAssignments())?.name ?? '';
  });

  protected readonly axisCities = computed(() =>
    countVictoryCities(Alliance.AXIS, this.landControl()),
  );
  protected readonly alliesCities = computed(() =>
    countVictoryCities(Alliance.ALLIES, this.landControl()),
  );
  protected readonly threshold = computed(
    () => VICTORY_CITY_THRESHOLD[this.houseRules().victoryCondition],
  );

  protected begin(): void {
    this.turnFlow.completeHandoff();
  }
}
