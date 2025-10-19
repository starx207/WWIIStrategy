import { Component, computed, input, output } from '@angular/core';
import { SquadDirection, SquadComponent } from '@ww2/shared/squad-component/squad-component';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { createSquads } from '@ww2/shared/military-unit-squad';

export type BattalionRole = 'attack' | 'defend';

@Component({
  selector: 'ww2-battalion',
  imports: [SquadComponent],
  templateUrl: './battalion.html',
  styleUrl: './battalion.scss',
  host: {
    '[class]': 'hostClasses()',
  },
})
export class Battalion {
  strength = input.required<number>();
  role = input.required<BattalionRole>();

  fromArmy = input<MilitaryUnit[]>([]);

  battalionUnits = computed(() =>
    this.fromArmy().filter(
      (unit) => (this.role() == 'attack' ? unit.attack : unit.defense) == this.strength()
    )
  );

  protected hostClasses = computed(() => `battalion battalion__${this.role()}`);
  protected squadDirection = computed<SquadDirection>(() =>
    this.role() == 'defend' ? 'left-face' : 'right-face'
  );

  protected squads = computed(() => createSquads(this.battalionUnits()));
}
