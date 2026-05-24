export enum CombatPhase {
  OPENING_FIRE = 'opening-fire',
  OPENING_FIRE_CASUALTIES = 'opening-fire-casualties',
  COMBAT = 'combat',
  COMBAT_CASUALTIES = 'combat-casualties',
  REGROUP = 'regroup',
}

export type CasualtyPhase = CombatPhase.OPENING_FIRE_CASUALTIES | CombatPhase.COMBAT_CASUALTIES;

export const COMBAT_PHASES = Object.values(CombatPhase);
