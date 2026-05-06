import { CombatPhase } from '@ww2/combat/combat-phase';
import type { CombatRole } from '@ww2/combat/combat.actions';
import { MilitaryUnit } from './military-unit';
import { Nationality } from './nationality';
import { BaseUnitProfile, UNIT_PROFILES } from './unit-profile';
import { UnitType } from './unit-type';

export type CombatProfileId = 'standard-combat';
export type CombatProfileKind = 'standard-combat' | 'special-attack';
export type TargetKind = 'unit' | 'air-unit' | 'sea-unit' | 'land-unit' | 'factory';
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
  ruleState: RuleState;
}

export type RuleContextInput = Partial<RuleContext>;

export interface UnitRule {
  id: string;
  modify?: (effectiveUnit: EffectiveUnit, context: RuleContext) => EffectiveUnit;
}

export const UNIT_RULES: UnitRule[] = [];

const buildStandardCombatProfiles = (stats: BaseUnitProfile): CombatProfile[] => {
  const phases = stats.openingFire
    ? [CombatPhase.OPENING_FIRE, CombatPhase.COMBAT]
    : [CombatPhase.COMBAT];

  const profiles: CombatProfile[] = [];
  if (stats.attack > 0) {
    profiles.push({
      id: 'standard-combat',
      kind: 'standard-combat',
      role: 'attack',
      phases,
      target: stats.attack,
      shotsPerRound: 1,
      targetKind: 'unit',
      damage: { type: 'unit-hit' },
    });
  }

  if (stats.defense > 0) {
    profiles.push({
      id: 'standard-combat',
      kind: 'standard-combat',
      role: 'defend',
      phases,
      target: stats.defense,
      shotsPerRound: 1,
      targetKind: 'unit',
      damage: { type: 'unit-hit' },
    });
  }

  return profiles;
};

export const getEffectiveUnit = (
  unit: MilitaryUnit,
  context: RuleContextInput = {},
): EffectiveUnit => {
  const resolvedContext = resolveRuleContext(context);
  const baseStats = { ...UNIT_PROFILES[unit.type] };
  const baseEffectiveUnit: EffectiveUnit = {
    unit,
    id: unit.id,
    type: unit.type,
    nationality: unit.nationality,
    stats: baseStats,
    combatProfiles: buildStandardCombatProfiles(baseStats),
  };

  return UNIT_RULES.reduce(
    (effectiveUnit, rule) => rule.modify?.(effectiveUnit, resolvedContext) ?? effectiveUnit,
    baseEffectiveUnit,
  );
};

export const getEffectiveArmy = (
  units: MilitaryUnit[],
  context: RuleContextInput = {},
): EffectiveUnit[] => {
  return units.map((unit) => getEffectiveUnit(unit, context));
};

export const getEffectiveStats = (
  unit: MilitaryUnit,
  context: RuleContextInput = {},
): BaseUnitProfile => {
  return getEffectiveUnit(unit, context).stats;
};

export const getCombatProfiles = (
  unit: MilitaryUnit,
  context: RuleContextInput = {},
): CombatProfile[] => {
  return getEffectiveUnit(unit, context).combatProfiles.filter((profile) => {
    const matchesRole = context.role === undefined || profile.role === context.role;
    const matchesPhase = context.phase === undefined || profile.phases.includes(context.phase);
    return matchesRole && matchesPhase;
  });
};

export const getPrimaryCombatProfile = (
  unit: MilitaryUnit,
  role: CombatRole,
  context: RuleContextInput = {},
): CombatProfile | undefined => {
  return getCombatProfiles(unit, { ...context, role })[0];
};

export const getCombatTarget = (
  unit: MilitaryUnit,
  role: CombatRole,
  context: RuleContextInput = {},
): number => {
  return getPrimaryCombatProfile(unit, role, context)?.target ?? 0;
};

export const getDefaultCombatTarget = (unit: MilitaryUnit, role: CombatRole): number => {
  return getCombatTarget(unit, role);
};

export const getHitPoints = (unit: MilitaryUnit, context: RuleContextInput = {}): number => {
  return getEffectiveStats(unit, context).hitPoints;
};

export const canParticipateInCombatPhase = (
  unit: MilitaryUnit,
  phase: CombatPhase,
  role: CombatRole,
  context: RuleContextInput = {},
): boolean => {
  return getCombatProfiles(unit, { ...context, phase, role }).some((profile) => profile.target > 0);
};

export const canUseCombatProfile = (
  unit: MilitaryUnit,
  profileId: CombatProfileId,
  context: RuleContextInput,
): boolean => {
  return getCombatProfiles(unit, context).some((profile) => profile.id === profileId);
};

const resolveRuleContext = (context: RuleContextInput): RuleContext => {
  return {
    ...context,
    ruleState: context.ruleState ?? DEFAULT_RULE_STATE,
  };
};
