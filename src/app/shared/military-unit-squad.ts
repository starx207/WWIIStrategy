import { MilitaryUnit } from './military-unit';
import { Nationality } from './nationality';
import { UnitType } from './unit-type';
import { v4 as uuid } from 'uuid';
import { EffectiveUnit } from './effective-unit';
import { isStringArray } from './utility';

export class MilitaryUnitSquad<T extends EffectiveUnit | MilitaryUnit = MilitaryUnit> {
  readonly id: string;

  constructor(
    public units: T[],
    id?: string,
    public displayVariant?: string,
  ) {
    this.id = id ?? uuid();
  }

  get count() {
    return this.units.length;
  }

  get nationality() {
    return this.count == 0 ? Nationality.SOVIET_UNION : this.units[0].nationality;
  }

  get type() {
    return this.count == 0 ? UnitType.INFANTRY : this.units[0].type;
  }

  isSubsetOf(armyOrIds: T[] | string[]): boolean {
    const incomingIds = isStringArray(armyOrIds) ? armyOrIds : armyOrIds.map((a) => a.id);
    const squadIds = this.units.map((u) => u.id);
    return squadIds.every((id) => incomingIds.includes(id));
  }

  intersectsWith(armyOrIds: T[] | string[]): boolean {
    const incomingIds = isStringArray(armyOrIds) ? armyOrIds : armyOrIds.map((a) => a.id);
    const squadIds = this.units.map((u) => u.id);
    return squadIds.some((id) => incomingIds.includes(id));
  }
}
