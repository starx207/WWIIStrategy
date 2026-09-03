import {
  ApplicationRef,
  Component,
  computed,
  effect,
  EffectRef,
  ElementRef,
  EnvironmentInjector,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Store } from '@ngxs/store';
import { FeatureLike } from 'ol/Feature';
import { Map as OlMap } from 'ol';
import { containsExtent, getCenter } from 'ol/extent';
import { configureMap } from '../map-config';
import { mapTerritoriesLayer, TerritoryLayer, TerritoryStyleId } from '../layers/map-territories';
import { MapSelectors } from '../map-selectors';
import { connectSquadOverlaysToMap } from '../overlays/squad-placement';
import { connectControlMarkersToMap } from '../overlays/control-marker-placement';
import { TERRITORY_INFO_BY_NAME } from '../../territories/territory-info';
import type { TerritoryName } from '../../territories/territory-names';
import { MapActions } from '../map-actions';
import { MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { mapMovementPlanLayer } from '../layers/movement-plan-layer';
import { GameActions } from '@ww2/game/game-actions';
import { GameSelectors } from '@ww2/game/game-selectors';
import { nationalityForGamePhase } from '@ww2/game/game-phase';
import { MOVEMENT_PHASES, MovementPhase, TurnPhase } from '@ww2/game/turn-phase';
import { LAND_UNIT_TYPES, UnitType } from '@ww2/shared/unit-type';
import { LandTerritoryName } from '../../territories/territory-names';
import { parseSquadId } from '../rules/movement-execution';
import { canUnloadTo, findLoadableTransport } from '../rules/amphibious';
import { PlacementService } from '../../production/placement.service';

@Component({
  selector: 'ww2-game-map',
  imports: [],
  templateUrl: './game-map.html',
  styleUrl: './game-map.scss',
})
export class GameMap implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLElement>;
  selectedZoneId: string | undefined;

  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly store = inject(Store);
  private readonly squadsByTerritoryName = this.store.selectSignal(
    MapSelectors.squadsByTerritoryName,
  );
  private readonly movementPlansBySquadId = this.store.selectSignal(
    MapSelectors.movementPlansBySquadId,
  );
  private readonly selectedSquad = this.store.selectSignal(MapSelectors.selectedSquad);
  private readonly squadLayoutCoordinatesBySquadId = this.store.selectSignal(
    MapSelectors.squadLayoutCoordinatesBySquadId,
  );
  private readonly selectedSquadMovementPlan = this.store.selectSignal(
    MapSelectors.selectedSquadMovementPlan,
  );
  private readonly nextAdjacentDestinations = this.store.selectSignal(
    MapSelectors.selectedSquadNextAdjacentDestinations,
  );
  private readonly selectedMovementPlan = this.store.selectSignal(
    MapSelectors.selectedSquadMovementPlan,
  );
  private readonly canChangeSelectedMovementPlan = computed(
    () => (this.selectedMovementPlan()?.path.length ?? 0) > 0,
  );
  private readonly hasMovementPlansWithPath = this.store.selectSignal(
    MapSelectors.hasMovementPlansWithPath,
  );
  private readonly currentTurnPhase = this.store.selectSignal(GameSelectors.turnPhase);
  private readonly gamePhase = this.store.selectSignal(GameSelectors.gamePhase);
  private readonly activeNationality = computed(() => nationalityForGamePhase(this.gamePhase()));
  private readonly unitsByTerritoryName = this.store.selectSignal(
    MapSelectors.unitsByTerritoryName,
  );
  private readonly cargoByCarrierUnitId = this.store.selectSignal(
    MapSelectors.cargoByCarrierUnitId,
  );
  private readonly cargoDestinations = this.store.selectSignal(
    MapSelectors.selectedSquadCargoDestinations,
  );
  private readonly combatCommittedUnitIds = this.store.selectSignal(
    MapSelectors.combatCommittedUnitIds,
  );
  private readonly capturedControlMarkers = this.store.selectSignal(
    MapSelectors.capturedControlMarkers,
  );
  private readonly placementService = inject(PlacementService);

  private map!: OlMap;
  private territoriesLayer?: TerritoryLayer;
  private cleanupFns: ((() => void) | undefined)[] = [];

  private readonly effects: EffectRef[] = [
    effect(() => {
      const canChangeMovementPlan = this.canChangeSelectedMovementPlan();
      this.store.dispatch(
        new GameActions.SetContextualMenuOptionDisabled(
          ['undo-move', 'reset-squad-moves'],
          !canChangeMovementPlan,
        ),
      );
    }),
    effect(() => {
      const hasMovementPlans = this.hasMovementPlansWithPath();
      this.store.dispatch(
        new GameActions.SetContextualMenuOptionDisabled(['reset-all-moves'], !hasMovementPlans),
      );
    }),
    // A "Complex capacity" chip click (PlacementService.focusDirect) asks the map to pan the
    // territory into view, in case the player had scrolled/zoomed elsewhere while reviewing.
    effect(() => {
      const request = this.placementService.revealRequest();
      if (request) {
        this.ensureTerritoryVisible(request.territory);
      }
    }),
  ];

  ngOnInit(): void {
    const { layer: territoriesLayer, cleanup: territoryCleanup } = mapTerritoriesLayer({
      stylePicker: this.selectZoneStyle.bind(this),
      injector: this.environmentInjector,
      styleRefreshTriggers: [
        this.nextAdjacentDestinations,
        this.selectedSquadMovementPlan,
        this.cargoDestinations,
        this.placementService.candidateTerritories,
        this.placementService.focusedTerritory,
      ],
    });
    this.cleanupFns.push(territoryCleanup);
    this.territoriesLayer = territoriesLayer;

    const { layer: movementPlanLayer, cleanup: cleanupMovementPlan } = mapMovementPlanLayer(
      this.movementPlansBySquadId,
      this.selectedSquad,
      this.squadLayoutCoordinatesBySquadId,
      this.environmentInjector,
    );
    this.cleanupFns.push(cleanupMovementPlan);

    const { map } = configureMap(this.mapContainer.nativeElement, {
      layers: [territoriesLayer, movementPlanLayer],
    });
    this.map = map;

    const { cleanup } = connectSquadOverlaysToMap(
      this.map,
      territoriesLayer,
      this.squadsByTerritoryName,
      this.movementPlansBySquadId,
      this.selectedSquad,
      this.squadLayoutCoordinatesBySquadId,
      this.activeNationality,
      this.currentTurnPhase,
      this.combatCommittedUnitIds,
      this.appRef,
      this.environmentInjector,
      this.onSquadSelected.bind(this),
      (coordinatesBySquadId) =>
        this.store.dispatch(new MapActions.SetSquadLayoutCoordinates(coordinatesBySquadId)),
    );
    this.cleanupFns.push(cleanup);

    const { cleanup: cleanupControlMarkers } = connectControlMarkersToMap(
      this.map,
      territoriesLayer,
      this.capturedControlMarkers,
      this.environmentInjector,
    );
    this.cleanupFns.push(cleanupControlMarkers);

    map.on('singleclick', (event) => {
      const clickedNode = map.forEachFeatureAtPixel(
        event.pixel,
        (feature) => {
          const kind = feature.get('kind');
          const squadId = feature.get('squadId');
          const stepIndex = feature.get('stepIndex');
          return (kind === 'arrow' || kind === 'final') &&
            typeof squadId === 'string' &&
            typeof stepIndex === 'number'
            ? { squadId, stepIndex }
            : undefined;
        },
        { hitTolerance: 6 },
      );

      if (clickedNode && clickedNode.squadId === this.selectedSquad()?.id) {
        this.store.dispatch(
          new MapActions.SetAircraftCombatNode(clickedNode.squadId, clickedNode.stepIndex),
        );
        return;
      }

      const clickedTerritory = map.forEachFeatureAtPixel(event.pixel, (feature) => {
        const territoryName = feature.get('name') as TerritoryName | undefined;
        return typeof territoryName === 'string' ? territoryName : undefined;
      });

      if (
        clickedTerritory &&
        this.currentTurnPhase() === TurnPhase.PLACE_NEW_UNITS &&
        this.placementService.candidateTerritories().includes(clickedTerritory)
      ) {
        this.selectedZoneId = undefined;
        this.placementService.focus(clickedTerritory);
        territoriesLayer.changed();
        return;
      }

      if (clickedTerritory && this.tryLoadOrUnload(clickedTerritory)) {
        this.selectedZoneId = undefined;
        territoriesLayer.changed();
        return;
      }

      if (clickedTerritory && this.nextAdjacentDestinations().includes(clickedTerritory)) {
        this.selectedZoneId = undefined;
        this.store.dispatch(
          new MapActions.PlanSquadMovementStep(clickedTerritory, event.coordinate),
        );
        return;
      }

      this.selectedZoneId = map.forEachFeatureAtPixel(event.pixel, (feature) => {
        const zoneId = feature.get('id');
        return typeof zoneId === 'string' ? zoneId : undefined;
      });
      territoriesLayer.changed();
    });
  }

  ngOnDestroy(): void {
    for (const effectRef of this.effects) {
      effectRef.destroy();
    }
    for (const cleanup of this.cleanupFns) {
      cleanup?.();
    }

    if (this.map) {
      this.map.setTarget(undefined);
    }
  }

  selectZoneStyle(feature: FeatureLike): TerritoryStyleId {
    const territoryName = feature.get('name') as TerritoryName | undefined;
    if (typeof territoryName === 'string') {
      if (
        this.nextAdjacentDestinations().includes(territoryName) ||
        this.cargoDestinations().includes(territoryName)
      ) {
        return 'movement-candidate';
      }

      const selectedPlan = this.selectedSquadMovementPlan();
      const selectedPlanCurrentTerritory = selectedPlan
        ? (selectedPlan.path.at(-1)?.territoryName ?? selectedPlan.startingTerritoryName)
        : undefined;
      if (territoryName === selectedPlanCurrentTerritory) {
        return 'movement-current';
      }

      if (this.currentTurnPhase() === TurnPhase.PLACE_NEW_UNITS) {
        const isCandidate = this.placementService.candidateTerritories().includes(territoryName);
        if (isCandidate && this.placementService.isFull(territoryName)) {
          return 'placement-full';
        }
        if (territoryName === this.placementService.focusedTerritory()) {
          return 'movement-current';
        }
        if (isCandidate) {
          return 'placement-candidate';
        }
      }
    }

    if (feature.get('id') === this.selectedZoneId) {
      return 'selected';
    }

    return typeof territoryName === 'string' && TERRITORY_INFO_BY_NAME[territoryName].kind === 'sea'
      ? 'sea'
      : 'land';
  }

  /** Pan the view to bring a territory fully into frame, if it isn't already — used when the
   * placement panel's "Complex capacity" chip asks to review a territory that may be off-screen. */
  private ensureTerritoryVisible(territory: TerritoryName): void {
    const feature = this.territoriesLayer
      ?.getSource()
      ?.getFeatures()
      .find((candidate) => candidate.get('name') === territory);
    const geometry = feature?.getGeometry();
    const view = this.map?.getView();
    const size = this.map?.getSize();
    if (!geometry || !view || !size) {
      return;
    }

    const featureExtent = geometry.getExtent();
    const viewExtent = view.calculateExtent(size);
    if (containsExtent(viewExtent, featureExtent)) {
      return;
    }

    view.animate({ center: getCenter(featureExtent), duration: 300 });
  }

  /**
   * Handle a territory click as a transport load (land squad → adjacent transport) or unload
   * (loaded transport → adjacent land: friendly unload or amphibious assault). Returns true when
   * the click was consumed as a cargo action.
   */
  private tryLoadOrUnload(clickedTerritory: TerritoryName): boolean {
    if (![...MOVEMENT_PHASES].includes(this.currentTurnPhase())) {
      return false;
    }
    const selected = this.selectedSquad();
    if (!selected) {
      return false;
    }
    const parsed = parseSquadId(selected.id);
    const selectedTerritory = selected.id.split('|')[1] as TerritoryName | undefined;
    const nation = this.activeNationality();
    if (!parsed || !selectedTerritory || !nation) {
      return false;
    }

    if (LAND_UNIT_TYPES.includes(parsed.unitType)) {
      const transportId = findLoadableTransport({
        fromTerritory: selectedTerritory,
        seaZone: clickedTerritory,
        cargoUnitCount: selected.unitIds.length,
        nation,
        unitsByTerritory: this.unitsByTerritoryName(),
        cargoByCarrierUnitId: this.cargoByCarrierUnitId(),
      });
      if (transportId) {
        this.store.dispatch(
          new MapActions.LoadCargo(transportId, selected.unitIds, selectedTerritory),
        );
        return true;
      }
    }

    if (parsed.unitType === UnitType.TRANSPORT) {
      const transportId = selected.unitIds[0];
      const hasCargo = (this.cargoByCarrierUnitId()[transportId] ?? []).length > 0;
      if (hasCargo && canUnloadTo(selectedTerritory, clickedTerritory)) {
        this.store.dispatch(
          new MapActions.UnloadCargo(transportId, clickedTerritory as LandTerritoryName),
        );
        return true;
      }
    }

    return false;
  }

  /**
   * A click on a squad occupying a valid destination territory should move the active squad there,
   * same as clicking empty ground of that territory — but the destination squad's overlay swallows
   * the click before the map's own singleclick handler ever sees it (`stopEvent: true`), so this is
   * invoked directly from the squad-selection callback instead.
   */
  private tryPlanMoveToDestinationSquad(destinationSquad: MilitaryUnitSquad<MilitaryUnit>): void {
    if (!this.selectedSquad()) {
      return;
    }
    const territory = destinationSquad.id.split('|')[1] as TerritoryName | undefined;
    if (!territory || !this.nextAdjacentDestinations().includes(territory)) {
      return;
    }
    const coordinate = this.squadLayoutCoordinatesBySquadId()[destinationSquad.id];
    if (!coordinate) {
      return;
    }
    this.store.dispatch(new MapActions.PlanSquadMovementStep(territory, coordinate));
  }

  private onSquadSelected(squad: MilitaryUnitSquad<MilitaryUnit>) {
    const phase = this.currentTurnPhase();

    if ([...MOVEMENT_PHASES].includes(phase)) {
      // Only the active nation's own squads can be selected. A click on any other squad can't
      // select it, but squad overlays swallow the click before it reaches the map's territory-click
      // handler (see tryPlanMoveToDestinationSquad) — so redirect it as a destination click for the
      // currently selected active squad when that territory is a valid move.
      if (squad.nationality !== this.activeNationality()) {
        this.tryPlanMoveToDestinationSquad(squad);
        return;
      }
      // Units that combat-moved or fought this turn can't move again in non-combat. A mixed
      // group (some committed, some idle) locks as a whole — split-squad movement isn't built yet.
      if (phase === TurnPhase.NON_COMBAT_MOVEMENT) {
        const committed = this.combatCommittedUnitIds();
        if (squad.units.some((unit) => committed.includes(unit.id))) {
          return;
        }
      }
      const canChangeMovementPlan = this.canChangeSelectedMovementPlan();
      const hasMovementPlans = this.hasMovementPlansWithPath();
      this.store.dispatch(
        new GameActions.SetContextualMenu([
          { id: 'header-label', label: 'Movement' },
          { id: 'undo-move', label: 'Undo', disabled: !canChangeMovementPlan },
          { id: 'reset-squad-moves', label: 'Clear Squad', disabled: !canChangeMovementPlan },
          { id: 'reset-all-moves', label: 'Clear All', disabled: !hasMovementPlans },
        ]),
      );
      this.store.dispatch(new MapActions.SelectSquad(squad, phase as MovementPhase));
    } else if (phase === TurnPhase.PLACE_NEW_UNITS) {
      // A click on a squad occupying a factory or sea zone would otherwise be swallowed by the
      // squad overlay (stopEvent: true) before the map's territory-click handler sees it — focus
      // the territory directly instead, same as clicking empty ground there.
      const territory = squad.id.split('|')[1] as TerritoryName | undefined;
      if (territory) {
        this.placementService.focus(territory);
      }
    } else {
      this.store.dispatch(new GameActions.SetContextualMenu([]));
    }
  }
}
