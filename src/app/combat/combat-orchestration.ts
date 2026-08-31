import { MilitaryUnit } from '@ww2/shared/military-unit';
import { NATION_ALLIANCE, Nationality } from '@ww2/shared/nationality';
import { AIR_UNIT_TYPES, NEUTRAL_UNIT_TYPES, UnitType } from '@ww2/shared/unit-type';
import { TurnPhase } from '@ww2/game/turn-phase';
import { TerritoryName } from '../territories/territory-names';
import { SquadMovementPlan } from '@ww2/map/map-state';
import { parseSquadId } from '@ww2/map/rules/movement-execution';

type UnitsByTerritory = Partial<Record<TerritoryName, MilitaryUnit[]>>;

export interface PendingBattle {
  territory: TerritoryName;
  attackerCount: number;
  defenderCount: number;
}

type AmphibiousAssaults = Partial<Record<string, string[]>>;

export interface BattleSetup {
  attackers: MilitaryUnit[];
  defenders: MilitaryUnit[];
  /** Physical origin of each attacker — where it is pulled from when the battle starts. */
  originByUnitId: Record<string, TerritoryName>;
  /** Where each attacker goes when it does NOT occupy the contested territory: land/sea units to
   * their origin, aircraft to their landing airfield (the plan's final step). Amphibious attackers
   * have no return — they occupy on capture, otherwise they are lost. */
  returnByUnitId: Record<string, TerritoryName>;
  /** Ids of the movement plans feeding this battle (removed once it resolves). */
  attackingSquadIds: string[];
  /** False when amphibious units are assaulting — the attacker may not retreat. */
  retreatAllowed: boolean;
}

/** Locate a unit and its territory by id. */
function findUnitLocation(
  unitId: string,
  unitsByTerritory: UnitsByTerritory,
): { unit: MilitaryUnit; territory: TerritoryName } | undefined {
  for (const [territory, units] of Object.entries(unitsByTerritory)) {
    const unit = (units ?? []).find((candidate) => candidate.id === unitId);
    if (unit) {
      return { unit, territory: territory as TerritoryName };
    }
  }
  return undefined;
}

function isEnemy(unit: MilitaryUnit, nation: Nationality): boolean {
  return NATION_ALLIANCE[unit.nationality] !== NATION_ALLIANCE[nation];
}

function isAirPlan(plan: SquadMovementPlan): boolean {
  const squad = parseSquadId(plan.squadId);
  return squad ? AIR_UNIT_TYPES.includes(squad.unitType) : false;
}

/**
 * The territory a combat-move plan attacks: land/sea units fight at their destination; aircraft
 * fight at their designated combat node (a mid-path step), then continue to a landing airfield.
 */
export function attackedTerritoryForPlan(plan: SquadMovementPlan): TerritoryName | undefined {
  if (plan.path.length === 0) {
    return undefined;
  }
  if (isAirPlan(plan)) {
    return plan.path.find((step) => step.combatType === 'combat')?.territoryName;
  }
  return plan.path[plan.path.length - 1].territoryName;
}

/** The units a combat-move plan would commit (all like units of its squad at the origin). */
export function movingUnitsForPlan(
  plan: SquadMovementPlan,
  unitsByTerritory: UnitsByTerritory,
): MilitaryUnit[] {
  const squad = parseSquadId(plan.squadId);
  if (!squad) {
    return [];
  }
  return (unitsByTerritory[plan.startingTerritoryName] ?? []).filter(
    (unit) => unit.nationality === squad.nationality && unit.type === squad.unitType,
  );
}

function combatMovePlans(plans: SquadMovementPlan[]): SquadMovementPlan[] {
  return plans.filter((plan) => plan.phase === TurnPhase.COMBAT_MOVEMENT && plan.path.length > 0);
}

function plansAttacking(plans: SquadMovementPlan[], territory: TerritoryName): SquadMovementPlan[] {
  return combatMovePlans(plans).filter((plan) => attackedTerritoryForPlan(plan) === territory);
}

/**
 * Territories the active nation is attacking that hold ground defenders — the battles to resolve
 * during Conduct Combat. Undefended territories are captured separately (resolveAutomaticCaptures).
 */
export function computePendingBattles(
  nation: Nationality,
  plans: SquadMovementPlan[],
  unitsByTerritory: UnitsByTerritory,
  amphibiousAssaults: AmphibiousAssaults = {},
): PendingBattle[] {
  const attacked = new Set<TerritoryName>();
  for (const plan of combatMovePlans(plans)) {
    const territory = attackedTerritoryForPlan(plan);
    if (territory) {
      attacked.add(territory);
    }
  }
  for (const [territory, ids] of Object.entries(amphibiousAssaults)) {
    if ((ids ?? []).length > 0) {
      attacked.add(territory as TerritoryName);
    }
  }

  const battles: PendingBattle[] = [];
  for (const territory of attacked) {
    // A battle only exists if the enemy has units that fight (a lone AA gun / factory is captured
    // without a fight — see resolveAutomaticCaptures).
    const combatDefenders = (unitsByTerritory[territory] ?? []).filter(
      (unit) => isEnemy(unit, nation) && !NEUTRAL_UNIT_TYPES.includes(unit.type),
    );
    if (combatDefenders.length === 0) {
      continue;
    }
    const planAttackers = plansAttacking(plans, territory).reduce(
      (total, plan) => total + movingUnitsForPlan(plan, unitsByTerritory).length,
      0,
    );
    const amphibiousAttackers = (amphibiousAssaults[territory] ?? []).length;
    battles.push({
      territory,
      attackerCount: planAttackers + amphibiousAttackers,
      defenderCount: combatDefenders.length,
    });
  }
  return battles;
}

/** Assemble the attacker army (land/sea at their destination, aircraft at their combat node), the
 * defender army, and where each attacker came from / returns to. */
export function buildBattleSetup(
  territory: TerritoryName,
  nation: Nationality,
  plans: SquadMovementPlan[],
  unitsByTerritory: UnitsByTerritory,
  amphibiousAssaults: AmphibiousAssaults = {},
): BattleSetup {
  const attackers: MilitaryUnit[] = [];
  const originByUnitId: Record<string, TerritoryName> = {};
  const returnByUnitId: Record<string, TerritoryName> = {};
  const attackingSquadIds: string[] = [];

  for (const plan of plansAttacking(plans, territory)) {
    attackingSquadIds.push(plan.squadId);
    // Aircraft land at the plan's final step; land/sea units return to where they came from.
    const landingTerritory = isAirPlan(plan)
      ? plan.path[plan.path.length - 1].territoryName
      : plan.startingTerritoryName;

    for (const unit of movingUnitsForPlan(plan, unitsByTerritory)) {
      attackers.push(unit);
      originByUnitId[unit.id] = plan.startingTerritoryName;
      returnByUnitId[unit.id] = landingTerritory;
    }
  }

  // Amphibious attackers assault from their transports' sea zones; they have no retreat/return.
  const amphibiousIds = amphibiousAssaults[territory] ?? [];
  for (const unitId of amphibiousIds) {
    const located = findUnitLocation(unitId, unitsByTerritory);
    if (located) {
      attackers.push(located.unit);
      originByUnitId[unitId] = located.territory;
    }
  }

  const defenders = (unitsByTerritory[territory] ?? []).filter((unit) => isEnemy(unit, nation));
  return {
    attackers,
    defenders,
    originByUnitId,
    returnByUnitId,
    attackingSquadIds,
    retreatAllowed: amphibiousIds.length === 0,
  };
}

function hasEnemyAntiAir(
  territory: TerritoryName,
  nation: Nationality,
  unitsByTerritory: UnitsByTerritory,
): boolean {
  return (unitsByTerritory[territory] ?? []).some(
    (unit) => isEnemy(unit, nation) && unit.type === UnitType.ANTI_AIR_GUN,
  );
}

export interface AntiAircraftResult {
  /** Ids of aircraft shot down while flying over enemy anti-aircraft guns. */
  shotDownUnitIds: string[];
  /** How many aircraft each territory's AA gun shot down. */
  reportByTerritory: Record<string, number>;
}

/**
 * Resolve anti-aircraft fire over the fly-over territories of aircraft combat moves (the steps
 * marked `under-fire`). Each AA gun fires once at each aircraft that passes over, hitting on a 1;
 * a hit downs the aircraft. `rollDie` returns 1-6 (injected for testability). Pure function — the
 * caller removes the returned unit ids from the map.
 */
export function computeAntiAircraftFire(params: {
  nation: Nationality;
  unitsByTerritory: UnitsByTerritory;
  plans: SquadMovementPlan[];
  rollDie: () => number;
}): AntiAircraftResult {
  const { nation, unitsByTerritory, plans, rollDie } = params;
  const shotDownUnitIds: string[] = [];
  const reportByTerritory: Record<string, number> = {};

  for (const plan of combatMovePlans(plans)) {
    if (!isAirPlan(plan)) {
      continue;
    }
    const flyOverTerritories = plan.path
      .filter((step) => step.combatType === 'under-fire')
      .map((step) => step.territoryName);
    if (flyOverTerritories.length === 0) {
      continue;
    }

    for (const aircraft of movingUnitsForPlan(plan, unitsByTerritory)) {
      for (const territory of flyOverTerritories) {
        if (!hasEnemyAntiAir(territory, nation, unitsByTerritory)) {
          continue;
        }
        if (rollDie() <= 1) {
          shotDownUnitIds.push(aircraft.id);
          reportByTerritory[territory] = (reportByTerritory[territory] ?? 0) + 1;
          break; // Downed — it flies over no further territories.
        }
      }
    }
  }

  return { shotDownUnitIds, reportByTerritory };
}
