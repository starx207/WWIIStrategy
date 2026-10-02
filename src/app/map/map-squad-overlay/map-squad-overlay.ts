import {
  Component,
  computed,
  inject,
  input,
  output,
  ViewEncapsulation,
  ChangeDetectionStrategy,
} from '@angular/core';
import { SquadComponent } from '@ww2/shared/squad-component/squad-component';
import { MapSquadLayout } from '../map-squad-layout';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { Store } from '@ngxs/store';
import { MapSelectors } from '../map-selectors';

export type MapSquadOverlayVariant = 'normal' | 'movement-start' | 'movement-final';

@Component({
  selector: 'ww2-map-squad-overlay',
  imports: [SquadComponent],
  templateUrl: './map-squad-overlay.html',
  styleUrl: './map-squad-overlay.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  encapsulation: ViewEncapsulation.None,
})
export class MapSquadOverlay {
  id = input.required<string>();
  layout = input.required<MapSquadLayout>();
  variant = input<MapSquadOverlayVariant>('normal');
  /** True when this squad is locked out of movement this phase (e.g. combat-committed units
   * during non-combat move) — dimmed like a squad mid-move, but still selectable. */
  disabled = input<boolean>(false);
  squadSelected = output<MilitaryUnitSquad<MilitaryUnit>>();

  private readonly store = inject(Store);
  private readonly selectedSquad = this.store.selectSignal(MapSelectors.selectedSquad);
  private readonly isSelectedSquad = computed(() => this.selectedSquad()?.id === this.id());

  protected overlayClasses(): string {
    return `map-squad-overlay map-squad-overlay__${this.variant()} ${this.isSelectedSquad() ? 'map-squad-overlay__selected' : ''} ${this.disabled() ? 'map-squad-overlay__disabled' : ''}`;
  }

  protected selectSquad(squad: MilitaryUnitSquad<MilitaryUnit>) {
    this.squadSelected.emit(squad);
  }
}
