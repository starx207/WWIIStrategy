import { MilitaryUnit } from '@ww2/shared/military-unit';
import { NATION_ALLIANCE, Nationality } from '@ww2/shared/nationality';
import { AIR_UNIT_TYPES, NEUTRAL_UNIT_TYPES } from '@ww2/shared/unit-type';
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

export interface BattleSetup {
  attackers: MilitaryUnit[];
  defenders: MilitaryUnit[];
  /** Physical origin of each attacker — where it is pulled from when the battle starts. */
  originByUnitId: Record<string, TerritoryName>;
  /** Where each attacker goes when it does NOT occupy the contested territory: land/sea units to
   * their origin, aircraft to their landing airfield (the plan's final step). */
  returnByUnitId: Record<string, TerritoryName>;
  /** Ids of the movement plans feeding this battle (removed once it resolves). */
  attackingSquadIds: string[];
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
): PendingBattle[] {
  const attacked = new Set<TerritoryName>();
  for (const plan of combatMovePlans(plans)) {
    const territory = attackedTerritoryForPlan(plan);
    if (territory) {
      attacked.add(territory);
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
    const attackerCount = plansAttacking(plans, territory).reduce(
      (total, plan) => total + movingUnitsForPlan(plan, unitsByTerritory).length,
      0,
    );
    battles.push({ territory, attackerCount, defenderCount: combatDefenders.length });
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

  const defenders = (unitsByTerritory[territory] ?? []).filter((unit) => isEnemy(unit, nation));
  return { attackers, defenders, originByUnitId, returnByUnitId, attackingSquadIds };
}
