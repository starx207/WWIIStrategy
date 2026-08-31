import { MilitaryUnit } from '@ww2/shared/military-unit';
import { NATION_ALLIANCE, Nationality } from '@ww2/shared/nationality';
import { AIR_UNIT_TYPES, NEUTRAL_UNIT_TYPES } from '@ww2/shared/unit-type';
import { TurnPhase } from '@ww2/game/turn-phase';
import { LandTerritoryName, TerritoryName } from '../../territories/territory-names';
import { TERRITORY_INFO_BY_NAME } from '../../territories/territory-info';
import { SquadMovementPlan } from '../map-state';
import { parseSquadId } from './movement-execution';

type UnitsByTerritory = Partial<Record<TerritoryName, MilitaryUnit[]>>;
type LandControlMap = Record<LandTerritoryName, Nationality>;

function isEnemy(unit: MilitaryUnit, nation: Nationality): boolean {
  return NATION_ALLIANCE[unit.nationality] !== NATION_ALLIANCE[nation];
}

function isEnemyControlledLand(
  territory: TerritoryName,
  nation: Nationality,
  landControl: LandControlMap,
): territory is LandTerritoryName {
  if (TERRITORY_INFO_BY_NAME[territory].kind !== 'land') {
    return false;
  }
  const controller = landControl[territory as LandTerritoryName];
  return controller !== undefined && NATION_ALLIANCE[controller] !== NATION_ALLIANCE[nation];
}

/** True when a territory holds an enemy unit that actually fights on the ground (not an AA gun/IC). */
export function hasNonNeutralEnemy(
  territory: TerritoryName,
  nation: Nationality,
  unitsByTerritory: UnitsByTerritory,
): boolean {
  return (unitsByTerritory[territory] ?? []).some(
    (unit) => isEnemy(unit, nation) && !NEUTRAL_UNIT_TYPES.includes(unit.type),
  );
}

export interface AutoCaptureResult {
  unitsByTerritoryName: UnitsByTerritory;
  pendingCapturesByTerritory: Partial<Record<LandTerritoryName, Nationality>>;
  movementPlansBySquadId: Record<string, SquadMovementPlan>;
}

/**
 * Resolve the combat moves that need no battle:
 *  - Undefended destinations (enemy land with no ground defenders): attackers move in and capture it.
 *  - Blitz pass-throughs (enemy land a tank moves through en route): captured without stopping.
 * Enemy AA guns / factories in a captured territory are removed. Plans that lead to a real battle
 * (a defended destination) are preserved for the battle board. Pure function.
 */
export function resolveAutomaticCaptures(params: {
  nation: Nationality;
  unitsByTerritoryName: UnitsByTerritory;
  movementPlansBySquadId: Record<string, SquadMovementPlan>;
  landControl: LandControlMap;
  pendingCapturesByTerritory: Partial<Record<LandTerritoryName, Nationality>>;
}): AutoCaptureResult {
  const { nation, landControl } = params;
  const units: UnitsByTerritory = { ...params.unitsByTerritoryName };
  const captures = { ...params.pendingCapturesByTerritory };
  const remainingPlans: Record<string, SquadMovementPlan> = {};

  for (const [squadId, plan] of Object.entries(params.movementPlansBySquadId)) {
    if (plan.phase !== TurnPhase.COMBAT_MOVEMENT || plan.path.length === 0) {
      remainingPlans[squadId] = plan;
      continue;
    }

    // Aircraft only fly over enemy territory — they never capture it. Leave their plans for combat.
    const squadInfo = parseSquadId(squadId);
    if (squadInfo && AIR_UNIT_TYPES.includes(squadInfo.unitType)) {
      remainingPlans[squadId] = plan;
      continue;
    }

    // Blitz: any enemy-controlled land the unit passes through (all but the final step) is captured.
    for (const step of plan.path.slice(0, -1)) {
      if (isEnemyControlledLand(step.territoryName, nation, landControl)) {
        captures[step.territoryName] = nation;
      }
    }

    const destination = plan.path[plan.path.length - 1].territoryName;
    const undefended =
      isEnemyControlledLand(destination, nation, landControl) &&
      !hasNonNeutralEnemy(destination, nation, units);

    if (!undefended) {
      // Leads to a battle (or is otherwise not an auto-capture) — keep for combat resolution.
      remainingPlans[squadId] = plan;
      continue;
    }

    const squad = parseSquadId(squadId);
    if (!squad) {
      remainingPlans[squadId] = plan;
      continue;
    }

    const originUnits = units[plan.startingTerritoryName] ?? [];
    const isMoving = (unit: MilitaryUnit) =>
      unit.nationality === squad.nationality && unit.type === squad.unitType;
    const moving = originUnits.filter(isMoving);
    if (moving.length === 0) {
      continue;
    }

    units[plan.startingTerritoryName] = originUnits.filter((unit) => !isMoving(unit));
    // Occupy the destination: keep any friendly units already there, drop the enemy AA/IC, add attackers.
    const friendlyAtDestination = (units[destination] ?? []).filter(
      (unit) => !isEnemy(unit, nation),
    );
    units[destination] = [...friendlyAtDestination, ...moving];
    captures[destination] = nation;
  }

  return {
    unitsByTerritoryName: units,
    pendingCapturesByTerritory: captures,
    movementPlansBySquadId: remainingPlans,
  };
}
