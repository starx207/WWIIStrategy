import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  Signal,
} from '@angular/core';
import { Overlay, Map as OlMap, Feature } from 'ol';
import { MapSquadOverlay } from '../map-squad-overlay/map-squad-overlay';
import { TERRITORY_NAMES, TerritoryName } from '../../territories/territory-names';
import { Geometry } from 'ol/geom';
import VectorSource from 'ol/source/Vector';
import { MapSelectors } from '../map-selectors';
import { layoutMapSquadsInGeometry } from '../map-squad-layout';
import { unByKey } from 'ol/Observable';
import { mapTerritoriesLayer } from '../layers/map-territories';

type MapSquadOverlayRef = {
  overlay: Overlay;
  componentRef: ComponentRef<MapSquadOverlay>;
};

type TerritoryFeatureMap = Map<TerritoryName, Feature<Geometry>>;

type TerritoryLayerSource = VectorSource<Feature<Geometry>>;

interface ConnectSquadOverlaysToMapReturn {
  refresh: (squadsByTerritoryName: ReturnType<typeof MapSelectors.squadsByTerritoryName>) => void;
  cleanup: () => void;
}

const clearSquadOverlays = (
  squadOverlayRefs: MapSquadOverlayRef[],
  appRef: ApplicationRef,
  map?: OlMap,
): void => {
  if (map) {
    squadOverlayRefs.forEach(({ overlay }) => map.removeOverlay(overlay));
  }

  squadOverlayRefs.forEach(({ componentRef }) => {
    appRef.detachView(componentRef.hostView);
    componentRef.destroy();
  });
  squadOverlayRefs = [];
};

const updateSquadOverlayScale = (
  squadOverlayRefs: MapSquadOverlayRef[],
  map?: OlMap,
  baseOverlayResolution?: number,
): void => {
  const currentResolution = map?.getView().getResolution();
  if (!baseOverlayResolution || !currentResolution) {
    return;
  }

  const scale = baseOverlayResolution / currentResolution;
  squadOverlayRefs.forEach(({ componentRef }) => {
    componentRef.location.nativeElement.style.setProperty(
      '--map-squad-overlay-scale',
      scale.toString(),
    );
  });
};

const refreshSquadOverlays = (
  squadsByTerritoryName: ReturnType<typeof MapSelectors.squadsByTerritoryName>,
  territoryFeaturesByName: TerritoryFeatureMap,
  squadOverlayRefs: MapSquadOverlayRef[],
  appRef: ApplicationRef,
  environmentInjector: EnvironmentInjector,
  map?: OlMap,
  baseOverlayResolution?: number,
): void => {
  if (!map || territoryFeaturesByName.size === 0) {
    return;
  }

  clearSquadOverlays(squadOverlayRefs, appRef, map);

  for (const [territoryName, squads] of Object.entries(squadsByTerritoryName)) {
    if (squads.length === 0 || !TERRITORY_NAMES.includes(territoryName as TerritoryName)) {
      continue;
    }
    const feature = territoryFeaturesByName.get(territoryName as TerritoryName);
    const geometry = feature?.getGeometry();
    if (!geometry) {
      continue;
    }

    for (const positionedSquad of layoutMapSquadsInGeometry(squads, geometry)) {
      const componentRef = createComponent(MapSquadOverlay, {
        environmentInjector: environmentInjector,
      });
      componentRef.setInput('layout', positionedSquad.layout);
      appRef.attachView(componentRef.hostView);

      const overlay = new Overlay({
        element: componentRef.location.nativeElement,
        position: positionedSquad.coordinate,
        positioning: 'center-center',
        stopEvent: false,
      });

      map.addOverlay(overlay);
      squadOverlayRefs.push({ overlay, componentRef });
    }
  }

  updateSquadOverlayScale(squadOverlayRefs, map, baseOverlayResolution);
};

const refreshTerritoryFeatures = (
  squadsByTerritoryName: Signal<ReturnType<typeof MapSelectors.squadsByTerritoryName>>,
  territoryFeaturesByName: TerritoryFeatureMap,
  squadOverlayRefs: MapSquadOverlayRef[],
  appRef: ApplicationRef,
  environmentInjector: EnvironmentInjector,
  map?: OlMap,
  baseOverlayResolution?: number,
  zoneSource?: TerritoryLayerSource,
): void => {
  const refreshedTerritoryFeatureMap = new Map<TerritoryName, Feature<Geometry>>();
  const features = zoneSource?.getFeatures() ?? [];

  for (const feature of features) {
    const territoryName = feature.get('name') as TerritoryName | undefined;
    const geometry = feature.getGeometry();
    if (typeof territoryName === 'string' && TERRITORY_NAMES.includes(territoryName) && geometry) {
      refreshedTerritoryFeatureMap.set(territoryName, feature);
    }
  }

  territoryFeaturesByName = refreshedTerritoryFeatureMap;
  refreshSquadOverlays(
    squadsByTerritoryName(),
    territoryFeaturesByName,
    squadOverlayRefs,
    appRef,
    environmentInjector,
    map,
    baseOverlayResolution,
  );
};

export const connectSquadOverlaysToMap = (
  map: OlMap,
  territoriesLayer: ReturnType<typeof mapTerritoriesLayer>,
  squadsByTerritoryName: Signal<ReturnType<typeof MapSelectors.squadsByTerritoryName>>,
  appRef: ApplicationRef,
  environmentInjector: EnvironmentInjector,
): ConnectSquadOverlaysToMapReturn => {
  const squadOverlayRefs: MapSquadOverlayRef[] = [];
  const territoryFeaturesByName = new Map<TerritoryName, Feature<Geometry>>();
  const baseOverlayResolution = map.getView().getResolution();
  const sourceKeyEvents = [
    map
      .getView()
      .on('change:resolution', () =>
        updateSquadOverlayScale(squadOverlayRefs, map, baseOverlayResolution),
      ),
  ];

  const territoriesSource = territoriesLayer.getSource();
  if (territoriesSource) {
    sourceKeyEvents.push(
      territoriesSource.on('featuresloadend', () =>
        refreshTerritoryFeatures(
          squadsByTerritoryName,
          territoryFeaturesByName,
          squadOverlayRefs,
          appRef,
          environmentInjector,
          map,
          baseOverlayResolution,
          territoriesSource,
        ),
      ),
    );
  }

  return {
    refresh: (squadsByTerritoryName: ReturnType<typeof MapSelectors.squadsByTerritoryName>) => {
      refreshSquadOverlays(
        squadsByTerritoryName,
        territoryFeaturesByName,
        squadOverlayRefs,
        appRef,
        environmentInjector,
        map,
        baseOverlayResolution,
      );
    },
    cleanup: () => {
      clearSquadOverlays(squadOverlayRefs, appRef, map);
      unByKey(sourceKeyEvents);
    },
  };
};
