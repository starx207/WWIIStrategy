import { EffectiveMapUnit } from '../effective-map-unit';
import { RuleContext } from '../rule-context';

export type UnitRuleModifier = (
  effectiveUnit: EffectiveMapUnit,
  context: RuleContext,
) => EffectiveMapUnit;

export interface UnitRule {
  id: string;
  modify?: UnitRuleModifier;
}
