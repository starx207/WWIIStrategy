import { Component, computed, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { UnitType } from '@ww2/shared/unit-type';
import { MilitaryUnitIcon } from '@ww2/shared/military-unit-icon';
import { UNIT_TYPE_LABEL } from '@ww2/shared/unit-type-label';
import { MapSelectors } from '@ww2/map/map-selectors';
import { GameSelectors } from '@ww2/game/game-selectors';
import { nationalityForGamePhase } from '@ww2/game/game-phase';
import { LandTerritoryName, TerritoryName } from '../../territories/territory-names';
import { ProductionSelectors } from '../production-selectors';
import { ProductionActions } from '../production-actions';
import {
  adjacentSeaZones,
  capacityOf,
  factoryTerritoriesFor,
  newFactoryTerritoriesFor,
  placementCategory,
} from '../rules/placement';

interface PendingGroup {
  unitType: UnitType;
  units: MilitaryUnit[];
}

interface Destination {
  value: string;
  label: string;
  territory: TerritoryName;
  /** IC territory this placement counts against (undefined for building a new IC). */
  countsAgainst?: LandTerritoryName;
}

@Component({
  selector: 'ww2-placement-panel',
  imports: [MilitaryUnitIcon],
  templateUrl: './placement-panel.html',
  styleUrl: './placement-panel.scss',
})
export class PlacementPanel {
  private readonly store = inject(Store);

  private readonly gamePhase = this.store.selectSignal(GameSelectors.gamePhase);
  private readonly pendingByNation = this.store.selectSignal(
    ProductionSelectors.pendingPlacementsByNationality,
  );
  private readonly unitsByTerritory = this.store.selectSignal(MapSelectors.unitsByTerritoryName);
  private readonly landControl = this.store.selectSignal(
    MapSelectors.landTerritoryControllerByName,
  );

  // Local, phase-scoped placement bookkeeping (the component is recreated each placement phase).
  private readonly placedByTerritory = signal<Record<string, number>>({});
  private readonly builtThisPhase = signal<LandTerritoryName[]>([]);
  private readonly selectedDestByType = signal<Partial<Record<UnitType, string>>>({});

  protected readonly activeNation = computed(() => nationalityForGamePhase(this.gamePhase()));

  protected readonly pending = computed(() => {
    const nation = this.activeNation();
    return nation ? (this.pendingByNation()[nation] ?? []) : [];
  });

  protected readonly pendingGroups = computed<PendingGroup[]>(() => {
    const groups = new Map<UnitType, MilitaryUnit[]>();
    for (const unit of this.pending()) {
      const units = groups.get(unit.type) ?? [];
      units.push(unit);
      groups.set(unit.type, units);
    }
    return [...groups.entries()].map(([unitType, units]) => ({ unitType, units }));
  });

  /** IC territories usable this turn (built-this-phase complexes can't mobilize until next turn). */
  private readonly factoryTerritories = computed(() => {
    const nation = this.activeNation();
    if (!nation) {
      return [];
    }
    const built = this.builtThisPhase();
    return factoryTerritoriesFor(nation, this.unitsByTerritory(), this.landControl()).filter(
      (territory) => !built.includes(territory),
    );
  });

  private readonly newFactoryTerritories = computed(() => {
    const nation = this.activeNation();
    if (!nation) {
      return [];
    }
    const built = this.builtThisPhase();
    return newFactoryTerritoriesFor(nation, this.unitsByTerritory(), this.landControl()).filter(
      (territory) => !built.includes(territory),
    );
  });

  protected remainingCapacity(territory: LandTerritoryName): number {
    return capacityOf(territory) - (this.placedByTerritory()[territory] ?? 0);
  }

  private usableFactories(): LandTerritoryName[] {
    return this.factoryTerritories().filter((territory) => this.remainingCapacity(territory) > 0);
  }

  protected readonly capacityRows = computed(() =>
    this.factoryTerritories().map((territory) => ({
      territory,
      placed: this.placedByTerritory()[territory] ?? 0,
      capacity: capacityOf(territory),
    })),
  );

  protected label(unitType: UnitType): string {
    return UNIT_TYPE_LABEL[unitType];
  }

  protected destinationsFor(unitType: UnitType): Destination[] {
    const category = placementCategory(unitType);

    if (category === 'factory') {
      return this.newFactoryTerritories().map((territory) => ({
        value: territory,
        label: `${territory} — build complex`,
        territory,
      }));
    }

    if (category === 'naval') {
      const seen = new Set<string>();
      const destinations: Destination[] = [];
      for (const factory of this.usableFactories()) {
        for (const seaZone of adjacentSeaZones(factory)) {
          if (!seen.has(seaZone)) {
            seen.add(seaZone);
            destinations.push({
              value: seaZone,
              label: `${seaZone} (via ${factory})`,
              territory: seaZone,
              countsAgainst: factory,
            });
          }
        }
      }
      return destinations;
    }

    return this.usableFactories().map((territory) => ({
      value: territory,
      label: `${territory} (${this.remainingCapacity(territory)} left)`,
      territory,
      countsAgainst: territory,
    }));
  }

  protected selectedDest(unitType: UnitType): string | undefined {
    const destinations = this.destinationsFor(unitType);
    const explicit = this.selectedDestByType()[unitType];
    if (explicit && destinations.some((destination) => destination.value === explicit)) {
      return explicit;
    }
    return destinations[0]?.value;
  }

  protected setDest(unitType: UnitType, value: string): void {
    this.selectedDestByType.update((map) => ({ ...map, [unitType]: value }));
  }

  protected place(unitType: UnitType): void {
    const nation = this.activeNation();
    const group = this.pendingGroups().find((candidate) => candidate.unitType === unitType);
    const destinationValue = this.selectedDest(unitType);
    if (!nation || !group || group.units.length === 0 || !destinationValue) {
      return;
    }

    const destination = this.destinationsFor(unitType).find(
      (candidate) => candidate.value === destinationValue,
    );
    if (!destination) {
      return;
    }

    if (placementCategory(unitType) === 'factory') {
      this.builtThisPhase.update((built) => [...built, destination.territory as LandTerritoryName]);
    } else if (destination.countsAgainst) {
      const key = destination.countsAgainst;
      this.placedByTerritory.update((map) => ({ ...map, [key]: (map[key] ?? 0) + 1 }));
    }

    this.store.dispatch(
      new ProductionActions.PlaceUnit(nation, group.units[0].id, destination.territory),
    );
  }
}
