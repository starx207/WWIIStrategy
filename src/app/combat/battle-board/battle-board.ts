import {
  Component,
  ViewChildren,
  QueryList,
  signal,
  computed,
  inject,
  OnInit,
  effect,
  viewChild,
} from '@angular/core';
import { Battalion } from '../battalion/battalion';
import { UpperCasePipe } from '@angular/common';
import { Store } from '@ngxs/store';
import { CombatActions, CombatRole } from '../combat.actions';
import { CombatSelectors } from '../combat-selectors';
import { Dice } from '@ww2/shared/dice/dice';
import { CombatPhase } from '../combat-phase';
import { ModalDialog } from '@ww2/shared/modal-dialog/modal-dialog';

const MAX_DICE_COUNT = 20;

@Component({
  selector: 'ww2-battle-board',
  imports: [Battalion, UpperCasePipe, Dice, ModalDialog],
  templateUrl: './battle-board.html',
  styleUrl: './battle-board.scss',
  host: {
    class: 'battle-board',
  },
})
export class BattleBoard implements OnInit {
  private store = inject(Store);

  readonly ATTACK_SQUAD_RANKS = [4, 3, 2, 1, 0];
  readonly DEFENSE_SQUAD_RANKS = [5, 4, 3, 2, 1];

  protected attackers = this.store.selectSignal(CombatSelectors.combatForce('attack'));
  protected defenders = this.store.selectSignal(CombatSelectors.combatForce('defend'));
  protected currentPhase = this.store.selectSignal(CombatSelectors.currentPhase);
  protected isCasualtyPhase = this.store.selectSignal(CombatSelectors.isCasualtyPhase);
  protected isCombatPhase = this.store.selectSignal(CombatSelectors.isFirePhase);
  protected pendingAttackerCasualtyCount = this.store.selectSignal(
    CombatSelectors.pendingHitCountForRole('attack'),
  );
  protected pendingDefenderCasualtyCount = this.store.selectSignal(
    CombatSelectors.pendingHitCountForRole('defend'),
  );
  protected outcome = this.store.selectSignal(CombatSelectors.outcome);
  protected canConfirmAttackerCasualties = this.store.selectSignal(
    CombatSelectors.canConfirmCasualties('attack'),
  );
  protected canConfirmDefenderCasualties = this.store.selectSignal(
    CombatSelectors.canConfirmCasualties('defend'),
  );
  protected resolutionSummary = this.store.selectSignal(CombatSelectors.resolutionSummary);

  activeBattalion = signal<Battalion | undefined>(undefined);
  protected outcomeDialog = viewChild(ModalDialog);

  activeUnits = computed(() => {
    const battalion = this.activeBattalion();
    const units = battalion?.battalionUnits() ?? [];
    if (units.length === 0) {
      return units;
    }

    return units.filter((unit) => battalion!.readyUnits().includes(unit));
  });
  activeBattalionStrength = computed(() => this.activeBattalion()?.strength() ?? 100);
  liveDiceValues = computed(() => {
    const values = this.activeUnits().length > 0 ? this.activeUnits().map(() => -1) : [];
    return values.length > MAX_DICE_COUNT ? values.slice(0, MAX_DICE_COUNT) : values;
  });

  readyForVolley = computed(() => {
    const activeBattalion = this.activeBattalion();
    const activeRole = activeBattalion?.role;
    const phase = this.currentPhase();
    const isCombat = this.isCombatPhase();
    const canFire = isCombat || (phase === CombatPhase.REGROUP && activeRole === 'attack');
    return this.outcome() === 'ongoing' && canFire && !!activeBattalion;
  });
  canRetreat = computed(() => this.currentPhase() === CombatPhase.REGROUP);
  outcomeTitle = computed(() => {
    const summary = this.resolutionSummary();
    if (!summary) {
      return '';
    }

    return summary.outcome === 'attackerVictory' ? 'Attacker Victory' : 'Defender Victory';
  });
  outcomeDescription = computed(() => {
    const summary = this.resolutionSummary();
    if (!summary) {
      return '';
    }

    switch (summary.resolutionReason) {
      case 'retreat':
        return 'The attacker broke off the battle and withdrew.';
      case 'attackersEliminated':
        return 'All attacking units were destroyed.';
      case 'defendersEliminated':
        return 'All defending units were destroyed.';
    }
  });
  territoryOutcome = computed(() => {
    const summary = this.resolutionSummary();
    if (!summary || !summary.territory) {
      return '';
    }

    if (summary.territoryCaptured) {
      return `${summary.territory} was captured by the attacker.`;
    }

    if (summary.outcome === 'attackerVictory') {
      return `${summary.territory} was cleared but could not be captured.`;
    }

    return `${summary.territory} remains under defender control.`;
  });
  roundsLabel = computed(() => {
    const rounds = this.resolutionSummary()?.rounds ?? 0;
    return `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
  });
  private readonly outcomeDialogEffect = effect(() => {
    const dialog = this.outcomeDialog();
    const summary = this.resolutionSummary();
    if (!dialog) {
      return;
    }

    if (summary) {
      dialog.open();
      return;
    }

    dialog.close();
  });

  @ViewChildren(Dice) diceComponents!: QueryList<Dice>;

  ngOnInit() {
    this.store.dispatch(new CombatActions.PreparingBattlefield());
  }

  closeOutcomeDialog(): void {
    this.outcomeDialog()?.close();
  }

  retreat(): void {
    this.activeBattalion.set(undefined);
    this.store.dispatch(new CombatActions.Retreat());
  }

  confirmCasualties(role: CombatRole): void {
    this.store.dispatch(new CombatActions.ConfirmCasualties(role));
  }

  rollDice(): void {
    if (!this.readyForVolley()) {
      return;
    }

    const battalion = this.activeBattalion();
    if (!battalion) {
      return;
    }
    if (battalion.role === 'attack' && this.currentPhase() === CombatPhase.REGROUP) {
      this.store.dispatch(new CombatActions.PressAttack());
    }
    const selectedBattalionStrength = battalion.strength();
    const selectedBattalionUnits = battalion.battalionUnits();

    this.diceComponents.forEach((dice) => dice.roll());
    const results = this.diceComponents.map((dc) => dc.value);

    this.store.dispatch(
      new CombatActions.CombatantsFiring(
        results,
        selectedBattalionStrength,
        selectedBattalionUnits,
        battalion.role,
      ),
    );
  }

  selectBattalion(battalion: Battalion): void {
    const phase = this.currentPhase();
    if (!phase) {
      return;
    }
    if (this.isCasualtyPhase()) {
      return;
    }
    if (phase === CombatPhase.REGROUP && battalion.role !== 'attack') {
      return; // Only attacker can choose to continue the battle from regroup
    }

    const hasReadyUnits =
      phase === CombatPhase.REGROUP
        ? battalion.battalionUnits().some((unit) => unit.attack > 0)
        : battalion.readyUnits().some((unit) => battalion.battalionUnits().includes(unit));
    if (hasReadyUnits) {
      this.diceComponents.forEach((dice) => (dice.value = -1)); // Reset any dice we already rolled previously
      this.activeBattalion.set(battalion);
    }
  }
}
