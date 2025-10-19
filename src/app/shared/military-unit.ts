import { Nationality } from './nationality';
import { UnitType } from './unit-type';

export interface MilitaryUnitInitOptions {
  attack?: number;
  defense?: number;
  hitPoints?: number;
}

export abstract class MilitaryUnit {
  constructor(
    public type: UnitType,
    public nationality: Nationality,
    options?: MilitaryUnitInitOptions
  ) {
    this.attack = options?.attack ?? 1;
    this.defense = options?.defense ?? 1;
    this.hitPoints = options?.hitPoints ?? 1;
  }

  readonly attack: number;
  readonly defense: number;
  hitPoints: number;
  // canTarget: UnitType[];
  // movement: number;
}

export class InfantryUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.INFANTRY, nationality, { defense: 2 });
  }
}

export class ArtilleryUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.ARTILLERY, nationality, { attack: 2, defense: 2 });
  }
}

export class TankUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.TANK, nationality, { attack: 3, defense: 3 });
  }
}

export class AntiAirUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.ANTI_AIR_GUN, nationality, { attack: 0 });
  }
}

export class FactoryUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.FACTORY, nationality, { attack: 0, defense: 0 });
  }
}

export class FighterJetUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.FIGHTER_JET, nationality, { attack: 3, defense: 4 });
  }
}

export class BomberUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.BOMBER, nationality, { attack: 4 });
  }
}

export class BattleshipUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.BATTLESHIP, nationality, { attack: 4, defense: 4, hitPoints: 2 });
  }
}

export class DestroyerUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.DESTROYER, nationality, { attack: 3, defense: 3 });
  }
}

export class AircraftCarrierUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.AIRCRAFT_CARRIER, nationality, { defense: 3 });
  }
}

export class TransportUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.TRANSPORT, nationality, { attack: 0 });
  }
}

export class SubmarineUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.SUBMARINE, nationality, { attack: 2, defense: 2 });
  }
}
