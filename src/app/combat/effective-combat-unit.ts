import { TargetKind } from '@ww2/shared/unit-profile';
import { CasualtyPhase, CombatPhase } from './combat-phase';
import { CombatRole } from './combat.actions';
import { EffectiveUnit, isEffectiveUnit } from '@ww2/shared/effective-unit';
import { MilitaryUnit } from '@ww2/shared/military-unit';

export type CombatProfileId = 'standard-combat';
export type CombatProfileKind = 'standard-combat' | 'special-attack';
export type IncomeLossFormula = 'full-roll' | 'half-roll-rounded-down';
export type DamageEffect =
  | { type: 'unit-hit' }
  | { type: 'income-loss'; formula: IncomeLossFormula };

export interface CombatProfile {
  id: CombatProfileId;
  kind: CombatProfileKind;
  role: CombatRole;
  phases: CombatPhase[];
  target: number;
  shotsPerRound: number;
  targetKind: TargetKind;
  casualtyClearPhases: CasualtyPhase[];
  damage: DamageEffect;
}

export type EffectiveCombatUnit = EffectiveUnit & {
  combatProfiles: CombatProfile[];
};

export const isEffectiveCombatUnit = (
  unit: EffectiveCombatUnit | MilitaryUnit,
): unit is EffectiveCombatUnit => isEffectiveUnit(unit) && 'combatProfiles' in unit;
