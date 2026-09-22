import { Component, computed, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { MilitaryUnitIcon } from '@ww2/shared/military-unit-icon';
import { MapSelectors } from '../map-selectors';
import { SquadDetachmentService } from '../squad-detachment.service';
import { parseSquadId } from '../rules/movement-execution';

/**
 * A single "Move N of M" +/- stepper for splitting the selected stack. It shows only when the
 * selected squad has more than one unit available and no order has started yet (see
 * `MapSelectors.selectedSquadDetachableCount`). Unlike the landing picker there is no Confirm
 * button — the player commits the split by clicking a destination on the map, which is why the
 * docking wrapper stays pointer-events:none. Choosing the full count (the default) plans an
 * ordinary whole-stack move.
 */
@Component({
  selector: 'ww2-squad-detachment-picker',
  imports: [MilitaryUnitIcon],
  templateUrl: './squad-detachment-picker.html',
  styleUrl: './squad-detachment-picker.scss',
})
export class SquadDetachmentPicker {
  private readonly store = inject(Store);
  private readonly detachment = inject(SquadDetachmentService);

  private readonly selectedSquad = this.store.selectSignal(MapSelectors.selectedSquad);
  protected readonly total = this.store.selectSignal(MapSelectors.selectedSquadDetachableCount);

  protected readonly visible = computed(() => this.total() > 1);

  /** The chosen count, clamped to the current stack size (defaults to the whole stack). */
  protected readonly count = computed(() => {
    const total = this.total();
    const chosen = this.detachment.count() ?? total;
    return Math.max(1, Math.min(chosen, total));
  });

  protected readonly staying = computed(() => this.total() - this.count());

  protected readonly nationality = computed(
    () => parseSquadId(this.selectedSquad()?.id ?? '')?.nationality,
  );
  protected readonly unitType = computed(
    () => parseSquadId(this.selectedSquad()?.id ?? '')?.unitType,
  );

  protected readonly canIncrement = computed(() => this.count() < this.total());
  protected readonly canDecrement = computed(() => this.count() > 1);

  protected adjust(delta: number): void {
    const next = Math.max(1, Math.min(this.count() + delta, this.total()));
    this.detachment.count.set(next);
  }
}
