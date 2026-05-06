import { getHitPoints } from './effective-unit';
import { MilitaryUnit } from './military-unit';
import { TargetKind } from './unit-profile';
import {
  AIR_UNIT_TYPES,
  NEUTRAL_UNIT_TYPES,
  SEA_UNIT_TYPES,
  UnitType,
} from './unit-type';

export type HitPool = Partial<Record<TargetKind, number>>;

export function createEmptyHitPool(): HitPool {
  return {};
}

export function totalHitPool(pool: HitPool): number {
  return Object.values(pool).reduce((total, hits) => total + (hits ?? 0), 0);
}

export function addHitsToPool(pool: HitPool, targetKind: TargetKind, hitCount: number): HitPool {
  if (hitCount <= 0) {
    return { ...pool };
  }

  return {
    ...pool,
    [targetKind]: (pool[targetKind] ?? 0) + hitCount,
  };
}

export function subtractHitFromPool(pool: HitPool, targetKind: TargetKind): HitPool {
  const currentHits = pool[targetKind] ?? 0;
  if (currentHits <= 0) {
    return { ...pool };
  }

  const nextPool = { ...pool };
  if (currentHits === 1) {
    delete nextPool[targetKind];
  } else {
    nextPool[targetKind] = currentHits - 1;
  }
  return nextPool;
}

export function unitMatchesTargetKind(unit: MilitaryUnit, targetKind: TargetKind): boolean {
  switch (targetKind) {
    case 'unit':
      return !NEUTRAL_UNIT_TYPES.includes(unit.type);
    case 'air-unit':
      return AIR_UNIT_TYPES.includes(unit.type);
    case 'sea-unit':
      return SEA_UNIT_TYPES.includes(unit.type);
    case 'factory':
      return unit.type === UnitType.FACTORY;
  }
}

export function targetKindPriorityForUnit(unit: MilitaryUnit): TargetKind[] {
  const targetKinds: TargetKind[] = [];
  if (unitMatchesTargetKind(unit, 'air-unit')) {
    targetKinds.push('air-unit');
  }
  if (unitMatchesTargetKind(unit, 'sea-unit')) {
    targetKinds.push('sea-unit');
  }
  if (unitMatchesTargetKind(unit, 'factory')) {
    targetKinds.push('factory');
  }

  if (unitMatchesTargetKind(unit, 'unit')) {
    targetKinds.push('unit');
  }
  return targetKinds;
}

export function consumeHitForUnit(pool: HitPool, unit: MilitaryUnit): HitPool | undefined {
  for (const targetKind of targetKindPriorityForUnit(unit)) {
    if ((pool[targetKind] ?? 0) > 0) {
      return subtractHitFromPool(pool, targetKind);
    }
  }

  return undefined;
}

export function unitCanConsumeHit(pool: HitPool, unit: MilitaryUnit): boolean {
  return consumeHitForUnit(pool, unit) !== undefined;
}

export function totalRemainingHitCapacityForTargetKind(
  units: MilitaryUnit[],
  damageById: Record<string, number>,
  targetKind: TargetKind,
): number {
  return units
    .filter((unit) => unitMatchesTargetKind(unit, targetKind))
    .reduce((total, unit) => {
      return total + Math.max(0, getHitPoints(unit) - (damageById[unit.id] ?? 0));
    }, 0);
}
