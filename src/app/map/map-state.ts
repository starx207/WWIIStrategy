import { Injectable } from '@angular/core';
import { State } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { Nationality } from '@ww2/shared/nationality';
import {
  INITIAL_LAND_TERRITORY_CONTROL,
  INITIAL_UNITS_BY_TERRITORY_NAME,
} from './initial-map-layout';
import { LandTerritoryName, TerritoryName } from '../territories/territory-names';

export interface MapStateModel {
  unitsByTerritoryName: Partial<Record<TerritoryName, MilitaryUnit[]>>;
  landTerritoryControllerByName: Record<LandTerritoryName, Nationality>;
}

const DEFAULT_STATE: MapStateModel = {
  unitsByTerritoryName: INITIAL_UNITS_BY_TERRITORY_NAME,
  landTerritoryControllerByName: INITIAL_LAND_TERRITORY_CONTROL,
};

@State<MapStateModel>({
  name: 'map',
  defaults: DEFAULT_STATE,
})
@Injectable()
export class MapState {}
