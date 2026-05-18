import GeoJSON from 'ol/format/GeoJSON';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { mapProjection } from '../map-config';
import Style, { StyleLike } from 'ol/style/Style';
import { Fill, Stroke } from 'ol/style';
import { FeatureLike } from 'ol/Feature';

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

export type TerritoryStyleId = 'land' | 'sea' | 'selected';

export const mapTerritoriesLayer = (stylePicker: (feature: FeatureLike) => TerritoryStyleId) => {
  const zoneStyle = (feature: FeatureLike): Style => {
    const styleId = stylePicker(feature);

    switch (styleId) {
      case 'land':
        return landZoneStyle;
      case 'sea':
        return seaZoneStyle;
      case 'selected':
        return selectedZoneStyle;
      default:
        return landZoneStyle;
    }
  };

  const zoneLayer = new VectorLayer({
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

  return zoneLayer;
};
