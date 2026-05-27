import { Selector } from '@ngxs/store';
import { SettingsState, SettingsStateModel } from './settings-state';

export class SettingsSelectors {
  @Selector([SettingsState])
  static rules(state: SettingsStateModel) {
    return state.rules;
  }
}
