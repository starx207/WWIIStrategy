import { MilitaryUnit } from './military-unit';
import { Nationality } from './nationality';
import { UnitType } from './unit-type';
import { v4 as uuid } from 'uuid';

export interface CreateSquadOptions {
  separateUnits?: MilitaryUnit[];
}

export function createSquads(
  army: MilitaryUnit[],
  options?: CreateSquadOptions
): MilitaryUnitSquad[] {
  const groups: Record<string, MilitaryUnit[]> = {};
  const separatePrefix = options?.separateUnits !== undefined;

  army.forEach((unit) => {
    // This "prefix" logic is to separate the grouping of units if some have fired in the current combat round and some have not
    const prefix = separatePrefix && options.separateUnits?.includes(unit) ? 'g2' : 'g1';
    const groupKey = `${prefix}-${unit.type}-${unit.nationality}`;
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(unit);
  });

  const squads = Object.entries(groups).map(([key, units]) => new MilitaryUnitSquad(units, key));
  return squads;
}

export class MilitaryUnitSquad {
  readonly id: string;

  constructor(public units: MilitaryUnit[], id?: string) {
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

  isSubsetOf(armyOrIds: MilitaryUnit[] | string[]): boolean {
    if (this.isStringArray(armyOrIds)) {
      return this.units.every((unit) => armyOrIds.includes(unit.id));
    } else {
      return this.units.every((unit) => armyOrIds.includes(unit));
    }
  }

  intersectsWith(armyOrIds: MilitaryUnit[] | string[]): boolean {
    if (this.isStringArray(armyOrIds)) {
      return this.units.some((unit) => armyOrIds.includes(unit.id));
    } else {
      return this.units.some((unit) => armyOrIds.includes(unit));
    }
  }

  private isStringArray(arr: MilitaryUnit[] | string[]): arr is string[] {
    return arr.length > 0 && typeof arr[0] === 'string';
  }
}
