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

  private map!: OlMap;
  private squadOverlayCleanup: (() => void) | undefined;
  private squadOverlayEffect: EffectRef | undefined;

  ngOnInit(): void {
    const zoneLayer = mapTerritoriesLayer(this.selectZoneStyle.bind(this));

    const { map } = configureMap(this.mapContainer.nativeElement, {
      layers: [zoneLayer],
    });
    this.map = map;
    const { cleanup, refresh } = connectSquadOverlaysToMap(
      this.map,
      zoneLayer,
      this.squadsByTerritoryName,
      this.appRef,
      this.environmentInjector,
    );
    this.squadOverlayCleanup = cleanup;
    this.squadOverlayEffect = effect(() => refresh(this.squadsByTerritoryName()));

    map.on('singleclick', (event) => {
      this.selectedZoneId = map.forEachFeatureAtPixel(event.pixel, (feature) => {
        const zoneId = feature.get('id');
        return typeof zoneId === 'string' ? zoneId : undefined;
      });
      zoneLayer.changed();
    });
  }

  ngOnDestroy(): void {
    this.squadOverlayEffect?.destroy();
    this.squadOverlayCleanup?.();

    if (this.map) {
      this.map.setTarget(undefined);
    }
  }

  selectZoneStyle(feature: FeatureLike): TerritoryStyleId {
    if (feature.get('id') === this.selectedZoneId) {
      return 'selected';
    }

    const territoryName = feature.get('name') as TerritoryName | undefined;
    return typeof territoryName === 'string' && TERRITORY_INFO_BY_NAME[territoryName].kind === 'sea'
      ? 'sea'
      : 'land';
  }
}
