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

type EffectiveUnitInput = MilitaryUnit | EffectiveUnit;

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
    attackingArmy: context.attackingArmy ?? [],
    defendingArmy: context.defendingArmy ?? [],
    ruleState: context.ruleState ?? DEFAULT_RULE_STATE,
  };
};

const isEffectiveUnit = (unit: EffectiveUnitInput): unit is EffectiveUnit =>
  unit && 'stats' in unit;

export const getEffectiveUnit = (
  unit: EffectiveUnitInput,
  context: RuleContextInput = {},
): EffectiveUnit => {
  if (isEffectiveUnit(unit)) {
    return unit;
  }

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
  units: EffectiveUnitInput[],
  context: RuleContextInput = {},
): EffectiveUnit[] => {
  return units.map((unit) => getEffectiveUnit(unit, context));
};

export const getEffectiveStats = (
  unit: EffectiveUnitInput,
  context: RuleContextInput = {},
): BaseUnitProfile => {
  return getEffectiveUnit(unit, context).stats;
};

export const getCombatProfiles = (
  unit: EffectiveUnitInput,
  context: RuleContextInput = {},
): CombatProfile[] => {
  return getEffectiveUnit(unit, context).combatProfiles.filter((profile) => {
    const matchesRole = context.role === undefined || profile.role === context.role;
    const matchesPhase = context.phase === undefined || profile.phases.includes(context.phase);
    return matchesRole && matchesPhase;
  });
};

export const getPrimaryCombatProfile = (
  unit: EffectiveUnitInput,
  role: CombatRole,
  context: RuleContextInput = {},
): CombatProfile | undefined => {
  return getCombatProfiles(unit, { ...context, role })[0];
};

export const getCombatTarget = (
  unit: EffectiveUnitInput,
  role: CombatRole,
  context: RuleContextInput = {},
): number => {
  return getPrimaryCombatProfile(unit, role, context)?.target ?? 0;
};

export const getDefaultCombatTarget = (unit: EffectiveUnitInput, role: CombatRole): number => {
  return getCombatTarget(unit, role);
};

export const getHitPoints = (unit: EffectiveUnitInput, context: RuleContextInput = {}): number => {
  return isEffectiveUnit(unit) ? unit.stats.hitPoints : getEffectiveStats(unit, context).hitPoints;
};

export const canParticipateInCombatPhase = (
  unit: EffectiveUnitInput,
  phase: CombatPhase,
  role: CombatRole,
  context: RuleContextInput = {},
): boolean => {
  return getCombatProfiles(unit, { ...context, phase, role }).some((profile) => profile.target > 0);
};
