import { Selector } from '@ngxs/store';
import { Nationality } from '@ww2/shared/nationality';
import { SettingsState, SettingsStateModel, TechnologyId } from './settings-state';

export class SettingsSelectors {
  @Selector([SettingsState])
  static rules(state: SettingsStateModel) {
    return state.rules;
  }

  @Selector([SettingsState])
  static technologiesByNationality(
    state: SettingsStateModel,
  ): Partial<Record<Nationality, TechnologyId[]>> {
    return state.rules.technologiesByNationality;
  }
}
