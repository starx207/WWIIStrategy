import { CombatStateModel } from './combat-state';
import { RuleContext, RuleContextInput } from './rule-context';

type RuleContextCombatStateInput = Pick<
  CombatStateModel,
  'attackingArmy' | 'defendingArmy' | 'currentPhase' | 'ruleState'
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
    ruleState: ruleContext?.ruleState ?? state.ruleState,
  };
};
