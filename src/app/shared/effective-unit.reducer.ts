import { CombatPhase } from '@ww2/combat/combat-phase';
import {
  CombatProfile,
  DEFAULT_RULE_STATE,
  EffectiveUnit,
  RuleContext,
  RuleContextInput,
} from './effective-unit';
import { BaseUnitProfile, UNIT_PROFILES } from './unit-profile';
import { MilitaryUnit } from './military-unit';
import { UNIT_RULES } from './unit-rule';
import { CombatRole } from '@ww2/combat/combat.actions';

const buildStandardCombatProfiles = (stats: BaseUnitProfile): CombatProfile[] => {
  const phases =
    stats.openingFire === 'exclusive'
      ? [CombatPhase.OPENING_FIRE]
      : stats.openingFire === true
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
      targetKind: stats.targetKind ?? 'unit',
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
      targetKind: stats.targetKind ?? 'unit',
      damage: { type: 'unit-hit' },
    });
  }

  return profiles;
};

const resolveRuleContext = (context: RuleContextInput): RuleContext => {
  return {
    ...context,
    ruleState: context.ruleState ?? DEFAULT_RULE_STATE,
  };
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
