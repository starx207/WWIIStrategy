import { MilitaryUnit } from '@ww2/shared/military-unit';
import { CombatProfile, EffectiveCombatUnit, isEffectiveCombatUnit } from './effective-combat-unit';
import { RuleContext, RuleContextInput } from './rule-context';
import { BaseUnitProfile, UNIT_PROFILES } from '@ww2/shared/unit-profile';
import { CasualtyPhase, CombatPhase } from './combat-phase';
import { DEFAULT_RULE_STATE } from '@ww2/shared/effective-unit';
import { UnitType } from '@ww2/shared/unit-type';
import { Nationality } from '@ww2/shared/nationality';
import { CombatRole } from './combat.actions';
import { UNIT_RULES } from './rules/unit-rule.definitions';

type EffectiveCombatUnitInput = MilitaryUnit | EffectiveCombatUnit;

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
  effectiveUnit: EffectiveCombatUnit,
  context: RuleContext,
): EffectiveCombatUnit => {
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

const applyNationalAdvantages = (
  effectiveUnit: EffectiveCombatUnit,
  context: RuleContext,
): EffectiveCombatUnit => {
  if (effectiveUnit.nationality === Nationality.SOVIET_UNION) {
    const sovietAdvantages = context.ruleState.nationalAdvantages[Nationality.SOVIET_UNION];
    if (
      effectiveUnit.type === UnitType.INFANTRY &&
      context.role === 'defend' &&
      sovietAdvantages.russianWinter === 'active'
    ) {
      const defenseProfile = effectiveUnit.combatProfiles.find(
        (p) => p.role === 'defend' && p.id === 'standard-combat',
      );
      if (defenseProfile) {
        defenseProfile.target = 3;
      }
    }
  }

  if (effectiveUnit.nationality === Nationality.GERMANY) {
    const germanAdvantages = context.ruleState.nationalAdvantages[Nationality.GERMANY];
    if (
      effectiveUnit.type === UnitType.SUBMARINE &&
      context.role === 'attack' &&
      (germanAdvantages.wolfPacks === 'active' || germanAdvantages.wolfPacks === 'enabled')
    ) {
      const submarineCount = context.attackingArmy.filter(
        (unit) =>
          unit.type === UnitType.SUBMARINE && unit.nationality === effectiveUnit.nationality,
      ).length;
      if (submarineCount >= 3) {
        const attackProfile = effectiveUnit.combatProfiles.find(
          (p) => p.role === 'attack' && p.id === 'standard-combat',
        );
        if (attackProfile) {
          attackProfile.target += 1;
        }
      }
    }
  }

  const usAdvantages = context.ruleState.nationalAdvantages[Nationality.UNITED_STATES];
  if (
    effectiveUnit.type === UnitType.ANTI_AIR_GUN &&
    context.role === 'defend' &&
    (usAdvantages.superfortresses === 'active' || usAdvantages.superfortresses === 'enabled')
  ) {
    const usBomberCount = context.attackingArmy.filter(
      (unit) => unit.type === UnitType.BOMBER && unit.nationality === Nationality.UNITED_STATES,
    ).length;
    if (usBomberCount > 0) {
      const defenseProfile = effectiveUnit.combatProfiles.find(
        (p) => p.role === 'defend' && p.id === 'standard-combat' && p.shotsPerRound > 0,
      );
      if (defenseProfile) {
        defenseProfile.targetKind = 'aa-vulnerable-air-unit';
        defenseProfile.shotsPerRound -= usBomberCount;
        if (defenseProfile.shotsPerRound < 0) {
          defenseProfile.shotsPerRound = 0;
        }
      }
    }
  }
  return effectiveUnit;
};

const getEffectiveUnit = (
  unit: EffectiveCombatUnitInput,
  context?: RuleContext,
): EffectiveCombatUnit => {
  if (isEffectiveCombatUnit(unit)) {
    return unit;
  }

  const resolvedContext = resolveRuleContext(context);
  const baseStats = { ...UNIT_PROFILES[unit.type] };
  const baseEffectiveUnit: EffectiveCombatUnit = {
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

  const techAdvancedUnit = applyTechnologyEffects(effectiveUnitWithUnitRules, resolvedContext);

  return applyNationalAdvantages(techAdvancedUnit, resolvedContext);
};

const getEffectiveStats = (
  unit: EffectiveCombatUnitInput,
  context?: RuleContext,
): BaseUnitProfile => {
  return getEffectiveUnit(unit, context).stats;
};

const getCombatTarget = (
  unit: EffectiveCombatUnitInput,
  role: CombatRole,
  context?: RuleContext,
): number => {
  return getPrimaryCombatProfile(unit, role, context!)?.target ?? 0;
};

export const getEffectiveArmy: {
  (units: EffectiveCombatUnit[]): EffectiveCombatUnit[];
  (units: MilitaryUnit[], context: RuleContext): EffectiveCombatUnit[];
} = (units: EffectiveCombatUnitInput[], context?: RuleContext): EffectiveCombatUnit[] => {
  return units.map((unit) => getEffectiveUnit(unit, context));
};

export const getCombatProfiles: {
  (unit: EffectiveCombatUnit): CombatProfile[];
  (unit: MilitaryUnit, context: RuleContext): CombatProfile[];
} = (unit: EffectiveCombatUnitInput, context?: RuleContext): CombatProfile[] => {
  return getEffectiveUnit(unit, context).combatProfiles.filter((profile) => {
    const matchesRole = context?.role === undefined || profile.role === context.role;
    const matchesPhase = context?.phase === undefined || profile.phases.includes(context.phase);
    return matchesRole && matchesPhase;
  });
};

export const getPrimaryCombatProfile: {
  (
    unit: EffectiveCombatUnit,
    role: CombatRole,
    context?: RuleContextInput,
  ): CombatProfile | undefined;
  (unit: MilitaryUnit, role: CombatRole, context: RuleContext): CombatProfile | undefined;
} = (
  unit: EffectiveCombatUnitInput,
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
  (unit: EffectiveCombatUnit, role: CombatRole): number;
  (unit: MilitaryUnit, role: CombatRole, context: RuleContext): number;
} = (unit: EffectiveCombatUnitInput, role: CombatRole, context?: RuleContext): number => {
  return getCombatTarget(unit, role, context);
};

export const getHitPoints: {
  (unit: EffectiveCombatUnit): number;
  (unit: MilitaryUnit, context: RuleContext): number;
} = (unit: EffectiveCombatUnitInput, context?: RuleContext): number => {
  return isEffectiveCombatUnit(unit)
    ? unit.stats.hitPoints
    : getEffectiveStats(unit, context).hitPoints;
};

export const canParticipateInCombatPhase: {
  (unit: EffectiveCombatUnit, phase: CombatPhase, role: CombatRole): boolean;
  (unit: MilitaryUnit, phase: CombatPhase, role: CombatRole, context: RuleContext): boolean;
} = (
  unit: EffectiveCombatUnitInput,
  phase: CombatPhase,
  role: CombatRole,
  context?: RuleContext,
): boolean => {
  return getCombatProfiles(unit, resolveRuleContext(context, { phase, role })).some(
    (profile) => profile.target > 0,
  );
};
