import { createSelector, Selector } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { CombatPhase } from './combat-phase';
import { CombatRole } from './combat.actions';
import { CombatState, CombatStateModel } from './combat-state';
import { getHitPoints } from '@ww2/shared/effective-unit.reducer';
import { consumeHitForUnit, HitPool, totalHitPool } from '@ww2/shared/hit-pool';

type AssignmentMap = Record<string, number>;

function pendingHitPool(
  hitsToAssign: HitPool,
  assignments: AssignmentMap,
  roleArmy: MilitaryUnit[],
): HitPool {
  let pendingPool = { ...hitsToAssign };
  const unitById = new Map(roleArmy.map((unit) => [unit.id, unit]));

  for (const [unitId, hits] of Object.entries(assignments)) {
    const unit = unitById.get(unitId);
    if (!unit) {
      continue;
    }

    for (let i = 0; i < hits; i++) {
      const nextPool = consumeHitForUnit(pendingPool, unit);
      if (!nextPool) {
        return pendingPool;
      }
      pendingPool = nextPool;
    }
  }

  return pendingPool;
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
      return role === 'attack' ? state.attackingArmy : state.defendingArmy;
    });
  }

  static battleReadyIds(role: CombatRole) {
    return createSelector([CombatState], (state: CombatStateModel) => {
      return role === 'attack' ? state.attackerReadyToFireIds : state.defenderReadyToFireIds;
    });
  }

  static battleReadyUnits(role: CombatRole) {
    return createSelector(
      [CombatSelectors.combatForce(role), CombatSelectors.battleReadyIds(role)],
      (units: MilitaryUnit[], readyIds: string[]) => {
        if (readyIds.length === 0) {
          return [];
        }
        const readyIdSet = new Set(readyIds);
        return units.filter((unit) => readyIdSet.has(unit.id));
      },
    );
  }

  static hitsToAssign(role: CombatRole) {
    return createSelector([CombatState], (state: CombatStateModel) => {
      return role === 'attack' ? state.attackerHitsToAssign : state.defenderHitsToAssign;
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

      return totalHitPool(pendingHits) === 0 && totalHitPool(hitsToAssign) > 0;
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
      if (hits > 0) {
        pendingIds.add(unitId);
      }
    }

    for (const [unitId, hits] of Object.entries(state.defenderAssignedHitsByUnitId)) {
      if (hits > 0) {
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

    for (const unit of [...state.attackingArmy, ...state.defendingArmy]) {
      const persistentDamage = state.unitDamageById[unit.id] ?? 0;
      const assignedDamage = (attackerAssigned[unit.id] ?? 0) + (defenderAssigned[unit.id] ?? 0);
      if (persistentDamage + assignedDamage >= getHitPoints(unit)) {
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

    const damageMap: Record<string, number> = {};
    const allMultiHpUnits = [...state.attackingArmy, ...state.defendingArmy]
      .filter((unit) => getHitPoints(unit) > 1)
      .map((unit) => unit.id);
    for (const unitId of allMultiHpUnits) {
      damageMap[unitId] =
        (persistedDamage[unitId] ?? 0) +
        (attackerDamage[unitId] ?? 0) +
        (defenderDamage[unitId] ?? 0);
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
