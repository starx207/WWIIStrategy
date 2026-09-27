import { Component, computed, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { MilitaryUnitIcon } from '@ww2/shared/military-unit-icon';
import { GameSelectors } from '@ww2/game/game-selectors';
import { TurnPhase } from '@ww2/game/turn-phase';
import { MapSelectors, TransportCargoUnit } from '../map-selectors';
import { CargoUnloadService } from '../cargo-unload.service';
import { parseSquadId } from '../rules/movement-execution';

/**
 * A per-unit checklist for a partial transport unload. It shows when a loaded transport squad with an
 * available unload target is selected, letting the player tick which carried units disembark; the
 * unload is committed by clicking an unload coast on the map (no confirm button, mirroring the
 * detachment picker). Default = unload everything. During the combat phase, units that loaded this
 * phase are locked checked — they cannot stay aboard for an amphibious assault (see the rules); units
 * carried over from a prior turn stay electable.
 */
@Component({
  selector: 'ww2-cargo-unload-picker',
  imports: [MilitaryUnitIcon],
  templateUrl: './cargo-unload-picker.html',
  styleUrl: './cargo-unload-picker.scss',
})
export class CargoUnloadPicker {
  private readonly store = inject(Store);
  private readonly cargoUnload = inject(CargoUnloadService);

  private readonly selectedSquad = this.store.selectSignal(MapSelectors.selectedSquad);
  protected readonly cargo = this.store.selectSignal(MapSelectors.selectedTransportCargo);
  private readonly cargoDestinations = this.store.selectSignal(
    MapSelectors.selectedSquadCargoDestinations,
  );
  private readonly turnPhase = this.store.selectSignal(GameSelectors.turnPhase);

  protected readonly nationality = computed(
    () => parseSquadId(this.selectedSquad()?.id ?? '')?.nationality,
  );

  /** Only offer the choice when there is cargo to drop and somewhere to drop it. */
  protected readonly visible = computed(
    () => this.cargo().length > 0 && this.cargoDestinations().unload.length > 0,
  );

  private readonly isCombat = computed(() => this.turnPhase() === TurnPhase.COMBAT_MOVEMENT);

  /** The units that will unload: the player's explicit choice, else everything (the default). Units
   * locked by the combat rule are always included. */
  protected readonly checkedIds = computed<Set<string>>(() => {
    const cargo = this.cargo();
    const chosen = this.cargoUnload.selectedUnitIds();
    const ids = chosen === null ? new Set(cargo.map((unit) => unit.id)) : new Set(chosen);
    for (const unit of cargo) {
      if (this.isLocked(unit)) {
        ids.add(unit.id);
      }
    }
    return ids;
  });

  protected readonly checkedCount = computed(() => this.checkedIds().size);

  /** A unit loaded this combat phase can't stay aboard when the transport unloads — force it checked. */
  protected isLocked(unit: TransportCargoUnit): boolean {
    return this.isCombat() && unit.provenance === 'loaded-this-phase';
  }

  protected isChecked(unit: TransportCargoUnit): boolean {
    return this.checkedIds().has(unit.id);
  }

  protected toggle(unit: TransportCargoUnit): void {
    if (this.isLocked(unit)) {
      return;
    }
    const next = new Set(this.checkedIds());
    if (next.has(unit.id)) {
      next.delete(unit.id);
    } else {
      next.add(unit.id);
    }
    this.cargoUnload.selectedUnitIds.set([...next]);
  }
}
