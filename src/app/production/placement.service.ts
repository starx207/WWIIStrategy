import { Injectable, computed, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { UnitType } from '@ww2/shared/unit-type';
import { GameSelectors } from '@ww2/game/game-selectors';
import { nationalityForGamePhase } from '@ww2/game/game-phase';
import { MapSelectors } from '@ww2/map/map-selectors';
import { LandTerritoryName, TerritoryName } from '../territories/territory-names';
import { TERRITORY_INFO_BY_NAME } from '../territories/territory-info';
import { ProductionSelectors } from './production-selectors';
import { ProductionActions } from './production-actions';
import {
  PlacementCategory,
  adjacentSeaZones,
  capacityOf,
  factoryTerritoriesFor,
  newFactoryTerritoriesFor,
  placementCategory,
} from './rules/placement';

/** A unit staged for placement at a territory — not yet committed to the map. */
export interface StagedPlacement {
  unit: MilitaryUnit;
  territory: TerritoryName;
  /** IC territory this placement counts against for capacity (undefined when building a new IC). */
  countsAgainst?: LandTerritoryName;
  isFactory: boolean;
}

export interface StagedGroup {
  territory: TerritoryName;
  placements: StagedPlacement[];
}

/** What kind of placement a focused territory accepts. */
type FocusKind = 'land-air' | 'naval' | 'new-factory';

/**
 * Drives the map-driven Mobilize Units phase: the player clicks a factory (or its adjacent sea
 * zone, or a new-IC-eligible territory) on the map to focus it, then places pending units there.
 * Placements are staged locally (not written to the map) until the player confirms, so removing a
 * staged placement is a trivial undo. Shared by the map (for highlighting + click handling) and the
 * placement panel (for the unit list), so both stay in sync off one source of truth.
 */
@Injectable({ providedIn: 'root' })
export class PlacementService {
  private readonly store = inject(Store);

  private readonly gamePhase = this.store.selectSignal(GameSelectors.gamePhase);
  private readonly pendingByNation = this.store.selectSignal(
    ProductionSelectors.pendingPlacementsByNationality,
  );
  private readonly unitsByTerritory = this.store.selectSignal(MapSelectors.unitsByTerritoryName);
  private readonly landControl = this.store.selectSignal(
    MapSelectors.landTerritoryControllerByName,
  );

  private readonly staged = signal<StagedPlacement[]>([]);
  private readonly focusedTerritorySignal = signal<TerritoryName | null>(null);
  readonly focusedTerritory = this.focusedTerritorySignal.asReadonly();

  readonly activeNation = computed(() => nationalityForGamePhase(this.gamePhase()));

  /** Units bought but not yet staged for placement. */
  readonly pending = computed(() => {
    const nation = this.activeNation();
    const all = nation ? (this.pendingByNation()[nation] ?? []) : [];
    const stagedIds = new Set(this.staged().map((placement) => placement.unit.id));
    return all.filter((unit) => !stagedIds.has(unit.id));
  });

  /** Units placed against each IC territory this phase, for capacity accounting. */
  private readonly placedByTerritory = computed<Partial<Record<LandTerritoryName, number>>>(() => {
    const counts: Partial<Record<LandTerritoryName, number>> = {};
    for (const placement of this.staged()) {
      const key = placement.countsAgainst;
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
      .map((placement) => placement.territory as LandTerritoryName),
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

  readonly newFactoryTerritories = computed(() => {
    const nation = this.activeNation();
    if (!nation) {
      return [];
    }
    const built = this.builtThisPhase();
    return newFactoryTerritoriesFor(nation, this.unitsByTerritory(), this.landControl()).filter(
      (territory) => !built.includes(territory),
    );
  });

  remainingCapacity(territory: LandTerritoryName): number {
    return capacityOf(territory) - (this.placedByTerritory()[territory] ?? 0);
  }

  private usableFactories(): LandTerritoryName[] {
    return this.factoryTerritories().filter((territory) => this.remainingCapacity(territory) > 0);
  }

  readonly capacityRows = computed(() =>
    this.factoryTerritories().map((territory) => ({
      territory,
      placed: this.placedByTerritory()[territory] ?? 0,
      capacity: capacityOf(territory),
    })),
  );

  private hasPendingCategory(category: PlacementCategory): boolean {
    return this.pending().some((unit) => placementCategory(unit.type) === category);
  }

  /**
   * Territories the map should highlight as clickable this phase, gated by whether there's a
   * pending unit that could actually go there — a factory tile only lights up if land/air units
   * are pending, its adjacent sea zones only if naval units are pending, and so on.
   */
  readonly candidateTerritories = computed<TerritoryName[]>(() => {
    const territories = new Set<TerritoryName>();

    if (this.hasPendingCategory('land-air')) {
      for (const factory of this.usableFactories()) {
        territories.add(factory);
      }
    }
    if (this.hasPendingCategory('naval')) {
      for (const factory of this.usableFactories()) {
        for (const seaZone of adjacentSeaZones(factory)) {
          territories.add(seaZone);
        }
      }
    }
    if (this.hasPendingCategory('factory')) {
      for (const territory of this.newFactoryTerritories()) {
        territories.add(territory);
      }
    }

    return [...territories];
  });

  /** Focus a territory for placement, if it's currently a valid candidate. */
  focus(territory: TerritoryName): void {
    if (this.candidateTerritories().includes(territory)) {
      this.focusedTerritorySignal.set(territory);
    }
  }

  /**
   * Focus a territory directly, bypassing the candidate check — used to revisit a territory that
   * already has staged placements (from the all-territories summary) even if it's no longer a
   * fresh candidate (e.g. its capacity filled up, or it has nothing left pending for it).
   */
  focusDirect(territory: TerritoryName): void {
    this.focusedTerritorySignal.set(territory);
  }

  /** Clear the focused territory (e.g. the player dismisses the focus panel). */
  clearFocus(): void {
    this.focusedTerritorySignal.set(null);
  }

  private hasRealFactory(territory: LandTerritoryName): boolean {
    return (this.unitsByTerritory()[territory] ?? []).some(
      (unit) => unit.type === UnitType.FACTORY,
    );
  }

  /** What category of unit the focused territory itself accepts — purely structural (land vs sea,
   * has-a-factory-already-or-not), independent of remaining capacity or what's currently pending. */
  private focusKind(): FocusKind | null {
    const territory = this.focusedTerritory();
    if (!territory) {
      return null;
    }
    if (TERRITORY_INFO_BY_NAME[territory].kind === 'sea') {
      return 'naval';
    }
    return this.hasRealFactory(territory as LandTerritoryName) ? 'land-air' : 'new-factory';
  }

  /**
   * Units placeable at the focused territory right now (from the pending queue). Empty whenever the
   * territory isn't a live candidate any more (full capacity, already built this phase, or nothing
   * pending fits it) — `stagedAtFocus` below still shows what's already there for removal.
   */
  readonly placeableUnitsAtFocus = computed<MilitaryUnit[]>(() => {
    const territory = this.focusedTerritory();
    const kind = this.focusKind();
    if (!territory || !kind || !this.candidateTerritories().includes(territory)) {
      return [];
    }
    const category: PlacementCategory =
      kind === 'new-factory' ? 'factory' : kind === 'naval' ? 'naval' : 'land-air';
    return this.pending().filter((unit) => placementCategory(unit.type) === category);
  });

  /** Units already staged at the focused territory. */
  readonly stagedAtFocus = computed<StagedPlacement[]>(() => {
    const territory = this.focusedTerritory();
    if (!territory) {
      return [];
    }
    return this.staged().filter((placement) => placement.territory === territory);
  });

  /** All staged placements grouped by territory, for the all-territories review list. */
  readonly stagedGroups = computed<StagedGroup[]>(() => {
    const groups = new Map<TerritoryName, StagedPlacement[]>();
    for (const placement of this.staged()) {
      const list = groups.get(placement.territory) ?? [];
      list.push(placement);
      groups.set(placement.territory, list);
    }
    return [...groups.entries()].map(([territory, placements]) => ({ territory, placements }));
  });

  readonly hasStaged = computed(() => this.staged().length > 0);

  /** Stage one unit at the currently focused territory. */
  place(unit: MilitaryUnit): void {
    const territory = this.focusedTerritory();
    const kind = this.focusKind();
    if (!territory || !kind) {
      return;
    }

    if (kind === 'new-factory') {
      this.staged.update((placements) => [...placements, { unit, territory, isFactory: true }]);
      return;
    }

    if (kind === 'naval') {
      // Attribute the placement to the first usable adjacent factory with room — naval units
      // mobilize in the sea zone but still count against their launching IC's capacity.
      const factory = this.usableFactories().find((candidate) =>
        (adjacentSeaZones(candidate) as readonly TerritoryName[]).includes(territory),
      );
      if (!factory) {
        return;
      }
      this.staged.update((placements) => [
        ...placements,
        { unit, territory, countsAgainst: factory, isFactory: false },
      ]);
      return;
    }

    this.staged.update((placements) => [
      ...placements,
      { unit, territory, countsAgainst: territory as LandTerritoryName, isFactory: false },
    ]);
  }

  /** Undo a staged placement, returning the unit to the pending queue. */
  undo(unitId: string): void {
    this.staged.update((placements) =>
      placements.filter((placement) => placement.unit.id !== unitId),
    );
  }

  /** Commit every staged placement to the map and clear local state. */
  confirmAll(): void {
    const nation = this.activeNation();
    if (nation) {
      for (const placement of this.staged()) {
        this.store.dispatch(
          new ProductionActions.PlaceUnit(nation, placement.unit.id, placement.territory),
        );
      }
    }
    this.staged.set([]);
    this.focusedTerritorySignal.set(null);
  }

  /** Discard any staged placements and clear focus (starting or loading a game). */
  reset(): void {
    this.staged.set([]);
    this.focusedTerritorySignal.set(null);
  }
}
