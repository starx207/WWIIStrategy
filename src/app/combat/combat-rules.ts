import { CombatPhase } from './combat-phase';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { CombatRole } from './combat.actions';

export namespace CombatRules {
  export interface FiringInput {
    values: number[];
    target: number;
    //firingUnits: MilitaryUnit[];
  }

  export interface VictoryCheckInput {
    role: CombatRole;
    hitCount: number;
    attackers: MilitaryUnit[];
    defenders: MilitaryUnit[];
    casualtyIds: string[];
  }

  export function filterEligibleUnits(
    phase: CombatPhase,
    attackers?: MilitaryUnit[],
    defenders?: MilitaryUnit[]
  ) {
    if (phase === CombatPhase.COMBAT) {
      // TODO: This will need to filter to the units eligible to participate in the current combat phase
      return {
        attackers: attackers?.filter((x) => x.attack > 0) ?? [],
        defenders: defenders ?? [],
      };
    }

    return { attackers: [], defenders: [] };
  }

  // export function determineFiringResults(results: FiringInput) {
  //   const hitCount = results.values.filter((v) => v <= results.target).length;
  //   const hits = results.firingUnits.filter((_, i) => i < hitCount);
  //   const misses = results.firingUnits.filter((unit) => !hits.includes(unit));

  //   return { hits, misses };
  // }

  export function determineHits(results: FiringInput) {
    const hits = results.values.map((v, idx) => ({ v, idx })).filter((x) => x.v <= results.target);
    // const hits = results.values.filter((v) => v <= results.target);
    // const hits = results.firingUnits.filter((_, i) => i < hitCount);
    // const misses = results.firingUnits.filter((unit) => !hits.includes(unit));

    // return { hits, misses };
    return {
      hits: hits.map((h) => h.v),
      hitIndices: hits.map((h) => h.idx),
    };
  }

  export function checkForVictory(input: VictoryCheckInput) {
    const remainingHitPoints = (input.role === 'attack' ? input.attackers : input.defenders)
      .filter((unit) => !input.casualtyIds.includes(unit.id))
      .reduce((totalHp, unit) => totalHp + unit.hitPoints, 0);

    return input.hitCount >= remainingHitPoints;
  }
}
