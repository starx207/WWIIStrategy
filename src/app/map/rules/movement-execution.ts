import { MilitaryUnit } from '@ww2/shared/military-unit';
import { Nationality } from '@ww2/shared/nationality';
import { UnitType } from '@ww2/shared/unit-type';
import { TurnPhase } from '@ww2/game/turn-phase';
import { TerritoryName } from '../../territories/territory-names';
import { SquadMovementPlan } from '../map-state';

type UnitsByTerritory = Partial<Record<TerritoryName, MilitaryUnit[]>>;

/** Recover the nationality + unit type encoded in a map squad id (`map-squad|territory|nat|type`). */
export function parseSquadId(
  squadId: string,
): { nationality: Nationality; unitType: UnitType } | undefined {
  const parts = squadId.split('|');
  if (parts.length < 4 || parts[0] !== 'map-squad') {
    return undefined;
  }
  return { nationality: parts[2] as Nationality, unitType: parts[3] as UnitType };
}

export interface ExecuteMovementResult {
  unitsByTerritoryName: UnitsByTerritory;
  remainingPlans: Record<string, SquadMovementPlan>;
}

/**
 * Relocate the units of every plan whose phase matches, from its origin to the final step of its
 * path. Plans for other phases (or with no path) are preserved. Pure function — returns new maps.
 */
export function executeMovementPlans(
  unitsByTerritoryName: UnitsByTerritory,
  movementPlansBySquadId: Record<string, SquadMovementPlan>,
  phase: TurnPhase,
): ExecuteMovementResult {
  const units: UnitsByTerritory = { ...unitsByTerritoryName };
  const remainingPlans: Record<string, SquadMovementPlan> = {};

  for (const [squadId, plan] of Object.entries(movementPlansBySquadId)) {
    if (plan.phase !== phase || plan.path.length === 0) {
      remainingPlans[squadId] = plan;
      continue;
    }

    const origin = plan.startingTerritoryName;
    const destination = plan.path[plan.path.length - 1].territoryName;
    const squad = parseSquadId(squadId);
    if (!squad || origin === destination) {
      continue;
    }

    const originUnits = units[origin] ?? [];
    const isMoving = (unit: MilitaryUnit) =>
      unit.nationality === squad.nationality && unit.type === squad.unitType;
    const moving = originUnits.filter(isMoving);
    if (moving.length === 0) {
      continue;
    }

    units[origin] = originUnits.filter((unit) => !isMoving(unit));
    units[destination] = [...(units[destination] ?? []), ...moving];
  }

  return { unitsByTerritoryName: units, remainingPlans };
}
