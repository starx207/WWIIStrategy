import { Component, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { GameSelectors } from '@ww2/game/game-selectors';
import { MENU_ACTIONS, MenuAction, MenuOption } from '../menu-actions';

@Component({
  selector: 'ww2-app-header',
  imports: [],
  templateUrl: './app-header.html',
  styleUrl: './app-header.scss',
})
export class AppHeader {
  private readonly store = inject(Store);
  protected readonly contextualMenuOptions = this.store.selectSignal(GameSelectors.contextualMenu);

  protected dispatchMenuAction(actionId: MenuAction) {
    const action = MENU_ACTIONS[actionId]();
    this.store.dispatch(action);
  }

  protected menuOptionTracking(index: number, option: MenuOption) {
    return option.id === 'header-label' ? `${option.id}-${index}` : option.id;
  }
}
