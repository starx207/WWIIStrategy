import { MilitaryUnit } from '@ww2/shared/military-unit';
import { NATION_ALLIANCE, Nationality } from '@ww2/shared/nationality';
import { UnitType } from '@ww2/shared/unit-type';
import { TurnPhase } from '@ww2/game/turn-phase';
import { LandTerritoryName, TerritoryName } from '../../territories/territory-names';
import { SquadMovementPlan } from '../map-state';
import { CargoByCarrierUnitId } from './carrier-cargo';
import { loadCargo, stageAmphibiousAssault, unloadToTerritory } from './amphibious';

type UnitsByTerritory = Partial<Record<TerritoryName, MilitaryUnit[]>>;
type AmphibiousAssaults = Partial<Record<LandTerritoryName, string[]>>;

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

/**
 * The origin units a plan actually relocates: its squad's like units in `originUnits`, narrowed to
 * the plan's `unitIds` when it is a detachment (a subset split off the stack). No `unitIds` = the
 * whole stack (legacy). Sibling detachment plans of one stack carry disjoint `unitIds`, so applying
 * this per plan never double-moves a unit.
 */
function planMovingUnits(
  originUnits: MilitaryUnit[],
  squad: { nationality: Nationality; unitType: UnitType },
  plan: SquadMovementPlan,
): MilitaryUnit[] {
  const likeUnits = originUnits.filter(
    (unit) => unit.nationality === squad.nationality && unit.type === squad.unitType,
  );
  if (!plan.unitIds) {
    return likeUnits;
  }
  const ids = new Set(plan.unitIds);
  return likeUnits.filter((unit) => ids.has(unit.id));
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
    const loadingIds = planMovingUnits(originUnits, squad, plan).map((unit) => unit.id);
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
    const squadUnits = planMovingUnits(originUnits, squad, plan);
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

export interface ExecuteAmphibiousCombatMoveResult {
  unitsByTerritoryName: UnitsByTerritory;
  cargoByCarrierUnitId: CargoByCarrierUnitId;
  amphibiousAssaultsByTerritory: AmphibiousAssaults;
  remainingPlans: Record<string, SquadMovementPlan>;
}

/**
 * Materialize the transport half of the combat-movement phase, ahead of `RecordCombatCommitments`
 * (see `TurnFlowService.advancePhase`). Runs the same three passes as `executeMovementPlans` but
 * restricted to transport cargo operations — a land squad's `role:'load'` plan and a transport's
 * `role:'unload'` plan — leaving land attackers, aircraft, carriers, and naval-combat transports
 * for the existing combat/auto-capture paths:
 *  1. **loads** board a land squad's units onto their target transport's current sea zone;
 *  2. **transport moves** relocate each unloading transport (dragging its cargo) to its final sea
 *     step;
 *  3. **unloads** drop cargo from the transport's post-move sea zone — a **hostile** coast stages an
 *     amphibious assault (units stay physically in the sea zone, their ids go to
 *     `amphibiousAssaultsByTerritory`, resolved downstream exactly as before), a friendly coast is
 *     occupied immediately.
 * The consumed plans are removed; everything else is preserved. Pure function.
 */
export function executeAmphibiousCombatMovePlans(params: {
  unitsByTerritoryName: UnitsByTerritory;
  movementPlansBySquadId: Record<string, SquadMovementPlan>;
  cargoByCarrierUnitId: CargoByCarrierUnitId;
  amphibiousAssaultsByTerritory: AmphibiousAssaults;
  landControl: Record<LandTerritoryName, Nationality>;
  nation: Nationality;
}): ExecuteAmphibiousCombatMoveResult {
  const { landControl, nation } = params;
  let units: UnitsByTerritory = { ...params.unitsByTerritoryName };
  let cargo: CargoByCarrierUnitId = { ...params.cargoByCarrierUnitId };
  let amphibious: AmphibiousAssaults = { ...params.amphibiousAssaultsByTerritory };
  const remainingPlans: Record<string, SquadMovementPlan> = {};

  const terminalCargoRole = (plan: SquadMovementPlan) =>
    plan.phase === TurnPhase.COMBAT_MOVEMENT && plan.path.length > 0
      ? plan.path[plan.path.length - 1].cargo?.role
      : undefined;

  const entries = Object.entries(params.movementPlansBySquadId);

  // Keep every plan that isn't a transport cargo operation (land attackers, aircraft, carriers,
  // naval-combat transports) — those resolve through the existing combat/auto-capture machinery.
  for (const [squadId, plan] of entries) {
    if (terminalCargoRole(plan) === undefined) {
      remainingPlans[squadId] = plan;
    }
  }

  // Pass 1 — loads.
  for (const [squadId, plan] of entries) {
    if (terminalCargoRole(plan) !== 'load') {
      continue;
    }
    const terminal = plan.path[plan.path.length - 1];
    const squad = parseSquadId(squadId);
    if (!squad || terminal.cargo?.role !== 'load') {
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

  // Pass 2 — transport moves (dragging cargo) to the final sea step before the unload.
  for (const [squadId, plan] of entries) {
    if (terminalCargoRole(plan) !== 'unload') {
      continue;
    }
    const squad = parseSquadId(squadId);
    if (!squad) {
      continue;
    }
    const origin = plan.startingTerritoryName;
    const moveSteps = plan.path.filter((step) => !step.cargo);
    const destination = moveSteps[moveSteps.length - 1]?.territoryName;
    if (!destination || destination === origin) {
      continue;
    }
    const originUnits = units[origin] ?? [];
    const transports = originUnits.filter(
      (unit) => unit.nationality === squad.nationality && unit.type === squad.unitType,
    );
    if (transports.length === 0) {
      continue;
    }
    const cargoIds = new Set(transports.flatMap((transport) => cargo[transport.id] ?? []));
    const movingIds = new Set([...transports.map((unit) => unit.id), ...cargoIds]);
    const moving = originUnits.filter((unit) => movingIds.has(unit.id));

    units[origin] = originUnits.filter((unit) => !movingIds.has(unit.id));
    units[destination] = [...(units[destination] ?? []), ...moving];
  }

  // Pass 3 — unloads from the transport's post-move sea zone: hostile stages an assault, friendly
  // occupies immediately.
  for (const [squadId, plan] of entries) {
    if (terminalCargoRole(plan) !== 'unload') {
      continue;
    }
    const squad = parseSquadId(squadId);
    if (!squad) {
      continue;
    }
    const target = plan.path[plan.path.length - 1].territoryName as LandTerritoryName;
    const moveSteps = plan.path.filter((step) => !step.cargo);
    const transportTerritory =
      moveSteps[moveSteps.length - 1]?.territoryName ?? plan.startingTerritoryName;
    const transports = (units[transportTerritory] ?? []).filter(
      (unit) => unit.nationality === squad.nationality && unit.type === squad.unitType,
    );
    const controller = landControl[target];
    const hostile =
      controller !== undefined && NATION_ALLIANCE[controller] !== NATION_ALLIANCE[nation];

    for (const transport of transports) {
      if ((cargo[transport.id] ?? []).length === 0) {
        continue;
      }
      if (hostile) {
        const result = stageAmphibiousAssault({
          cargoByCarrierUnitId: cargo,
          amphibiousAssaultsByTerritory: amphibious,
          transportId: transport.id,
          targetTerritory: target,
        });
        cargo = result.cargoByCarrierUnitId;
        amphibious = result.amphibiousAssaultsByTerritory;
      } else {
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
  }

  return {
    unitsByTerritoryName: units,
    cargoByCarrierUnitId: cargo,
    amphibiousAssaultsByTerritory: amphibious,
    remainingPlans,
  };
}
