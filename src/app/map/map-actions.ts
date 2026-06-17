import { MilitaryUnit } from '@ww2/shared/military-unit';
import { EffectiveMapUnit } from './effective-map-unit';
import { MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { TerritoryName } from '../territories/territory-names';
import { Coordinate } from 'ol/coordinate';

export namespace MapActions {
  const ACTION_SOURCE = '[Map]';

  export class SelectSquad {
    static readonly type = `${ACTION_SOURCE} Select Squad`;

    constructor(public squad: MilitaryUnitSquad<MilitaryUnit | EffectiveMapUnit>) {}
  }

  export class PlanSquadMovementStep {
    static readonly type = `${ACTION_SOURCE} Plan Squad Movement Step`;

    constructor(
      public territoryName: TerritoryName,
      public coordinate: Coordinate,
    ) {}
  }

  export class UndoSquadMovementStep {
    static readonly type = `${ACTION_SOURCE} Undo Squad Movement Step`;
  }

  export class ClearSelectedSquadMovementPlan {
    static readonly type = `${ACTION_SOURCE} Clear Selected Squad Movement Plan`;
  }

  export class ClearAllMovementPlans {
    static readonly type = ACTION_SOURCE + ' Clear All Movement Plans';
  }

  export class SetSquadLayoutCoordinates {
    static readonly type = ACTION_SOURCE + ' Set Squad Layout Coordinates';

    constructor(public coordinatesBySquadId: Record<string, Coordinate>) {}
  }

  export class RecalculateSquadLayoutCoordinates {
    static readonly type = ACTION_SOURCE + ' Recalculate Squad Layout Coordinates';
  }
}
