import { RuleState } from '@ww2/settings/settings-state';
import { CombatStateModel } from './combat-state';
import { RuleContext, RuleContextInput } from './rule-context';

type RuleContextCombatStateInput = Pick<
  CombatStateModel,
  'attackingArmy' | 'defendingArmy' | 'currentPhase'
>;

type RuleContextSettingsStateInput = RuleState;

export const createResolvedRuleContext = (
  state: RuleContextCombatStateInput,
  rules: RuleContextSettingsStateInput,
  ruleContext?: RuleContextInput,
): RuleContext => {
  return {
    phase: ruleContext?.phase ?? state.currentPhase,
    ...ruleContext,
    attackingArmy: state.attackingArmy,
    defendingArmy: state.defendingArmy,
    ruleState: ruleContext?.ruleState ?? rules,
  };
};
