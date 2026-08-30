import { Component, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { MapSelectors } from '../map-selectors';

@Component({
  selector: 'ww2-invalid-movement-badge',
  imports: [],
  templateUrl: './invalid-movement-badge.html',
  styleUrl: './invalid-movement-badge.scss',
})
export class InvalidMovementBadge {
  private readonly store = inject(Store);
  // TODO: make this clickable to jump-select the next invalid squad
  protected readonly invalidMovementPlanCount = this.store.selectSignal(
    MapSelectors.invalidMovementPlanCount,
  );
}
