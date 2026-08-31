import { MilitaryUnit } from '@ww2/shared/military-unit';
import { EffectiveMapUnit } from './effective-map-unit';
import { MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { LandTerritoryName, TerritoryName } from '../territories/territory-names';
import { Nationality } from '@ww2/shared/nationality';
import { Coordinate } from 'ol/coordinate';
import { MovementPhase, TurnPhase } from '@ww2/game/turn-phase';

export namespace MapActions {
  const ACTION_SOURCE = '[Map]';

  export class SelectSquad {
    static readonly type = `${ACTION_SOURCE} Select Squad`;

    constructor(
      public squad: MilitaryUnitSquad<MilitaryUnit | EffectiveMapUnit>,
      public phase: MovementPhase,
    ) {}
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

  export class SetAircraftCombatNode {
    static readonly type = `${ACTION_SOURCE} Set Aircraft Combat Node`;

    constructor(
      public squadId: string,
      public stepIndex: number,
    ) {}
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

  /** Add a mobilized (newly-placed) unit to a territory. */
  export class MobilizeUnit {
    static readonly type = ACTION_SOURCE + ' Mobilize Unit';

    constructor(
      public territoryName: TerritoryName,
      public unit: MilitaryUnit,
    ) {}
  }

  /**
   * Execute all movement plans for a phase: relocate each squad's units from its origin to the
   * final step of its path, then discard those plans. Used for non-combat movement (and, after
   * combat, for advancing survivors — see the combat orchestrator).
   */
  export class ApplyMovementPlans {
    static readonly type = ACTION_SOURCE + ' Apply Movement Plans';

    constructor(public phase: TurnPhase) {}
  }

  /** Replace the full set of units occupying a territory (used to apply battle casualties). */
  export class SetTerritoryUnits {
    static readonly type = ACTION_SOURCE + ' Set Territory Units';

    constructor(
      public territoryName: TerritoryName,
      public units: MilitaryUnit[],
    ) {}
  }

  /** Append units to a territory (e.g. surviving attackers retreating back to their origin). */
  export class AddUnitsToTerritory {
    static readonly type = ACTION_SOURCE + ' Add Units To Territory';

    constructor(
      public territoryName: TerritoryName,
      public units: MilitaryUnit[],
    ) {}
  }

  /**
   * Record that a land territory was captured. The transfer is applied at end of turn
   * (ApplyPendingCaptures), not immediately, so aircraft can't treat it as a friendly airfield yet.
   */
  export class RecordTerritoryCapture {
    static readonly type = ACTION_SOURCE + ' Record Territory Capture';

    constructor(
      public territoryName: LandTerritoryName,
      public nationality: Nationality,
    ) {}
  }

  /** Transfer all pending captures into the control map and clear them (end of turn). */
  export class ApplyPendingCaptures {
    static readonly type = ACTION_SOURCE + ' Apply Pending Captures';
  }

  /** Remove all movement plans whose destination is the given territory (after a battle resolves). */
  export class RemoveMovementPlansForDestination {
    static readonly type = ACTION_SOURCE + ' Remove Movement Plans For Destination';

    constructor(public territoryName: TerritoryName) {}
  }

  /** Remove specific movement plans by squad id (the plans that fed a resolved battle). */
  export class RemoveMovementPlans {
    static readonly type = ACTION_SOURCE + ' Remove Movement Plans';

    constructor(public squadIds: string[]) {}
  }

  /**
   * Resolve combat moves that need no battle: occupy + capture undefended enemy territories and
   * record blitz pass-through captures for the given nation. Consumes the resolved combat-move plans.
   */
  export class ResolveAutomaticCaptures {
    static readonly type = ACTION_SOURCE + ' Resolve Automatic Captures';

    constructor(public nationality: Nationality) {}
  }

  /** Load land units from a coast onto a transport in an adjacent sea zone. */
  export class LoadCargo {
    static readonly type = ACTION_SOURCE + ' Load Cargo';

    constructor(
      public transportId: string,
      public unitIds: string[],
      public fromTerritory: TerritoryName,
    ) {}
  }

  /**
   * Unload a transport's cargo onto an adjacent land territory. A friendly target is occupied
   * immediately; a hostile target stages an amphibious assault resolved during Conduct Combat.
   */
  export class UnloadCargo {
    static readonly type = ACTION_SOURCE + ' Unload Cargo';

    constructor(
      public transportId: string,
      public targetTerritory: LandTerritoryName,
    ) {}
  }

  /** Clear the staged amphibious assault for a territory once its battle has resolved. */
  export class ClearAmphibiousAssault {
    static readonly type = ACTION_SOURCE + ' Clear Amphibious Assault';

    constructor(public territoryName: LandTerritoryName) {}
  }
}
