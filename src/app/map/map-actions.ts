import { MilitaryUnit } from '@ww2/shared/military-unit';
import { EffectiveMapUnit } from './effective-map-unit';
import { MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';

export namespace MapActions {
  const ACTION_SOURCE = '[Map]';

  export class SelectSquad {
    static readonly type = `${ACTION_SOURCE} Select Squad`;

    constructor(public squad: MilitaryUnitSquad<MilitaryUnit | EffectiveMapUnit>) {}
  }
}
