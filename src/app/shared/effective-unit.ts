import { CombatPhase } from '@ww2/combat/combat-phase';
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

export type OptionalRuleId = never;
export type TechnologyId = never;

export interface RuleState {
  enabledOptionalRules: OptionalRuleId[];
  technologiesByNationality: Partial<Record<Nationality, TechnologyId[]>>;
}

export const DEFAULT_RULE_STATE: RuleState = {
  enabledOptionalRules: [],
  technologiesByNationality: {},
};

export interface RuleContext {
  phase?: CombatPhase;
  role?: CombatRole;
  attackingArmy: MilitaryUnit[];
  defendingArmy: MilitaryUnit[];
  ruleState: RuleState;
}

export type RuleContextInput = Partial<RuleContext>;

export type UnitRuleModifier = (
  effectiveUnit: EffectiveUnit,
  context: RuleContext,
) => EffectiveUnit;

export interface UnitRule {
  id: string;
  modify?: UnitRuleModifier;
}
