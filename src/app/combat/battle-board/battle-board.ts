import { Component, ViewChildren, QueryList, signal, computed, inject } from '@angular/core';
import { Battalion } from '../battalion/battalion';
import { UpperCasePipe } from '@angular/common';
import { Dice } from '../dice/dice';
import { MilitaryUnitIcon } from '@ww2/shared/military-unit-icon';
import { CombatService } from '../combat-service';

@Component({
  selector: 'ww2-battle-board',
  imports: [Battalion, UpperCasePipe, Dice, MilitaryUnitIcon],
  templateUrl: './battle-board.html',
  styleUrl: './battle-board.scss',
  host: {
    class: 'battle-board',
  },
})
export class BattleBoard {
  readonly ATTACK_SQUAD_RANKS = [4, 3, 2, 1, 0];
  readonly DEFENSE_SQUAD_RANKS = [5, 4, 3, 2, 1];

  combatService = inject(CombatService);

  get attackers() {
    return this.combatService.attackers;
  }
  get defenders() {
    return this.combatService.defenders;
  }

  activeBattalion = signal<Battalion | undefined>(undefined);

  activeUnits = computed(() => this.activeBattalion()?.battalionUnits() ?? []);
  activeBattalionStrength = computed(() => this.activeBattalion()?.strength() ?? 100);

  @ViewChildren(Dice) diceComponents!: QueryList<Dice>;

  rollDice(): void {
    this.diceComponents.forEach((dice) => dice.roll());
  }

  selectBattalion(battalion: Battalion): void {
    this.activeBattalion.set(battalion);
  }
}
