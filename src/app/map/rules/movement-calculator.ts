import { MilitaryUnit } from '@ww2/shared/military-unit';
import { EffectiveMapUnit, isEffectiveMapUnit } from '../effective-map-unit';
import { TerritoryName } from '../../territories/territory-names';
import { TERRITORY_INFO_BY_NAME } from '../../territories/territory-info';
import { getMaxMovement, resolveRuleContext } from '../effective-map-unit.reducer';
import { RuleContext } from '../rule-context';
import { ADJACENT_TERRITORIES_BY_NAME } from '../../territories/territory-adjacency';
import { LAND_UNIT_TYPES, NEUTRAL_UNIT_TYPES, SEA_UNIT_TYPES } from '@ww2/shared/unit-type';

const isValidDestination = (
  unit: MilitaryUnit | EffectiveMapUnit,
  territory: TerritoryName,
  context: RuleContext,
): boolean => {
  const unitType = unit.type;
  const territoryInfo = TERRITORY_INFO_BY_NAME[territory];

  if (
    [...LAND_UNIT_TYPES, ...NEUTRAL_UNIT_TYPES].includes(unitType) &&
    territoryInfo.kind === 'sea'
  ) {
    return false;
  }
  if (SEA_UNIT_TYPES.includes(unitType) && territoryInfo.kind === 'land') {
    return false;
  }
  return true;
};

export const calculatePossibleDestinations: {
  (unit: MilitaryUnit, startingFrom: TerritoryName, context: RuleContext): TerritoryName[];
  (unit: EffectiveMapUnit, startingFrom: TerritoryName): TerritoryName[];
} = (
  unit: MilitaryUnit | EffectiveMapUnit,
  startingFrom: TerritoryName,
  context?: RuleContext,
): TerritoryName[] => {
  const resolvedContext = resolveRuleContext(context);
  const maxDistance = isEffectiveMapUnit(unit)
    ? getMaxMovement(unit)
    : getMaxMovement(unit, resolvedContext);

  const visited = new Set<TerritoryName>([startingFrom]);
  const nDistanceNeighbors: Record<number, TerritoryName[]> = {
    0: [startingFrom],
  };
  for (let i = 0; i < maxDistance; i++) {
    for (const territory of nDistanceNeighbors[i]) {
      const neighbors = (ADJACENT_TERRITORIES_BY_NAME[territory] ?? [])
        .filter((neighbor) => !visited.has(neighbor))
        .filter((neighbor) => isValidDestination(unit, neighbor, resolvedContext));
      if (neighbors.length === 0) {
        continue;
      }
      nDistanceNeighbors[i + 1] = [...neighbors, ...(nDistanceNeighbors[i + 1] ?? [])];
      neighbors.forEach((neighbor) => visited.add(neighbor));
    }

    if (nDistanceNeighbors[i + 1] === undefined) {
      break; // No more neighbors to visit
    }
  }

  return [...visited].filter((territory) => territory !== startingFrom);
};
