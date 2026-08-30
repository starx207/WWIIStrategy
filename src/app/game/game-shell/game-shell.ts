import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppHeader } from '../../app-header/app-header';
import { GameMap } from '@ww2/map/game-map/game-map';
import { GameSessionService } from '../game-session.service';

@Component({
  selector: 'ww2-game-shell',
  imports: [AppHeader, GameMap],
  templateUrl: './game-shell.html',
  styleUrl: './game-shell.scss',
})
export class GameShell {
  private readonly session = inject(GameSessionService);
  private readonly router = inject(Router);

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
