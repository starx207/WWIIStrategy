import { AIR_UNIT_TYPES, UnitType } from '@ww2/shared/unit-type';
import { UnitRuleModifier } from '../unit-rule';

export const aaGunShotsRule: UnitRuleModifier = (effectiveUnit, context) => {
  if (context.role !== 'defend' || effectiveUnit.type !== UnitType.ANTI_AIR_GUN) {
    return effectiveUnit;
  }

  const enemyAircraftCount = context.attackingArmy.filter((unit) =>
    AIR_UNIT_TYPES.includes(unit.type),
  ).length;
  if (enemyAircraftCount === 0) {
    return effectiveUnit;
  }

  // Only 1 AA gun may fire in a given round. So the first 1 will get 1 shot per aircraft, the rest will get 0 shots.
  const allAAGuns = context.defendingArmy
    .filter((unit) => unit.type === UnitType.ANTI_AIR_GUN)
    .sort((a, b) => a.id.localeCompare(b.id));
  const profile = effectiveUnit.combatProfiles.find((p) => p.id === 'standard-combat');
  if (profile) {
    profile.shotsPerRound = allAAGuns[0].id === effectiveUnit.id ? enemyAircraftCount : 0;
  }
  return effectiveUnit;
};
