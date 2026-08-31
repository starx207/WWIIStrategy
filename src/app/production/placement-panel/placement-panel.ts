import { Component, computed, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { UnitType } from '@ww2/shared/unit-type';
import { MilitaryUnitIcon } from '@ww2/shared/military-unit-icon';
import { UNIT_TYPE_LABEL } from '@ww2/shared/unit-type-label';
import { MapSelectors } from '@ww2/map/map-selectors';
import { GameSelectors } from '@ww2/game/game-selectors';
import { nationalityForGamePhase } from '@ww2/game/game-phase';
import { TurnFlowService } from '@ww2/game/turn-flow.service';
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

/** A unit the player has staged for placement this phase (not yet committed to the map). */
interface StagedPlacement {
  unit: MilitaryUnit;
  destination: Destination;
  isFactory: boolean;
}

/** Staged placements grouped by their destination, for the "placed this turn" review list. */
interface PlacedGroup {
  territory: TerritoryName;
  label: string;
  placements: StagedPlacement[];
}

@Component({
  selector: 'ww2-placement-panel',
  imports: [MilitaryUnitIcon],
  templateUrl: './placement-panel.html',
  styleUrl: './placement-panel.scss',
})
export class PlacementPanel {
  private readonly store = inject(Store);
  private readonly turnFlow = inject(TurnFlowService);

  private readonly gamePhase = this.store.selectSignal(GameSelectors.gamePhase);
  private readonly pendingByNation = this.store.selectSignal(
    ProductionSelectors.pendingPlacementsByNationality,
  );
  private readonly unitsByTerritory = this.store.selectSignal(MapSelectors.unitsByTerritoryName);
  private readonly landControl = this.store.selectSignal(
    MapSelectors.landTerritoryControllerByName,
  );

  // Placements are staged locally until the player confirms, so removing one before committing is
  // a trivial undo (nothing is written to the map until "End Turn").
  private readonly staged = signal<StagedPlacement[]>([]);
  private readonly selectedDestByType = signal<Partial<Record<UnitType, string>>>({});

  protected readonly activeNation = computed(() => nationalityForGamePhase(this.gamePhase()));

  /** Units bought but not yet staged for placement. */
  protected readonly pending = computed(() => {
    const nation = this.activeNation();
    const all = nation ? (this.pendingByNation()[nation] ?? []) : [];
    const stagedIds = new Set(this.staged().map((placement) => placement.unit.id));
    return all.filter((unit) => !stagedIds.has(unit.id));
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

  /** Newly-placed units this phase, grouped by destination, for review/undo. */
  protected readonly placedGroups = computed<PlacedGroup[]>(() => {
    const groups = new Map<string, PlacedGroup>();
    for (const placement of this.staged()) {
      const key = placement.destination.value;
      const group = groups.get(key) ?? {
        territory: placement.destination.territory,
        label: placement.destination.label,
        placements: [],
      };
      group.placements.push(placement);
      groups.set(key, group);
    }
    return [...groups.values()];
  });

  /** Units placed against each IC territory (used for capacity accounting). */
  private readonly placedByTerritory = computed<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const placement of this.staged()) {
      const key = placement.destination.countsAgainst;
      if (key) {
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  });

  /** Complexes built this phase — they can't mobilize units until next turn. */
  private readonly builtThisPhase = computed<LandTerritoryName[]>(() =>
    this.staged()
      .filter((placement) => placement.isFactory)
      .map((placement) => placement.destination.territory as LandTerritoryName),
  );

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

  /** Stage one unit of the given type at its selected destination. */
  protected place(unitType: UnitType): void {
    const group = this.pendingGroups().find((candidate) => candidate.unitType === unitType);
    const destinationValue = this.selectedDest(unitType);
    if (!group || group.units.length === 0 || !destinationValue) {
      return;
    }

    const destination = this.destinationsFor(unitType).find(
      (candidate) => candidate.value === destinationValue,
    );
    if (!destination) {
      return;
    }

    this.staged.update((placements) => [
      ...placements,
      { unit: group.units[0], destination, isFactory: placementCategory(unitType) === 'factory' },
    ]);
  }

  /** Undo a staged placement, returning the unit to the pending queue. */
  protected undo(unitId: string): void {
    this.staged.update((placements) =>
      placements.filter((placement) => placement.unit.id !== unitId),
    );
  }

  /** Commit every staged placement to the map, then end the turn. */
  protected confirm(): void {
    const nation = this.activeNation();
    if (nation) {
      for (const placement of this.staged()) {
        this.store.dispatch(
          new ProductionActions.PlaceUnit(
            nation,
            placement.unit.id,
            placement.destination.territory,
          ),
        );
      }
    }
    this.staged.set([]);
    this.turnFlow.advancePhase();
  }
}
