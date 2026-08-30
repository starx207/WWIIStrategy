import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { AppHeader } from '../../app-header/app-header';
import { GameMap } from '@ww2/map/game-map/game-map';
import { GameSelectors } from '@ww2/game/game-selectors';
import { TurnPhase } from '@ww2/game/turn-phase';
import { PurchasePanel } from '../../production/purchase-panel/purchase-panel';
import { GameSessionService } from '../game-session.service';

@Component({
  selector: 'ww2-game-shell',
  imports: [AppHeader, GameMap, PurchasePanel],
  templateUrl: './game-shell.html',
  styleUrl: './game-shell.scss',
})
export class GameShell {
  private readonly session = inject(GameSessionService);
  private readonly router = inject(Router);
  private readonly store = inject(Store);

  protected readonly TurnPhase = TurnPhase;
  protected readonly turnPhase = this.store.selectSignal(GameSelectors.turnPhase);

  protected readonly saveDialogOpen = signal(false);
  protected readonly saveFileName = signal('');

  protected openSaveDialog(): void {
    this.saveFileName.set(this.session.suggestedSaveFileName());
    this.saveDialogOpen.set(true);
  }

  protected cancelSave(): void {
    this.saveDialogOpen.set(false);
  }

  protected confirmSave(): void {
    const fileName = this.saveFileName().trim();
    if (!fileName) {
      return;
    }
    this.session.saveToFile(fileName);
    this.saveDialogOpen.set(false);
  }

  protected updateSaveFileName(value: string): void {
    this.saveFileName.set(value);
  }

  protected exitToMenu(): void {
    this.router.navigateByUrl('/');
  }
}
