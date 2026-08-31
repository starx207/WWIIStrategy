import { MilitaryUnit } from '@ww2/shared/military-unit';
import { NATION_ALLIANCE, Nationality } from '@ww2/shared/nationality';
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
  /** Origin territory of each attacking unit, so survivors can return on a loss/retreat. */
  originByUnitId: Record<string, TerritoryName>;
}

function isEnemy(unit: MilitaryUnit, nation: Nationality): boolean {
  return NATION_ALLIANCE[unit.nationality] !== NATION_ALLIANCE[nation];
}

/** The units a combat-move plan would move (all like units of its squad at the origin). */
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

function combatPlansForDestination(
  plans: SquadMovementPlan[],
  territory: TerritoryName,
): SquadMovementPlan[] {
  return plans.filter(
    (plan) =>
      plan.phase === TurnPhase.COMBAT_MOVEMENT &&
      plan.path.length > 0 &&
      plan.path[plan.path.length - 1].territoryName === territory,
  );
}

/**
 * Territories the active nation is attacking that hold enemy units — the battles to resolve during
 * Conduct Combat. (Undefended-territory captures are handled separately.)
 */
export function computePendingBattles(
  nation: Nationality,
  plans: SquadMovementPlan[],
  unitsByTerritory: UnitsByTerritory,
): PendingBattle[] {
  const destinations = new Set(
    plans
      .filter((plan) => plan.phase === TurnPhase.COMBAT_MOVEMENT && plan.path.length > 0)
      .map((plan) => plan.path[plan.path.length - 1].territoryName),
  );

  const battles: PendingBattle[] = [];
  for (const territory of destinations) {
    const defenders = (unitsByTerritory[territory] ?? []).filter((unit) => isEnemy(unit, nation));
    if (defenders.length === 0) {
      continue;
    }
    const attackerCount = combatPlansForDestination(plans, territory).reduce(
      (total, plan) => total + movingUnitsForPlan(plan, unitsByTerritory).length,
      0,
    );
    battles.push({ territory, attackerCount, defenderCount: defenders.length });
  }
  return battles;
}

/** Assemble the attacker army (from combat-move plans), defender army, and attacker origins. */
export function buildBattleSetup(
  territory: TerritoryName,
  nation: Nationality,
  plans: SquadMovementPlan[],
  unitsByTerritory: UnitsByTerritory,
): BattleSetup {
  const attackers: MilitaryUnit[] = [];
  const originByUnitId: Record<string, TerritoryName> = {};

  for (const plan of combatPlansForDestination(plans, territory)) {
    for (const unit of movingUnitsForPlan(plan, unitsByTerritory)) {
      attackers.push(unit);
      originByUnitId[unit.id] = plan.startingTerritoryName;
    }
  }

  const defenders = (unitsByTerritory[territory] ?? []).filter((unit) => isEnemy(unit, nation));
  return { attackers, defenders, originByUnitId };
}
