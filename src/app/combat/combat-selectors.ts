import { MilitaryUnit } from '@ww2/shared/military-unit';
import { CombatState, CombatStateModel } from './combat-state';
import { createSelector, Selector } from '@ngxs/store';
import { CombatRole } from './combat.actions';
import { CombatRules } from './combat-rules';

export class CombatSelectors {
  static battleReadyIds(role: CombatRole) {
    return createSelector([CombatState], (state: CombatStateModel) => {
      const participants = state.phaseParticipants ?? [];
      if (participants.length === 0) {
        return [];
      }
      const army = role === 'attack' ? state.attackingArmy : state.defendingArmy;
      if (!army) {
        return [];
      }
      return army.map((a) => a.id).filter((id) => participants.includes(id));
    });
  }

  static combatForce(role: CombatRole) {
    return createSelector([CombatState], (state: CombatStateModel) => {
      return (role === 'attack' ? state.attackingArmy : state.defendingArmy) ?? [];
    });
  }

  static battleReadyUnits(role: CombatRole) {
    return createSelector(
      [CombatSelectors.combatForce(role), CombatSelectors.battleReadyIds(role)],
      (units: MilitaryUnit[], readyIds: string[]) => {
        return units.filter((u) => readyIds.includes(u.id));
      }
    );
  }

  @Selector([CombatState])
  static hitValues(state: CombatStateModel) {
    return CombatRules.determineHits({
      values: state.lastDiceRoll,
      target: state.diceTarget,
    }).hits;
  }

  @Selector([CombatState])
  static hitIndices(state: CombatStateModel) {
    return CombatRules.determineHits({
      values: state.lastDiceRoll,
      target: state.diceTarget,
    }).hitIndices;
  }

  @Selector([CombatState, CombatSelectors.hitValues])
  static pendingHitCount(state: CombatStateModel, hits: number[]) {
    const hitCount = hits.length;
    const electedCasualties = state.pendingCasualties.length;
    return hitCount - electedCasualties;
  }

  @Selector([CombatSelectors.pendingHitCount, CombatSelectors.hitValues])
  static pendingHitValues(hitCount: number, hits: number[]) {
    return hitCount === 0 ? [] : hits.slice(0, hitCount);
  }

  @Selector([CombatSelectors.pendingHitCount, CombatSelectors.hitIndices])
  static pendingHitIndices(hitCount: number, indices: number[]) {
    return hitCount === 0 ? [] : indices.slice(0, hitCount);
  }

  @Selector([CombatState])
  static activeCombatRole(state: CombatStateModel) {
    return state.phaseRole;
  }
}
