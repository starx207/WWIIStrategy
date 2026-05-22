import { Component, input, ViewEncapsulation } from '@angular/core';
import { SquadComponent } from '@ww2/shared/squad-component/squad-component';
import { MapSquadLayout } from '../map-squad-layout';

@Component({
  selector: 'ww2-map-squad-overlay',
  imports: [SquadComponent],
  templateUrl: './map-squad-overlay.html',
  styleUrl: './map-squad-overlay.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MapSquadOverlay {
  layout = input.required<MapSquadLayout>();
}
