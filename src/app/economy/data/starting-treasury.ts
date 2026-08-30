import { Nationality } from '@ww2/shared/nationality';

/**
 * Starting IPC bank for each power in Axis & Allies Revised (2004). Each power begins with IPCs
 * equal to its starting income (USSR 24, Germany 40, UK 30, Japan 30, USA 42).
 */
export const STARTING_TREASURY_BY_NATION: Record<Nationality, number> = {
  [Nationality.SOVIET_UNION]: 24,
  [Nationality.GERMANY]: 40,
  [Nationality.UNITED_KINGDOM]: 30,
  [Nationality.JAPAN]: 30,
  [Nationality.UNITED_STATES]: 42,
};
