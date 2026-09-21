import { Component, computed, input, output, signal } from '@angular/core';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { UnitType } from '@ww2/shared/unit-type';
import { MilitaryUnitIcon } from '@ww2/shared/military-unit-icon';
import { TerritoryName } from '../../territories/territory-names';
import {
  LandingAssignmentRequest,
  candidateZonesForType,
  isValidLandingAssignment,
} from '../aircraft-landing';

interface ZoneOption {
  territory: TerritoryName;
  cap: number;
  /** Whether picking this zone for the current aircraft would exceed its capacity. */
  full: boolean;
}

interface AircraftRow {
  unit: MilitaryUnit;
  typeLabel: string;
  selected: TerritoryName;
  options: ZoneOption[];
}

const TYPE_LABEL: Partial<Record<UnitType, string>> = {
  [UnitType.FIGHTER_JET]: 'Fighter',
  [UnitType.BOMBER]: 'Bomber',
};

/**
 * After a battle, lets the player choose where each surviving aircraft lands, within the capacity of
 * the zones the flight was originally designated to (see aircraft-landing.ts). Emits the chosen
 * zone-per-aircraft map when confirmed.
 */
@Component({
  selector: 'ww2-aircraft-landing-picker',
  imports: [MilitaryUnitIcon],
  templateUrl: './aircraft-landing-picker.html',
  styleUrl: './aircraft-landing-picker.scss',
})
export class AircraftLandingPicker {
  readonly request = input.required<LandingAssignmentRequest>();
  readonly landingConfirmed = output<Record<string, TerritoryName>>();

  /** Explicit per-aircraft overrides; merged over the request's defaults to form the assignment. */
  private readonly choices = signal<Record<string, TerritoryName>>({});

  private readonly assignment = computed<Record<string, TerritoryName>>(() => ({
    ...this.request().defaultZoneByUnitId,
    ...this.choices(),
  }));

  /** Rows to render — one per surviving aircraft, with its eligible zones and current pick. */
  protected readonly rows = computed<AircraftRow[]>(() => {
    const request = this.request();
    const assignment = this.assignment();

    // Current usage per (type, zone) so we can flag zones that are full for other aircraft.
    const usage = new Map<string, number>();
    for (const unit of request.aircraft) {
      const zone = assignment[unit.id];
      const key = `${unit.type}|${zone}`;
      usage.set(key, (usage.get(key) ?? 0) + 1);
    }

    return request.aircraft.map((unit) => {
      const selected = assignment[unit.id];
      const options = candidateZonesForType(request.caps, unit.type).map((territory) => {
        const cap = request.caps.get(unit.type)?.get(territory) ?? 0;
        const used = usage.get(`${unit.type}|${territory}`) ?? 0;
        // A zone is "full" for this aircraft when it is already at capacity with other aircraft.
        const full = territory !== selected && used >= cap;
        return { territory, cap, full };
      });
      return {
        unit,
        typeLabel: TYPE_LABEL[unit.type] ?? unit.type,
        selected,
        options,
      };
    });
  });

  protected readonly canConfirm = computed(() =>
    isValidLandingAssignment(this.request().aircraft, this.assignment(), this.request().caps),
  );

  protected onZoneChange(unitId: string, territory: string): void {
    this.choices.update((current) => ({ ...current, [unitId]: territory as TerritoryName }));
  }

  protected confirm(): void {
    if (!this.canConfirm()) {
      return;
    }
    this.landingConfirmed.emit(this.assignment());
  }
}
