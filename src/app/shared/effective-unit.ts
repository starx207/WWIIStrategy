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

export type TechnologyId = 'jet-fighters' | 'heavy-bombers' | 'super-submarines';
export type NationalAdvantageState = 'enabled' | 'disabled' | 'active' | 'expired';

export interface RuleState {
  technologiesByNationality: Partial<Record<Nationality, TechnologyId[]>>;
  nationalAdvantages: {
    [Nationality.SOVIET_UNION]: {
      russianWinter: NationalAdvantageState;
    };
    [Nationality.GERMANY]: {
      wolfPacks: NationalAdvantageState;
    };
    [Nationality.UNITED_STATES]: {
      superfortresses: NationalAdvantageState;
    };
  };
}

export const DEFAULT_RULE_STATE: RuleState = {
  technologiesByNationality: {},
  nationalAdvantages: {
    [Nationality.SOVIET_UNION]: {
      russianWinter: 'active',
    },
    [Nationality.GERMANY]: {
      wolfPacks: 'enabled',
    },
    [Nationality.UNITED_STATES]: {
      superfortresses: 'enabled',
    },
  },
};
