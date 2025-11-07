export enum CombatPhase {
  OPENING_FIRE = 'opening-fire',
  OPENING_FIRE_CASUALTIES = 'opening-fire-casualties',
  COMBAT = 'combat',
  COMBAT_CASUALTIES = 'combat-casualties',
  PRESS_ATTACK = 'press-attack',
  RETREAT = 'retreat',
}

export const COMBAT_PHASES = Object.values(CombatPhase);
