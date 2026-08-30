import { Nationality } from '@ww2/shared/nationality';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { AIR_UNIT_TYPES, LAND_UNIT_TYPES, SEA_UNIT_TYPES, UnitType } from '@ww2/shared/unit-type';
import {
  LandTerritoryName,
  SeaTerritoryName,
  TerritoryName,
} from '../../territories/territory-names';
import { TERRITORY_INFO_BY_NAME } from '../../territories/territory-info';
import { ADJACENT_TERRITORIES_BY_NAME } from '../../territories/territory-adjacency';
import { TERRITORY_IPC_VALUE } from '@ww2/economy/data/territory-ipc';

export type PlacementCategory = 'land-air' | 'naval' | 'factory';

type UnitsByTerritory = Partial<Record<TerritoryName, MilitaryUnit[]>>;
type LandControlMap = Record<LandTerritoryName, Nationality>;

/** How a unit type is placed: in an IC territory, an adjacent sea zone, or as a new IC. */
export function placementCategory(unitType: UnitType): PlacementCategory {
  if (unitType === UnitType.FACTORY) {
    return 'factory';
  }
  if (SEA_UNIT_TYPES.includes(unitType)) {
    return 'naval';
  }
  // Land and air units both mobilize in the industrial-complex territory itself.
  if (LAND_UNIT_TYPES.includes(unitType) || AIR_UNIT_TYPES.includes(unitType)) {
    return 'land-air';
  }
  return 'land-air';
}

function isLand(territory: TerritoryName): territory is LandTerritoryName {
  return TERRITORY_INFO_BY_NAME[territory].kind === 'land';
}

function hasFactory(units: MilitaryUnit[] | undefined): boolean {
  return (units ?? []).some((unit) => unit.type === UnitType.FACTORY);
}

/** Land territories the nation controls that contain an industrial complex. */
export function factoryTerritoriesFor(
  nation: Nationality,
  unitsByTerritory: UnitsByTerritory,
  landControl: LandControlMap,
): LandTerritoryName[] {
  return (Object.keys(landControl) as LandTerritoryName[]).filter(
    (territory) => landControl[territory] === nation && hasFactory(unitsByTerritory[territory]),
  );
}

/** Per-IC mobilization cap: the territory's IPC production value. */
export function capacityOf(territory: LandTerritoryName): number {
  return TERRITORY_IPC_VALUE[territory] ?? 0;
}

/**
 * Territories where the nation may build a NEW industrial complex: land it controls, with an IPC
 * value of at least 1, that does not already contain a complex.
 */
export function newFactoryTerritoriesFor(
  nation: Nationality,
  unitsByTerritory: UnitsByTerritory,
  landControl: LandControlMap,
): LandTerritoryName[] {
  return (Object.keys(landControl) as LandTerritoryName[]).filter(
    (territory) =>
      landControl[territory] === nation &&
      capacityOf(territory) >= 1 &&
      !hasFactory(unitsByTerritory[territory]),
  );
}

/** Sea zones adjacent to a (coastal) industrial-complex territory, where naval units mobilize. */
export function adjacentSeaZones(territory: LandTerritoryName): SeaTerritoryName[] {
  return (ADJACENT_TERRITORIES_BY_NAME[territory] ?? []).filter(
    (neighbor): neighbor is SeaTerritoryName => !isLand(neighbor),
  );
}
