import { Component, computed, input } from '@angular/core';
import { UnitType } from '../unit-type';
import { MilitaryUnitIcon } from '../military-unit-icon';
import { Nationality } from '../nationality';
import { MilitaryUnit } from '../military-unit';

export type SquadDirection = 'left-face' | 'right-face';

@Component({
  selector: 'ww2-military-unit-squad',
  imports: [MilitaryUnitIcon],
  templateUrl: './military-unit-squad.html',
  styleUrl: './military-unit-squad.scss',
  host: {
    '[class]': 'hostClasses()',
  },
})
export class MilitaryUnitSquad {
  units = input.required<MilitaryUnit[]>();
  direction = input<SquadDirection>('left-face');

  protected unitType = computed(() =>
    this.units().length == 0 ? UnitType.INFANTRY : this.units()[0].type
  );
  protected nationality = computed(() =>
    this.units().length == 0 ? Nationality.SOVIET_UNION : this.units()[0].nationality
  );
  protected unitCount = computed(() => this.units().length);

  protected hostClasses = computed(
    () => `military-unit-squad military-unit-squad__${this.direction()}`
  );
}
