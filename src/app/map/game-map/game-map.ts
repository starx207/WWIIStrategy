import {
  ApplicationRef,
  Component,
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
import { configureMap } from '../map-config';
import { mapTerritoriesLayer, TerritoryStyleId } from '../layers/map-territories';
import { MapSelectors } from '../map-selectors';
import { connectSquadOverlaysToMap } from '../overlays/squad-placement';
import { TERRITORY_INFO_BY_NAME } from '../../territories/territory-info';
import type { TerritoryName } from '../../territories/territory-names';
import { MapActions } from '../map-actions';
import { MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { mapMovementPlanLayer } from '../layers/movement-plan-layer';

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
  private readonly selectedSquadMovementPlan = this.store.selectSignal(
    MapSelectors.selectedSquadMovementPlan,
  );
  private readonly nextAdjacentDestinations = this.store.selectSignal(
    MapSelectors.selectedSquadNextAdjacentDestinations,
  );

  private map!: OlMap;
  private cleanupFns: ((() => void) | undefined)[] = [];
  private squadOverlayEffect: EffectRef | undefined;

  ngOnInit(): void {
    const { layer: territoriesLayer, cleanup: territoryCleanup } = mapTerritoriesLayer({
      stylePicker: this.selectZoneStyle.bind(this),
      injector: this.environmentInjector,
      styleRefreshTriggers: [this.nextAdjacentDestinations, this.selectedSquadMovementPlan],
    });
    this.cleanupFns.push(territoryCleanup);

    const { layer: movementPlanLayer, cleanup: cleanupMovementPlan } = mapMovementPlanLayer(
      this.movementPlansBySquadId,
      this.selectedSquad,
      this.squadsByTerritoryName,
      territoriesLayer,
      this.environmentInjector,
    );
    this.cleanupFns.push(cleanupMovementPlan);

    const { map } = configureMap(this.mapContainer.nativeElement, {
      layers: [territoriesLayer, movementPlanLayer],
    });
    this.map = map;

    const { cleanup, refresh } = connectSquadOverlaysToMap(
      this.map,
      territoriesLayer,
      this.squadsByTerritoryName,
      this.movementPlansBySquadId,
      this.selectedSquad,
      this.appRef,
      this.environmentInjector,
      this.onSquadSelected.bind(this),
    );
    this.cleanupFns.push(cleanup);
    this.squadOverlayEffect = effect(
      () =>
        refresh(this.squadsByTerritoryName(), this.movementPlansBySquadId(), this.selectedSquad()),
      { injector: this.environmentInjector },
    );

    map.on('singleclick', (event) => {
      const clickedTerritory = map.forEachFeatureAtPixel(event.pixel, (feature) => {
        const territoryName = feature.get('name') as TerritoryName | undefined;
        return typeof territoryName === 'string' ? territoryName : undefined;
      });

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
    this.squadOverlayEffect?.destroy();
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
      if (this.nextAdjacentDestinations().includes(territoryName)) {
        return 'movement-candidate';
      }

      const selectedPlan = this.selectedSquadMovementPlan();
      const selectedPlanCurrentTerritory = selectedPlan
        ? (selectedPlan.path.at(-1)?.territoryName ?? selectedPlan.startingTerritoryName)
        : undefined;
      if (territoryName === selectedPlanCurrentTerritory) {
        return 'movement-current';
      }
    }

    if (feature.get('id') === this.selectedZoneId) {
      return 'selected';
    }

    return typeof territoryName === 'string' && TERRITORY_INFO_BY_NAME[territoryName].kind === 'sea'
      ? 'sea'
      : 'land';
  }

  private onSquadSelected(squad: MilitaryUnitSquad<MilitaryUnit>) {
    this.store.dispatch(new MapActions.SelectSquad(squad));
  }
}
