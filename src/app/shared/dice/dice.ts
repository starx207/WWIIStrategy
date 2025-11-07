import { Component, computed, input, signal } from '@angular/core';

// TODO: We'll need dice for other things in the game, so move it to the "shared" folder
@Component({
  selector: 'ww2-dice',
  imports: [],
  templateUrl: './dice.html',
  styleUrl: './dice.scss',
  host: {
    '[class]': 'hostClasses()',
  },
})
export class Dice {
  private rolledValue = signal<number | null>(null);

  value = computed(() => this.rolledValue() ?? 6);

  protected hostClasses = computed(() => `dice dice__value__${this.value()}`);

  roll(): void {
    // Generate random number from 1 to 6 with equal probability
    const randomValue = Math.floor(Math.random() * 6) + 1;
    this.rolledValue.set(randomValue);
  }
}
