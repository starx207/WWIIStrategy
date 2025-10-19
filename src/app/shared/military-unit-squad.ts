import { MilitaryUnit } from './military-unit';
import { Nationality } from './nationality';
import { UnitType } from './unit-type';

export function createSquads(army: MilitaryUnit[]): MilitaryUnitSquad[] {
  const groups: Record<string, MilitaryUnit[]> = {};

  army.forEach((unit) => {
    const groupKey = `${unit.type}-${unit.nationality}`;
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
}
