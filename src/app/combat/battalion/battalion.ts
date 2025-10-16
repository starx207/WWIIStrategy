import { Component, computed, input } from '@angular/core';
import { Nationality } from '@ww2/shared/nationality';
import {
  SquadDirection,
  MilitaryUnitSquad,
} from '@ww2/shared/military-unit-squad/military-unit-squad';
import { UnitType } from '@ww2/shared/unit-type';
import { MilitaryUnit } from '@ww2/shared/military-unit';

export type BattalionRole = 'attack' | 'defend';

@Component({
  selector: 'ww2-battalion',
  imports: [MilitaryUnitSquad],
  templateUrl: './battalion.html',
  styleUrl: './battalion.scss',
  host: {
    '[class]': 'hostClasses()',
  },
})
export class Battalion {
  nationality = input.required<Nationality>();
  strength = input.required<number>();
  role = input.required<BattalionRole>();

  fromArmy = input<MilitaryUnit[]>([]);
  unitTypes = input<UnitType[]>([]);

  protected hostClasses = computed(() => `battalion battalion__${this.role()}`);
  protected squadDirection = computed<SquadDirection>(() =>
    this.role() == 'defend' ? 'left-face' : 'right-face'
  );
  protected randomCount = Math.floor(Math.random() * 25);
  protected strengthFilterUnits = computed(() =>
    this.fromArmy().filter(
      (unit) => (this.role() == 'attack' ? unit.attack : unit.defense) == this.strength()
    )
  );

  protected squads = computed(() => {
    const groups: Record<string, MilitaryUnit[]> = {};

    this.strengthFilterUnits().forEach((unit) => {
      const groupKey = `${unit.type}-${unit.nationality}`;
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(unit);
    });

    return Object.values(groups);
  });
}
