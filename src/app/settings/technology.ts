import { TechnologyId } from './settings-state';

/** Display names for the implemented technologies. */
export const TECHNOLOGY_LABEL: Record<TechnologyId, string> = {
  'jet-fighters': 'Jet Fighters',
  'heavy-bombers': 'Heavy Bombers',
  'super-submarines': 'Super Submarines',
};

/** One-line description of each technology's effect. */
export const TECHNOLOGY_EFFECT: Record<TechnologyId, string> = {
  'jet-fighters': 'Fighters defend on a 5.',
  'heavy-bombers': 'Bombers roll two dice on attack.',
  'super-submarines': 'Submarines attack on a 3.',
};

/**
 * The die face a player must roll (on at least one research die) to acquire each technology, per the
 * Axis & Allies Revised Weapons Development Chart. The three deferred techs would occupy the
 * remaining faces (Rockets 2, Long-Range Aircraft 4, Combined Bombardment 5) once implemented.
 * TODO: add rockets/long-range-aircraft/combined-bombardment.
 */
export const TECH_TARGET_NUMBER: Record<TechnologyId, number> = {
  'jet-fighters': 1,
  'super-submarines': 3,
  'heavy-bombers': 6,
};

/** IPC cost of a single research die. */
export const RESEARCH_DIE_COST = 5;
