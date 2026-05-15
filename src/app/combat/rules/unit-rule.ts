import { EffectiveCombatUnit } from '../effective-combat-unit';
import { RuleContext } from '../rule-context';

export type UnitRuleModifier = (
  effectiveUnit: EffectiveCombatUnit,
  context: RuleContext,
) => EffectiveCombatUnit;

export interface UnitRule {
  id: string;
  modify?: UnitRuleModifier;
}
