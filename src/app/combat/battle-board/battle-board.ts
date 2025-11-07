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
import { MilitaryUnitIcon } from '@ww2/shared/military-unit-icon';
import { Store } from '@ngxs/store';
import { CombatActions } from '../combat.actions';
import { CombatSelectors } from '../combat-selectors';
import { Dice } from '@ww2/shared/dice/dice';

@Component({
  selector: 'ww2-battle-board',
  imports: [Battalion, UpperCasePipe, Dice, MilitaryUnitIcon],
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
  protected diceHitIndices = this.store.selectSignal(CombatSelectors.hitIndices);
  protected pendingDiceHits = this.store.selectSignal(CombatSelectors.pendingHitIndices);
  protected activeRole = this.store.selectSignal(CombatSelectors.activeCombatRole);

  activeBattalion = signal<Battalion | undefined>(undefined);

  activeUnits = computed(() => this.activeBattalion()?.battalionUnits() ?? []);
  activeBattalionStrength = computed(() => this.activeBattalion()?.strength() ?? 100);

  readyForVolley = computed(() => this.activeBattalion() && this.pendingDiceHits().length === 0);

  @ViewChildren(Dice) diceComponents!: QueryList<Dice>;

  ngOnInit() {
    this.store.dispatch(new CombatActions.PreparingBattlefield());
  }

  rollDice(): void {
    const battalion = this.activeBattalion();
    if (!battalion) {
      return;
    }
    const selectedBattalionStrength = battalion.strength();
    const selectedBattalionUnits = battalion.battalionUnits();

    this.diceComponents.forEach((dice) => dice.roll());
    const results = this.diceComponents.map((dc) => dc.value());

    setTimeout(() => {
      this.store.dispatch(
        new CombatActions.CombatantsFiring(
          results,
          selectedBattalionStrength,
          selectedBattalionUnits
        )
      );
    }, 2000); // 2 sec delay so player can see the result of the roll before we handle the result
  }

  selectBattalion(battalion: Battalion): void {
    if (this.store.selectSnapshot(CombatSelectors.activeCombatRole) !== battalion.role) {
      return;
    }
    if (this.pendingDiceHits().length > 0) {
      return; // Casualties must be elected before selecting a new battalion for firing
    }

    const hasReadyUnits = battalion
      .readyUnits()
      .some((unit) => battalion.battalionUnits().includes(unit));
    if (hasReadyUnits) {
      this.activeBattalion.set(battalion);
    }
  }
}
