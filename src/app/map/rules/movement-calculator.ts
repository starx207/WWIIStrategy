import { MilitaryUnit } from '@ww2/shared/military-unit';
import { EffectiveMapUnit, isEffectiveMapUnit } from '../effective-map-unit';
import { LandTerritoryName, TerritoryName } from '../../territories/territory-names';
import { TERRITORY_INFO_BY_NAME } from '../../territories/territory-info';
import { RuleContext } from '../rule-context';
import { ADJACENT_TERRITORIES_BY_NAME } from '../../territories/territory-adjacency';
import {
  AIR_UNIT_TYPES,
  LAND_UNIT_TYPES,
  NEUTRAL_UNIT_TYPES,
  SEA_UNIT_TYPES,
  UnitType,
} from '@ww2/shared/unit-type';
import { Alliance, NATION_ALLIANCE } from '@ww2/shared/nationality';
import { TurnPhase } from '@ww2/game/turn-phase';
import { SquadMovementPlan } from '../map-state';
import { getMaxMovement } from '../effective-map-unit.reducer';

const distanceToClosestAirfield = (
  startingTerritory: TerritoryName,
  requiredAlliance: Alliance,
  context: RuleContext,
): number => {
  const visited = new Set<TerritoryName>();
  let distance = 0;
  const territoriesToVisit = [startingTerritory];

  while (territoriesToVisit.length > 0) {
    const nextTerritories: TerritoryName[] = [];

    for (const territory of territoriesToVisit) {
      if (visited.has(territory)) {
        continue;
      }
      visited.add(territory);

      const territoryInfo = TERRITORY_INFO_BY_NAME[territory];
      if (territoryInfo.kind === 'sea') {
        // TODO: will also need to implement the aircraft carrier rule later on. First need to implement the concept of
        //       some units acting as "cargo" for other units. Once implemented, friendly(? or same nationality) aircraft carriers are considered
        //       valid airfields (if they're not at capacity) if they are within range of the target territory (based on the carrier's remaining movement)
      } else {
        // Land territories are considered airfields if they're controlled by the unit's allies.
        const territoryAlliance =
          NATION_ALLIANCE[context.landControlMap[territory as LandTerritoryName]!];

        if (territoryAlliance === requiredAlliance) {
          return distance;
        }
      }
      nextTerritories.push(
        ...ADJACENT_TERRITORIES_BY_NAME[territory].filter((neighbor) => !visited.has(neighbor)),
      );
    }

    territoriesToVisit.length = 0;
    territoriesToVisit.push(...nextTerritories);
    distance++;
  }

  throw new Error(`No reachable airfields found from territory ${startingTerritory}`);
};

const isValidDestination = (
  unit: MilitaryUnit | EffectiveMapUnit,
  territory: TerritoryName,
  remainingMovement: number,
  context: RuleContext,
): boolean => {
  const unitType = unit.type;
  const territoryInfo = TERRITORY_INFO_BY_NAME[territory];

  // Land units cannot travel by sea
  if (
    [...LAND_UNIT_TYPES, ...NEUTRAL_UNIT_TYPES].includes(unitType) &&
    territoryInfo.kind === 'sea'
  ) {
    return false;
  }

  // Sea units cannot travel by land
  if (SEA_UNIT_TYPES.includes(unitType) && territoryInfo.kind === 'land') {
    return false;
  }

  // Determine who currently controls the territory.
  // Land territories can be controlled with no units present.
  // Sea territories are only controlled if they have units present.
  const territoryNationality =
    territoryInfo.kind === 'land'
      ? context.landControlMap[territory as LandTerritoryName]
      : context.unitsByTerritory[territory]?.[0]?.nationality;

  const unitAlliance = NATION_ALLIANCE[unit.nationality];
  const territoryAlliance = territoryNationality
    ? NATION_ALLIANCE[territoryNationality]
    : unitAlliance;

  // Land & Sea units cannot enter enemy territory during non-combat moves
  if (
    context.turnPhase === TurnPhase.NON_COMBAT_MOVEMENT &&
    unitAlliance !== territoryAlliance &&
    ![...AIR_UNIT_TYPES].includes(unitType)
  ) {
    return false;
  }

  // Aircraft movement restrictions
  if ([...AIR_UNIT_TYPES].includes(unitType)) {
    // Planes must stay within range of a friendly airfield
    const closestAirfieldDistance = distanceToClosestAirfield(territory, unitAlliance, context);
    // -1 to account for the cost of moving to the new territory, since the plane will need to be within range of an airfield after the move is complete.
    if (closestAirfieldDistance > remainingMovement - 1) {
      return false;
    }
  }

  return true;
};

export const calculateAdjacentDestinations = (
  unit: MilitaryUnit | EffectiveMapUnit,
  movement: SquadMovementPlan | undefined,
  context: RuleContext,
): TerritoryName[] => {
  if (!movement) {
    return [];
  }

  const maxMovement = isEffectiveMapUnit(unit)
    ? getMaxMovement(unit)
    : getMaxMovement(unit, context);

  const remainingMovement = maxMovement - movement.path.length;

  if (remainingMovement <= 0) {
    return [];
  }

  const currentTerritory = movement.path.at(-1)?.territoryName ?? movement.startingTerritoryName;

  return (ADJACENT_TERRITORIES_BY_NAME[currentTerritory] ?? []).filter((neighbor) =>
    isValidDestination(unit, neighbor, remainingMovement, context),
  );
};
