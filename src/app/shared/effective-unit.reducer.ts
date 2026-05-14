import { CasualtyPhase, CombatPhase } from '@ww2/combat/combat-phase';
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
import { isEffectiveUnit } from './utility';
import { UnitType } from './unit-type';

type EffectiveUnitInput = MilitaryUnit | EffectiveUnit;

const isInputOnly = (context?: RuleContext | RuleContextInput): context is RuleContextInput =>
  context !== undefined && !('ruleState' in context);

const buildStandardCombatProfiles = (stats: BaseUnitProfile): CombatProfile[] => {
  const phases =
    stats.openingFire === 'exclusive'
      ? [CombatPhase.OPENING_FIRE]
      : stats.openingFire === true
        ? [CombatPhase.OPENING_FIRE, CombatPhase.COMBAT]
        : [CombatPhase.COMBAT];
  const casualtyClearPhases: CasualtyPhase[] = [
    CombatPhase.OPENING_FIRE_CASUALTIES,
    CombatPhase.COMBAT_CASUALTIES,
  ];

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
      casualtyClearPhases,
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
      casualtyClearPhases,
      damage: { type: 'unit-hit' },
    });
  }

  return profiles;
};

const resolveRuleContext = (context?: RuleContext, extra?: RuleContextInput): RuleContext => {
  return {
    ...context,
    ...extra,
    attackingArmy: context?.attackingArmy ?? [],
    defendingArmy: context?.defendingArmy ?? [],
    ruleState: context?.ruleState ?? DEFAULT_RULE_STATE,
  };
};

const applyTechnologyEffects = (
  effectiveUnit: EffectiveUnit,
  context: RuleContext,
): EffectiveUnit => {
  const unitTechnologies =
    context.ruleState.technologiesByNationality?.[effectiveUnit.nationality] ?? [];
  if (unitTechnologies.length === 0) {
    return effectiveUnit;
  }

  if (unitTechnologies.includes('jet-fighters') && effectiveUnit.type === UnitType.FIGHTER_JET) {
    const defenseProfile = effectiveUnit.combatProfiles.find(
      (p) => p.role === 'defend' && p.id === 'standard-combat',
    );
    if (defenseProfile) {
      defenseProfile.target = 5;
    }
  }

  if (unitTechnologies.includes('heavy-bombers') && effectiveUnit.type === UnitType.BOMBER) {
    // All attack profiles get +1 shot per round, not just standard combat.
    const attackProfiles = effectiveUnit.combatProfiles.filter((p) => p.role === 'attack');
    attackProfiles.forEach((profile) => {
      profile.shotsPerRound = 2;
    });
  }

  if (unitTechnologies.includes('super-submarines') && effectiveUnit.type === UnitType.SUBMARINE) {
    const attackProfile = effectiveUnit.combatProfiles.find(
      (p) => p.role === 'attack' && p.id === 'standard-combat',
    );
    if (attackProfile) {
      attackProfile.target = 3;
    }
  }

  return effectiveUnit;
};

const getEffectiveUnit = (unit: EffectiveUnitInput, context?: RuleContext): EffectiveUnit => {
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

  const effectiveUnitWithUnitRules = UNIT_RULES.reduce(
    (effectiveUnit, rule) => rule.modify?.(effectiveUnit, resolvedContext) ?? effectiveUnit,
    baseEffectiveUnit,
  );

  return applyTechnologyEffects(effectiveUnitWithUnitRules, resolvedContext);
};

const getEffectiveStats = (unit: EffectiveUnitInput, context?: RuleContext): BaseUnitProfile => {
  return getEffectiveUnit(unit, context).stats;
};

const getCombatTarget = (
  unit: EffectiveUnitInput,
  role: CombatRole,
  context?: RuleContext,
): number => {
  return getPrimaryCombatProfile(unit, role, context!)?.target ?? 0;
};

export const getEffectiveArmy: {
  (units: EffectiveUnit[]): EffectiveUnit[];
  (units: MilitaryUnit[], context: RuleContext): EffectiveUnit[];
} = (units: EffectiveUnitInput[], context?: RuleContext): EffectiveUnit[] => {
  return units.map((unit) => getEffectiveUnit(unit, context));
};

export const getCombatProfiles: {
  (unit: EffectiveUnit): CombatProfile[];
  (unit: MilitaryUnit, context: RuleContext): CombatProfile[];
} = (unit: EffectiveUnitInput, context?: RuleContext): CombatProfile[] => {
  return getEffectiveUnit(unit, context).combatProfiles.filter((profile) => {
    const matchesRole = context?.role === undefined || profile.role === context.role;
    const matchesPhase = context?.phase === undefined || profile.phases.includes(context.phase);
    return matchesRole && matchesPhase;
  });
};

export const getPrimaryCombatProfile: {
  (unit: EffectiveUnit, role: CombatRole, context?: RuleContextInput): CombatProfile | undefined;
  (unit: MilitaryUnit, role: CombatRole, context: RuleContext): CombatProfile | undefined;
} = (
  unit: EffectiveUnitInput,
  role: CombatRole,
  context?: RuleContext | RuleContextInput,
): CombatProfile | undefined => {
  const fullContext = isInputOnly(context) ? undefined : context;
  const inputContext = isInputOnly(context) ? context : undefined;
  return getCombatProfiles(
    unit,
    resolveRuleContext(fullContext, {
      ...inputContext,
      role,
    }),
  )[0];
};

export const getDefaultCombatTarget: {
  (unit: EffectiveUnit, role: CombatRole): number;
  (unit: MilitaryUnit, role: CombatRole, context: RuleContext): number;
} = (unit: EffectiveUnitInput, role: CombatRole, context?: RuleContext): number => {
  return getCombatTarget(unit, role, context);
};

export const getHitPoints: {
  (unit: EffectiveUnit): number;
  (unit: MilitaryUnit, context: RuleContext): number;
} = (unit: EffectiveUnitInput, context?: RuleContext): number => {
  return isEffectiveUnit(unit) ? unit.stats.hitPoints : getEffectiveStats(unit, context).hitPoints;
};

export const canParticipateInCombatPhase: {
  (unit: EffectiveUnit, phase: CombatPhase, role: CombatRole): boolean;
  (unit: MilitaryUnit, phase: CombatPhase, role: CombatRole, context: RuleContext): boolean;
} = (
  unit: EffectiveUnitInput,
  phase: CombatPhase,
  role: CombatRole,
  context?: RuleContext,
): boolean => {
  return getCombatProfiles(unit, resolveRuleContext(context, { phase, role })).some(
    (profile) => profile.target > 0,
  );
};
