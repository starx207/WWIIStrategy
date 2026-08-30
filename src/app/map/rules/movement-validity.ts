import { MilitaryUnit } from '@ww2/shared/military-unit';
import { EffectiveMapUnit } from '../effective-map-unit';
import { SquadMovementPlan } from '../map-state';
import { LandTerritoryName, TerritoryName } from '../../territories/territory-names';
import { NATION_ALLIANCE, Nationality } from '@ww2/shared/nationality';
import { AIR_UNIT_TYPES, SEA_UNIT_TYPES } from '@ww2/shared/unit-type';
import { TurnPhase } from '@ww2/game/turn-phase';

type IsMovementPlanValidParams = {
  unit: MilitaryUnit | EffectiveMapUnit;
  plan: SquadMovementPlan;
  unitsByTerritoryName: Partial<Record<TerritoryName, MilitaryUnit[]>>;
  landTerritoryControllerByName: Record<LandTerritoryName, Nationality>;
};

const isValidSeaMovement = ({
  unit,
  plan,
  unitsByTerritoryName,
  landTerritoryControllerByName,
}: IsMovementPlanValidParams): boolean => {
  if (plan.phase === TurnPhase.NON_COMBAT_MOVEMENT) {
    return !plan.path.some((step) => step.combatType !== 'none');
  }

  // Determine the alligience of the units in the destination territory.
  const lastTerritory = plan.path[plan.path.length - 1].territoryName;
  const lastTerritoryUnits = unitsByTerritoryName[lastTerritory] ?? [];
  const lastTerritoryAlligience = lastTerritoryUnits.map(
    (territoryUnit) => NATION_ALLIANCE[territoryUnit.nationality],
  );

  // Valid combat move if any units in the territory are enemies of the moving unit.
  const unitAlligience = NATION_ALLIANCE[unit.nationality];
  return lastTerritoryAlligience.some(
    (territoryAlligience) => territoryAlligience !== unitAlligience,
  );
};

const isValidLandMovement = ({
  unit,
  plan,
  unitsByTerritoryName,
  landTerritoryControllerByName,
}: IsMovementPlanValidParams): boolean => {
  const unitAlligience = NATION_ALLIANCE[unit.nationality];

  if (plan.phase === TurnPhase.COMBAT_MOVEMENT) {
    const destinationTerritory = plan.path[plan.path.length - 1].territoryName as LandTerritoryName;
    const destinationControlledBy =
      NATION_ALLIANCE[landTerritoryControllerByName[destinationTerritory]];

    return destinationControlledBy !== unitAlligience;
  }

  const planTerritoriesControlledBy = plan.path
    .map((step) => step.territoryName as LandTerritoryName)
    .map((territoryName) => landTerritoryControllerByName[territoryName])
    .map((controlledBy) => NATION_ALLIANCE[controlledBy]);

  return !planTerritoriesControlledBy.some((x) => x !== unitAlligience);
};

const isValidAirMovement = ({
  unit,
  plan,
  unitsByTerritoryName,
  landTerritoryControllerByName,
}: IsMovementPlanValidParams): boolean => {
  const destinationTerritory = plan.path[plan.path.length - 1].territoryName as LandTerritoryName;
  const destinationAlligience =
    NATION_ALLIANCE[landTerritoryControllerByName[destinationTerritory]];

  if (destinationAlligience != NATION_ALLIANCE[unit.nationality]) {
    // Aircraft must land in friendly territory
    return false;
  }

  if (plan.phase === TurnPhase.NON_COMBAT_MOVEMENT) {
    return true; // Aircraft can fly over enemy territory in any phase
  }

  const flightPathContainsCombat = plan.path.some((step) => step.combatType === 'combat');
  return flightPathContainsCombat;
};

export const isMovementPlanValid = ({
  unit,
  plan,
  unitsByTerritoryName,
  landTerritoryControllerByName,
}: IsMovementPlanValidParams): boolean => {
  if (plan.path.length === 0) {
    return true;
  }

  const unitType = unit.type;
  if (AIR_UNIT_TYPES.includes(unitType)) {
    return isValidAirMovement({
      unit,
      plan,
      unitsByTerritoryName,
      landTerritoryControllerByName,
    });
  } else if (SEA_UNIT_TYPES.includes(unitType)) {
    return isValidSeaMovement({
      unit,
      plan,
      unitsByTerritoryName,
      landTerritoryControllerByName,
    });
  } else {
    return isValidLandMovement({
      unit,
      plan,
      unitsByTerritoryName,
      landTerritoryControllerByName,
    });
  }
};
