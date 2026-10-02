import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { Store } from '@ngxs/store';
import { GameSelectors } from '@ww2/game/game-selectors';
import { nationalityForGamePhase } from '@ww2/game/game-phase';
import { TURN_PHASE_LABEL, TurnPhase } from '@ww2/game/turn-phase';
import { MapSelectors } from '@ww2/map/map-selectors';
import { NATIONALITY_LABEL } from '@ww2/shared/nationality-label';
import { computePendingBattles } from '@ww2/combat/combat-orchestration';
import { SessionSelectors, playerForNation } from '../../session/session-selectors';
import { TurnFlowService } from '../turn-flow.service';

@Component({
  selector: 'ww2-phase-control',
  imports: [],
  templateUrl: './phase-control.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './phase-control.scss',
})
export class PhaseControl {
  private readonly store = inject(Store);
  private readonly turnFlow = inject(TurnFlowService);

  private readonly gamePhase = this.store.selectSignal(GameSelectors.gamePhase);
  private readonly turnPhase = this.store.selectSignal(GameSelectors.turnPhase);
  private readonly players = this.store.selectSignal(SessionSelectors.players);
  private readonly nationAssignments = this.store.selectSignal(SessionSelectors.nationAssignments);
  private readonly invalidMoveCount = this.store.selectSignal(
    MapSelectors.invalidMovementPlanCount,
  );
  private readonly plans = this.store.selectSignal(MapSelectors.movementPlans);
  private readonly units = this.store.selectSignal(MapSelectors.unitsByTerritoryName);
  private readonly amphibious = this.store.selectSignal(MapSelectors.amphibiousAssaultsByTerritory);

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

  protected readonly blockers = computed<string[]>(() => {
    const phase = this.turnPhase();
    const list: string[] = [];

    if (phase === TurnPhase.COMBAT_MOVEMENT || phase === TurnPhase.NON_COMBAT_MOVEMENT) {
      const invalid = this.invalidMoveCount();
      if (invalid > 0) {
        list.push(`${invalid} invalid move${invalid === 1 ? '' : 's'}`);
      }
    }

    if (phase === TurnPhase.COMBAT_RESOLUTION) {
      const nation = this.activeNation();
      const battles = nation
        ? computePendingBattles(nation, this.plans(), this.units(), this.amphibious()).length
        : 0;
      if (battles > 0) {
        list.push(`${battles} unresolved battle${battles === 1 ? '' : 's'}`);
      }
    }

    return list;
  });

  protected readonly canAdvance = computed(() => this.blockers().length === 0);

  protected readonly advanceLabel = computed(() =>
    this.turnPhase() === TurnPhase.PLACE_NEW_UNITS ? 'End Turn' : 'Next Phase ▸',
  );

  // During placement, the panel's "Confirm & End Turn" button owns advancing (it commits the
  // player's staged placements first), so the header button is hidden to avoid bypassing them.
  protected readonly showAdvance = computed(() => this.turnPhase() !== TurnPhase.PLACE_NEW_UNITS);

  protected nextPhase(): void {
    this.turnFlow.advancePhase();
  }
}
