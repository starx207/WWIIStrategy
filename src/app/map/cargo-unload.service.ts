import { Injectable, signal } from '@angular/core';

/**
 * Transient UI intent for a partial transport unload: which loaded cargo unit ids the *next* unload
 * order should drop. `null` means "unload the whole cargo" — the no-split default. The set is
 * consumed when the player clicks an unload coast (see `GameMap`/`MapActions.PlanSquadMovementStep`)
 * and reset whenever the selection changes, so it never leaks across transports. Kept out of NGXS map
 * state deliberately: it is ephemeral and not part of the saved game.
 */
@Injectable({ providedIn: 'root' })
export class CargoUnloadService {
  readonly selectedUnitIds = signal<string[] | null>(null);

  reset(): void {
    this.selectedUnitIds.set(null);
  }
}
