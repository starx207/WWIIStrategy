import { Nationality } from '@ww2/shared/nationality';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { TurnPhase } from '@ww2/game/turn-phase';
import { TerritoryName } from '../../territories/territory-names';
import { SquadMovementPlan } from '../map-state';
import { movingUnitsForPlan } from '../../combat/combat-orchestration';
import { parseSquadId } from './movement-execution';

type UnitsByTerritory = Partial<Record<TerritoryName, MilitaryUnit[]>>;
type AmphibiousAssaults = Partial<Record<string, string[]>>;

/**
 * Ids of every unit that "committed" to combat this turn for the given nation: any unit whose
 * squad made a combat move (whether or not it led to a battle — an undefended-territory or blitz
 * combat move still counts) plus any unit staged for an amphibious assault. Used to lock those
 * units out of the non-combat movement phase. Must be collected when leaving COMBAT_MOVEMENT,
 * before ResolveAutomaticCaptures consumes the plans that captured undefended/blitz territory.
 */
export function collectCombatCommittedUnitIds(params: {
  nation: Nationality;
  plans: SquadMovementPlan[];
  unitsByTerritory: UnitsByTerritory;
  amphibiousAssaultsByTerritory: AmphibiousAssaults;
}): string[] {
  const { nation, plans, unitsByTerritory, amphibiousAssaultsByTerritory } = params;
  const committed = new Set<string>();

  for (const plan of plans) {
    if (plan.phase !== TurnPhase.COMBAT_MOVEMENT || plan.path.length === 0) {
      continue;
    }
    if (parseSquadId(plan.squadId)?.nationality !== nation) {
      continue;
    }
    for (const unit of movingUnitsForPlan(plan, unitsByTerritory)) {
      committed.add(unit.id);
    }
  }

  for (const ids of Object.values(amphibiousAssaultsByTerritory)) {
    for (const id of ids ?? []) {
      committed.add(id);
    }
  }

  return [...committed];
}
