import { MilitaryUnit } from '@ww2/shared/military-unit';
import { UnitType } from '@ww2/shared/unit-type';
import { TerritoryName } from '../../territories/territory-names';

/** Fighters an aircraft carrier can carry. */
export const CARRIER_CAPACITY = 2;

/** Maps a carrier unit id to the ids of the fighters loaded on it. */
export type CargoByCarrierUnitId = Record<string, string[]>;

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
