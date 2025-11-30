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
import { provideHttpClient } from '@angular/common/http';
import { CombatState } from './combat/combat-state';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(),
    provideStore(
      [CombatState],
      withNgxsReduxDevtoolsPlugin(),
      withNgxsRouterPlugin()
      // withNgxsStoragePlugin({
      //   keys: '*',
      //   storage: StorageOption.SessionStorage, // TODO: I want to use local storage in final version
      // })
    ),
  ],
};
