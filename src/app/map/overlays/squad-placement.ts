import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector,
  Signal,
} from '@angular/core';
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

type MapSquadOverlayRef = {
  overlay: Overlay;
  componentRef: ComponentRef<MapSquadOverlay>;
};

type TerritoryFeatureMap = Map<TerritoryName, Feature<Geometry>>;

type TerritoryLayerSource = VectorSource<Feature<Geometry>>;

type SquadsByTerritoryName = ReturnType<typeof MapSelectors.squadsByTerritoryName>;
type MovementPlansBySquadId = Record<string, SquadMovementPlan>;

interface ConnectSquadOverlaysToMapReturn {
  refresh: (
    squadsByTerritoryName: SquadsByTerritoryName,
    movementPlansBySquadId: MovementPlansBySquadId,
    selectedSquad: SelectedSquadState | undefined,
  ) => void;
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
  squadOverlayRefs.length = 0;
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
  squadsByTerritoryName: SquadsByTerritoryName,
  movementPlansBySquadId: MovementPlansBySquadId,
  selectedSquad: SelectedSquadState | undefined,
  territoryFeaturesByName: TerritoryFeatureMap,
  squadOverlayRefs: MapSquadOverlayRef[],
  appRef: ApplicationRef,
  environmentInjector: EnvironmentInjector,
  onSquadSelected: (squad: MilitaryUnitSquad<MilitaryUnit>) => void,
  map?: OlMap,
  baseOverlayResolution?: number,
): void => {
  if (!map || territoryFeaturesByName.size === 0) {
    return;
  }

  clearSquadOverlays(squadOverlayRefs, appRef, map);

  const plannedMovingSquadIds = new Set(
    Object.values(movementPlansBySquadId)
      .filter((plan) => plan.path.length > 0)
      .map((plan) => plan.squadId),
  );

  for (const [territoryName, squads] of Object.entries(squadsByTerritoryName)) {
    const visibleSquads = squads.filter((squad) => !plannedMovingSquadIds.has(squad.id));
    if (visibleSquads.length === 0 || !TERRITORY_NAMES.includes(territoryName as TerritoryName)) {
      continue;
    }
    const feature = territoryFeaturesByName.get(territoryName as TerritoryName);
    const geometry = feature?.getGeometry();
    if (!geometry) {
      continue;
    }

    for (const positionedSquad of layoutMapSquadsInGeometry(visibleSquads, geometry)) {
      addSquadOverlay(
        positionedSquad.layout,
        positionedSquad.coordinate,
        'normal',
        squadOverlayRefs,
        appRef,
        environmentInjector,
        onSquadSelected,
        map,
      );
    }
  }

  for (const plan of Object.values(movementPlansBySquadId)) {
    if (plan.path.length === 0) {
      continue;
    }

    const squad = findSquadById(squadsByTerritoryName, plan.squadId);
    const startGeometry = territoryFeaturesByName.get(plan.startingTerritoryName)?.getGeometry();
    const finalStep = plan.path[plan.path.length - 1];

    if (!squad || !startGeometry) {
      continue;
    }

    const startPlacement = layoutMapSquadsInGeometry(
      squadsByTerritoryName[plan.startingTerritoryName] ?? [],
      startGeometry,
    ).find((positionedSquad) => positionedSquad.squad.id === plan.squadId);
    const isSelectedPlan = selectedSquad?.id === plan.squadId;

    if (startPlacement) {
      addSquadOverlay(
        startPlacement.layout,
        startPlacement.coordinate,
        'movement-start',
        squadOverlayRefs,
        appRef,
        environmentInjector,
        onSquadSelected,
        map,
      );
    }
    addSquadOverlay(
      createSingleSquadLayout(squad),
      finalStep.coordinate,
      isSelectedPlan ? 'movement-final' : 'normal',
      squadOverlayRefs,
      appRef,
      environmentInjector,
      onSquadSelected,
      map,
    );
  }

  updateSquadOverlayScale(squadOverlayRefs, map, baseOverlayResolution);
};

const addSquadOverlay = (
  layout: MapSquadLayout,
  coordinate: Coordinate,
  variant: MapSquadOverlayVariant,
  squadOverlayRefs: MapSquadOverlayRef[],
  appRef: ApplicationRef,
  environmentInjector: EnvironmentInjector,
  onSquadSelected: (squad: MilitaryUnitSquad<MilitaryUnit>) => void,
  map: OlMap,
): void => {
  const componentRef = createComponent(MapSquadOverlay, {
    environmentInjector: environmentInjector,
  });
  componentRef.setInput('layout', layout);
  componentRef.setInput('variant', variant);
  componentRef.instance.squadSelected.subscribe(onSquadSelected);
  appRef.attachView(componentRef.hostView);

  const overlay = new Overlay({
    element: componentRef.location.nativeElement,
    position: coordinate,
    positioning: 'center-center',
    stopEvent: true,
  });

  map.addOverlay(overlay);
  squadOverlayRefs.push({ overlay, componentRef });
};

const refreshTerritoryFeatures = (
  squadsByTerritoryName: Signal<SquadsByTerritoryName>,
  movementPlansBySquadId: Signal<MovementPlansBySquadId>,
  selectedSquad: Signal<SelectedSquadState | undefined>,
  territoryFeaturesByName: TerritoryFeatureMap,
  squadOverlayRefs: MapSquadOverlayRef[],
  appRef: ApplicationRef,
  environmentInjector: EnvironmentInjector,
  onSquadSelected: (squad: MilitaryUnitSquad<MilitaryUnit>) => void,
  map?: OlMap,
  baseOverlayResolution?: number,
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

  refreshSquadOverlays(
    squadsByTerritoryName(),
    movementPlansBySquadId(),
    selectedSquad(),
    territoryFeaturesByName,
    squadOverlayRefs,
    appRef,
    environmentInjector,
    onSquadSelected,
    map,
    baseOverlayResolution,
  );
};

export const connectSquadOverlaysToMap = (
  map: OlMap,
  territoriesLayer: TerritoryLayer,
  squadsByTerritoryName: Signal<SquadsByTerritoryName>,
  movementPlansBySquadId: Signal<MovementPlansBySquadId>,
  selectedSquad: Signal<SelectedSquadState | undefined>,
  appRef: ApplicationRef,
  environmentInjector: EnvironmentInjector,
  onSquadSelected: (squad: MilitaryUnitSquad<MilitaryUnit>) => void,
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
          movementPlansBySquadId,
          selectedSquad,
          territoryFeaturesByName,
          squadOverlayRefs,
          appRef,
          environmentInjector,
          onSquadSelected,
          map,
          baseOverlayResolution,
          territoriesSource,
        ),
      ),
    );
  }

  return {
    refresh: (
      squadsByTerritoryName: SquadsByTerritoryName,
      movementPlansBySquadId: MovementPlansBySquadId,
      selectedSquad: SelectedSquadState | undefined,
    ) => {
      refreshSquadOverlays(
        squadsByTerritoryName,
        movementPlansBySquadId,
        selectedSquad,
        territoryFeaturesByName,
        squadOverlayRefs,
        appRef,
        environmentInjector,
        onSquadSelected,
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

function findSquadById(
  squadsByTerritoryName: SquadsByTerritoryName,
  squadId: string,
): MilitaryUnitSquad<MilitaryUnit> | undefined {
  return Object.values(squadsByTerritoryName)
    .flat()
    .find((squad) => squad.id === squadId);
}
