import { MovementPhase, TurnPhase } from '@ww2/game/turn-phase';
import { BaseUnitProfile, UNIT_PROFILES } from '@ww2/shared/unit-profile';
import { EffectiveMapUnit, isEffectiveMapUnit, MovementProfile } from './effective-map-unit';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { RuleContext, RuleContextInput } from './rule-context';
import { UNIT_RULES } from './rules/unit-rule.definitions';
import { DEFAULT_RULE_STATE } from '@ww2/settings/settings-state';

type EffectiveMapUnitInput = MilitaryUnit | EffectiveMapUnit;

// TODO: Not sure yet what will be in the full context and not the input.
//       Will need to update this as the context is built out.
const isInputOnly = (context?: RuleContext | RuleContextInput): context is RuleContextInput =>
  context !== undefined && !('TODO' in context);

const buildStandardMovementProfile = (stats: BaseUnitProfile): MovementProfile[] => {
  const phases: MovementPhase[] = stats.movementPhaseRestriction
    ? [stats.movementPhaseRestriction]
    : [TurnPhase.COMBAT_MOVEMENT, TurnPhase.NON_COMBAT_MOVEMENT];

  const profiles: MovementProfile[] = [];
  if (stats.movement > 0) {
    profiles.push({
      id: 'standard-movement',
      kind: 'standard-movement',
      maxMovement: stats.movement,
      movementPhases: phases,
    });
  }

  return profiles;
};

export const resolveRuleContext = (
  context?: RuleContext,
  extra?: RuleContextInput,
): RuleContext => {
  return {
    ...context,
    ...extra,
    ruleState: extra?.ruleState ?? context?.ruleState ?? DEFAULT_RULE_STATE,
  };
};

const applyTechnologyEffects = (
  effectiveUnit: EffectiveMapUnit,
  context: RuleContext,
): EffectiveMapUnit => {
  const unitTechnologies =
    context.ruleState.technologiesByNationality?.[effectiveUnit.nationality] ?? [];
  if (unitTechnologies.length === 0) {
    return effectiveUnit;
  }

  // TODO: Implement movement-based technology effects

  return effectiveUnit;
};

const applyNationalAdvantages = (
  effectiveUnit: EffectiveMapUnit,
  context: RuleContext,
): EffectiveMapUnit => {
  // TODO: Implement movement-based national advantages

  return effectiveUnit;
};

const getEffectiveUnit = (unit: EffectiveMapUnitInput, context?: RuleContext): EffectiveMapUnit => {
  if (isEffectiveMapUnit(unit)) {
    return unit;
  }

  const resolvedContext = resolveRuleContext(context);
  const baseStats = { ...UNIT_PROFILES[unit.type] };
  const baseEffectiveUnit: EffectiveMapUnit = {
    unit,
    id: unit.id,
    type: unit.type,
    nationality: unit.nationality,
    stats: baseStats,
    movementProfiles: buildStandardMovementProfile(baseStats),
  };

  const effecitveUnitWithRules = UNIT_RULES.reduce(
    (effectiveUnit, rule) => rule.modify?.(effectiveUnit, resolvedContext) ?? effectiveUnit,
    baseEffectiveUnit,
  );

  const techAdvancedUnit = applyTechnologyEffects(effecitveUnitWithRules, resolvedContext);

  return applyNationalAdvantages(techAdvancedUnit, resolvedContext);
};

export const getMovementProfiles: {
  (unit: EffectiveMapUnit): MovementProfile[];
  (unit: MilitaryUnit, context: RuleContext): MovementProfile[];
} = (unit: EffectiveMapUnitInput, context?: RuleContext) => {
  return getEffectiveUnit(unit, context).movementProfiles;
};

export const getPrimaryMovementProfile: {
  (unit: EffectiveMapUnit, context?: RuleContextInput): MovementProfile | undefined;
  (unit: MilitaryUnit, context: RuleContext): MovementProfile | undefined;
} = (
  unit: EffectiveMapUnitInput,
  context?: RuleContext | RuleContextInput,
): MovementProfile | undefined => {
  const fullContext = isInputOnly(context) ? undefined : context;
  const inputContext = isInputOnly(context) ? context : undefined;
  return getMovementProfiles(unit, resolveRuleContext(fullContext, inputContext))[0];
};

export const getMaxMovement: {
  (unit: EffectiveMapUnit): number;
  (unit: MilitaryUnit, context: RuleContext): number;
} = (unit: EffectiveMapUnitInput, context?: RuleContext) => {
  return getPrimaryMovementProfile(unit, context!)?.maxMovement ?? 0;
};
