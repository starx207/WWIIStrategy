import Feature, { FeatureLike } from 'ol/Feature';
import { Coordinate } from 'ol/coordinate';
import Geometry from 'ol/geom/Geometry';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style, Text } from 'ol/style';
import { SquadMovementPlan, SquadMovementStepCombatType } from '../map-state';
import { EnvironmentInjector, Signal } from '@angular/core';
import { MapSelectors } from '../map-selectors';
import { toObservable } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';

const ACTIVE_COLOR = 'rgba(46, 128, 255, 0.95)';
const INACTIVE_COLOR = 'rgba(46, 128, 255, 0.95)';
const ACTIVE_WARNING_COLOR = 'rgba(251, 255, 11, 0.95)';
const INACTIVE_WARNING_COLOR = 'rgba(251, 255, 11, 0.95)';
const ACTIVE_FILL = 'rgba(46, 128, 255, 0.18)';
const INACTIVE_FILL = 'rgba(46, 128, 255, 0.18)';
const COMBAT_COLOR = 'rgba(189, 0, 0, 0.82)';
const NODE_BORDER_COLOR = 'rgba(255, 255, 255, 0.9)';

type MovementFeatureKind = 'segment' | 'arrow' | 'start' | 'final';

type MovementPlanFeatureProperties = {
  active: boolean;
  kind: MovementFeatureKind;
  subKind?: SquadMovementStepCombatType;
  // Present on node features ('arrow' / 'final') so a map click can resolve back to a plan step.
  squadId?: string;
  stepIndex?: number;
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
      createPointFeature(coordinates[coordinates.length - 1], {
        active,
        kind: 'final',
        squadId: plan.squadId,
        stepIndex: plan.path.length - 1,
      }),
    );

    for (let index = 0; index < coordinates.length - 1; index++) {
      const start = coordinates[index];
      const end = coordinates[index + 1];
      const planStep = plan.path[index];
      source.addFeature(
        new Feature({ geometry: new LineString([start, end]), active, kind: 'segment' }),
      );
      source.addFeature(
        createPointFeature(end, {
          active,
          kind: 'arrow',
          subKind: planStep?.combatType,
          squadId: plan.squadId,
          stepIndex: index,
        }),
      );
    }
  }
}

function movementPlanStyle(feature: FeatureLike): Style | Style[] {
  const active = feature.get('active') as MovementPlanFeatureProperties['active'];
  const kind = feature.get('kind') as MovementPlanFeatureProperties['kind'];
  const subKind = feature.get('subKind') as MovementPlanFeatureProperties['subKind'];
  const color = active ? ACTIVE_COLOR : INACTIVE_COLOR;
  const warningColor = active ? ACTIVE_WARNING_COLOR : INACTIVE_WARNING_COLOR;
  const fill = active ? ACTIVE_FILL : INACTIVE_FILL;
  const lineWidth = active ? 4 : 3;

  switch (kind) {
    case 'segment':
      return new Style({
        stroke: new Stroke({ color, width: lineWidth, lineDash: active ? undefined : [8, 8] }),
      });
    case 'arrow':
      return nodeStyle(active, subKind, color, warningColor);
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

/** Picks the symbol for a step node based on its combat type. */
function nodeStyle(
  active: boolean,
  subKind: MovementPlanFeatureProperties['subKind'],
  color: string,
  warningColor: string,
): Style | Style[] {
  switch (subKind) {
    case 'combat':
      return combatNodeStyle(active);
    case 'under-fire':
      return underFireNodeStyle(active, warningColor);
    default:
      return normalNodeStyle(active, color);
  }
}

/** Normal move: solid circle with a white border. */
function normalNodeStyle(active: boolean, color: string): Style {
  return new Style({
    image: new CircleStyle({
      radius: active ? 8 : 6,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: NODE_BORDER_COLOR, width: active ? 2 : 1.5 }),
    }),
  });
}

/** Fly-over under anti-air fire: warning triangle with an exclamation point. */
function underFireNodeStyle(active: boolean, warningColor: string): Style {
  const strokeColor = 'rgba(0, 0, 0, 0.9)';
  return new Style({
    image: new RegularShape({
      points: 3,
      radius: active ? 13 : 11,
      fill: new Fill({ color: warningColor }),
      stroke: new Stroke({ color: strokeColor, width: active ? 2 : 1.5 }),
      angle: 0,
    }),
    text: new Text({
      text: '!',
      font: `bold ${active ? 13 : 11}px sans-serif`,
      fill: new Fill({ color: strokeColor }),
      // Nudge down so the "!" sits inside the visible body of the triangle.
      offsetY: active ? -1 : -0.8,
      offsetX: 0.2,
    }),
  });
}

/** Combat engagement: red crosshairs (a ring plus a cross). */
function combatNodeStyle(active: boolean): Style[] {
  const radius = active ? 9 : 7;
  const strokeWidth = active ? 2.5 : 2;
  const ring = new Style({
    image: new CircleStyle({
      radius,
      stroke: new Stroke({ color: COMBAT_COLOR, width: strokeWidth }),
    }),
  });
  const cross = new Style({
    image: new RegularShape({
      points: 4,
      radius: radius + (active ? 4 : 3),
      radius2: 0,
      angle: 0,
      stroke: new Stroke({ color: COMBAT_COLOR, width: strokeWidth }),
    }),
  });
  return [ring, cross];
}

function createPointFeature(
  coordinate: Coordinate,
  properties: MovementPlanFeatureProperties,
): Feature<Point> {
  return new Feature({ geometry: new Point(coordinate), ...properties });
}
