import { Nationality } from './nationality';

/** Full display names for each power. */
export const NATIONALITY_LABEL: Record<Nationality, string> = {
  [Nationality.SOVIET_UNION]: 'Soviet Union',
  [Nationality.GERMANY]: 'Germany',
  [Nationality.UNITED_KINGDOM]: 'United Kingdom',
  [Nationality.JAPAN]: 'Japan',
  [Nationality.UNITED_STATES]: 'United States',
};

/** Short codes for compact UI (e.g. header widgets). */
export const NATIONALITY_SHORT_LABEL: Record<Nationality, string> = {
  [Nationality.SOVIET_UNION]: 'USSR',
  [Nationality.GERMANY]: 'GER',
  [Nationality.UNITED_KINGDOM]: 'UK',
  [Nationality.JAPAN]: 'JPN',
  [Nationality.UNITED_STATES]: 'USA',
};
