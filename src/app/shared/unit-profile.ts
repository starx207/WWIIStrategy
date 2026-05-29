import { UnitType } from './unit-type';

export type TargetKind = 'unit' | 'air-unit' | 'aa-vulnerable-air-unit' | 'sea-unit' | 'factory';

export interface BaseUnitProfile {
  attack: number;
  defense: number;
  hitPoints: number;
  openingFire: boolean | 'exclusive';
  targetKind?: TargetKind;
  movement: number;
}

export const UNIT_PROFILES: Record<UnitType, BaseUnitProfile> = {
  [UnitType.INFANTRY]: {
    attack: 1,
    defense: 2,
    hitPoints: 1,
    openingFire: false,
    movement: 1,
  },
  [UnitType.ARTILLERY]: {
    attack: 2,
    defense: 2,
    hitPoints: 1,
    openingFire: false,
    movement: 1,
  },
  [UnitType.TANK]: {
    attack: 3,
    defense: 3,
    hitPoints: 1,
    openingFire: false,
    movement: 2,
  },
  [UnitType.ANTI_AIR_GUN]: {
    attack: 0,
    defense: 1,
    hitPoints: 1,
    openingFire: 'exclusive',
    targetKind: 'air-unit',
    movement: 1,
  },
  [UnitType.FACTORY]: {
    attack: 0,
    defense: 0,
    hitPoints: 1,
    openingFire: false,
    movement: 0,
  },
  [UnitType.FIGHTER_JET]: {
    attack: 3,
    defense: 4,
    hitPoints: 1,
    openingFire: false,
    movement: 4,
  },
  [UnitType.BOMBER]: {
    attack: 4,
    defense: 1,
    hitPoints: 1,
    openingFire: false,
    movement: 6,
  },
  [UnitType.TRANSPORT]: {
    attack: 0,
    defense: 1,
    hitPoints: 1,
    openingFire: false,
    movement: 2,
  },
  [UnitType.DESTROYER]: {
    attack: 3,
    defense: 3,
    hitPoints: 1,
    openingFire: false,
    movement: 2,
  },
  [UnitType.SUBMARINE]: {
    attack: 2,
    defense: 2,
    hitPoints: 1,
    openingFire: true,
    targetKind: 'sea-unit',
    movement: 2,
  },
  [UnitType.BATTLESHIP]: {
    attack: 4,
    defense: 4,
    hitPoints: 2,
    openingFire: false,
    movement: 2,
  },
  [UnitType.AIRCRAFT_CARRIER]: {
    attack: 1,
    defense: 3,
    hitPoints: 1,
    openingFire: false,
    movement: 2,
  },
};
