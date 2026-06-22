import { RuleState } from '@ww2/settings/settings-state';
import { RuleContext, RuleContextInput } from './rule-context';
import { MapStateModel } from './map-state';
import { TurnPhase } from '@ww2/game/turn-phase';

type RuleContextMapStateInput = Pick<
  MapStateModel,
  'unitsByTerritoryName' | 'landTerritoryControllerByName'
>;

type RuleContextSettingsStateInput = RuleState;

export const createResolvedRuleContext = (
  mapState: RuleContextMapStateInput,
  turnPhase: TurnPhase,
  rules: RuleContextSettingsStateInput,
  ruleContext?: RuleContextInput,
): RuleContext => {
  return {
    ...ruleContext,
    unitsByTerritory: mapState.unitsByTerritoryName,
    landControlMap: mapState.landTerritoryControllerByName,
    turnPhase: ruleContext?.turnPhase ?? turnPhase,
    ruleState: ruleContext?.ruleState ?? rules,
  };
};
