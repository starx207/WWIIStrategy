import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Map, View } from 'ol';
import ImageLayer from 'ol/layer/Image';
import ImageStatic from 'ol/source/ImageStatic';
import { Extent } from 'ol/extent';
import TileLayer from 'ol/layer/Tile';
import { OSM } from 'ol/source';
import { addProjection, Projection } from 'ol/proj';

// TODO: Consider looking at ngx-openlayers
@Component({
  selector: 'ww2-test-ol-map',
  imports: [],
  templateUrl: './test-ol-map.html',
  styleUrl: './test-ol-map.scss',
})
export class TestOlMap implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;
  private map!: Map;

  ngOnInit(): void {
    const imageWidth = 2772;
    const imageHeight = 1512;
    const imageExtent: Extent = [0, 0, imageWidth, imageHeight]; // Adjust if your image uses a different projection or bounds

    const imageProjection = new Projection({
      code: 'AABOARD',
      units: 'pixels',
      extent: imageExtent,
    });
    addProjection(imageProjection);

    this.map = new Map({
      target: this.mapContainer.nativeElement,
      layers: [
        // new TileLayer({
        //   source: new OSM()
        // }),
        new ImageLayer({
          source: new ImageStatic({
            url: 'images/game-board.svg',
            imageExtent: imageExtent,
            projection: imageProjection,
          }),
        }),
      ],
      view: new View({
        projection: imageProjection,
        center: [imageWidth / 2, imageHeight / 2],
        zoom: 1,
        extent: imageExtent,
        maxZoom: 5,
      }),
    });
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.setTarget(undefined);
    }
  }
}
