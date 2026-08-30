import { Component, inject } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { Store } from '@ngxs/store';
import { GameSelectors } from '@ww2/game/game-selectors';
import { MENU_ACTIONS, MenuAction, MenuOption } from '../menu-actions';
import { HEADER_WIDGETS } from './header-widget';

@Component({
  selector: 'ww2-app-header',
  imports: [NgComponentOutlet],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
})
export class AppHeader {
  private readonly store = inject(Store);
  // TODO: convert the contextualMenu label/buttons (see menu-actions.ts, GameActions.SetContextualMenu)
  //       into HEADER_WIDGETS components for consistency.
  protected readonly contextualMenuOptions = this.store.selectSignal(GameSelectors.contextualMenu);
  protected readonly headerWidgets = inject(HEADER_WIDGETS, { optional: true }) ?? [];

  protected dispatchMenuAction(actionId: MenuAction) {
    const action = MENU_ACTIONS[actionId]();
    this.store.dispatch(action);
  }

  protected menuOptionTracking(index: number, option: MenuOption) {
    return option.id === 'header-label' ? `${option.id}-${index}` : option.id;
  }
}
