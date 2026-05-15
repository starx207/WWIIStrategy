import { CombatPhase } from '@ww2/combat/combat-phase';
import { UnitType } from '@ww2/shared/unit-type';
import { UnitRuleModifier } from '../unit-rule';

export const subVsDestroyerRule: UnitRuleModifier = (effectiveUnit, context) => {
  if (effectiveUnit.type !== UnitType.SUBMARINE) {
    return effectiveUnit;
  }

  const opposingArmy = context.role === 'attack' ? context.defendingArmy : context.attackingArmy;
  const hasDestroyer = opposingArmy.some((unit) => unit.type === UnitType.DESTROYER);
  if (hasDestroyer) {
    effectiveUnit.combatProfiles.forEach((profile) => {
      if (profile.id === 'standard-combat') {
        profile.casualtyClearPhases = [CombatPhase.COMBAT_CASUALTIES];
      }
    });
  }
  return effectiveUnit;
};
