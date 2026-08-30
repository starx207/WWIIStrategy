import { UnitType } from './unit-type';

/** Display names for each unit type. */
export const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  [UnitType.INFANTRY]: 'Infantry',
  [UnitType.ARTILLERY]: 'Artillery',
  [UnitType.TANK]: 'Tank',
  [UnitType.ANTI_AIR_GUN]: 'AA Gun',
  [UnitType.FACTORY]: 'Industrial Complex',
  [UnitType.FIGHTER_JET]: 'Fighter',
  [UnitType.BOMBER]: 'Bomber',
  [UnitType.TRANSPORT]: 'Transport',
  [UnitType.DESTROYER]: 'Destroyer',
  [UnitType.SUBMARINE]: 'Submarine',
  [UnitType.BATTLESHIP]: 'Battleship',
  [UnitType.AIRCRAFT_CARRIER]: 'Aircraft Carrier',
};

/** Unit types a player can purchase, in a sensible store display order. */
export const PURCHASABLE_UNIT_TYPES: UnitType[] = [
  UnitType.INFANTRY,
  UnitType.ARTILLERY,
  UnitType.TANK,
  UnitType.ANTI_AIR_GUN,
  UnitType.FIGHTER_JET,
  UnitType.BOMBER,
  UnitType.TRANSPORT,
  UnitType.SUBMARINE,
  UnitType.DESTROYER,
  UnitType.AIRCRAFT_CARRIER,
  UnitType.BATTLESHIP,
  UnitType.FACTORY,
];
