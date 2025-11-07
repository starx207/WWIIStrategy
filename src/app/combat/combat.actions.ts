import { MilitaryUnit } from '@ww2/shared/military-unit';
import { CombatPhase } from './combat-phase';

// TOOD: Determine the best place to put this so we don't have circular dependencies
export type CombatRole = 'attack' | 'defend';

/*
  The comments here are how I think(?) the flow of actions will go and what they will trigger.
  I should remove the comments once I have things working as they don't really describe the actions.
*/

export namespace CombatActions {
  const ACTION_SOURCE = '[Battle Board]';

  // ngOnInit
  export class PreparingBattlefield {
    static readonly type = `${ACTION_SOURCE} Battlefield Loading`;
  }

  /*
    Battle cycle (opening fire or regular combat)
    1. Prepare the units eligible for combat
    2. Attacking units fire until all have participated, or no defenders left with hitpoints > 0
    3. Defending units fire until all have participated, or no defenders left with hitpoints > 0

    Casualties cycle (opening fire or regular combat)
    1. Remove all attacking and defending casualties
    2. If no attackers remain, combat ends
    3. If any defenders remain, attacker must choose to press or retreat (only for regular combat)
    4. If no defenders remain, combat ends.
  */

  // Maybe press/retreat are not combat phases themselves - nothing really happens in those phases except ending combat or re-initating a new combat phase.

  /*
    opening fire       >> battle cycle
    opening casualties >> remove opening fire casualties
    combat             >> battle cycle
    casualties         >> casualty cycle
    press              >> end phase
    retreat            >> end phase
  */
  export class CombatPhaseInitiated {
    static readonly type = `${ACTION_SOURCE} Combat Phase Initiated`;

    constructor(public phase: CombatPhase) {}
  }

  // Might not need this - just initiate the next phase
  /*
    opening fire       >> Initiate opening casualties
    opening casualties >> If end of combat, raise action
                          Otherwise, start combat phase.
    combat             >> Initiate casualties
    casualties         >> If end of combat, raise action
                          Otherwise give attacker press/retreat choice and initiate appropriate phase.
    press              >> initiate combat phase
    retreat            >> raise end of combat
  */
  export class CombatPhaseComplete {
    static readonly type = `${ACTION_SOURCE} Combat Phase Completed`;

    constructor(public phase: CombatPhase) {}
  }

  // // during opening-fire and combat, this action will denote which units are eligible to participate
  // // in combat (attacking units with attack > 0 and defending units with defense > 0)
  // export class PrepareCombatants {
  //   static readonly type = `${ACTION_SOURCE} Combatants Prepared`;

  //   constructor(public attackers: MilitaryUnit[], public defenders: MilitaryUnit[]) {}
  // }

  // After a "roll" of the dice, this action will indicate which combatants
  // fired and hit and which fired and missed. All combatants reported by this action will be removed
  // from the current combat phase so they cannot fire again.
  export class CombatantsFiring {
    static readonly type = `${ACTION_SOURCE} Combatants Firing`;

    // constructor(public hits: MilitaryUnit[], public misses: MilitaryUnit[]) {}
    constructor(
      public shotValues: number[],
      public targetValue: number,
      public units: MilitaryUnit[] // public role: CombatRole, // public phase: CombatPhase
    ) {}
  }

  // In response to any hits reported by CombatantsFiring, the other player must "elect"
  // units to absorb those hits. Each unit elected will have its hitpoints reduced by 1
  // after which, any units with a hitcount of zero becomes a casualty and will be cleared in the casualty phase.
  export class CasualtiesElected {
    static readonly type = `${ACTION_SOURCE} Casualties Elected`;

    constructor(public casualties: MilitaryUnit[]) {}
  }

  export class UndoCasualties {
    static readonly type = `${ACTION_SOURCE} Undo Casualty`;

    constructor(public casualties: MilitaryUnit[]) {}
  }

  export class CombatEnded {
    static readonly type = `${ACTION_SOURCE} Combat Ended`;
  }
}
