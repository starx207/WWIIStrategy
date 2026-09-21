import { MilitaryUnit } from '@ww2/shared/military-unit';
import { AIR_UNIT_TYPES, UnitType } from '@ww2/shared/unit-type';
import { TerritoryName } from '../territories/territory-names';

/** Per aircraft type, how many were designated to land in each zone — the per-zone landing capacity. */
export type LandingCapsByType = Map<UnitType, Map<TerritoryName, number>>;

/** The surviving aircraft plus the data a picker needs to reassign them within their landing caps. */
export interface LandingAssignmentRequest {
  aircraft: MilitaryUnit[];
  caps: LandingCapsByType;
  /** Each surviving aircraft's originally-designated landing zone (the default choice). */
  defaultZoneByUnitId: Record<string, TerritoryName>;
}

/** The aircraft (fighters/bombers) among a list of units. */
export function aircraftOnly(units: MilitaryUnit[]): MilitaryUnit[] {
  return units.filter((unit) => AIR_UNIT_TYPES.includes(unit.type));
}

/**
 * How many attacking aircraft of each type were designated to land in each zone. A zone's capacity
 * for a type is exactly the number originally routed there (the plan's final step), so survivors can
 * only be redistributed among the zones the flight already committed to, up to what each can hold.
 */
export function computeLandingCaps(
  attackerAircraft: MilitaryUnit[],
  returnByUnitId: Record<string, TerritoryName>,
): LandingCapsByType {
  const caps: LandingCapsByType = new Map();
  for (const unit of attackerAircraft) {
    const zone = returnByUnitId[unit.id];
    if (!zone) {
      continue;
    }
    const byZone = caps.get(unit.type) ?? new Map<TerritoryName, number>();
    byZone.set(zone, (byZone.get(zone) ?? 0) + 1);
    caps.set(unit.type, byZone);
  }
  return caps;
}

/** Candidate landing zones for an aircraft type (those it was designated to), in a stable order. */
export function candidateZonesForType(caps: LandingCapsByType, type: UnitType): TerritoryName[] {
  return [...(caps.get(type)?.keys() ?? [])];
}

/**
 * Whether the player has a meaningful landing choice for the surviving aircraft. True when some
 * aircraft type was designated to more than one landing zone and at least one — but not all — of
 * that type survived: if all survive every zone is filled to capacity (the assignment is forced), if
 * none survive there is nothing to place, and a single designated zone leaves no choice.
 */
export function landingAssignmentNeeded(
  originalAttackerAircraft: MilitaryUnit[],
  survivingAircraft: MilitaryUnit[],
  returnByUnitId: Record<string, TerritoryName>,
): boolean {
  const caps = computeLandingCaps(originalAttackerAircraft, returnByUnitId);
  const survivorsByType = new Map<UnitType, number>();
  for (const unit of survivingAircraft) {
    survivorsByType.set(unit.type, (survivorsByType.get(unit.type) ?? 0) + 1);
  }

  for (const [type, byZone] of caps) {
    const total = [...byZone.values()].reduce((sum, count) => sum + count, 0);
    const survivors = survivorsByType.get(type) ?? 0;
    if (byZone.size > 1 && survivors > 0 && survivors < total) {
      return true;
    }
  }
  return false;
}

/**
 * Validate an assignment: every surviving aircraft lands in a zone designated for its type and no
 * zone exceeds its per-type capacity.
 */
export function isValidLandingAssignment(
  survivingAircraft: MilitaryUnit[],
  assignment: Record<string, TerritoryName>,
  caps: LandingCapsByType,
): boolean {
  const usedByTypeZone = new Map<string, number>();
  for (const unit of survivingAircraft) {
    const zone = assignment[unit.id];
    if (!zone) {
      return false;
    }
    const cap = caps.get(unit.type)?.get(zone);
    if (cap === undefined) {
      return false;
    }
    const key = `${unit.type}|${zone}`;
    const used = (usedByTypeZone.get(key) ?? 0) + 1;
    if (used > cap) {
      return false;
    }
    usedByTypeZone.set(key, used);
  }
  return true;
}
