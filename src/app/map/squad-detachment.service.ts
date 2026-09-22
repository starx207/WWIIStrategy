import { Injectable, signal } from '@angular/core';

/**
 * Transient UI intent for splitting a squad: how many units of the currently selected stack the
 * *next* movement order should move. `null` means "the whole (remaining) stack" — the no-split
 * default. The count is consumed when the player clicks a destination (see
 * `GameMap`/`MapActions.PlanSquadMovementStep`) and reset whenever the selection changes, so it
 * never leaks across squads. Kept out of NGXS map state deliberately: it is ephemeral and not part
 * of the saved game.
 */
@Injectable({ providedIn: 'root' })
export class SquadDetachmentService {
  readonly count = signal<number | null>(null);

  reset(): void {
    this.count.set(null);
  }
}
