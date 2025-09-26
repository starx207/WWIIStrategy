export enum UnitType {
  INFANTRY = 'soldier',
  ARTILLERY = 'artillery',
  TANK = 'tank',
  ANTI_AIR_GUN = 'anti-air-gun',
  FACTORY = 'factory',
  FIGHTER_JET = 'jet',
  BOMBER = 'bomber',
  TRANSPORT = 'transport',
  DESTROYER = 'destroyer',
  SUBMARINE = 'submarine',
  BATTLESHIP = 'battleship',
  AIRCRAFT_CARRIER = 'aircraft-carrier',
}

// Helper arrays
export const LAND_UNIT_TYPES = [UnitType.INFANTRY, UnitType.ARTILLERY, UnitType.TANK];
export const AIR_UNIT_TYPES = [UnitType.FIGHTER_JET, UnitType.BOMBER];
export const SEA_UNIT_TYPES = [
  UnitType.TRANSPORT,
  UnitType.DESTROYER,
  UnitType.SUBMARINE,
  UnitType.BATTLESHIP,
  UnitType.AIRCRAFT_CARRIER,
];
export const NEUTRAL_UNIT_TYPES = [UnitType.ANTI_AIR_GUN, UnitType.FACTORY];
export const UNIT_TYPES = Object.values(UnitType);
