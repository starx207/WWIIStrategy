import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  Signal,
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Overlay, Map as OlMap, Feature } from 'ol';
import { Coordinate } from 'ol/coordinate';
import { MapSquadOverlay, MapSquadOverlayVariant } from '../map-squad-overlay/map-squad-overlay';
import { TERRITORY_NAMES, TerritoryName } from '../../territories/territory-names';
import { Geometry } from 'ol/geom';
import VectorSource from 'ol/source/Vector';
import { MapSelectors, SelectedSquadState } from '../map-selectors';
import {
  createSingleSquadLayout,
  layoutMapSquadsInGeometry,
  MapSquadLayout,
} from '../map-squad-layout';
import { unByKey } from 'ol/Observable';
import { TerritoryLayer } from '../layers/map-territories';
import { SquadMovementPlan } from '../map-state';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { Nationality } from '@ww2/shared/nationality';
import { TurnPhase } from '@ww2/game/turn-phase';
import { combineLatest } from 'rxjs';

type MapSquadOverlayRef = {
  overlay: Overlay;
  componentRef: ComponentRef<MapSquadOverlay>;
};

type DesiredMapSquadOverlay = {
  key: string;
  squadId: string;
  layout: MapSquadLayout;
  coordinate: Coordinate;
  variant: MapSquadOverlayVariant;
  disabled: boolean;
  /** True for the active nation's squads — stacked above (and thus clickable over) squads of
   * other nations sharing the same territory, e.g. an attacker/defender pair mid-combat-move. */
  onTop: boolean;
};

type TerritoryFeatureMap = Map<TerritoryName, Feature<Geometry>>;

type TerritoryLayerSource = VectorSource<Feature<Geometry>>;

type SquadsByTerritoryName = ReturnType<typeof MapSelectors.squadsByTerritoryName>;
type MovementPlansBySquadId = Record<string, SquadMovementPlan>;
type SquadLayoutCoordinatesBySquadId = ReturnType<
  typeof MapSelectors.squadLayoutCoordinatesBySquadId
>;

interface ConnectSquadOverlaysToMapReturn {
  cleanup: () => void;
}

const clearSquadOverlays = (
  squadOverlayRefsByKey: Map<string, MapSquadOverlayRef>,
  appRef: ApplicationRef,
  map?: OlMap,
): void => {
  for (const { overlay, componentRef } of squadOverlayRefsByKey.values()) {
    map?.removeOverlay(overlay);
    appRef.detachView(componentRef.hostView);
    componentRef.destroy();
  }
  squadOverlayRefsByKey.clear();
};

const updateSquadOverlayScale = (
  squadOverlayRefsByKey: Map<string, MapSquadOverlayRef>,
  map?: OlMap,
  baseOverlayResolution?: number,
): void => {
  const currentResolution = map?.getView().getResolution();
  if (!baseOverlayResolution || !currentResolution) {
    return;
  }

  // TODO: Maybe we need a settings dialog where we can adjust things like the overall scale of the pieces
  //       I had to add the 0.9 reduction when moving from my Lenovo to Mac. Alternatively I might need to
  //       have a better way to calculate initial resolution for the pieces.
  const scale = (baseOverlayResolution / currentResolution) * 0.9;
  for (const { componentRef } of squadOverlayRefsByKey.values()) {
    componentRef.location.nativeElement.style.setProperty(
      '--map-squad-overlay-scale',
      scale.toString(),
    );
  }
};

const refreshSquadOverlays = (
  squadsByTerritoryName: SquadsByTerritoryName,
  movementPlansBySquadId: MovementPlansBySquadId,
  selectedSquad: SelectedSquadState | undefined,
  squadLayoutCoordinatesBySquadId: SquadLayoutCoordinatesBySquadId,
  activeNationality: Nationality | undefined,
  turnPhase: TurnPhase,
  combatCommittedUnitIds: string[],
  territoryFeaturesByName: TerritoryFeatureMap,
  squadOverlayRefsByKey: Map<string, MapSquadOverlayRef>,
  appRef: ApplicationRef,
  environmentInjector: EnvironmentInjector,
  onSquadSelected: (squad: MilitaryUnitSquad<MilitaryUnit>) => void,
  setSquadLayoutCoordinates: (coordinatesBySquadId: Record<string, Coordinate>) => void,
  map: OlMap,
  baseOverlayResolution?: number,
): void => {
  const missingCoordinates = calculateMissingSquadLayoutCoordinates(
    squadsByTerritoryName,
    squadLayoutCoordinatesBySquadId,
    territoryFeaturesByName,
  );
  const effectiveLayoutCoordinatesBySquadId = {
    ...squadLayoutCoordinatesBySquadId,
    ...missingCoordinates,
  };

  if (Object.keys(missingCoordinates).length > 0) {
    setSquadLayoutCoordinates(missingCoordinates);
  }

  reconcileSquadOverlays(
    buildDesiredSquadOverlays(
      squadsByTerritoryName,
      movementPlansBySquadId,
      selectedSquad,
      effectiveLayoutCoordinatesBySquadId,
      activeNationality,
      turnPhase,
      combatCommittedUnitIds,
    ),
    squadOverlayRefsByKey,
    appRef,
    environmentInjector,
    onSquadSelected,
    map,
  );
  updateSquadOverlayScale(squadOverlayRefsByKey, map, baseOverlayResolution);
};

/** Whether a squad is locked out of non-combat movement because one or more of its units already
 * committed to combat this turn (mixed squads lock as a whole — see GameMap.onSquadSelected). */
function isSquadDisabled(
  squad: MilitaryUnitSquad<MilitaryUnit>,
  turnPhase: TurnPhase,
  combatCommittedUnitIds: string[],
): boolean {
  return (
    turnPhase === TurnPhase.NON_COMBAT_MOVEMENT &&
    squad.units.some((unit) => combatCommittedUnitIds.includes(unit.id))
  );
}

function buildDesiredSquadOverlays(
  squadsByTerritoryName: SquadsByTerritoryName,
  movementPlansBySquadId: MovementPlansBySquadId,
  selectedSquad: SelectedSquadState | undefined,
  squadLayoutCoordinatesBySquadId: SquadLayoutCoordinatesBySquadId,
  activeNationality: Nationality | undefined,
  turnPhase: TurnPhase,
  combatCommittedUnitIds: string[],
): DesiredMapSquadOverlay[] {
  const desiredOverlays: DesiredMapSquadOverlay[] = [];
  const plannedMovingSquadIds = new Set(
    Object.values(movementPlansBySquadId)
      .filter((plan) => plan.path.length > 0)
      .map((plan) => plan.squadId),
  );

  for (const squads of Object.values(squadsByTerritoryName)) {
    for (const squad of squads) {
      if (plannedMovingSquadIds.has(squad.id)) {
        continue;
      }
      const coordinate = squadLayoutCoordinatesBySquadId[squad.id];
      if (!coordinate) {
        continue;
      }
      desiredOverlays.push({
        key: 'normal:' + squad.id,
        squadId: squad.id,
        layout: createSingleSquadLayout(squad),
        coordinate,
        variant: 'normal',
        disabled: isSquadDisabled(squad, turnPhase, combatCommittedUnitIds),
        onTop: squad.nationality === activeNationality,
      });
    }
  }

  for (const plan of Object.values(movementPlansBySquadId)) {
    if (plan.path.length === 0) {
      continue;
    }

    const squad = findSquadById(squadsByTerritoryName, plan.squadId);
    const startCoordinate = squadLayoutCoordinatesBySquadId[plan.squadId];
    // A trailing load/unload cargo step is a pickup/drop target, not a place the squad ends up —
    // the transport's icon belongs at its last actual (non-cargo) position, or where it started if
    // it only loads/unloads without moving.
    const moveSteps = plan.path.filter((step) => !step.cargo);
    const finalCoordinate = moveSteps[moveSteps.length - 1]?.coordinate ?? startCoordinate;

    if (!squad || !finalCoordinate) {
      continue;
    }

    // A movement plan only ever exists for the active nation's own squad (selection is gated to
    // it), so these are always on top.
    if (startCoordinate) {
      desiredOverlays.push({
        key: 'start:' + plan.squadId,
        squadId: squad.id,
        layout: createSingleSquadLayout(squad),
        coordinate: startCoordinate,
        variant: 'movement-start',
        disabled: false,
        onTop: true,
      });
    }
    desiredOverlays.push({
      key: 'final:' + plan.squadId,
      squadId: squad.id,
      layout: createSingleSquadLayout(squad),
      coordinate: finalCoordinate,
      variant: selectedSquad?.activePlanKey === plan.squadId ? 'movement-final' : 'normal',
      disabled: false,
      onTop: true,
    });
  }

  return desiredOverlays;
}

function reconcileSquadOverlays(
  desiredOverlays: DesiredMapSquadOverlay[],
  squadOverlayRefsByKey: Map<string, MapSquadOverlayRef>,
  appRef: ApplicationRef,
  environmentInjector: EnvironmentInjector,
  onSquadSelected: (squad: MilitaryUnitSquad<MilitaryUnit>) => void,
  map: OlMap,
): void {
  const desiredKeys = new Set<string>();

  for (const desiredOverlay of desiredOverlays) {
    desiredKeys.add(desiredOverlay.key);
    const existingRef = squadOverlayRefsByKey.get(desiredOverlay.key);
    if (existingRef) {
      updateSquadOverlay(existingRef, desiredOverlay);
      continue;
    }

    squadOverlayRefsByKey.set(
      desiredOverlay.key,
      createSquadOverlay(desiredOverlay, appRef, environmentInjector, onSquadSelected, map),
    );
  }

  for (const [key, ref] of squadOverlayRefsByKey) {
    if (desiredKeys.has(key)) {
      continue;
    }
    map.removeOverlay(ref.overlay);
    appRef.detachView(ref.componentRef.hostView);
    ref.componentRef.destroy();
    squadOverlayRefsByKey.delete(key);
  }
}

function createSquadOverlay(
  desiredOverlay: DesiredMapSquadOverlay,
  appRef: ApplicationRef,
  environmentInjector: EnvironmentInjector,
  onSquadSelected: (squad: MilitaryUnitSquad<MilitaryUnit>) => void,
  map: OlMap,
): MapSquadOverlayRef {
  const componentRef = createComponent(MapSquadOverlay, {
    environmentInjector: environmentInjector,
  });
  componentRef.setInput('id', desiredOverlay.squadId);
  componentRef.setInput('layout', desiredOverlay.layout);
  componentRef.setInput('variant', desiredOverlay.variant);
  componentRef.setInput('disabled', desiredOverlay.disabled);
  componentRef.instance.squadSelected.subscribe(onSquadSelected);
  appRef.attachView(componentRef.hostView);

  const overlay = new Overlay({
    element: componentRef.location.nativeElement,
    position: desiredOverlay.coordinate,
    positioning: 'center-center',
    stopEvent: true,
  });

  map.addOverlay(overlay);
  applyOverlayStackOrder(componentRef, desiredOverlay.onTop);
  return { overlay, componentRef };
}

function updateSquadOverlay(
  overlayRef: MapSquadOverlayRef,
  desiredOverlay: DesiredMapSquadOverlay,
): void {
  overlayRef.componentRef.setInput('layout', desiredOverlay.layout);
  overlayRef.componentRef.setInput('variant', desiredOverlay.variant);
  overlayRef.componentRef.setInput('disabled', desiredOverlay.disabled);
  overlayRef.overlay.setPosition(desiredOverlay.coordinate);
  applyOverlayStackOrder(overlayRef.componentRef, desiredOverlay.onTop);
}

/**
 * Stack the active nation's overlay elements above others sharing the same territory (e.g. an
 * attacker/defender pair mid-combat-move) — both visually and for pointer hit-testing, so they're
 * also the ones that get selected on click.
 *
 * OL wraps the element it's given (`componentRef.location.nativeElement`) in its own internal
 * `position: absolute` div, and it's those wrapper divs — not our content — that are the actual
 * siblings competing for paint order in the shared overlay container; a z-index on our content
 * only orders things *inside* that wrapper, which has nothing else in it. OL doesn't expose the
 * wrapper via any public API, so reach it the only way available: it's the parent element once
 * the Overlay has been constructed (or reused, for an already-attached overlay).
 */
function applyOverlayStackOrder(componentRef: ComponentRef<MapSquadOverlay>, onTop: boolean): void {
  const wrapper = componentRef.location.nativeElement.parentElement;
  if (wrapper) {
    wrapper.style.zIndex = onTop ? '2' : '1';
  }
}

const refreshTerritoryFeatures = (
  territoryFeaturesByName: TerritoryFeatureMap,
  zoneSource?: TerritoryLayerSource,
): void => {
  territoryFeaturesByName.clear();
  const features = zoneSource?.getFeatures() ?? [];

  for (const feature of features) {
    const territoryName = feature.get('name') as TerritoryName | undefined;
    const geometry = feature.getGeometry();
    if (typeof territoryName === 'string' && TERRITORY_NAMES.includes(territoryName) && geometry) {
      territoryFeaturesByName.set(territoryName, feature);
    }
  }
};

export const connectSquadOverlaysToMap = (
  map: OlMap,
  territoriesLayer: TerritoryLayer,
  squadsByTerritoryName: Signal<SquadsByTerritoryName>,
  movementPlansBySquadId: Signal<MovementPlansBySquadId>,
  selectedSquad: Signal<SelectedSquadState | undefined>,
  squadLayoutCoordinatesBySquadId: Signal<SquadLayoutCoordinatesBySquadId>,
  activeNationality: Signal<Nationality | undefined>,
  turnPhase: Signal<TurnPhase>,
  combatCommittedUnitIds: Signal<string[]>,
  appRef: ApplicationRef,
  environmentInjector: EnvironmentInjector,
  onSquadSelected: (squad: MilitaryUnitSquad<MilitaryUnit>) => void,
  setSquadLayoutCoordinates: (coordinatesBySquadId: Record<string, Coordinate>) => void,
): ConnectSquadOverlaysToMapReturn => {
  const squadOverlayRefsByKey = new Map<string, MapSquadOverlayRef>();
  const territoryFeaturesByName = new Map<TerritoryName, Feature<Geometry>>();
  const baseOverlayResolution = map.getView().getResolution();
  const sourceKeyEvents = [
    map
      .getView()
      .on('change:resolution', () =>
        updateSquadOverlayScale(squadOverlayRefsByKey, map, baseOverlayResolution),
      ),
  ];

  const refreshSub = combineLatest([
    toObservable(squadsByTerritoryName, { injector: environmentInjector }),
    toObservable(movementPlansBySquadId, { injector: environmentInjector }),
    toObservable(selectedSquad, { injector: environmentInjector }),
    toObservable(squadLayoutCoordinatesBySquadId, { injector: environmentInjector }),
    toObservable(activeNationality, { injector: environmentInjector }),
    toObservable(turnPhase, { injector: environmentInjector }),
    toObservable(combatCommittedUnitIds, { injector: environmentInjector }),
  ]).subscribe(
    ([squads, movementPlans, activeSquad, layoutCoordinates, nation, phase, committedIds]) => {
      refreshSquadOverlays(
        squads,
        movementPlans,
        activeSquad,
        layoutCoordinates,
        nation,
        phase,
        committedIds,
        territoryFeaturesByName,
        squadOverlayRefsByKey,
        appRef,
        environmentInjector,
        onSquadSelected,
        setSquadLayoutCoordinates,
        map,
        baseOverlayResolution,
      );
    },
  );

  const territoriesSource = territoriesLayer.getSource();
  if (territoriesSource) {
    sourceKeyEvents.push(
      territoriesSource.on('featuresloadend', () => {
        refreshTerritoryFeatures(territoryFeaturesByName, territoriesSource);
        refreshSquadOverlays(
          squadsByTerritoryName(),
          movementPlansBySquadId(),
          selectedSquad(),
          squadLayoutCoordinatesBySquadId(),
          activeNationality(),
          turnPhase(),
          combatCommittedUnitIds(),
          territoryFeaturesByName,
          squadOverlayRefsByKey,
          appRef,
          environmentInjector,
          onSquadSelected,
          setSquadLayoutCoordinates,
          map,
          baseOverlayResolution,
        );
      }),
    );
  }

  return {
    cleanup: () => {
      refreshSub.unsubscribe();
      clearSquadOverlays(squadOverlayRefsByKey, appRef, map);
      unByKey(sourceKeyEvents);
    },
  };
};

function calculateMissingSquadLayoutCoordinates(
  squadsByTerritoryName: SquadsByTerritoryName,
  squadLayoutCoordinatesBySquadId: SquadLayoutCoordinatesBySquadId,
  territoryFeaturesByName: TerritoryFeatureMap,
): Record<string, Coordinate> {
  const missingCoordinatesBySquadId: Record<string, Coordinate> = {};

  for (const [territoryName, squads] of Object.entries(squadsByTerritoryName)) {
    const missingSquadIds = new Set(
      squads.filter((squad) => !squadLayoutCoordinatesBySquadId[squad.id]).map((squad) => squad.id),
    );
    if (missingSquadIds.size === 0 || !TERRITORY_NAMES.includes(territoryName as TerritoryName)) {
      continue;
    }

    const geometry = territoryFeaturesByName.get(territoryName as TerritoryName)?.getGeometry();
    if (!geometry) {
      continue;
    }

    for (const positionedSquad of layoutMapSquadsInGeometry(squads, geometry)) {
      if (missingSquadIds.has(positionedSquad.squad.id)) {
        missingCoordinatesBySquadId[positionedSquad.squad.id] = [...positionedSquad.coordinate];
      }
    }
  }

  return missingCoordinatesBySquadId;
}

function findSquadById(
  squadsByTerritoryName: SquadsByTerritoryName,
  squadId: string,
): MilitaryUnitSquad<MilitaryUnit> | undefined {
  return Object.values(squadsByTerritoryName)
    .flat()
    .find((squad) => squad.id === squadId);
}
