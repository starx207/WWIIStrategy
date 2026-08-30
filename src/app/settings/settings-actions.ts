import { Nationality } from '@ww2/shared/nationality';
import { NationalAdvantageId, NationalAdvantageState, TechnologyId } from './settings-state';

export namespace SettingsActions {
  const ACTION_SOURCE = '[Settings]';

  export class SetNationalAdvantageState {
    static readonly type = `${ACTION_SOURCE} Set National Advantage State`;

    constructor(
      public advantageId: NationalAdvantageId,
      public state: NationalAdvantageState,
    ) {}
  }

  /** Permanently grant a technology to a nation (successful weapons-development roll). */
  export class GrantTechnology {
    static readonly type = `${ACTION_SOURCE} Grant Technology`;

    constructor(
      public nationality: Nationality,
      public technologyId: TechnologyId,
    ) {}
  }
}
