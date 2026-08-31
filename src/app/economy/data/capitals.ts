import { Nationality } from '@ww2/shared/nationality';
import { LandTerritoryName } from '../../territories/territory-names';

/**
 * Each power's capital territory in Axis & Allies Revised. Capturing a capital transfers the
 * victim's treasury to the captor and zeroes the victim's income until the capital is liberated.
 */
export const CAPITAL_BY_NATION: Record<Nationality, LandTerritoryName> = {
  [Nationality.SOVIET_UNION]: 'Russia',
  [Nationality.GERMANY]: 'Germany',
  [Nationality.UNITED_KINGDOM]: 'United Kingdom',
  [Nationality.JAPAN]: 'Japan',
  [Nationality.UNITED_STATES]: 'Eastern United States',
};

/** The nation whose capital a territory is, if any (inverse of CAPITAL_BY_NATION). */
export const CAPITAL_OWNER_BY_TERRITORY: Partial<Record<LandTerritoryName, Nationality>> =
  Object.fromEntries(
    Object.entries(CAPITAL_BY_NATION).map(([nation, territory]) => [
      territory,
      nation as Nationality,
    ]),
  );
