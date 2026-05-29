import { RuleState } from '@ww2/settings/settings-state';

export interface RuleContext {
  ruleState: RuleState;
}

export type RuleContextInput = Partial<Pick<RuleContext, 'ruleState'>>;
