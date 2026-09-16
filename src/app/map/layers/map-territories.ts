import GeoJSON from 'ol/format/GeoJSON';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { mapProjection } from '../map-config';
import Style from 'ol/style/Style';
import { Fill, Stroke } from 'ol/style';
import Feature, { FeatureLike } from 'ol/Feature';
import { EnvironmentInjector, Signal } from '@angular/core';
import { Geometry } from 'ol/geom';
import { combineLatest, Subscription } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

const landZoneStyle = new Style({
  fill: new Fill({ color: 'transparent' }),
  stroke: new Stroke({ color: 'transparent' }),
});

const seaZoneStyle = new Style({
  fill: new Fill({ color: 'transparent' }),
  stroke: new Stroke({
    color: 'transparent',
  }),
});

const selectedZoneStyle = new Style({
  fill: new Fill({ color: 'rgba(255, 232, 85, 0.24)' }),
  stroke: new Stroke({ color: 'rgba(255, 232, 85, 1)', width: 3 }),
});

const movementCandidateZoneStyle = new Style({
  fill: new Fill({ color: 'rgba(70, 160, 255, 0.2)' }),
  stroke: new Stroke({ color: 'rgba(70, 160, 255, 0.95)', width: 3 }),
});

const movementCurrentZoneStyle = new Style({
  fill: new Fill({ color: 'rgba(72, 190, 135, 0.2)' }),
  stroke: new Stroke({ color: 'rgba(72, 190, 135, 0.95)', width: 3 }),
});

const placementCandidateZoneStyle = new Style({
  fill: new Fill({ color: 'rgba(200, 162, 74, 0.22)' }),
  stroke: new Stroke({ color: 'rgba(200, 162, 74, 0.95)', width: 3 }),
});

const placementFullZoneStyle = new Style({
  fill: new Fill({ color: 'rgba(200, 50, 40, 0.22)' }),
  stroke: new Stroke({ color: 'rgba(200, 50, 40, 0.95)', width: 3 }),
});

// Amphibious logistics cues, kept distinct from the movement blue/green: teal = a sea zone a land
// squad can load onto; violet = a coast a loaded transport can unload onto.
const loadTargetZoneStyle = new Style({
  fill: new Fill({ color: 'rgba(64, 196, 200, 0.22)' }),
  stroke: new Stroke({ color: 'rgba(64, 196, 200, 0.95)', width: 3 }),
});

const unloadTargetZoneStyle = new Style({
  fill: new Fill({ color: 'rgba(150, 110, 210, 0.24)' }),
  stroke: new Stroke({ color: 'rgba(150, 110, 210, 0.95)', width: 3 }),
});

export type TerritoryLayer = VectorLayer<VectorSource<Feature<Geometry>>, Feature<Geometry>>;

export type TerritoryStyleId =
  | 'land'
  | 'sea'
  | 'selected'
  | 'movement-candidate'
  | 'movement-current'
  | 'placement-candidate'
  | 'placement-full'
  | 'load-target'
  | 'unload-target';

export type TerritoryLayerOptions = {
  stylePicker: (feature: FeatureLike) => TerritoryStyleId;
  injector: EnvironmentInjector;
  styleRefreshTriggers?: Signal<unknown>[];
};

export type TerritoryLayerReturn = {
  layer: TerritoryLayer;
  cleanup: () => void;
};

export const mapTerritoriesLayer = ({
  stylePicker,
  styleRefreshTriggers,
  injector,
}: TerritoryLayerOptions): TerritoryLayerReturn => {
  const zoneStyle = (feature: FeatureLike): Style => {
    const styleId = stylePicker(feature);

    switch (styleId) {
      case 'land':
        return landZoneStyle;
      case 'sea':
        return seaZoneStyle;
      case 'selected':
        return selectedZoneStyle;
      case 'movement-candidate':
        return movementCandidateZoneStyle;
      case 'movement-current':
        return movementCurrentZoneStyle;
      case 'placement-candidate':
        return placementCandidateZoneStyle;
      case 'placement-full':
        return placementFullZoneStyle;
      case 'load-target':
        return loadTargetZoneStyle;
      case 'unload-target':
        return unloadTargetZoneStyle;
      default:
        return landZoneStyle;
    }
  };

  const layer = new VectorLayer({
    source: new VectorSource({
      url: 'data/board-zones.geojson',
      format: new GeoJSON({
        dataProjection: mapProjection,
        featureProjection: mapProjection,
      }),
    }),
    style: zoneStyle,
    zIndex: 1,
  });

  let styleRefreshSub: Subscription | undefined = undefined;
  if (styleRefreshTriggers?.length) {
    const triggers$ = styleRefreshTriggers.map((t) => toObservable(t, { injector: injector }));
    styleRefreshSub = combineLatest([...triggers$]).subscribe(() => {
      layer.changed();
    });
  }

  const cleanup = () => {
    styleRefreshSub?.unsubscribe();
  };

  return { layer, cleanup };
};
