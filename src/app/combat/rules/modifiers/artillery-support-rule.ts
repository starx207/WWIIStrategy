import { UnitType } from '@ww2/shared/unit-type';
import { UnitRuleModifier } from '../unit-rule';

export const artillerySupportRule: UnitRuleModifier = (effectiveUnit, context) => {
  if (effectiveUnit.type !== UnitType.INFANTRY || context.role !== 'attack') {
    return effectiveUnit;
  }

  const artilleryCount = context.attackingArmy.filter(
    (unit) => unit.type === UnitType.ARTILLERY && unit.nationality === effectiveUnit.nationality,
  ).length;
  if (artilleryCount === 0) {
    return effectiveUnit;
  }

  const eligibleInfantry = context.attackingArmy
    .filter(
      (unit) => unit.type === UnitType.INFANTRY && unit.nationality === effectiveUnit.nationality,
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((unit) => unit.id)
    .slice(0, artilleryCount);

  if (eligibleInfantry.includes(effectiveUnit.id)) {
    const profile = effectiveUnit.combatProfiles.find(
      (p) => p.id === 'standard-combat' && p.role === 'attack',
    );
    if (profile) {
      profile.target += 1;
    }
  }
  return effectiveUnit;
};
