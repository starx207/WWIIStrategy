import { Routes } from '@angular/router';
import { LandingPage } from './landing/landing-page';
import { NewGameSetup } from './setup/new-game-setup';
import { GameShell } from './game/game-shell/game-shell';
import { gameStartedGuard } from './game/game-started.guard';

export const routes: Routes = [
  { path: '', component: LandingPage },
  { path: 'setup', component: NewGameSetup },
  { path: 'game', component: GameShell, canActivate: [gameStartedGuard] },
  { path: '**', redirectTo: '' },
];
