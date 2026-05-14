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
import { CombatProfileId } from '@ww2/shared/effective-unit';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { HitPool } from '@ww2/shared/hit-pool';

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

  protected readonly CombatPhase = CombatPhase;
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
  protected pendingAttackerHitPool = this.store.selectSignal(
    CombatSelectors.pendingHitPoolForRole('attack'),
  );
  protected pendingDefenderHitPool = this.store.selectSignal(
    CombatSelectors.pendingHitPoolForRole('defend'),
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
  activeUnits = signal<MilitaryUnit[]>([]);
  activeProfileId = signal<CombatProfileId | undefined>(undefined);
  activeShotCount = signal(0);
  protected outcomeDialog = viewChild(ModalDialog);

  activeBattalionStrength = computed(() => this.activeBattalion()?.strength() ?? 100);
  pendingAttackerCasualtyLabel = computed(() =>
    this.formatPendingHitLabel(this.pendingAttackerCasualtyCount(), this.pendingAttackerHitPool()),
  );
  pendingDefenderCasualtyLabel = computed(() =>
    this.formatPendingHitLabel(this.pendingDefenderCasualtyCount(), this.pendingDefenderHitPool()),
  );
  liveDiceValues = computed(() => {
    const diceCount = this.activeShotCount();
    const values = diceCount > 0 ? Array.from({ length: diceCount }, () => -1) : [];
    return values.length > MAX_DICE_COUNT ? values.slice(0, MAX_DICE_COUNT) : values;
  });

  readyForVolley = computed(() => {
    const activeBattalion = this.activeBattalion();
    return this.outcome() === 'ongoing' && this.isCombatPhase() && !!activeBattalion;
  });
  isRegroup = computed(() => this.currentPhase() === CombatPhase.REGROUP);
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
    this.clearActiveVolley();
    this.store.dispatch(new CombatActions.Retreat());
  }

  pressAttack(): void {
    if (!this.isRegroup()) {
      return;
    }

    this.clearActiveVolley();
    this.store.dispatch(new CombatActions.PressAttack());
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
    const selectedBattalionUnits = this.activeUnits();
    const selectedProfileId = this.activeProfileId();
    if (!selectedProfileId) {
      return;
    }

    this.diceComponents.forEach((dice) => dice.roll());
    const results = this.diceComponents.map((dc) => dc.value);

    this.store.dispatch(
      new CombatActions.CombatantsFiring(
        results,
        selectedBattalionUnits,
        battalion.role,
        selectedProfileId,
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
    if (phase === CombatPhase.REGROUP) {
      return;
    }

    const selectableUnits = battalion.selectableUnits();
    const selectedProfile = battalion.selectedProfile();
    if (battalion.canFire() && selectedProfile) {
      this.diceComponents.forEach((dice) => (dice.value = -1)); // Reset any dice we already rolled previously
      this.activeUnits.set(selectableUnits);
      this.activeProfileId.set(selectedProfile.id);
      this.activeShotCount.set(battalion.selectedShotCount());
      this.activeBattalion.set(battalion);
    }
  }

  private formatPendingHitLabel(totalHits: number, hitPool: HitPool): string {
    const restrictedHits = [
      { label: 'sea', count: hitPool['sea-unit'] ?? 0 },
      {
        label: 'air',
        count: (hitPool['air-unit'] ?? 0) + (hitPool['aa-vulnerable-air-unit'] ?? 0),
      },
    ].filter((item) => item.count > 0);

    if (restrictedHits.length === 0) {
      return `${totalHits}`;
    }

    const restrictedLabel = restrictedHits.map((item) => `${item.count} ${item.label}`).join(', ');
    return `${totalHits} - ${restrictedLabel}`;
  }

  private clearActiveVolley(): void {
    this.activeBattalion.set(undefined);
    this.activeUnits.set([]);
    this.activeProfileId.set(undefined);
    this.activeShotCount.set(0);
  }
}
