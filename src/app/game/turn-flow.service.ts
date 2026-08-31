import { Injectable, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import {
  NATIONALITIES_IN_TURN_ORDER,
  nationalityForGamePhase,
  gamePhaseForNationality,
} from './game-phase';
import { Nationality } from '@ww2/shared/nationality';
import { LandTerritoryName } from '../territories/territory-names';
import { GameSelectors } from './game-selectors';
import { GameActions } from './game-actions';
import { GamePhase } from './game-phase';
import { TurnPhase } from './turn-phase';
import { MapSelectors } from '@ww2/map/map-selectors';
import { MapActions } from '@ww2/map/map-actions';
import { EconomyActions } from '@ww2/economy/economy-actions';
import { CAPITAL_OWNER_BY_TERRITORY } from '@ww2/economy/data/capitals';
import { CombatOrchestrator } from '@ww2/combat/combat-orchestrator';
import { SessionSelectors } from '../session/session-selectors';
import { SessionActions } from '../session/session-actions';
import { VictoryStatus, evaluateVictory } from '@ww2/victory/rules/victory';

/**
 * Advances the game through phases and turns, running the side effects that belong at each
 * boundary: applying non-combat movement, transferring captured territory, seizing a captured
 * capital's treasury, collecting income, checking for victory, and gating the pass-the-device
 * handoff between nations.
 */
@Injectable({ providedIn: 'root' })
export class TurnFlowService {
  private readonly store = inject(Store);
  private readonly combatOrchestrator = inject(CombatOrchestrator);

  /** True while the end-of-turn interstitial should be shown. */
  readonly handoffPending = signal(false);
  /** The nation that plays next once the handoff is acknowledged. */
  readonly pendingNextNation = signal<Nationality | null>(null);
  /** Set when a side has met the victory condition. */
  readonly victoryResult = signal<VictoryStatus | null>(null);

  /** Clear transient turn-flow UI state (called when starting or loading a game). */
  reset(): void {
    this.handoffPending.set(false);
    this.pendingNextNation.set(null);
    this.victoryResult.set(null);
  }

  private gamePhase(): GamePhase {
    return this.store.selectSnapshot(GameSelectors.gamePhase);
  }

  private turnPhase(): TurnPhase {
    return this.store.selectSnapshot(GameSelectors.turnPhase);
  }

  private currentNation(): Nationality | undefined {
    return nationalityForGamePhase(this.gamePhase());
  }

  /** Human-readable reasons the current phase can't be advanced yet (empty = free to advance). */
  advanceBlockers(): string[] {
    const blockers: string[] = [];
    const phase = this.turnPhase();

    if (phase === TurnPhase.COMBAT_MOVEMENT || phase === TurnPhase.NON_COMBAT_MOVEMENT) {
      const invalid = this.store.selectSnapshot(MapSelectors.invalidMovementPlanCount);
      if (invalid > 0) {
        blockers.push(`${invalid} invalid move${invalid === 1 ? '' : 's'}`);
      }
    }

    if (phase === TurnPhase.COMBAT_RESOLUTION) {
      const battles = this.combatOrchestrator.pendingBattles().length;
      if (battles > 0) {
        blockers.push(`${battles} unresolved battle${battles === 1 ? '' : 's'}`);
      }
    }

    return blockers;
  }

  canAdvance(): boolean {
    return this.advanceBlockers().length === 0;
  }

  /** Advance to the next phase, or end the turn if we're at the last phase. */
  advancePhase(): void {
    if (!this.canAdvance()) {
      return;
    }

    const phase = this.turnPhase();
    const nation = this.currentNation();

    // Leaving combat movement: resolve anti-aircraft fire over fly-over territories, then
    // undefended captures and blitz, before battles are shown.
    if (phase === TurnPhase.COMBAT_MOVEMENT && nation) {
      this.combatOrchestrator.resolveAntiAircraftFire();
      this.store.dispatch(new MapActions.ResolveAutomaticCaptures(nation));
    }

    if (phase === TurnPhase.NON_COMBAT_MOVEMENT) {
      this.store.dispatch(new MapActions.ApplyMovementPlans(TurnPhase.NON_COMBAT_MOVEMENT));
    }

    if (phase === TurnPhase.PLACE_NEW_UNITS) {
      this.endTurn();
      return;
    }

    this.store.dispatch(new GameActions.AdvanceTurnPhase());
  }

  /** Acknowledge the handoff interstitial and begin the next nation's turn. */
  completeHandoff(): void {
    const next = this.pendingNextNation();
    if (next == null) {
      return;
    }
    this.store.dispatch([
      new GameActions.SetGamePhase(gamePhaseForNationality(next)),
      new GameActions.SetTurnPhase(TurnPhase.PURCHASE_UNITS),
    ]);
    this.handoffPending.set(false);
    this.pendingNextNation.set(null);
  }

  private endTurn(): void {
    const nation = this.currentNation();
    if (!nation) {
      return;
    }

    // Seize the treasury of any power whose capital this nation captured this turn.
    const pendingCaptures = this.store.selectSnapshot(MapSelectors.pendingCapturesByTerritory);
    for (const [territory, captor] of Object.entries(pendingCaptures)) {
      const victim = CAPITAL_OWNER_BY_TERRITORY[territory as LandTerritoryName];
      if (victim && captor && victim !== captor) {
        this.store.dispatch(new EconomyActions.SeizeTreasury(victim, captor));
      }
    }

    // Transfer captured territory, then collect income on the resulting control map.
    this.store.dispatch(new MapActions.ApplyPendingCaptures());
    this.store.dispatch(new EconomyActions.CollectIncome(nation));

    // Determine who plays next; after the US turn the round ends and victory is checked.
    if (nation === Nationality.UNITED_STATES) {
      const condition = this.store.selectSnapshot(SessionSelectors.houseRules).victoryCondition;
      const landControl = this.store.selectSnapshot(MapSelectors.landTerritoryControllerByName);
      const status = evaluateVictory(landControl, condition);
      if (status.winner) {
        this.victoryResult.set(status);
        return;
      }
      this.store.dispatch(new SessionActions.IncrementRound());
      this.pendingNextNation.set(Nationality.SOVIET_UNION);
    } else {
      const order = NATIONALITIES_IN_TURN_ORDER;
      this.pendingNextNation.set(order[order.indexOf(nation) + 1] ?? Nationality.SOVIET_UNION);
    }

    this.handoffPending.set(true);
  }
}
