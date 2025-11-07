import { MilitaryUnit } from './military-unit';
import { Nationality } from './nationality';
import { UnitType } from './unit-type';

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

  const squads = Object.values(groups).map((units) => new MilitaryUnitSquad(units));
  return squads;
}

export class MilitaryUnitSquad {
  constructor(public units: MilitaryUnit[]) {}

  get count() {
    return this.units.length;
  }

  get nationality() {
    return this.count == 0 ? Nationality.SOVIET_UNION : this.units[0].nationality;
  }

  get type() {
    return this.count == 0 ? UnitType.INFANTRY : this.units[0].type;
  }

  isSubsetOf(army: MilitaryUnit[]): boolean {
    return this.units.every((unit) => army.includes(unit));
  }
}
