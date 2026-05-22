import { createSelector, Selector } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { Nationality } from '@ww2/shared/nationality';
import { LandTerritoryName, MapState, MapStateModel, TerritoryName } from './map-state';

type SquadGroups = Record<string, MilitaryUnit[]>;

export class MapSelectors {
  @Selector([MapState])
  static unitsByTerritoryName(state: MapStateModel) {
    return state.unitsByTerritoryName;
  }

  static unitsInTerritory(territoryName: TerritoryName) {
    return createSelector([MapState], (state: MapStateModel) => {
      return state.unitsByTerritoryName[territoryName] ?? [];
    });
  }

  @Selector([MapState])
  static allUnits(state: MapStateModel) {
    return Object.values(state.unitsByTerritoryName).flatMap((units) => units ?? []);
  }

  @Selector([MapState])
  static squadsByTerritoryName(
    state: MapStateModel,
  ): Record<TerritoryName, MilitaryUnitSquad<MilitaryUnit>[]> {
    return Object.fromEntries(
      Object.entries(state.unitsByTerritoryName)
        .map(([territoryName, units]) => [
          territoryName,
          createMapSquads(territoryName, units ?? []),
        ])
        .filter(([, squads]) => squads.length > 0),
    ) as Record<TerritoryName, MilitaryUnitSquad<MilitaryUnit>[]>;
  }

  @Selector([MapState])
  static landTerritoryControllerByName(state: MapStateModel) {
    return state.landTerritoryControllerByName;
  }

  static controllerForLandTerritory(territoryName: LandTerritoryName) {
    return createSelector([MapState], (state: MapStateModel): Nationality | undefined => {
      return state.landTerritoryControllerByName[territoryName];
    });
  }
}

function createMapSquads(
  territoryName: TerritoryName,
  units: MilitaryUnit[],
): MilitaryUnitSquad<MilitaryUnit>[] {
  const groups = units.reduce<SquadGroups>((currentGroups, unit) => {
    const groupKey = `${unit.nationality}|${unit.type}`;
    currentGroups[groupKey] = [...(currentGroups[groupKey] ?? []), unit];
    return currentGroups;
  }, {});

  return Object.entries(groups)
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
    .map(([groupKey, squadUnits]) => {
      const [nationality, unitType] = groupKey.split('|');
      return new MilitaryUnitSquad(
        squadUnits,
        `map-squad|${territoryName}|${nationality}|${unitType}`,
      );
    });
}
