import { Alliance, NATION_ALLIANCE, Nationality } from '@ww2/shared/nationality';
import { LandTerritoryName } from '../../territories/territory-names';
import { VICTORY_CITIES, VICTORY_CITY_THRESHOLD, VictoryCondition } from '../data/victory-cities';

type LandControlMap = Record<LandTerritoryName, Nationality>;

/** Number of victory cities an alliance currently controls. */
export function countVictoryCities(alliance: Alliance, landControl: LandControlMap): number {
  return VICTORY_CITIES.filter(
    (victoryCity) => NATION_ALLIANCE[landControl[victoryCity.territory]] === alliance,
  ).length;
}

export interface VictoryStatus {
  axisCities: number;
  alliesCities: number;
  threshold: number;
  /** The winning alliance, or null if no side has met the condition yet. */
  winner: Alliance | null;
}

/** Evaluate whether either alliance has met the victory-city threshold. */
export function evaluateVictory(
  landControl: LandControlMap,
  condition: VictoryCondition,
): VictoryStatus {
  const threshold = VICTORY_CITY_THRESHOLD[condition];
  const axisCities = countVictoryCities(Alliance.AXIS, landControl);
  const alliesCities = countVictoryCities(Alliance.ALLIES, landControl);

  let winner: Alliance | null = null;
  if (axisCities >= threshold) {
    winner = Alliance.AXIS;
  } else if (alliesCities >= threshold) {
    winner = Alliance.ALLIES;
  }

  return { axisCities, alliesCities, threshold, winner };
}
