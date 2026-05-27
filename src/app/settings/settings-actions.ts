import { NationalAdvantageId, NationalAdvantageState } from './settings-state';

export namespace SettingsActions {
  const ACTION_SOURCE = '[Settings]';

  export class SetNationalAdvantageState {
    static readonly type = `${ACTION_SOURCE} Set National Advantage State`;

    constructor(
      public advantageId: NationalAdvantageId,
      public state: NationalAdvantageState,
    ) {}
  }
}
