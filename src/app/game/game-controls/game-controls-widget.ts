import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GameSessionService } from '../game-session.service';

/**
 * Header widget with the game-wide controls (save to file, return to the main menu) and the
 * save-file-name dialog. Lives in the header so it sits to the right of the contextual widgets.
 */
@Component({
  selector: 'ww2-game-controls-widget',
  imports: [],
  templateUrl: './game-controls-widget.html',
  styleUrl: './game-controls-widget.scss',
})
export class GameControlsWidget {
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
