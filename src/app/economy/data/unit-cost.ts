import { UnitType } from '@ww2/shared/unit-type';

/**
 * IPC purchase cost per unit type, from the Axis & Allies Revised (2004) rulebook cost chart
 * (Appendix / Phase 2: Purchase Units). Costs are the same for every power.
 */
export const UNIT_COST_BY_TYPE: Record<UnitType, number> = {
  [UnitType.INFANTRY]: 3,
  [UnitType.ARTILLERY]: 4,
  [UnitType.TANK]: 5,
  [UnitType.ANTI_AIR_GUN]: 5,
  [UnitType.FACTORY]: 15, // industrial complex
  [UnitType.FIGHTER_JET]: 10,
  [UnitType.BOMBER]: 15,
  [UnitType.TRANSPORT]: 8,
  [UnitType.DESTROYER]: 12,
  [UnitType.SUBMARINE]: 8,
  [UnitType.BATTLESHIP]: 24,
  [UnitType.AIRCRAFT_CARRIER]: 16,
};
