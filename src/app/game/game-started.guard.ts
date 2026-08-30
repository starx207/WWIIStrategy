import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { SessionSelectors } from '../session/session-selectors';

/** Blocks `/game` unless a game has been started or loaded; otherwise redirects to the landing page. */
export const gameStartedGuard: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);
  return store.selectSnapshot(SessionSelectors.started) ? true : router.parseUrl('/');
};
