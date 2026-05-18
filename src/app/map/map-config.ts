import { Map, View } from 'ol';
import BaseLayer from 'ol/layer/Base';
import ImageLayer from 'ol/layer/Image';
import { addProjection, Projection } from 'ol/proj';
import { ImageStatic } from 'ol/source';

const mapWidth = 2772;
const mapHeight = 1512;
const mapCode = 'AABOARD';

const mapExtent = [0, 0, mapWidth, mapHeight] as const;

export const mapProjection = new Projection({
  code: mapCode,
  units: 'pixels',
  extent: [...mapExtent],
});

export const configureMap = (
  mapTarget: HTMLElement,
  options?: {
    layers?: BaseLayer[];
  },
) => {
  addProjection(mapProjection);

  const view = new View({
    projection: mapProjection,
    center: [mapWidth / 2, mapHeight / 2],
    zoom: 0,
    minZoom: 0,
    extent: [...mapExtent],
    showFullExtent: true,
    maxZoom: 5,
  });

  const map = new Map({
    target: mapTarget,
    view,
    layers: [
      new ImageLayer({
        source: new ImageStatic({
          url: 'images/game-board.svg',
          imageExtent: [...mapExtent],
          projection: mapProjection,
        }),
        zIndex: 0,
      }),
      ...(options?.layers ?? []),
    ],
  });

  view.fit([...mapExtent], {
    size: map.getSize(),
    nearest: false,
  });

  return { view, map };
};
