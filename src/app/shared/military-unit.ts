import { Nationality } from './nationality';
import { UnitType } from './unit-type';

export interface MilitaryUnit {
  type: UnitType;
  nationality: Nationality;
  attack: number;
  // canTarget: UnitType[];
  defense: number;
  // movement: number;
  hitPoints: number;
}

export interface InfantryUnit extends MilitaryUnit {
  type: UnitType.INFANTRY;
  attack: 1;
  defense: 2;
  hitPoints: 1;
}

export interface ArtilleryUnit extends MilitaryUnit {
  type: UnitType.ARTILLERY;
  attack: 2;
  defense: 2;
  hitPoints: 1;
}

export interface TankUnit extends MilitaryUnit {
  type: UnitType.TANK;
  attack: 3;
  defense: 3;
  hitPoints: 1;
}

export interface AntiAirUnit extends MilitaryUnit {
  type: UnitType.ANTI_AIR_GUN;
  attack: 0;
  defense: 1;
  hitPoints: 1;
}

export interface FactoryUnit extends MilitaryUnit {
  type: UnitType.FACTORY;
  attack: 0;
  defense: 0;
  hitPoints: 1;
}

export interface FighterJetUnit extends MilitaryUnit {
  type: UnitType.FIGHTER_JET;
  attack: 3;
  defense: 4;
  hitPoints: 1;
}

export interface BomberUnit extends MilitaryUnit {
  type: UnitType.BOMBER;
  attack: 4;
  defense: 1;
  hitPoints: 1;
}

export interface BattleshipUnit extends MilitaryUnit {
  type: UnitType.BATTLESHIP;
  attack: 4;
  defense: 4;
  hitPoints: 2;
}

export interface DestroyerUnit extends MilitaryUnit {
  type: UnitType.DESTROYER;
  attack: 3;
  defense: 3;
  hitPoints: 1;
}

export interface AircraftCarrierUnit extends MilitaryUnit {
  type: UnitType.AIRCRAFT_CARRIER;
  attack: 1;
  defense: 3;
  hitPoints: 1;
}

export interface TransportUnit extends MilitaryUnit {
  type: UnitType.TRANSPORT;
  attack: 0;
  defense: 1;
  hitPoints: 1;
}

export interface SubmarineUnit extends MilitaryUnit {
  type: UnitType.SUBMARINE;
  attack: 2;
  defense: 2;
  hitPoints: 1;
}
