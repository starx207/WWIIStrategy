export enum UnitType {
  Infantry = 'soldier',
  Artillery = 'artillery',
  Tank = 'tank',
  AntiAirGun = 'anti-air-gun',
  Factory = 'factory',
  FighterJet = 'jet',
  Bomber = 'bomber',
  Transport = 'transport',
  Destroyer = 'destroyer',
  Submarine = 'submarine',
  Battleship = 'battleship',
  AircraftCarrier = 'aircraft-carrier',
}

// Helper arrays
export const LAND_UNIT_TYPES = [UnitType.Infantry, UnitType.Artillery, UnitType.Tank];
export const AIR_UNIT_TYPES = [UnitType.FighterJet, UnitType.Bomber];
export const SEA_UNIT_TYPES = [
  UnitType.Transport,
  UnitType.Destroyer,
  UnitType.Submarine,
  UnitType.Battleship,
  UnitType.AircraftCarrier,
];
export const NEUTRAL_UNIT_TYPES = [UnitType.AntiAirGun, UnitType.Factory];
export const UNIT_TYPES = Object.values(UnitType);
