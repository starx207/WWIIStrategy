import { Injectable, computed, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { Nationality } from '@ww2/shared/nationality';
import { AIR_UNIT_TYPES } from '@ww2/shared/unit-type';
import { GameSelectors } from '@ww2/game/game-selectors';
import { nationalityForGamePhase } from '@ww2/game/game-phase';
import { MapSelectors } from '@ww2/map/map-selectors';
import { MapActions } from '@ww2/map/map-actions';
import { LandTerritoryName, TerritoryName } from '../territories/territory-names';
import { TERRITORY_INFO_BY_NAME } from '../territories/territory-info';
import { CombatActions } from './combat.actions';
import { CombatSelectors } from './combat-selectors';
import {
  BattleSetup,
  PendingBattle,
  buildBattleSetup,
  computeAntiAircraftFire,
  computePendingBattles,
  computeShoreBombardment,
} from './combat-orchestration';
import {
  LandingAssignmentRequest,
  aircraftOnly,
  computeLandingCaps,
  landingAssignmentNeeded,
} from './aircraft-landing';

export interface AntiAircraftReportEntry {
  territory: string;
  shotDown: number;
}

export interface ShoreBombardmentReport {
  territory: string;
  ships: number;
  hits: number;
}

/**
 * Drives the Conduct Combat phase: derives the list of battles from combat-move plans, launches
 * each on the battle board with real armies, and applies the outcome (casualties, occupation,
 * pending capture) back to the map when the player acknowledges the result.
 */
@Injectable({ providedIn: 'root' })
export class CombatOrchestrator {
  private readonly store = inject(Store);

  /** The territory whose battle is currently on the board, or null when no battle is showing. */
  readonly activeBattleTerritory = signal<TerritoryName | null>(null);

  /** Summary of the most recent anti-aircraft fire (aircraft downed over each territory). */
  readonly antiAircraftReport = signal<AntiAircraftReportEntry[]>([]);

  /** Shore bombardment that supported the current amphibious assault, if any. */
  readonly shoreBombardmentReport = signal<ShoreBombardmentReport | null>(null);

  /**
   * Set after a battle is acknowledged when the player must choose where surviving aircraft land
   * (more than one designated zone for a type, with some but not all of that type surviving). While
   * set, the battle result is held until the choice is confirmed via finishBattle.
   */
  readonly pendingLandingAssignment = signal<LandingAssignmentRequest | null>(null);

  /** The candidate landing zones for the current assignment prompt, for the map to highlight. */
  readonly landingHighlightZones = computed<TerritoryName[]>(() => {
    const request = this.pendingLandingAssignment();
    if (!request) {
      return [];
    }
    const zones = new Set<TerritoryName>();
    for (const byZone of request.caps.values()) {
      for (const zone of byZone.keys()) {
        zones.add(zone);
      }
    }
    return [...zones];
  });

  private originByUnitId: BattleSetup['originByUnitId'] = {};
  private returnByUnitId: BattleSetup['returnByUnitId'] = {};
  private attackingSquadIds: string[] = [];
  private originalAttackerAircraft: MilitaryUnit[] = [];

  /** Clear any in-progress battle state (called when starting or loading a game). */
  reset(): void {
    this.originByUnitId = {};
    this.returnByUnitId = {};
    this.attackingSquadIds = [];
    this.originalAttackerAircraft = [];
    this.antiAircraftReport.set([]);
    this.shoreBombardmentReport.set(null);
    this.pendingLandingAssignment.set(null);
    this.activeBattleTerritory.set(null);
  }

  /**
   * Resolve anti-aircraft fire over the aircraft fly-over territories (called when leaving the
   * combat-move phase, before battles). Downed aircraft are removed from the map.
   */
  resolveAntiAircraftFire(): void {
    const nation = this.activeNation();
    if (!nation) {
      this.antiAircraftReport.set([]);
      return;
    }

    const units = this.store.selectSnapshot(MapSelectors.unitsByTerritoryName);
    const plans = this.store.selectSnapshot(MapSelectors.movementPlans);
    const { shotDownUnitIds, reportByTerritory } = computeAntiAircraftFire({
      nation,
      unitsByTerritory: units,
      plans,
      rollDie: () => Math.floor(Math.random() * 6) + 1,
    });

    const downed = new Set(shotDownUnitIds);
    if (downed.size > 0) {
      for (const [territory, territoryUnits] of Object.entries(units)) {
        if ((territoryUnits ?? []).some((unit) => downed.has(unit.id))) {
          this.store.dispatch(
            new MapActions.SetTerritoryUnits(
              territory as TerritoryName,
              (territoryUnits ?? []).filter((unit) => !downed.has(unit.id)),
            ),
          );
        }
      }
    }

    this.antiAircraftReport.set(
      Object.entries(reportByTerritory).map(([territory, shotDown]) => ({ territory, shotDown })),
    );
  }

  private activeNation(): Nationality | undefined {
    return nationalityForGamePhase(this.store.selectSnapshot(GameSelectors.gamePhase));
  }

  /** Battles remaining to resolve this turn. */
  pendingBattles(): PendingBattle[] {
    const nation = this.activeNation();
    if (!nation) {
      return [];
    }
    return computePendingBattles(
      nation,
      this.store.selectSnapshot(MapSelectors.movementPlans),
      this.store.selectSnapshot(MapSelectors.unitsByTerritoryName),
      this.store.selectSnapshot(MapSelectors.amphibiousAssaultsByTerritory),
    );
  }

  /** Launch the battle for a territory: pull attackers off the map and load the battle board. */
  startBattle(territory: TerritoryName): void {
    const nation = this.activeNation();
    if (!nation) {
      return;
    }

    const units = this.store.selectSnapshot(MapSelectors.unitsByTerritoryName);
    const plans = this.store.selectSnapshot(MapSelectors.movementPlans);
    const amphibious = this.store.selectSnapshot(MapSelectors.amphibiousAssaultsByTerritory);
    const {
      attackers,
      defenders,
      originByUnitId,
      returnByUnitId,
      attackingSquadIds,
      retreatAllowed,
    } = buildBattleSetup(territory, nation, plans, units, amphibious);
    if (attackers.length === 0 || defenders.length === 0) {
      return;
    }

    this.originByUnitId = originByUnitId;
    this.returnByUnitId = returnByUnitId;
    this.attackingSquadIds = attackingSquadIds;
    // Remember the aircraft that set out, so post-battle we know each landing zone's capacity.
    this.originalAttackerAircraft = aircraftOnly(attackers);

    // Shore bombardment supports an amphibious assault: friendly battleships in the launching sea
    // zones fire before the land battle, thinning the defenders.
    let battleDefenders = defenders;
    if (!retreatAllowed) {
      const bombardment = computeShoreBombardment({
        nation,
        amphibiousUnitIds: amphibious[territory as LandTerritoryName] ?? [],
        defenders,
        unitsByTerritory: units,
        rollDie: () => Math.floor(Math.random() * 6) + 1,
      });
      battleDefenders = bombardment.remainingDefenders;
      this.shoreBombardmentReport.set(
        bombardment.shipsBombarding > 0
          ? { territory, ships: bombardment.shipsBombarding, hits: bombardment.hits }
          : null,
      );
    } else {
      this.shoreBombardmentReport.set(null);
    }

    // Remove the attacking units from their origin territories — they've committed to the assault.
    const attackerIds = new Set(attackers.map((unit) => unit.id));
    for (const origin of new Set(Object.values(originByUnitId))) {
      const remaining = (units[origin] ?? []).filter((unit) => !attackerIds.has(unit.id));
      this.store.dispatch(new MapActions.SetTerritoryUnits(origin, remaining));
    }

    this.store.dispatch(
      new CombatActions.PreparingBattlefield(territory, attackers, battleDefenders, retreatAllowed),
    );
    this.activeBattleTerritory.set(territory);
  }

  /**
   * Whether acknowledging the current battle should prompt the player to choose where surviving
   * aircraft land (see landingAssignmentNeeded). Called before finishBattle.
   */
  requiresLandingAssignment(): boolean {
    const survivors = aircraftOnly(this.store.selectSnapshot(CombatSelectors.rawAttackingArmy));
    return landingAssignmentNeeded(this.originalAttackerAircraft, survivors, this.returnByUnitId);
  }

  /** Open the landing-assignment prompt for the current battle's surviving aircraft. */
  beginLandingAssignment(): void {
    const survivors = aircraftOnly(this.store.selectSnapshot(CombatSelectors.rawAttackingArmy));
    const caps = computeLandingCaps(this.originalAttackerAircraft, this.returnByUnitId);
    const defaultZoneByUnitId: Record<string, TerritoryName> = {};
    for (const unit of survivors) {
      defaultZoneByUnitId[unit.id] = this.returnByUnitId[unit.id];
    }
    this.pendingLandingAssignment.set({ aircraft: survivors, caps, defaultZoneByUnitId });
  }

  /**
   * Apply the finished battle's result to the map and clear the active battle. `landingOverrides`
   * (from the landing picker) redirect surviving aircraft to the zones the player chose, replacing
   * their originally-designated landing zones.
   */
  finishBattle(landingOverrides: Record<string, TerritoryName> = {}): void {
    const territory = this.activeBattleTerritory();
    if (!territory) {
      return;
    }

    const survivingAttackers = this.store.selectSnapshot(CombatSelectors.rawAttackingArmy);
    const survivingDefenders = this.store.selectSnapshot(CombatSelectors.rawDefendingArmy);
    const summary = this.store.selectSnapshot(CombatSelectors.resolutionSummary);
    const nation = this.activeNation();
    const attackerWon = summary?.outcome === 'attackerVictory';
    const isLand = TERRITORY_INFO_BY_NAME[territory].kind === 'land';

    // Attackers hold the contested territory when they win it: land units capture, sea units hold a
    // sea zone. Aircraft never hold ground — they always fly on to their landing airfield.
    const holdsTerritory =
      (attackerWon && summary?.canCaptureTerritory && isLand) || (attackerWon && !isLand);
    const occupiers = holdsTerritory
      ? survivingAttackers.filter((unit) => !AIR_UNIT_TYPES.includes(unit.type))
      : [];
    const departing = survivingAttackers.filter((unit) => !occupiers.includes(unit));

    if (holdsTerritory) {
      this.store.dispatch(new MapActions.SetTerritoryUnits(territory, occupiers));
      if (isLand && nation) {
        this.store.dispatch(
          new MapActions.RecordTerritoryCapture(territory as LandTerritoryName, nation),
        );
      }
    } else {
      // Defenders hold (or the attacker won but can't capture) — clear the attackers off it.
      this.store.dispatch(new MapActions.SetTerritoryUnits(territory, survivingDefenders));
    }

    this.returnSurvivors(departing, { ...this.returnByUnitId, ...landingOverrides });
    this.store.dispatch(new MapActions.RemoveMovementPlans(this.attackingSquadIds));
    if (isLand) {
      // Clear any amphibious assault staged against this territory now that it's resolved.
      this.store.dispatch(new MapActions.ClearAmphibiousAssault(territory as LandTerritoryName));
    }

    this.originByUnitId = {};
    this.returnByUnitId = {};
    this.attackingSquadIds = [];
    this.originalAttackerAircraft = [];
    this.pendingLandingAssignment.set(null);
    this.activeBattleTerritory.set(null);
  }

  /** Send surviving attackers that didn't occupy the territory to their landing/return territory. */
  private returnSurvivors(
    survivors: MilitaryUnit[],
    returnByUnitId: Record<string, TerritoryName>,
  ): void {
    const byTerritory = new Map<TerritoryName, MilitaryUnit[]>();
    for (const unit of survivors) {
      const destination = returnByUnitId[unit.id];
      if (!destination) {
        continue;
      }
      byTerritory.set(destination, [...(byTerritory.get(destination) ?? []), unit]);
    }
    for (const [destination, units] of byTerritory) {
      this.store.dispatch(new MapActions.AddUnitsToTerritory(destination, units));
    }
  }
}
