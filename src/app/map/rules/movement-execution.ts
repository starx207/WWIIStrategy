import { MilitaryUnit } from '@ww2/shared/military-unit';
import { Nationality } from '@ww2/shared/nationality';
import { UnitType } from '@ww2/shared/unit-type';
import { TurnPhase } from '@ww2/game/turn-phase';
import { TerritoryName } from '../../territories/territory-names';
import { SquadMovementPlan } from '../map-state';
import { CargoByCarrierUnitId } from './carrier-cargo';
import { loadCargo, unloadToTerritory } from './amphibious';

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
  cargoByCarrierUnitId: CargoByCarrierUnitId;
  remainingPlans: Record<string, SquadMovementPlan>;
}

function findTerritoryForUnitId(
  units: UnitsByTerritory,
  unitId: string,
): TerritoryName | undefined {
  for (const [territory, territoryUnits] of Object.entries(units)) {
    if ((territoryUnits ?? []).some((unit) => unit.id === unitId)) {
      return territory as TerritoryName;
    }
  }
  return undefined;
}

/**
 * Relocate the units of every plan whose phase matches, from its origin to the final step of its
 * path, and apply any deferred amphibious logistics tagged on those plans. Plans for other phases
 * (or with no path) are preserved. Pure function — returns new maps.
 *
 * Runs three ordered passes so an amphibious operation composed across separate plans lands
 * consistently: (1) **loads** move a land squad's units into their target transport's current sea
 * zone and record them as cargo; (2) **moves** relocate each carrier/transport — dragging its
 * cargo — and every ordinary land/air squad to its final non-cargo step; (3) **unloads** drop a
 * transport's cargo from its post-move sea zone onto the target coast. Object-iteration order alone
 * is not sufficient — a transport must be loaded before it moves and moved before it unloads.
 */
export function executeMovementPlans(
  unitsByTerritoryName: UnitsByTerritory,
  movementPlansBySquadId: Record<string, SquadMovementPlan>,
  phase: TurnPhase,
  cargoByCarrierUnitId: CargoByCarrierUnitId = {},
): ExecuteMovementResult {
  let units: UnitsByTerritory = { ...unitsByTerritoryName };
  let cargo: CargoByCarrierUnitId = { ...cargoByCarrierUnitId };
  const remainingPlans: Record<string, SquadMovementPlan> = {};

  // Plans not for this phase (or with no path) are preserved untouched; the rest are consumed.
  const phasePlans: [string, SquadMovementPlan][] = [];
  for (const [squadId, plan] of Object.entries(movementPlansBySquadId)) {
    if (plan.phase !== phase || plan.path.length === 0) {
      remainingPlans[squadId] = plan;
    } else {
      phasePlans.push([squadId, plan]);
    }
  }

  const terminalCargoRole = (plan: SquadMovementPlan) =>
    plan.path[plan.path.length - 1].cargo?.role;

  // Pass 1 — loads.
  for (const [squadId, plan] of phasePlans) {
    const terminal = plan.path[plan.path.length - 1];
    if (terminal.cargo?.role !== 'load') {
      continue;
    }
    const squad = parseSquadId(squadId);
    if (!squad) {
      continue;
    }
    const transportTerritory = findTerritoryForUnitId(units, terminal.cargo.transportId);
    if (!transportTerritory) {
      continue;
    }
    const originUnits = units[plan.startingTerritoryName] ?? [];
    const loadingIds = originUnits
      .filter((unit) => unit.nationality === squad.nationality && unit.type === squad.unitType)
      .map((unit) => unit.id);
    if (loadingIds.length === 0) {
      continue;
    }
    const result = loadCargo({
      unitsByTerritory: units,
      cargoByCarrierUnitId: cargo,
      transportId: terminal.cargo.transportId,
      transportTerritory,
      unitIds: loadingIds,
      fromTerritory: plan.startingTerritoryName,
    });
    units = result.unitsByTerritoryName;
    cargo = result.cargoByCarrierUnitId;
  }

  // Pass 2 — moves (carriers/transports drag their cargo).
  for (const [squadId, plan] of phasePlans) {
    if (terminalCargoRole(plan) === 'load') {
      continue; // handled in pass 1
    }
    const squad = parseSquadId(squadId);
    if (!squad) {
      continue;
    }

    const origin = plan.startingTerritoryName;
    // A trailing unload step is a drop target, not a place the transport moves to.
    const moveSteps = plan.path.filter((step) => !step.cargo);
    const destination = moveSteps[moveSteps.length - 1]?.territoryName;
    if (!destination || destination === origin) {
      continue;
    }

    const originUnits = units[origin] ?? [];
    const squadUnits = originUnits.filter(
      (unit) => unit.nationality === squad.nationality && unit.type === squad.unitType,
    );
    if (squadUnits.length === 0) {
      continue;
    }

    // Carriers carry loaded fighters; transports carry loaded land units.
    const carriesCargo =
      squad.unitType === UnitType.AIRCRAFT_CARRIER || squad.unitType === UnitType.TRANSPORT;
    const cargoIds = new Set(
      carriesCargo ? squadUnits.flatMap((carrier) => cargo[carrier.id] ?? []) : [],
    );
    const movingIds = new Set([...squadUnits.map((unit) => unit.id), ...cargoIds]);
    const moving = originUnits.filter((unit) => movingIds.has(unit.id));

    units[origin] = originUnits.filter((unit) => !movingIds.has(unit.id));
    units[destination] = [...(units[destination] ?? []), ...moving];
  }

  // Pass 3 — unloads (friendly). Each transport of the squad at its post-move sea zone drops its
  // cargo onto the target coast.
  for (const [squadId, plan] of phasePlans) {
    if (terminalCargoRole(plan) !== 'unload') {
      continue;
    }
    const squad = parseSquadId(squadId);
    if (!squad) {
      continue;
    }
    const target = plan.path[plan.path.length - 1].territoryName;
    const moveSteps = plan.path.filter((step) => !step.cargo);
    const transportTerritory =
      moveSteps[moveSteps.length - 1]?.territoryName ?? plan.startingTerritoryName;
    const transports = (units[transportTerritory] ?? []).filter(
      (unit) => unit.nationality === squad.nationality && unit.type === squad.unitType,
    );
    for (const transport of transports) {
      if ((cargo[transport.id] ?? []).length === 0) {
        continue;
      }
      const result = unloadToTerritory({
        unitsByTerritory: units,
        cargoByCarrierUnitId: cargo,
        transportId: transport.id,
        transportTerritory,
        targetTerritory: target,
      });
      units = result.unitsByTerritoryName;
      cargo = result.cargoByCarrierUnitId;
    }
  }

  return { unitsByTerritoryName: units, cargoByCarrierUnitId: cargo, remainingPlans };
}
