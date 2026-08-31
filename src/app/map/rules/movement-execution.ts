import { MilitaryUnit } from '@ww2/shared/military-unit';
import { Nationality } from '@ww2/shared/nationality';
import { UnitType } from '@ww2/shared/unit-type';
import { TurnPhase } from '@ww2/game/turn-phase';
import { TerritoryName } from '../../territories/territory-names';
import { SquadMovementPlan } from '../map-state';
import { CargoByCarrierUnitId } from './carrier-cargo';

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
  cargoByCarrierUnitId: CargoByCarrierUnitId = {},
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
    const squadUnits = originUnits.filter(
      (unit) => unit.nationality === squad.nationality && unit.type === squad.unitType,
    );
    if (squadUnits.length === 0) {
      continue;
    }

    // A carrier carries its loaded fighters along with it.
    const cargoIds = new Set(
      squad.unitType === UnitType.AIRCRAFT_CARRIER
        ? squadUnits.flatMap((carrier) => cargoByCarrierUnitId[carrier.id] ?? [])
        : [],
    );
    const movingIds = new Set([...squadUnits.map((unit) => unit.id), ...cargoIds]);
    const moving = originUnits.filter((unit) => movingIds.has(unit.id));

    units[origin] = originUnits.filter((unit) => !movingIds.has(unit.id));
    units[destination] = [...(units[destination] ?? []), ...moving];
  }

  return { unitsByTerritoryName: units, remainingPlans };
}
