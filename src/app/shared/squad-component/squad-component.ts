import { CdkMenuModule } from '@angular/cdk/menu';
import { Component, computed, input, output } from '@angular/core';
import { MilitaryUnitIcon } from '../military-unit-icon';
import { MilitaryUnitSquad } from '../military-unit-squad';
import { getHitPoints } from '../effective-unit.reducer';
import {
  ContextMenuAction,
  ContextMenuActionSelected,
  ContextMenuComponent,
} from '../context-menu/context-menu';

export type SquadDirection = 'left-face' | 'right-face';

export type SquadContextAction = ContextMenuAction<MilitaryUnitSquad>;
export interface SquadContextActionSelected {
  action: SquadContextAction;
  squad: MilitaryUnitSquad;
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
export class SquadComponent {
  squad = input.required<MilitaryUnitSquad>();
  selected = output();
  contextMenuActionSelected = output<SquadContextActionSelected>();
  direction = input<SquadDirection>('left-face');
  contextMenuActions = input<SquadContextAction[]>([]);
  disabled = input(false, {
    transform: (value: boolean | string) => (typeof value === 'string' ? value === '' : value),
  });

  protected unitType = computed(() => this.squad().type);
  protected hpRemaining = computed(() => this.squad().hpRemaining);
  protected hpMax = computed(() => {
    const unit = this.squad().units[0];
    return unit ? getHitPoints(unit) : undefined;
  });
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

  protected onContextMenuActionSelected(event: ContextMenuActionSelected<MilitaryUnitSquad>) {
    this.contextMenuActionSelected.emit({ action: event.action, squad: event.context });
  }
}
