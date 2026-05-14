import { CasualtyPhase, CombatPhase } from '@ww2/combat/combat-phase';
import type { CombatRole } from '@ww2/combat/combat.actions';
import { MilitaryUnit } from './military-unit';
import { Nationality } from './nationality';
import { BaseUnitProfile, TargetKind } from './unit-profile';
import { UnitType } from './unit-type';

export type CombatProfileId = 'standard-combat';
export type CombatProfileKind = 'standard-combat' | 'special-attack';
export type IncomeLossFormula = 'full-roll' | 'half-roll-rounded-down';
export type DamageEffect =
  | { type: 'unit-hit' }
  | { type: 'income-loss'; formula: IncomeLossFormula };

export interface CombatProfile {
  id: CombatProfileId;
  kind: CombatProfileKind;
  role: CombatRole;
  phases: CombatPhase[];
  target: number;
  shotsPerRound: number;
  targetKind: TargetKind;
  casualtyClearPhases: CasualtyPhase[];
  damage: DamageEffect;
}

export interface EffectiveUnit {
  unit: MilitaryUnit;
  id: string;
  type: UnitType;
  nationality: Nationality;
  stats: BaseUnitProfile;
  combatProfiles: CombatProfile[];
}

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

export interface RuleContext {
  phase?: CombatPhase;
  role?: CombatRole;
  attackingArmy: MilitaryUnit[];
  defendingArmy: MilitaryUnit[];
  ruleState: RuleState;
}

export type RuleContextInput = Partial<Pick<RuleContext, 'phase' | 'role' | 'ruleState'>>;

export type UnitRuleModifier = (
  effectiveUnit: EffectiveUnit,
  context: RuleContext,
) => EffectiveUnit;

export interface UnitRule {
  id: string;
  modify?: UnitRuleModifier;
}
