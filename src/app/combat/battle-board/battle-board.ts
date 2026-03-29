import {
  Component,
  ViewChildren,
  QueryList,
  signal,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { Battalion } from '../battalion/battalion';
import { UpperCasePipe } from '@angular/common';
import { Store } from '@ngxs/store';
import { CombatActions, CombatRole } from '../combat.actions';
import { CombatSelectors } from '../combat-selectors';
import { Dice } from '@ww2/shared/dice/dice';
import { CombatPhase } from '../combat-phase';

const MAX_DICE_COUNT = 20;

@Component({
  selector: 'ww2-battle-board',
  imports: [Battalion, UpperCasePipe, Dice],
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

  activeBattalion = signal<Battalion | undefined>(undefined);

  activeUnits = computed(() => this.activeBattalion()?.battalionUnits() ?? []);
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

  @ViewChildren(Dice) diceComponents!: QueryList<Dice>;

  ngOnInit() {
    this.store.dispatch(new CombatActions.PreparingBattlefield());
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
