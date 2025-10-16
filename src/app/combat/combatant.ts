import {
  AircraftCarrierUnit,
  AntiAirUnit,
  ArtilleryUnit,
  BattleshipUnit,
  BomberUnit,
  DestroyerUnit,
  FighterJetUnit,
  InfantryUnit,
  MilitaryUnit,
  SubmarineUnit,
  TankUnit,
  TransportUnit,
} from '@ww2/shared/military-unit';

export interface Combatant {
  remainingHitPoints: number;
}

export type InfantryCombatant = Combatant & InfantryUnit;
export type ArtilleryCombatant = Combatant & ArtilleryUnit;
export type TankCombatant = Combatant & TankUnit;
export type FighterJetCombatant = Combatant & FighterJetUnit;
export type BomberCombatant = Combatant & BomberUnit;
export type BattleshipCombatant = Combatant & BattleshipUnit;
export type DestroyerCombatant = Combatant & DestroyerUnit;
export type AircraftCarrierCombatant = Combatant & AircraftCarrierUnit;
export type TransportCombatant = Combatant & TransportUnit;
export type SubmarineCombatant = Combatant & SubmarineUnit;
export type AntiAirCombatant = Combatant & AntiAirUnit;
