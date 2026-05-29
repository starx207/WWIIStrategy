import { Selector } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { MapState, MapStateModel } from './map-state';
import { TerritoryName } from '../territories/territory-names';
import { calculatePossibleDestinations } from './rules/movement-calculator';
import { createResolvedRuleContext } from './rule-context.factory';
import { RuleState } from '@ww2/settings/settings-state';
import { SettingsSelectors } from '@ww2/settings/settings-selectors';

type SquadGroups = Record<string, MilitaryUnit[]>;

export class MapSelectors {
  @Selector([MapState])
  static squadsByTerritoryName(
    state: MapStateModel,
  ): Record<TerritoryName, MilitaryUnitSquad<MilitaryUnit>[]> {
    return Object.fromEntries(
      Object.entries(state.unitsByTerritoryName)
        .map(([territoryName, units]) => [
          territoryName,
          createMapSquads(territoryName as TerritoryName, units ?? []),
        ])
        .filter(([, squads]) => squads.length > 0),
    ) as Record<TerritoryName, MilitaryUnitSquad<MilitaryUnit>[]>;
  }

  @Selector([MapState, SettingsSelectors.rules])
  static selectedSquadRange(state: MapStateModel, rulesState: RuleState): TerritoryName[] {
    const selectedSquad = state.selectedSquad;
    if (!selectedSquad || selectedSquad.unitIds.length === 0) {
      return [];
    }

    const { territoryName, unit } = findTerritoryForUnitId(state, selectedSquad.unitIds[0]);
    if (!territoryName || !unit) {
      return [];
    }

    return calculatePossibleDestinations(
      unit,
      territoryName,
      createResolvedRuleContext(state, rulesState),
    );
  }
}

function findTerritoryForUnitId(
  state: MapStateModel,
  unitId: string,
): { territoryName?: TerritoryName; unit?: MilitaryUnit } {
  for (const [territoryName, units] of Object.entries(state.unitsByTerritoryName)) {
    if (!units) {
      continue;
    }
    const foundUnit = units.find((unit) => unit.id === unitId);
    if (foundUnit) {
      return { territoryName: territoryName as TerritoryName, unit: foundUnit };
    }
  }
  return {};
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
