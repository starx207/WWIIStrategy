import { MilitaryUnit } from '@ww2/shared/military-unit';
import { NATION_ALLIANCE, Nationality } from '@ww2/shared/nationality';
import { UnitType } from '@ww2/shared/unit-type';
import { LandTerritoryName, TerritoryName } from '../../territories/territory-names';
import { TERRITORY_INFO_BY_NAME } from '../../territories/territory-info';
import { ADJACENT_TERRITORIES_BY_NAME } from '../../territories/territory-adjacency';
import { CargoByCarrierUnitId, canTransportHoldTypes } from './carrier-cargo';
import type { SquadMovementPlan } from '../map-state';

type UnitsByTerritory = Partial<Record<TerritoryName, MilitaryUnit[]>>;
type AmphibiousAssaults = Partial<Record<LandTerritoryName, string[]>>;

function isAdjacent(a: TerritoryName, b: TerritoryName): boolean {
  return (ADJACENT_TERRITORIES_BY_NAME[a] ?? []).includes(b);
}

/**
 * The sea zone a transport will occupy once its plan executes — its last ordinary (non-cargo) step,
 * or its current territory if it has no planned move. Used to offer/authorize unload targets against
 * where the transport *will* be, not where it currently sits.
 */
export function plannedTransportSeaPosition(
  plan: SquadMovementPlan | undefined,
  currentTerritory: TerritoryName,
): TerritoryName {
  const moveSteps = (plan?.path ?? []).filter((step) => !step.cargo);
  return moveSteps[moveSteps.length - 1]?.territoryName ?? currentTerritory;
}

/**
 * Find a same-nationality transport in `seaZone` (adjacent to `fromTerritory`) that could legally
 * hold `cargoUnitCount` more units of `cargoUnitType` on top of what it already carries, or undefined
 * if none qualifies. Used to decide whether clicking a sea zone with a land squad selected should
 * load it. Enforces the infantry-anchored composition rule (see `canTransportHoldTypes`), not just a
 * count.
 */
export function findLoadableTransport(params: {
  fromTerritory: TerritoryName;
  seaZone: TerritoryName;
  cargoUnitCount: number;
  cargoUnitType: UnitType;
  nation: Nationality;
  unitsByTerritory: UnitsByTerritory;
  cargoByCarrierUnitId: CargoByCarrierUnitId;
  // Transports that already acted this turn (e.g. ran a combat cargo op): a transport participates in
  // cargo ops in only one phase, so a committed one can't be loaded onto again.
  committedUnitIds?: Set<string>;
  // Types of not-yet-executed loads already planned onto each transport this phase, charged against
  // its capacity so it can't be overcommitted across several load orders.
  plannedCargoTypesByTransportId?: Record<string, UnitType[]>;
}): string | undefined {
  const { fromTerritory, seaZone, cargoUnitCount, cargoUnitType, nation, committedUnitIds } =
    params;
  if (TERRITORY_INFO_BY_NAME[seaZone].kind !== 'sea' || !isAdjacent(fromTerritory, seaZone)) {
    return undefined;
  }
  // Loaded cargo units sit physically in the transport's sea zone, so their types are resolvable here.
  const typeById = new Map(
    (params.unitsByTerritory[seaZone] ?? []).map((unit) => [unit.id, unit.type]),
  );
  const incoming = Array<UnitType>(cargoUnitCount).fill(cargoUnitType);
  const transport = (params.unitsByTerritory[seaZone] ?? []).find((unit) => {
    if (unit.type !== UnitType.TRANSPORT || unit.nationality !== nation) {
      return false;
    }
    if (committedUnitIds?.has(unit.id)) {
      return false;
    }
    const existingTypes = (params.cargoByCarrierUnitId[unit.id] ?? [])
      .map((cargoId) => typeById.get(cargoId))
      .filter((type): type is UnitType => type !== undefined);
    const plannedTypes = params.plannedCargoTypesByTransportId?.[unit.id] ?? [];
    return canTransportHoldTypes([...existingTypes, ...plannedTypes, ...incoming]);
  });
  return transport?.id;
}

/** Whether a loaded transport can unload onto `targetTerritory` (adjacent land). */
export function canUnloadTo(
  transportTerritory: TerritoryName,
  targetTerritory: TerritoryName,
): boolean {
  return (
    TERRITORY_INFO_BY_NAME[targetTerritory].kind === 'land' &&
    isAdjacent(transportTerritory, targetTerritory)
  );
}

/** All unit ids currently staged for an amphibious assault. */
export function allAmphibiousUnitIds(amphibious: AmphibiousAssaults): Set<string> {
  return new Set(Object.values(amphibious).flatMap((ids) => ids ?? []));
}

export interface LoadCargoResult {
  unitsByTerritoryName: UnitsByTerritory;
  cargoByCarrierUnitId: CargoByCarrierUnitId;
}

/**
 * Load land units onto a transport: move them from their coast into the transport's sea zone and
 * record them as its cargo. Pure function.
 */
export function loadCargo(params: {
  unitsByTerritory: UnitsByTerritory;
  cargoByCarrierUnitId: CargoByCarrierUnitId;
  transportId: string;
  transportTerritory: TerritoryName;
  unitIds: string[];
  fromTerritory: TerritoryName;
}): LoadCargoResult {
  const units: UnitsByTerritory = { ...params.unitsByTerritory };
  const cargo: CargoByCarrierUnitId = { ...params.cargoByCarrierUnitId };

  const moveIds = new Set(params.unitIds);
  const fromUnits = units[params.fromTerritory] ?? [];
  const moving = fromUnits.filter((unit) => moveIds.has(unit.id));

  units[params.fromTerritory] = fromUnits.filter((unit) => !moveIds.has(unit.id));
  units[params.transportTerritory] = [...(units[params.transportTerritory] ?? []), ...moving];
  cargo[params.transportId] = [...(cargo[params.transportId] ?? []), ...params.unitIds];

  return { unitsByTerritoryName: units, cargoByCarrierUnitId: cargo };
}

/**
 * Unload a transport's cargo onto a friendly territory: move the loaded land units from the
 * transport's sea zone into the target territory. When `unitIds` is given, only those cargo units
 * disembark and the rest stay aboard; otherwise the whole cargo unloads. Pure function.
 */
export function unloadToTerritory(params: {
  unitsByTerritory: UnitsByTerritory;
  cargoByCarrierUnitId: CargoByCarrierUnitId;
  transportId: string;
  transportTerritory: TerritoryName;
  targetTerritory: TerritoryName;
  unitIds?: string[];
}): LoadCargoResult {
  const units: UnitsByTerritory = { ...params.unitsByTerritory };
  const cargo: CargoByCarrierUnitId = { ...params.cargoByCarrierUnitId };

  const currentCargo = cargo[params.transportId] ?? [];
  const requested = params.unitIds ? new Set(params.unitIds) : undefined;
  const unloadingIds = new Set(
    requested ? currentCargo.filter((id) => requested.has(id)) : currentCargo,
  );
  const seaUnits = units[params.transportTerritory] ?? [];
  const unloading = seaUnits.filter((unit) => unloadingIds.has(unit.id));

  units[params.transportTerritory] = seaUnits.filter((unit) => !unloadingIds.has(unit.id));
  units[params.targetTerritory] = [...(units[params.targetTerritory] ?? []), ...unloading];
  cargo[params.transportId] = currentCargo.filter((id) => !unloadingIds.has(id));

  return { unitsByTerritoryName: units, cargoByCarrierUnitId: cargo };
}

export interface StageAssaultResult {
  cargoByCarrierUnitId: CargoByCarrierUnitId;
  amphibiousAssaultsByTerritory: AmphibiousAssaults;
}

/**
 * Stage an amphibious assault: move a transport's cargo ids into the assault list for a hostile
 * territory (the units stay physically in the sea zone until combat resolves). When `unitIds` is
 * given, only those cargo units are staged and the rest stay aboard; otherwise the whole cargo is
 * staged. Pure function.
 */
export function stageAmphibiousAssault(params: {
  cargoByCarrierUnitId: CargoByCarrierUnitId;
  amphibiousAssaultsByTerritory: AmphibiousAssaults;
  transportId: string;
  targetTerritory: LandTerritoryName;
  unitIds?: string[];
}): StageAssaultResult {
  const cargo: CargoByCarrierUnitId = { ...params.cargoByCarrierUnitId };
  const amphibious: AmphibiousAssaults = { ...params.amphibiousAssaultsByTerritory };

  const currentCargo = cargo[params.transportId] ?? [];
  const requested = params.unitIds ? new Set(params.unitIds) : undefined;
  const stagingIds = requested ? currentCargo.filter((id) => requested.has(id)) : currentCargo;
  amphibious[params.targetTerritory] = [
    ...(amphibious[params.targetTerritory] ?? []),
    ...stagingIds,
  ];
  cargo[params.transportId] = requested ? currentCargo.filter((id) => !requested.has(id)) : [];

  return { cargoByCarrierUnitId: cargo, amphibiousAssaultsByTerritory: amphibious };
}
