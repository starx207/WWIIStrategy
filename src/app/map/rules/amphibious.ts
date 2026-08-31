import { MilitaryUnit } from '@ww2/shared/military-unit';
import { LandTerritoryName, TerritoryName } from '../../territories/territory-names';
import { CargoByCarrierUnitId } from './carrier-cargo';

type UnitsByTerritory = Partial<Record<TerritoryName, MilitaryUnit[]>>;
type AmphibiousAssaults = Partial<Record<LandTerritoryName, string[]>>;

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
 * transport's sea zone into the target territory and clear the transport's cargo. Pure function.
 */
export function unloadToTerritory(params: {
  unitsByTerritory: UnitsByTerritory;
  cargoByCarrierUnitId: CargoByCarrierUnitId;
  transportId: string;
  transportTerritory: TerritoryName;
  targetTerritory: TerritoryName;
}): LoadCargoResult {
  const units: UnitsByTerritory = { ...params.unitsByTerritory };
  const cargo: CargoByCarrierUnitId = { ...params.cargoByCarrierUnitId };

  const cargoIds = new Set(cargo[params.transportId] ?? []);
  const seaUnits = units[params.transportTerritory] ?? [];
  const unloading = seaUnits.filter((unit) => cargoIds.has(unit.id));

  units[params.transportTerritory] = seaUnits.filter((unit) => !cargoIds.has(unit.id));
  units[params.targetTerritory] = [...(units[params.targetTerritory] ?? []), ...unloading];
  cargo[params.transportId] = [];

  return { unitsByTerritoryName: units, cargoByCarrierUnitId: cargo };
}

export interface StageAssaultResult {
  cargoByCarrierUnitId: CargoByCarrierUnitId;
  amphibiousAssaultsByTerritory: AmphibiousAssaults;
}

/**
 * Stage an amphibious assault: move a transport's cargo ids into the assault list for a hostile
 * territory (the units stay physically in the sea zone until combat resolves) and clear the
 * transport's cargo. Pure function.
 */
export function stageAmphibiousAssault(params: {
  cargoByCarrierUnitId: CargoByCarrierUnitId;
  amphibiousAssaultsByTerritory: AmphibiousAssaults;
  transportId: string;
  targetTerritory: LandTerritoryName;
}): StageAssaultResult {
  const cargo: CargoByCarrierUnitId = { ...params.cargoByCarrierUnitId };
  const amphibious: AmphibiousAssaults = { ...params.amphibiousAssaultsByTerritory };

  const cargoIds = cargo[params.transportId] ?? [];
  amphibious[params.targetTerritory] = [...(amphibious[params.targetTerritory] ?? []), ...cargoIds];
  cargo[params.transportId] = [];

  return { cargoByCarrierUnitId: cargo, amphibiousAssaultsByTerritory: amphibious };
}
