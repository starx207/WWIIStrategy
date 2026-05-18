import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { configureMap } from '../map-config';
import { mapTerritoriesLayer, TerritoryStyleId } from '../layers/map-territories';
import { Map } from 'ol';
import { FeatureLike } from 'ol/Feature';

@Component({
  selector: 'ww2-game-map',
  imports: [],
  templateUrl: './game-map.html',
  styleUrl: './game-map.scss',
})
export class GameMap implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLElement>;
  selectedZoneId: string | undefined;

  private map!: Map;

  ngOnInit(): void {
    const zoneLayer = mapTerritoriesLayer(this.selectZoneStyle.bind(this));

    const { map } = configureMap(this.mapContainer.nativeElement, {
      layers: [zoneLayer],
    });

    map.on('singleclick', (event) => {
      this.selectedZoneId = map.forEachFeatureAtPixel(event.pixel, (feature) => {
        const zoneId = feature.get('id');
        return typeof zoneId === 'string' ? zoneId : undefined;
      });
      zoneLayer.changed();
    });

    this.map = map;
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.setTarget(undefined);
    }
  }

  selectZoneStyle(feature: FeatureLike): TerritoryStyleId {
    if (feature.get('id') === this.selectedZoneId) {
      return 'selected';
    }

    return feature.get('kind') === 'sea' ? 'sea' : 'land';
  }
}
