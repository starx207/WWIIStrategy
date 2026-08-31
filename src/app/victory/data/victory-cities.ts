import { Alliance } from '@ww2/shared/nationality';
import { LandTerritoryName } from '../../territories/territory-names';

export interface VictoryCity {
  /** The city's name (for display). */
  city: string;
  /** The territory that contains the city; control of the territory = control of the city. */
  territory: LandTerritoryName;
  /** Which alliance controls the city at the start of the game. */
  startingAlliance: Alliance;
}

/**
 * The twelve victory cities of Axis & Allies Revised. Each side begins controlling six. Controlling
 * a set number at the end of a round wins the game (8 minor, 10 major, 12 total).
 */
export const VICTORY_CITIES: VictoryCity[] = [
  // Allied-held at start
  { city: 'Washington', territory: 'Eastern United States', startingAlliance: Alliance.ALLIES },
  { city: 'Los Angeles', territory: 'Western United States', startingAlliance: Alliance.ALLIES },
  { city: 'London', territory: 'United Kingdom', startingAlliance: Alliance.ALLIES },
  { city: 'Moscow', territory: 'Russia', startingAlliance: Alliance.ALLIES },
  { city: 'Leningrad', territory: 'Karelia S.S.R.', startingAlliance: Alliance.ALLIES },
  { city: 'Calcutta', territory: 'India', startingAlliance: Alliance.ALLIES },
  // Axis-held at start
  { city: 'Berlin', territory: 'Germany', startingAlliance: Alliance.AXIS },
  { city: 'Paris', territory: 'Western Europe', startingAlliance: Alliance.AXIS },
  { city: 'Rome', territory: 'Southern Europe', startingAlliance: Alliance.AXIS },
  { city: 'Tokyo', territory: 'Japan', startingAlliance: Alliance.AXIS },
  { city: 'Shanghai', territory: 'Kwangtung', startingAlliance: Alliance.AXIS },
  { city: 'Manila', territory: 'Philippine Islands', startingAlliance: Alliance.AXIS },
];

export type VictoryCondition = 'minor' | 'major' | 'total';

/** Number of victory cities a side must control to win, per chosen condition. */
export const VICTORY_CITY_THRESHOLD: Record<VictoryCondition, number> = {
  minor: 8,
  major: 10,
  total: 12,
};

export const VICTORY_CONDITION_LABEL: Record<VictoryCondition, string> = {
  minor: 'Minor Victory (8 cities)',
  major: 'Major Victory (10 cities)',
  total: 'Total Victory (12 cities)',
};
