import { Component, computed, input, output } from '@angular/core';
import { MilitaryUnitIcon } from '../military-unit-icon';
import { MilitaryUnitSquad } from '../military-unit-squad';

export type SquadDirection = 'left-face' | 'right-face';

@Component({
  selector: 'ww2-squad',
  imports: [MilitaryUnitIcon],
  templateUrl: './squad-component.html',
  styleUrl: './squad-component.scss',
  host: {
    '[class]': 'hostClasses()',
    '(click)': 'selectSquad()',
  },
})
export class SquadComponent {
  squad = input.required<MilitaryUnitSquad>();
  selected = output();
  direction = input<SquadDirection>('left-face');
  disabled = input(false, {
    transform: (value: boolean | string) => (typeof value === 'string' ? value === '' : value),
  });

  protected unitType = computed(() => this.squad().type);
  protected nationality = computed(() => this.squad().nationality);
  protected unitCount = computed(() => this.squad().count);

  protected hostClasses = computed(
    () =>
      `military-unit-squad military-unit-squad__${this.direction()} ${
        this.disabled() ? 'military-unit-squad__disabled' : ''
      }`
  );

  protected selectSquad() {
    if (this.disabled()) {
      return;
    }
    this.selected.emit();
  }
}
