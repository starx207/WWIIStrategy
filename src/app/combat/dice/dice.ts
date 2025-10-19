import { Component, computed, input, signal } from '@angular/core';

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

  hit = input(false);

  value = computed(() => this.rolledValue() ?? 1);

  protected hostClasses = computed(
    () => `dice dice__value__${this.value()}${this.hit() ? ' dice__hit' : ''}`
  );

  roll(): void {
    // Generate random number from 1 to 6 with equal probability
    const randomValue = Math.floor(Math.random() * 6) + 1;
    this.rolledValue.set(randomValue);
  }
}
