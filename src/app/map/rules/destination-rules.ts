import { MilitaryUnit } from '@ww2/shared/military-unit';
import { TerritoryName } from '../../territories/territory-names';
import { SquadMovementStepCombatType } from '../map-state';
import { AIR_UNIT_TYPES, UnitType } from '@ww2/shared/unit-type';
import { NATION_ALLIANCE } from '@ww2/shared/nationality';

type DetermineMovementStepCombatTypeParams = {
  unit: MilitaryUnit;
  territory: TerritoryName;
  unitsByTerritoryName: Partial<Record<TerritoryName, MilitaryUnit[]>>;
};

export const determineMovementStepCombatType = ({
  unit,
  territory,
  unitsByTerritoryName,
}: DetermineMovementStepCombatTypeParams): SquadMovementStepCombatType => {
  const occupyingUnits = unitsByTerritoryName[territory] ?? [];
  if (occupyingUnits.length === 0) {
    return 'none';
  }

  const occupyingAlliance = NATION_ALLIANCE[occupyingUnits[0].nationality];
  const unitAlliance = NATION_ALLIANCE[unit.nationality];

  if (occupyingAlliance === unitAlliance) {
    return 'none';
  }

  if ([...AIR_UNIT_TYPES].includes(unit.type)) {
    const hasAAInstallation = occupyingUnits.some((u) => u.type === UnitType.ANTI_AIR_GUN);
    return hasAAInstallation ? 'under-fire' : 'none';
  }

  return 'combat';
};

type TerritoryEnemyParams = {
  unit: MilitaryUnit;
  territory: TerritoryName;
  unitsByTerritoryName: Partial<Record<TerritoryName, MilitaryUnit[]>>;
};

/**
 * True when the territory holds an enemy (opposing-alliance) unit that is not an AA gun — i.e. a
 * unit an aircraft could choose to engage in combat. AA-only, empty, and friendly territories are
 * not engageable.
 */
export const territoryHasEngageableEnemy = ({
  unit,
  territory,
  unitsByTerritoryName,
}: TerritoryEnemyParams): boolean => {
  const unitAlliance = NATION_ALLIANCE[unit.nationality];
  return (unitsByTerritoryName[territory] ?? []).some(
    (u) => NATION_ALLIANCE[u.nationality] !== unitAlliance && u.type !== UnitType.ANTI_AIR_GUN,
  );
};

type DetermineAircraftPathCombatTypesParams = {
  unit: MilitaryUnit;
  territories: TerritoryName[];
  unitsByTerritoryName: Partial<Record<TerritoryName, MilitaryUnit[]>>;
  // When set to a valid, engageable step index, that step becomes the combat engagement instead
  // of the auto "last engageable enemy" pick (the player manually chose it).
  preferredCombatIndex?: number;
};

/**
 * Aircraft only engage in combat at a single destination, not while flying over
 * enemy territory en route to their combat destination. So across the whole planned path,
 * the LAST step whose territory holds enemy (non-AA) units is the combat engagement;
 * every other step is a fly-over that is 'under-fire' when enemy AA is present, otherwise 'none'.
 * A valid `preferredCombatIndex` overrides that auto pick.
 */
export const determineAircraftPathCombatTypes = ({
  unit,
  territories,
  unitsByTerritoryName,
  preferredCombatIndex,
}: DetermineAircraftPathCombatTypesParams): SquadMovementStepCombatType[] => {
  const unitAlliance = NATION_ALLIANCE[unit.nationality];

  const stepEnemyPresence = territories.map((territory) => ({
    hasEnemyNonAA: territoryHasEngageableEnemy({ unit, territory, unitsByTerritoryName }),
    hasAA: (unitsByTerritoryName[territory] ?? []).some(
      (u) => NATION_ALLIANCE[u.nationality] !== unitAlliance && u.type === UnitType.ANTI_AIR_GUN,
    ),
  }));

  let combatIndex = -1;
  stepEnemyPresence.forEach((presence, index) => {
    if (presence.hasEnemyNonAA) {
      combatIndex = index;
    }
  });

  if (
    preferredCombatIndex !== undefined &&
    preferredCombatIndex >= 0 &&
    stepEnemyPresence[preferredCombatIndex]?.hasEnemyNonAA
  ) {
    combatIndex = preferredCombatIndex;
  }

  return stepEnemyPresence.map((presence, index) => {
    if (index === combatIndex) {
      return 'combat';
    }
    return presence.hasAA ? 'under-fire' : 'none';
  });
};
