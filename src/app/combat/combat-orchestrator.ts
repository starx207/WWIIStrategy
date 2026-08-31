import { Injectable, inject, signal } from '@angular/core';
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
  computePendingBattles,
} from './combat-orchestration';

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

  private originByUnitId: BattleSetup['originByUnitId'] = {};
  private returnByUnitId: BattleSetup['returnByUnitId'] = {};
  private attackingSquadIds: string[] = [];

  /** Clear any in-progress battle state (called when starting or loading a game). */
  reset(): void {
    this.originByUnitId = {};
    this.returnByUnitId = {};
    this.attackingSquadIds = [];
    this.activeBattleTerritory.set(null);
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
    const { attackers, defenders, originByUnitId, returnByUnitId, attackingSquadIds } =
      buildBattleSetup(territory, nation, plans, units);
    if (attackers.length === 0 || defenders.length === 0) {
      return;
    }

    this.originByUnitId = originByUnitId;
    this.returnByUnitId = returnByUnitId;
    this.attackingSquadIds = attackingSquadIds;

    // Remove the attacking units from their origin territories — they've committed to the assault.
    const attackerIds = new Set(attackers.map((unit) => unit.id));
    for (const origin of new Set(Object.values(originByUnitId))) {
      const remaining = (units[origin] ?? []).filter((unit) => !attackerIds.has(unit.id));
      this.store.dispatch(new MapActions.SetTerritoryUnits(origin, remaining));
    }

    this.store.dispatch(new CombatActions.PreparingBattlefield(territory, attackers, defenders));
    this.activeBattleTerritory.set(territory);
  }

  /** Apply the finished battle's result to the map and clear the active battle. */
  finishBattle(): void {
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

    this.returnSurvivors(departing);
    this.store.dispatch(new MapActions.RemoveMovementPlans(this.attackingSquadIds));

    this.originByUnitId = {};
    this.returnByUnitId = {};
    this.attackingSquadIds = [];
    this.activeBattleTerritory.set(null);
  }

  /** Send surviving attackers that didn't occupy the territory to their landing/return territory. */
  private returnSurvivors(survivors: MilitaryUnit[]): void {
    const byTerritory = new Map<TerritoryName, MilitaryUnit[]>();
    for (const unit of survivors) {
      const destination = this.returnByUnitId[unit.id];
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
