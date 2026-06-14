import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { withNgxsReduxDevtoolsPlugin } from '@ngxs/devtools-plugin';
import { withNgxsRouterPlugin } from '@ngxs/router-plugin';
import { withNgxsStoragePlugin } from '@ngxs/storage-plugin';
import { provideStore } from '@ngxs/store';
import { provideHttpClient } from '@angular/common/http';
import { CombatState } from './combat/combat-state';
import { MapState } from './map/map-state';
import { SettingsState } from './settings/settings-state';
import { GameState } from './game/game-state';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(),
    provideStore(
      [CombatState, MapState, SettingsState, GameState],
      withNgxsReduxDevtoolsPlugin(),
      withNgxsRouterPlugin(),
      withNgxsStoragePlugin({
        keys: '*',
      })
    ),
  ],
};
