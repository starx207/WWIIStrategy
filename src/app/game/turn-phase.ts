export enum TurnPhase {
  PURCHASE_UNITS = 'purchase-units',
  WEAPONS_DEVELOPMENT = 'weapons-development',
  COMBAT_MOVEMENT = 'combat-movement',
  COMBAT_RESOLUTION = 'combat-resolution',
  NON_COMBAT_MOVEMENT = 'non-combat-movement',
  PLACE_NEW_UNITS = 'place-new-units',
}

const MOVEMENT_PHASES_CONST = [TurnPhase.COMBAT_MOVEMENT, TurnPhase.NON_COMBAT_MOVEMENT] as const;

export const MOVEMENT_PHASES: TurnPhase[] = [...MOVEMENT_PHASES_CONST];

export type MovementPhase = (typeof MOVEMENT_PHASES_CONST)[number];
