import { Nationality } from './nationality';
import { UnitType } from './unit-type';
import {
  AircraftCarrierUnit,
  AntiAirUnit,
  ArtilleryUnit,
  BattleshipUnit,
  BomberUnit,
  DestroyerUnit,
  FactoryUnit,
  FighterJetUnit,
  InfantryUnit,
  MilitaryUnit,
  SubmarineUnit,
  TankUnit,
  TransportUnit,
} from './military-unit';

type UnitConstructor = new (nationality: Nationality) => MilitaryUnit;

const UNIT_CONSTRUCTOR_BY_TYPE: Record<UnitType, UnitConstructor> = {
  [UnitType.INFANTRY]: InfantryUnit,
  [UnitType.ARTILLERY]: ArtilleryUnit,
  [UnitType.TANK]: TankUnit,
  [UnitType.ANTI_AIR_GUN]: AntiAirUnit,
  [UnitType.FACTORY]: FactoryUnit,
  [UnitType.FIGHTER_JET]: FighterJetUnit,
  [UnitType.BOMBER]: BomberUnit,
  [UnitType.TRANSPORT]: TransportUnit,
  [UnitType.DESTROYER]: DestroyerUnit,
  [UnitType.SUBMARINE]: SubmarineUnit,
  [UnitType.BATTLESHIP]: BattleshipUnit,
  [UnitType.AIRCRAFT_CARRIER]: AircraftCarrierUnit,
};

/**
 * Construct the concrete {@link MilitaryUnit} subclass for a unit type. When an `id` is provided
 * (e.g. rehydrating a saved game) it overrides the fresh uuid the constructor assigns, so unit
 * identity survives a save/load round-trip. Omit `id` when minting a brand-new unit (purchases).
 */
export function createUnit(type: UnitType, nationality: Nationality, id?: string): MilitaryUnit {
  const constructor = UNIT_CONSTRUCTOR_BY_TYPE[type];
  if (!constructor) {
    throw new Error(`No unit constructor registered for unit type "${type}"`);
  }

  const unit = new constructor(nationality);
  if (id) {
    // `id` is declared readonly for callers, but rehydration must preserve the original value.
    (unit as unknown as { id: string }).id = id;
  }
  return unit;
}

/** Rebuild a {@link MilitaryUnit} from a plain (deserialized) object, preserving its id. */
export function reviveUnit(plain: {
  type: UnitType;
  nationality: Nationality;
  id: string;
}): MilitaryUnit {
  return createUnit(plain.type, plain.nationality, plain.id);
}
