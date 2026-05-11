import { createSelector, Selector } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { CombatPhase } from './combat-phase';
import { CombatRole } from './combat.actions';
import { CombatHit, CombatState, CombatStateModel } from './combat-state';
import { getEffectiveArmy, getHitPoints } from '@ww2/shared/effective-unit.reducer';
import {
  addHitsToPool,
  createEmptyHitPool,
  HitPool,
  targetKindPriorityForUnit,
  totalHitPool,
} from '@ww2/shared/hit-pool';
import { createResolvedRuleContext } from './rule-context.factory';

type AssignmentMap = Record<string, CombatHit[]>;

function hitPoolFromHits(hits: CombatHit[]): HitPool {
  return hits.reduce(
    (pool, hit) => addHitsToPool(pool, hit.targetKind, 1),
    createEmptyHitPool(),
  );
}

function consumeHitForUnit(
  hits: CombatHit[],
  unit: MilitaryUnit,
): { hit: CombatHit; remainingHits: CombatHit[] } | undefined {
  for (const targetKind of targetKindPriorityForUnit(unit)) {
    const hitIndex = hits.findIndex((hit) => hit.targetKind === targetKind);
    if (hitIndex < 0) {
      continue;
    }

    return {
      hit: hits[hitIndex],
      remainingHits: hits.filter((_, index) => index !== hitIndex),
    };
  }

  return undefined;
}

function pendingHitPool(
  hitsToAssign: CombatHit[],
  assignments: AssignmentMap,
  roleArmy: MilitaryUnit[],
): HitPool {
  let pendingHits = [...hitsToAssign];
  const unitById = new Map(roleArmy.map((unit) => [unit.id, unit]));

  for (const [unitId, hits] of Object.entries(assignments)) {
    const unit = unitById.get(unitId);
    if (!unit) {
      continue;
    }

    for (const _hit of hits) {
      const consumedHit = consumeHitForUnit(pendingHits, unit);
      if (!consumedHit) {
        return hitPoolFromHits(pendingHits);
      }
      pendingHits = consumedHit.remainingHits;
    }
  }

  return hitPoolFromHits(pendingHits);
}

export class CombatSelectors {
  @Selector([CombatState])
  static currentPhase(state: CombatStateModel) {
    return state.currentPhase;
  }

  @Selector([CombatState])
  static isFirePhase(state: CombatStateModel) {
    return (
      state.currentPhase === CombatPhase.OPENING_FIRE || state.currentPhase === CombatPhase.COMBAT
    );
  }

  @Selector([CombatState])
  static isCasualtyPhase(state: CombatStateModel) {
    return (
      state.currentPhase === CombatPhase.OPENING_FIRE_CASUALTIES ||
      state.currentPhase === CombatPhase.COMBAT_CASUALTIES
    );
  }

  @Selector([CombatState])
  static outcome(state: CombatStateModel) {
    return state.outcome;
  }

  @Selector([CombatState])
  static canCaptureTerritory(state: CombatStateModel) {
    return state.canCaptureTerritory;
  }

  @Selector([CombatState])
  static resolutionSummary(state: CombatStateModel) {
    return state.resolutionSummary;
  }

  static combatForce(role: CombatRole) {
    return createSelector([CombatState], (state: CombatStateModel) => {
      const army = role === 'attack' ? state.attackingArmy : state.defendingArmy;
      const ruleState = createResolvedRuleContext(state);
      return getEffectiveArmy(army, {
        ...ruleState,
        role: role,
      });
    });
  }

  static battleReadyIds(role: CombatRole) {
    return createSelector([CombatState], (state: CombatStateModel) => {
      return role === 'attack' ? state.attackerReadyToFireIds : state.defenderReadyToFireIds;
    });
  }

  static hitsToAssign(role: CombatRole) {
    return createSelector([CombatState], (state: CombatStateModel) => {
      return hitPoolFromHits(
        role === 'attack' ? state.attackerHitsToAssign : state.defenderHitsToAssign,
      );
    });
  }

  static assignedHitsByUnitId(role: CombatRole) {
    return createSelector([CombatState], (state: CombatStateModel) => {
      return role === 'attack'
        ? state.attackerAssignedHitsByUnitId
        : state.defenderAssignedHitsByUnitId;
    });
  }

  static pendingHitCountForRole(role: CombatRole) {
    return createSelector([CombatState], (state: CombatStateModel) => {
      const hitsToAssign =
        role === 'attack' ? state.attackerHitsToAssign : state.defenderHitsToAssign;
      const assignments =
        role === 'attack' ? state.attackerAssignedHitsByUnitId : state.defenderAssignedHitsByUnitId;
      const roleArmy = role === 'attack' ? state.attackingArmy : state.defendingArmy;

      return totalHitPool(pendingHitPool(hitsToAssign, assignments, roleArmy));
    });
  }

  static pendingHitPoolForRole(role: CombatRole) {
    return createSelector([CombatState], (state: CombatStateModel) => {
      return pendingHitPool(
        role === 'attack' ? state.attackerHitsToAssign : state.defenderHitsToAssign,
        role === 'attack' ? state.attackerAssignedHitsByUnitId : state.defenderAssignedHitsByUnitId,
        role === 'attack' ? state.attackingArmy : state.defendingArmy,
      );
    });
  }

  static casualtiesConfirmed(role: CombatRole) {
    return createSelector([CombatState], (state: CombatStateModel) => {
      return role === 'attack'
        ? state.attackerCasualtiesConfirmed
        : state.defenderCasualtiesConfirmed;
    });
  }

  static canConfirmCasualties(role: CombatRole) {
    return createSelector([CombatState], (state: CombatStateModel) => {
      const isCasualtyPhase =
        state.currentPhase === CombatPhase.OPENING_FIRE_CASUALTIES ||
        state.currentPhase === CombatPhase.COMBAT_CASUALTIES;
      if (!isCasualtyPhase) {
        return false;
      }

      const confirmed =
        role === 'attack' ? state.attackerCasualtiesConfirmed : state.defenderCasualtiesConfirmed;
      if (confirmed) {
        return false;
      }

      const hitsToAssign =
        role === 'attack' ? state.attackerHitsToAssign : state.defenderHitsToAssign;
      const pendingHits = pendingHitPool(
        hitsToAssign,
        role === 'attack' ? state.attackerAssignedHitsByUnitId : state.defenderAssignedHitsByUnitId,
        role === 'attack' ? state.attackingArmy : state.defendingArmy,
      );

      return totalHitPool(pendingHits) === 0 && hitsToAssign.length > 0;
    });
  }

  @Selector([
    CombatSelectors.pendingHitCountForRole('attack'),
    CombatSelectors.pendingHitCountForRole('defend'),
  ])
  static pendingHitCount(attackerPending: number, defenderPending: number) {
    return attackerPending + defenderPending;
  }

  @Selector([CombatSelectors.pendingHitCount])
  static pendingHitValues(pendingHitCount: number) {
    return pendingHitCount > 0 ? Array.from({ length: pendingHitCount }, () => 1) : [];
  }

  @Selector([CombatSelectors.pendingHitValues])
  static hitValues(pendingHitValues: number[]) {
    return pendingHitValues;
  }

  @Selector([CombatState])
  static pendingCasualties(state: CombatStateModel) {
    const pendingIds = new Set<string>();

    for (const [unitId, hits] of Object.entries(state.attackerAssignedHitsByUnitId)) {
      if (hits.length > 0) {
        pendingIds.add(unitId);
      }
    }

    for (const [unitId, hits] of Object.entries(state.defenderAssignedHitsByUnitId)) {
      if (hits.length > 0) {
        pendingIds.add(unitId);
      }
    }

    return [...pendingIds];
  }

  @Selector([CombatState])
  static allCasualtyIds(state: CombatStateModel) {
    const casualtyIds: string[] = [];
    const attackerAssigned = state.attackerAssignedHitsByUnitId;
    const defenderAssigned = state.defenderAssignedHitsByUnitId;
    const ruleState = createResolvedRuleContext(state);

    for (const unit of [...state.attackingArmy, ...state.defendingArmy]) {
      const persistentDamage = state.unitDamageById[unit.id] ?? 0;
      const assignedDamage =
        (attackerAssigned[unit.id]?.length ?? 0) + (defenderAssigned[unit.id]?.length ?? 0);
      if (persistentDamage + assignedDamage >= getHitPoints(unit, ruleState)) {
        casualtyIds.push(unit.id);
      }
    }

    return casualtyIds;
  }

  @Selector([CombatState])
  static damageMap(state: CombatStateModel) {
    const persistedDamage = state.unitDamageById;
    const attackerDamage = state.attackerAssignedHitsByUnitId;
    const defenderDamage = state.defenderAssignedHitsByUnitId;
    const ruleState = createResolvedRuleContext(state);

    const damageMap: Record<string, number> = {};
    const allMultiHpUnits = [...state.attackingArmy, ...state.defendingArmy]
      .filter((unit) => getHitPoints(unit, ruleState) > 1)
      .map((unit) => unit.id);
    for (const unitId of allMultiHpUnits) {
      damageMap[unitId] =
        (persistedDamage[unitId] ?? 0) +
        (attackerDamage[unitId]?.length ?? 0) +
        (defenderDamage[unitId]?.length ?? 0);
    }

    return damageMap;
  }

  @Selector([CombatState])
  static activeCombatRole(state: CombatStateModel) {
    if (
      state.currentPhase !== CombatPhase.OPENING_FIRE &&
      state.currentPhase !== CombatPhase.COMBAT
    ) {
      return undefined;
    }

    const hasAttackersReady = state.attackerReadyToFireIds.length > 0;
    const hasDefendersReady = state.defenderReadyToFireIds.length > 0;

    if (hasAttackersReady && !hasDefendersReady) {
      return 'attack';
    }

    if (hasDefendersReady && !hasAttackersReady) {
      return 'defend';
    }

    return undefined;
  }
}
