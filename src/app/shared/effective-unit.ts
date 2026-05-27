import { MilitaryUnit } from './military-unit';
import { Nationality } from './nationality';
import { BaseUnitProfile } from './unit-profile';
import { UnitType } from './unit-type';

export interface EffectiveUnit {
  unit: MilitaryUnit;
  id: string;
  type: UnitType;
  nationality: Nationality;
  stats: BaseUnitProfile;
}

export const isEffectiveUnit = (unit: EffectiveUnit | MilitaryUnit): unit is EffectiveUnit =>
  unit && 'stats' in unit;
