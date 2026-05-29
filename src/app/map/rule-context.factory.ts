import { RuleState } from '@ww2/settings/settings-state';
import { RuleContext, RuleContextInput } from './rule-context';
import { MapStateModel } from './map-state';

// TODO: Not sure yet what the inputs should be
type RuleContextMapStateInput = Pick<MapStateModel, 'unitsByTerritoryName'>;

type RuleContextSettingsStateInput = RuleState;

export const createResolvedRuleContext = (
  state: RuleContextMapStateInput,
  rules: RuleContextSettingsStateInput,
  ruleContext?: RuleContextInput,
): RuleContext => {
  return {
    ...ruleContext,
    ruleState: ruleContext?.ruleState ?? rules,
  };
};
