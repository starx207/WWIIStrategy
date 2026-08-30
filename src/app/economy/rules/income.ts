import { Nationality } from '@ww2/shared/nationality';
import { LandTerritoryName } from '../../territories/territory-names';
import { TERRITORY_IPC_VALUE } from '../data/territory-ipc';
import { CAPITAL_BY_NATION } from '../data/capitals';

export type LandControlMap = Record<LandTerritoryName, Nationality>;

/** True when a nation currently controls its own capital. */
export function controlsOwnCapital(nation: Nationality, landControl: LandControlMap): boolean {
  return landControl[CAPITAL_BY_NATION[nation]] === nation;
}

/**
 * Income a nation collects at the end of its turn: the summed IPC value of every land territory it
 * controls. A power whose capital is currently held by an enemy collects nothing until the capital
 * is liberated (Axis & Allies Revised capital-capture rule).
 */
export function calculateIncome(nation: Nationality, landControl: LandControlMap): number {
  if (!controlsOwnCapital(nation, landControl)) {
    return 0;
  }

  let total = 0;
  for (const [territory, controller] of Object.entries(landControl)) {
    if (controller === nation) {
      total += TERRITORY_IPC_VALUE[territory as LandTerritoryName] ?? 0;
    }
  }
  return total;
}
