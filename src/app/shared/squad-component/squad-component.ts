import { Component, computed, input } from '@angular/core';
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
  },
})
export class SquadComponent {
  squad = input.required<MilitaryUnitSquad>();
  direction = input<SquadDirection>('left-face');

  protected unitType = computed(() => this.squad().type);
  protected nationality = computed(() => this.squad().nationality);
  protected unitCount = computed(() => this.squad().count);

  protected hostClasses = computed(
    () => `military-unit-squad military-unit-squad__${this.direction()}`
  );
}
