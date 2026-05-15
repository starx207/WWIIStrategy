import { DEFAULT_RULE_STATE } from '@ww2/shared/effective-unit';
import { CombatStateModel } from './combat-state';
import { RuleContext, RuleContextInput } from './rule-context';

type RuleContextCombatStateInput = Pick<
  CombatStateModel,
  'attackingArmy' | 'defendingArmy' | 'currentPhase'
>;

export const createResolvedRuleContext = (
  state: RuleContextCombatStateInput,
  ruleContext?: RuleContextInput,
): RuleContext => {
  return {
    phase: ruleContext?.phase ?? state.currentPhase,
    ...ruleContext,
    attackingArmy: state.attackingArmy,
    defendingArmy: state.defendingArmy,
    ruleState: ruleContext?.ruleState ?? DEFAULT_RULE_STATE,
  };
};
