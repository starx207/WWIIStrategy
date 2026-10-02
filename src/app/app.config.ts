import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { withNgxsReduxDevtoolsPlugin } from '@ngxs/devtools-plugin';
import { withNgxsRouterPlugin } from '@ngxs/router-plugin';
import { StorageOption, withNgxsStoragePlugin } from '@ngxs/storage-plugin';
import { provideStore } from '@ngxs/store';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HEADER_WIDGETS } from './app-header/header-widget';
import { InvalidMovementBadge } from './map/invalid-movement-badge/invalid-movement-badge';
import { TreasuryWidget } from './economy/treasury-widget/treasury-widget';
import { PhaseControl } from './game/phase-control/phase-control';
import { withNgxsResetPlugin } from 'ngxs-reset-plugin';
import { ALL_GAME_STATES } from './game/all-game-states';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withXhr()),
    provideStore(
      [...ALL_GAME_STATES],
      withNgxsReduxDevtoolsPlugin(),
      withNgxsRouterPlugin(),
      withNgxsStoragePlugin({
        keys: '*',
        storage: StorageOption.LocalStorage,
      }),
      withNgxsResetPlugin(),
    ),
    // Treasuries sit leftmost, then the contextual phase/movement widgets.
    { provide: HEADER_WIDGETS, useValue: TreasuryWidget, multi: true },
    { provide: HEADER_WIDGETS, useValue: PhaseControl, multi: true },
    { provide: HEADER_WIDGETS, useValue: InvalidMovementBadge, multi: true },
  ],
};
