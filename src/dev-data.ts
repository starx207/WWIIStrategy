import {
  MilitaryUnit,
  InfantryUnit,
  ArtilleryUnit,
  TankUnit,
  FighterJetUnit,
  BomberUnit,
  BattleshipUnit,
  DestroyerUnit,
  AircraftCarrierUnit,
  TransportUnit,
  SubmarineUnit,
  AntiAirUnit,
} from '@ww2/shared/military-unit';
import { Nationality } from '@ww2/shared/nationality';

export const TEST_ATTACKERS: MilitaryUnit[] = [
  // Infantry units
  new InfantryUnit(Nationality.UNITED_STATES),
  new InfantryUnit(Nationality.UNITED_KINGDOM),
  new InfantryUnit(Nationality.UNITED_KINGDOM),
  new InfantryUnit(Nationality.UNITED_STATES),
  new InfantryUnit(Nationality.UNITED_KINGDOM),
  new InfantryUnit(Nationality.SOVIET_UNION),
  new InfantryUnit(Nationality.SOVIET_UNION),

  // Artillery units
  new ArtilleryUnit(Nationality.UNITED_STATES),
  new ArtilleryUnit(Nationality.UNITED_KINGDOM),
  new ArtilleryUnit(Nationality.UNITED_KINGDOM),
  new ArtilleryUnit(Nationality.SOVIET_UNION),

  // Tank units
  new TankUnit(Nationality.UNITED_KINGDOM),
  new TankUnit(Nationality.UNITED_KINGDOM),
  new TankUnit(Nationality.UNITED_STATES),
  new TankUnit(Nationality.UNITED_STATES),
  new TankUnit(Nationality.SOVIET_UNION),
  new TankUnit(Nationality.SOVIET_UNION),
  new TankUnit(Nationality.SOVIET_UNION),

  // Fighter jet units
  new FighterJetUnit(Nationality.UNITED_STATES),
  new FighterJetUnit(Nationality.UNITED_KINGDOM),
  new FighterJetUnit(Nationality.UNITED_KINGDOM),
  new FighterJetUnit(Nationality.SOVIET_UNION),
  new FighterJetUnit(Nationality.SOVIET_UNION),

  // Bomber units
  new BomberUnit(Nationality.UNITED_KINGDOM),
  new BomberUnit(Nationality.UNITED_STATES),
  new BomberUnit(Nationality.UNITED_KINGDOM),

  // Battleship units
  new BattleshipUnit(Nationality.UNITED_STATES),
  new BattleshipUnit(Nationality.UNITED_KINGDOM),
  new BattleshipUnit(Nationality.UNITED_KINGDOM),

  // Destroyer units
  new DestroyerUnit(Nationality.UNITED_KINGDOM),
  new DestroyerUnit(Nationality.UNITED_STATES),
  new DestroyerUnit(Nationality.UNITED_KINGDOM),
  new DestroyerUnit(Nationality.SOVIET_UNION),

  // Aircraft carrier units
  new AircraftCarrierUnit(Nationality.UNITED_STATES),
  new AircraftCarrierUnit(Nationality.UNITED_KINGDOM),

  // Transport units
  new TransportUnit(Nationality.UNITED_KINGDOM),
  new TransportUnit(Nationality.UNITED_STATES),
  new TransportUnit(Nationality.UNITED_KINGDOM),

  // Submarine units
  new SubmarineUnit(Nationality.UNITED_KINGDOM),
  new SubmarineUnit(Nationality.UNITED_STATES),
  new SubmarineUnit(Nationality.UNITED_KINGDOM),
  new SubmarineUnit(Nationality.SOVIET_UNION),
];

export const TEST_DEFENDERS: MilitaryUnit[] = [
  // Infantry units
  new InfantryUnit(Nationality.GERMANY),
  new InfantryUnit(Nationality.JAPAN),
  new InfantryUnit(Nationality.GERMANY),
  new InfantryUnit(Nationality.JAPAN),
  new InfantryUnit(Nationality.GERMANY),
  new InfantryUnit(Nationality.JAPAN),
  new InfantryUnit(Nationality.GERMANY),

  // Artillery units
  new ArtilleryUnit(Nationality.GERMANY),
  new ArtilleryUnit(Nationality.JAPAN),
  new ArtilleryUnit(Nationality.GERMANY),
  new ArtilleryUnit(Nationality.JAPAN),

  // Tank units
  new TankUnit(Nationality.GERMANY),
  new TankUnit(Nationality.JAPAN),
  new TankUnit(Nationality.GERMANY),
  new TankUnit(Nationality.JAPAN),
  new TankUnit(Nationality.GERMANY),

  // Anti-air units
  new AntiAirUnit(Nationality.GERMANY),
  new AntiAirUnit(Nationality.GERMANY),

  // Fighter jet units
  new FighterJetUnit(Nationality.GERMANY),
  new FighterJetUnit(Nationality.JAPAN),
  new FighterJetUnit(Nationality.GERMANY),
  new FighterJetUnit(Nationality.JAPAN),

  // Bomber units
  new BomberUnit(Nationality.GERMANY),
  new BomberUnit(Nationality.JAPAN),
  new BomberUnit(Nationality.GERMANY),
  new BomberUnit(Nationality.JAPAN),

  // Battleship units
  new BattleshipUnit(Nationality.GERMANY),
  new BattleshipUnit(Nationality.JAPAN),
  new BattleshipUnit(Nationality.GERMANY),

  // Destroyer units
  new DestroyerUnit(Nationality.GERMANY),
  new DestroyerUnit(Nationality.JAPAN),
  new DestroyerUnit(Nationality.GERMANY),

  // Aircraft carrier units
  new AircraftCarrierUnit(Nationality.JAPAN),
  new AircraftCarrierUnit(Nationality.GERMANY),
  new AircraftCarrierUnit(Nationality.JAPAN),

  // Transport units
  new TransportUnit(Nationality.GERMANY),
  new TransportUnit(Nationality.JAPAN),
  new TransportUnit(Nationality.GERMANY),

  // Submarine units
  new SubmarineUnit(Nationality.GERMANY),
  new SubmarineUnit(Nationality.JAPAN),
  new SubmarineUnit(Nationality.GERMANY),
  new SubmarineUnit(Nationality.JAPAN),
  new SubmarineUnit(Nationality.GERMANY),
];
