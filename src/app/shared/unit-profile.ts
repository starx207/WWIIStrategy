import { UnitType } from './unit-type';

export type TargetKind = 'unit' | 'air-unit' | 'sea-unit' | 'factory';

export interface BaseUnitProfile {
  attack: number;
  defense: number;
  hitPoints: number;
  openingFire: boolean;
  targetKind?: TargetKind;
}

export const UNIT_PROFILES: Record<UnitType, BaseUnitProfile> = {
  [UnitType.INFANTRY]: {
    attack: 1,
    defense: 2,
    hitPoints: 1,
    openingFire: false,
  },
  [UnitType.ARTILLERY]: {
    attack: 2,
    defense: 2,
    hitPoints: 1,
    openingFire: false,
  },
  [UnitType.TANK]: {
    attack: 3,
    defense: 3,
    hitPoints: 1,
    openingFire: false,
  },
  [UnitType.ANTI_AIR_GUN]: {
    attack: 0,
    defense: 1,
    hitPoints: 1,
    openingFire: true,
    targetKind: 'air-unit',
  },
  [UnitType.FACTORY]: {
    attack: 0,
    defense: 0,
    hitPoints: 1,
    openingFire: false,
  },
  [UnitType.FIGHTER_JET]: {
    attack: 3,
    defense: 4,
    hitPoints: 1,
    openingFire: false,
  },
  [UnitType.BOMBER]: {
    attack: 4,
    defense: 1,
    hitPoints: 1,
    openingFire: false,
  },
  [UnitType.TRANSPORT]: {
    attack: 0,
    defense: 1,
    hitPoints: 1,
    openingFire: false,
  },
  [UnitType.DESTROYER]: {
    attack: 3,
    defense: 3,
    hitPoints: 1,
    openingFire: false,
  },
  [UnitType.SUBMARINE]: {
    attack: 2,
    defense: 2,
    hitPoints: 1,
    openingFire: true,
    targetKind: 'sea-unit',
  },
  [UnitType.BATTLESHIP]: {
    attack: 4,
    defense: 4,
    hitPoints: 2,
    openingFire: false,
  },
  [UnitType.AIRCRAFT_CARRIER]: {
    attack: 1,
    defense: 3,
    hitPoints: 1,
    openingFire: false,
  },
};
