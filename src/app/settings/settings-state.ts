import { Injectable } from '@angular/core';
import { Action, State, StateContext } from '@ngxs/store';
import { Nationality } from '@ww2/shared/nationality';
import { SettingsActions } from './settings-actions';
import { patch } from '@ngxs/store/operators';

export type TechnologyId = 'jet-fighters' | 'heavy-bombers' | 'super-submarines';
export type NationalAdvantageState = 'enabled' | 'disabled' | 'active' | 'expired';
export type NationalAdvantageId = 'russianWinter' | 'wolfPacks' | 'superfortresses';

export interface NationalAdvantage {
  id: NationalAdvantageId;
  nationality: Nationality;
  state: NationalAdvantageState;
}

export interface RuleState {
  technologiesByNationality: Partial<Record<Nationality, TechnologyId[]>>;
  nationalAdvantages: NationalAdvantage[];
}

export interface SettingsStateModel {
  rules: RuleState;
}

export const DEFAULT_RULE_STATE: RuleState = {
  technologiesByNationality: {},
  nationalAdvantages: [
    {
      id: 'russianWinter',
      nationality: Nationality.SOVIET_UNION,
      state: 'active',
    },
    {
      id: 'wolfPacks',
      nationality: Nationality.GERMANY,
      state: 'enabled',
    },
    {
      id: 'superfortresses',
      nationality: Nationality.UNITED_STATES,
      state: 'enabled',
    },
  ],
};

const DEFAULT_SETTINGS_STATE: SettingsStateModel = {
  rules: DEFAULT_RULE_STATE,
};

type SettingsStateContext = StateContext<SettingsStateModel>;

@State<SettingsStateModel>({
  name: 'settings',
  defaults: DEFAULT_SETTINGS_STATE,
})
@Injectable()
export class SettingsState {
  @Action(SettingsActions.SetNationalAdvantageState)
  activateAdvantage(ctx: SettingsStateContext, action: SettingsActions.SetNationalAdvantageState) {
    const current = ctx.getState().rules.nationalAdvantages;
    for (const advantage of current) {
      if (advantage.id === action.advantageId) {
        advantage.state = action.state;
        break;
      }
    }

    ctx.setState(
      patch<SettingsStateModel>({
        rules: patch<RuleState>({
          nationalAdvantages: [...current],
        }),
      }),
    );
  }
}
