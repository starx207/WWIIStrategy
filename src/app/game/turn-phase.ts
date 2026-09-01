export enum TurnPhase {
  WEAPONS_DEVELOPMENT = 'weapons-development',
  PURCHASE_UNITS = 'purchase-units',
  COMBAT_MOVEMENT = 'combat-movement',
  COMBAT_RESOLUTION = 'combat-resolution',
  NON_COMBAT_MOVEMENT = 'non-combat-movement',
  PLACE_NEW_UNITS = 'place-new-units',
}

/** The first turn phase of every nation's turn — used as the turn-boundary marker. */
export const FIRST_TURN_PHASE = TurnPhase.WEAPONS_DEVELOPMENT;

const MOVEMENT_PHASES_CONST = [TurnPhase.COMBAT_MOVEMENT, TurnPhase.NON_COMBAT_MOVEMENT] as const;

export const MOVEMENT_PHASES: TurnPhase[] = [...MOVEMENT_PHASES_CONST];

export type MovementPhase = (typeof MOVEMENT_PHASES_CONST)[number];

/** Human-readable names for each turn phase (matching the rulebook's phase labels). */
export const TURN_PHASE_LABEL: Record<TurnPhase, string> = {
  [TurnPhase.PURCHASE_UNITS]: 'Purchase Units',
  [TurnPhase.WEAPONS_DEVELOPMENT]: 'Develop Weapons',
  [TurnPhase.COMBAT_MOVEMENT]: 'Combat Move',
  [TurnPhase.COMBAT_RESOLUTION]: 'Conduct Combat',
  [TurnPhase.NON_COMBAT_MOVEMENT]: 'Noncombat Move',
  [TurnPhase.PLACE_NEW_UNITS]: 'Mobilize Units',
};
