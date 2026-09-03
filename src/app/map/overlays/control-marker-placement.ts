import { EnvironmentInjector, Signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Overlay, Map as OlMap } from 'ol';
import { Coordinate } from 'ol/coordinate';
import { getCenter } from 'ol/extent';
import { Geometry } from 'ol/geom';
import MultiPolygon from 'ol/geom/MultiPolygon';
import Polygon from 'ol/geom/Polygon';
import { unByKey } from 'ol/Observable';
import { Nationality } from '@ww2/shared/nationality';
import { LandTerritoryName } from '../../territories/territory-names';
import { TerritoryLayer } from '../layers/map-territories';

type ControlMarkersByTerritory = Partial<Record<LandTerritoryName, Nationality>>;

type MarkerRef = {
  overlay: Overlay;
  element: HTMLImageElement;
};

interface ConnectControlMarkersToMapReturn {
  cleanup: () => void;
}

/**
 * A point guaranteed to sit inside a territory's geometry — unlike the extent's bbox center,
 * which can land outside an irregular or multi-part shape. For a multi-part territory, picks the
 * interior point of its largest part.
 */
function territoryMarkerCoordinate(geometry: Geometry): Coordinate {
  if (geometry instanceof Polygon) {
    const [x, y] = geometry.getInteriorPoint().getCoordinates();
    return [x, y];
  }
  if (geometry instanceof MultiPolygon) {
    const points = geometry.getInteriorPoints().getCoordinates();
    if (points.length > 0) {
      const [x, y] = points.reduce((largest, candidate) =>
        candidate[2] > largest[2] ? candidate : largest,
      );
      return [x, y];
    }
  }
  return getCenter(geometry.getExtent());
}

function createMarkerElement(nationality: Nationality): HTMLImageElement {
  const element = document.createElement('img');
  element.className = 'control-marker';
  element.src = `images/${nationality}/emblem.svg`;
  element.alt = '';
  // Purely decorative — never intercept clicks meant for the territory underneath.
  element.style.pointerEvents = 'none';
  element.style.width = '28px';
  element.style.height = '28px';
  element.style.opacity = '0.9';
  element.style.filter = 'drop-shadow(0 0 3px rgba(0, 0, 0, 0.7))';
  return element;
}

/**
 * Renders a small emblem marker over each captured-and-vacated territory (see
 * `MapSelectors.capturedControlMarkers`). Deliberately plain DOM rather than an Angular component
 * like the squad overlays — there's no interactivity or per-instance reactivity here beyond
 * swapping an image `src`, so the extra machinery would only add overhead.
 */
export const connectControlMarkersToMap = (
  map: OlMap,
  territoriesLayer: TerritoryLayer,
  controlMarkersByTerritory: Signal<ControlMarkersByTerritory>,
  environmentInjector: EnvironmentInjector,
): ConnectControlMarkersToMapReturn => {
  const markerRefsByTerritory = new Map<LandTerritoryName, MarkerRef>();

  const refresh = (markers: ControlMarkersByTerritory): void => {
    const source = territoriesLayer.getSource();
    const desiredTerritories = new Set(Object.keys(markers));

    for (const [key, nationality] of Object.entries(markers)) {
      const territory = key as LandTerritoryName;
      const geometry = source
        ?.getFeatures()
        .find((feature) => feature.get('name') === territory)
        ?.getGeometry();
      if (!geometry) {
        continue;
      }
      const coordinate = territoryMarkerCoordinate(geometry);

      const existing = markerRefsByTerritory.get(territory);
      if (existing) {
        existing.overlay.setPosition(coordinate);
        if (!existing.element.src.endsWith(`${nationality}/emblem.svg`)) {
          existing.element.src = `images/${nationality}/emblem.svg`;
        }
        continue;
      }

      const element = createMarkerElement(nationality);
      const overlay = new Overlay({
        element,
        position: coordinate,
        positioning: 'center-center',
        stopEvent: false,
      });
      map.addOverlay(overlay);
      markerRefsByTerritory.set(territory, { overlay, element });
    }

    for (const [territory, ref] of markerRefsByTerritory) {
      if (!desiredTerritories.has(territory)) {
        map.removeOverlay(ref.overlay);
        markerRefsByTerritory.delete(territory);
      }
    }
  };

  const refreshSub = toObservable(controlMarkersByTerritory, {
    injector: environmentInjector,
  }).subscribe(refresh);

  const territoriesSource = territoriesLayer.getSource();
  const featuresLoadKey = territoriesSource?.on('featuresloadend', () =>
    refresh(controlMarkersByTerritory()),
  );

  return {
    cleanup: () => {
      refreshSub.unsubscribe();
      if (featuresLoadKey) {
        unByKey(featuresLoadKey);
      }
      for (const ref of markerRefsByTerritory.values()) {
        map.removeOverlay(ref.overlay);
      }
      markerRefsByTerritory.clear();
    },
  };
};
