import Feature, { FeatureLike } from 'ol/Feature';
import { Coordinate } from 'ol/coordinate';
import Geometry from 'ol/geom/Geometry';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style } from 'ol/style';
import { SquadMovementPlan } from '../map-state';
import { EnvironmentInjector, Signal } from '@angular/core';
import { MapSelectors } from '../map-selectors';
import { toObservable } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';

const ACTIVE_COLOR = 'rgba(46, 128, 255, 0.95)';
const INACTIVE_COLOR = 'rgba(46, 128, 255, 0.95)';
const ACTIVE_FILL = 'rgba(46, 128, 255, 0.18)';
const INACTIVE_FILL = 'rgba(46, 128, 255, 0.18)';

type MovementFeatureKind = 'segment' | 'arrow' | 'start' | 'final';

type MovementPlanFeatureProperties = {
  active: boolean;
  kind: MovementFeatureKind;
  rotation?: number;
};

export type MovementPlanLayer = VectorLayer<VectorSource<Feature<Geometry>>>;

export type MovementPlanLayerReturn = {
  layer: MovementPlanLayer;
  cleanup: () => void;
};

export function mapMovementPlanLayer(
  movementPlansBySquadIdSignal: Signal<ReturnType<typeof MapSelectors.movementPlansBySquadId>>,
  activeSquadSignal: Signal<ReturnType<typeof MapSelectors.selectedSquad>>,
  squadLayoutCoordinatesBySquadIdSignal: Signal<
    ReturnType<typeof MapSelectors.squadLayoutCoordinatesBySquadId>
  >,
  injector: EnvironmentInjector,
): MovementPlanLayerReturn {
  const refresh$ = combineLatest([
    toObservable(movementPlansBySquadIdSignal, { injector: injector }),
    toObservable(activeSquadSignal, { injector: injector }),
    toObservable(squadLayoutCoordinatesBySquadIdSignal, { injector: injector }),
  ]);

  const layer = new VectorLayer({
    source: new VectorSource<Feature<Geometry>>(),
    style: movementPlanStyle,
    zIndex: 2,
  });

  const refreshSub = refresh$.subscribe(([movementPlans, activeSquad, layoutCoordinates]) => {
    refreshMovementPlanLayer(layer, movementPlans, activeSquad?.id, layoutCoordinates);
  });

  const cleanup = () => {
    refreshSub.unsubscribe();
  };

  return { layer, cleanup };
}

function refreshMovementPlanLayer(
  layer: MovementPlanLayer,
  movementPlansBySquadId: Record<string, SquadMovementPlan>,
  activeSquadId: string | undefined,
  squadLayoutCoordinatesBySquadId: ReturnType<typeof MapSelectors.squadLayoutCoordinatesBySquadId>,
): void {
  const source = layer.getSource();
  if (!source) {
    return;
  }

  source.clear();

  for (const plan of Object.values(movementPlansBySquadId)) {
    if (plan.path.length === 0) {
      continue;
    }

    const startCoordinate = squadLayoutCoordinatesBySquadId[plan.squadId];
    if (!startCoordinate) {
      continue;
    }

    const coordinates = [startCoordinate, ...plan.path.map((step) => step.coordinate)];
    const active = plan.squadId === activeSquadId;
    source.addFeature(createPointFeature(coordinates[0], { active, kind: 'start' }));
    source.addFeature(
      createPointFeature(coordinates[coordinates.length - 1], { active, kind: 'final' }),
    );

    for (let index = 0; index < coordinates.length - 1; index++) {
      const start = coordinates[index];
      const end = coordinates[index + 1];
      source.addFeature(
        new Feature({ geometry: new LineString([start, end]), active, kind: 'segment' }),
      );
      source.addFeature(
        createPointFeature(end, {
          active,
          kind: 'arrow',
          rotation: Math.atan2(end[1] - start[1], end[0] - start[0]),
        }),
      );
    }
  }
}

function movementPlanStyle(feature: FeatureLike): Style {
  const active = feature.get('active') as MovementPlanFeatureProperties['active'];
  const kind = feature.get('kind') as MovementPlanFeatureProperties['kind'];
  const rotation = feature.get('rotation') as MovementPlanFeatureProperties['rotation'];
  const color = active ? ACTIVE_COLOR : INACTIVE_COLOR;
  const fill = active ? ACTIVE_FILL : INACTIVE_FILL;
  const lineWidth = active ? 4 : 3;

  switch (kind) {
    case 'segment':
      return new Style({
        stroke: new Stroke({ color, width: lineWidth, lineDash: active ? undefined : [8, 8] }),
      });
    case 'arrow':
      return new Style({
        image: new RegularShape({
          points: 3,
          radius: active ? 11 : 9,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.82)', width: active ? 2 : 1 }),
          rotation: rotation ?? 0,
          rotateWithView: true,
          angle: Math.PI / 2,
        }),
      });
    case 'start':
      return new Style({
        image: new CircleStyle({
          radius: active ? 8 : 6,
          fill: new Fill({ color: fill }),
          stroke: new Stroke({ color, width: active ? 3 : 2 }),
        }),
      });
    case 'final':
      return new Style({
        image: new CircleStyle({
          radius: active ? 10 : 8,
          fill: new Fill({ color: 'rgba(255, 255, 255, 0.8)' }),
          stroke: new Stroke({ color, width: active ? 4 : 3 }),
        }),
      });
    default:
      return new Style();
  }
}

function createPointFeature(
  coordinate: Coordinate,
  properties: MovementPlanFeatureProperties,
): Feature<Point> {
  return new Feature({ geometry: new Point(coordinate), ...properties });
}
