import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { NEUTRAL_UNIT_TYPES, UNIT_TYPES, UnitType } from './unit-type';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { filter, map, switchMap } from 'rxjs';
import { NATIONALITIES, Nationality } from './nationality';

@Component({
  selector: 'ww2-military-unit-icon',
  imports: [],
  template: ` <span class="graphics-container" [innerHTML]="graphics()"></span> `,
  styles: `
  :host {
    display: inline-block;
    // TODO: These other settings I can classify so I can adjust based on the state of the component (selected, non-selected, etc.)
    stroke: black;
    stroke-width: 0.1;// 0.3125;
    stroke-opacity: 0.5;
    fill-opacity: 1;
  }

  .graphics-container {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  `,
  host: {
    '[class]': '"military-unit-icon " + nationalityClass()',
  },
})
export class MilitaryUnitIcon {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);

  nationality = input.required<Nationality>();
  type = input.required<UnitType>();

  private readonly isNeutral = computed(() => NEUTRAL_UNIT_TYPES.includes(this.type()));

  private readonly imageSrc = computed(() =>
    UNIT_TYPES.includes(this.type()) && NATIONALITIES.includes(this.nationality())
      ? this.isNeutral()
        ? `images/${this.type()}.svg`
        : `images/${this.nationality()}/${this.type()}.svg`
      : ''
  );

  protected readonly nationalityClass = computed(() =>
    NEUTRAL_UNIT_TYPES.includes(this.type())
      ? 'nationality-neutral'
      : `nationality-${this.nationality()}`
  );

  protected readonly graphics = toSignal(
    toObservable(this.imageSrc).pipe(
      filter((src) => !!src),
      switchMap((src) => this.http.get(src, { responseType: 'text' })),
      map((svg) => this.sanitizer.bypassSecurityTrustHtml(svg))
    )
  );
}
