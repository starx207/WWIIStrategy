import { MilitaryUnit } from '@ww2/shared/military-unit';
import { LAND_UNIT_TYPES, UnitType } from '@ww2/shared/unit-type';
import { TerritoryName } from '../../territories/territory-names';

/** Fighters an aircraft carrier can carry. */
export const CARRIER_CAPACITY = 2;

/** Land units a transport can carry. */
export const TRANSPORT_CAPACITY = 2;

/** Maps a carrying unit id (carrier or transport) to the ids of the units loaded on it. */
export type CargoByCarrierUnitId = Record<string, string[]>;

/** How many units a carrying unit can hold (0 if it can't carry anything). */
export function cargoCapacity(carryingUnitType: UnitType): number {
  if (carryingUnitType === UnitType.AIRCRAFT_CARRIER) {
    return CARRIER_CAPACITY;
  }
  if (carryingUnitType === UnitType.TRANSPORT) {
    return TRANSPORT_CAPACITY;
  }
  return 0;
}

/** Whether a carrying unit can carry a given cargo type: carriers hold fighters, transports hold land units. */
export function canCarry(carryingUnitType: UnitType, cargoUnitType: UnitType): boolean {
  if (carryingUnitType === UnitType.AIRCRAFT_CARRIER) {
    return cargoUnitType === UnitType.FIGHTER_JET;
  }
  if (carryingUnitType === UnitType.TRANSPORT) {
    return LAND_UNIT_TYPES.includes(cargoUnitType);
  }
  return false;
}

/** Remaining capacity of a carrying unit given its current cargo. */
export function remainingCapacity(
  carryingUnitType: UnitType,
  currentCargo: string[] | undefined,
): number {
  return cargoCapacity(carryingUnitType) - (currentCargo?.length ?? 0);
}

/**
 * Load same-nationality fighters onto the carriers in each territory (up to capacity), for the
 * game's starting layout. Fighters that begin in a carrier's sea zone are treated as its cargo.
 */
export function computeInitialCarrierCargo(
  unitsByTerritory: Partial<Record<TerritoryName, MilitaryUnit[]>>,
): CargoByCarrierUnitId {
  const cargo: CargoByCarrierUnitId = {};

  for (const units of Object.values(unitsByTerritory)) {
    if (!units) {
      continue;
    }
    const carriers = units.filter((unit) => unit.type === UnitType.AIRCRAFT_CARRIER);
    if (carriers.length === 0) {
      continue;
    }
    const fighters = units.filter((unit) => unit.type === UnitType.FIGHTER_JET);
    const assigned = new Set<string>();

    for (const carrier of carriers) {
      const loaded: string[] = [];
      for (const fighter of fighters) {
        if (loaded.length >= CARRIER_CAPACITY) {
          break;
        }
        if (assigned.has(fighter.id) || fighter.nationality !== carrier.nationality) {
          continue;
        }
        loaded.push(fighter.id);
        assigned.add(fighter.id);
      }
      if (loaded.length > 0) {
        cargo[carrier.id] = loaded;
      }
    }
  }

  return cargo;
}

/** Flatten a cargo map into the set of all loaded (fighter) unit ids. */
export function allCargoUnitIds(cargo: CargoByCarrierUnitId): Set<string> {
  return new Set(Object.values(cargo).flat());
}
