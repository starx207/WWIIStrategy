import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { GameSessionService } from '../game/game-session.service';

@Component({
  selector: 'ww2-landing-page',
  imports: [],
  templateUrl: './landing-page.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './landing-page.scss',
})
export class LandingPage {
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);

  protected readonly loadError = signal<string | null>(null);

  protected startNewGame(): void {
    this.router.navigateByUrl('/setup');
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      this.session.loadFromFile(file.name, text);
      this.loadError.set(null);
      await this.router.navigateByUrl('/game');
    } catch (error) {
      this.loadError.set((error as Error).message);
    } finally {
      // Allow re-selecting the same file after a failure.
      input.value = '';
    }
  }
}
