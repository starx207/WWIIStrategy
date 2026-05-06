import { Nationality } from './nationality';
import { UnitType } from './unit-type';
import { v4 as uuid } from 'uuid';

export abstract class MilitaryUnit {
  constructor(
    public type: UnitType,
    public nationality: Nationality,
  ) {
    this.id = uuid();
  }

  readonly id: string;
}

export class InfantryUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.INFANTRY, nationality);
  }
}

export class ArtilleryUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.ARTILLERY, nationality);
  }
}

export class TankUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.TANK, nationality);
  }
}

export class AntiAirUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.ANTI_AIR_GUN, nationality);
  }
}

export class FactoryUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.FACTORY, nationality);
  }
}

export class FighterJetUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.FIGHTER_JET, nationality);
  }
}

export class BomberUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.BOMBER, nationality);
  }
}

export class BattleshipUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.BATTLESHIP, nationality);
  }
}

export class DestroyerUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.DESTROYER, nationality);
  }
}

export class AircraftCarrierUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.AIRCRAFT_CARRIER, nationality);
  }
}

export class TransportUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.TRANSPORT, nationality);
  }
}

export class SubmarineUnit extends MilitaryUnit {
  constructor(nationality: Nationality) {
    super(UnitType.SUBMARINE, nationality);
  }
}
