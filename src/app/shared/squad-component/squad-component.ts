import { CdkMenuModule } from '@angular/cdk/menu';
import { Component, computed, input, output } from '@angular/core';
import { MilitaryUnitIcon } from '../military-unit-icon';
import { MilitaryUnitSquad } from '../military-unit-squad';
import {
  ContextMenuAction,
  ContextMenuActionSelected,
  ContextMenuComponent,
} from '../context-menu/context-menu';
import { EffectiveUnit } from '../effective-unit';
import { MilitaryUnit } from '../military-unit';

export type SquadDirection = 'left-face' | 'right-face';

export type SquadContextAction<T extends EffectiveUnit | MilitaryUnit = MilitaryUnit> =
  ContextMenuAction<MilitaryUnitSquad<T>>;
export interface SquadContextActionSelected<T extends EffectiveUnit | MilitaryUnit = MilitaryUnit> {
  action: SquadContextAction<T>;
  squad: MilitaryUnitSquad<T>;
}

@Component({
  selector: 'ww2-squad',
  imports: [CdkMenuModule, MilitaryUnitIcon, ContextMenuComponent],
  templateUrl: './squad-component.html',
  styleUrl: './squad-component.scss',
  host: {
    '[class]': 'hostClasses()',
    '(click)': 'selectSquad()',
  },
})
export class SquadComponent<T extends EffectiveUnit | MilitaryUnit = MilitaryUnit> {
  squad = input.required<MilitaryUnitSquad<T>>();
  selected = output();
  contextMenuActionSelected = output<SquadContextActionSelected<T>>();
  direction = input<SquadDirection>('left-face');
  contextMenuActions = input<SquadContextAction<T>[]>([]);
  disabled = input(false, {
    transform: (value: boolean | string) => (typeof value === 'string' ? value === '' : value),
  });

  protected unitType = computed(() => this.squad().type);
  protected variant = computed(() => this.squad().displayVariant);
  protected nationality = computed(() => this.squad().nationality);
  protected unitCount = computed(() => this.squad().count);

  protected hostClasses = computed(
    () =>
      `military-unit-squad military-unit-squad__${this.direction()} ${
        this.disabled() ? 'military-unit-squad__disabled' : ''
      }`,
  );

  protected selectSquad() {
    if (this.disabled()) {
      return;
    }
    this.selected.emit();
  }

  protected onContextMenuActionSelected(event: ContextMenuActionSelected<MilitaryUnitSquad<T>>) {
    this.contextMenuActionSelected.emit({ action: event.action, squad: event.context });
  }
}
