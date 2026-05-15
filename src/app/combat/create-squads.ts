import { MilitaryUnit } from '@ww2/shared/military-unit';
import { EffectiveCombatUnit, isEffectiveCombatUnit } from './effective-combat-unit';
import { RuleContext } from './rule-context';
import { MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { isString } from '@ww2/shared/utility';
import { getHitPoints } from './effective-combat-unit.reducer';

export interface CreateSquadOptions {
  separateUnits?: EffectiveCombatUnit[] | MilitaryUnit[] | string[];
  damageMap?: Record<string, number>;
  ruleContext?: RuleContext;
}

interface RequiredContextCreateSquadOptions extends CreateSquadOptions {
  ruleContext: RuleContext;
}

export function createSquads(
  army: MilitaryUnit[],
  options: RequiredContextCreateSquadOptions,
): MilitaryUnitSquad<MilitaryUnit>[];
export function createSquads(
  army: EffectiveCombatUnit[],
  options?: CreateSquadOptions,
): MilitaryUnitSquad<EffectiveCombatUnit>[];
export function createSquads<T extends EffectiveCombatUnit | MilitaryUnit = MilitaryUnit>(
  army: T[],
  options?: CreateSquadOptions,
): MilitaryUnitSquad<T>[] {
  const groups: Record<string, (T & { displayVariant: string | undefined })[]> = {};
  const separatePrefix = options?.separateUnits !== undefined;
  const separateUnitIds = options?.separateUnits?.map((u) => (isString(u) ? u : u.id));

  army.forEach((unit) => {
    // This "prefix" logic is to separate the grouping of units if some have fired in the current combat round and some have not
    const prefix = separatePrefix && separateUnitIds?.includes(unit.id) ? 'g2' : 'g1';
    const damage = options?.damageMap?.[unit.id] ?? 0;
    const hitPoints = isEffectiveCombatUnit(unit)
      ? getHitPoints(unit)
      : getHitPoints(unit, options!.ruleContext!);
    const damageIndicator =
      damage > 0 && damage < hitPoints ? `-hp-${hitPoints - damage}` : undefined;
    const groupKey = `${prefix}-${unit.type}-${unit.nationality}${damageIndicator ?? ''}`;
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push({ ...unit, displayVariant: damageIndicator });
  });

  const squads = Object.entries(groups).map(
    ([key, units]) => new MilitaryUnitSquad(units, key, units[0].displayVariant),
  );
  return squads;
}
