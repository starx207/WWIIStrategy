import { Component, computed, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { Nationality } from '@ww2/shared/nationality';
import { UnitType } from '@ww2/shared/unit-type';
import { MilitaryUnitIcon } from '@ww2/shared/military-unit-icon';
import { TerritoryName } from '../../territories/territory-names';
import { LandingAssignmentRequest, candidateZonesForType } from '../aircraft-landing';

/** A single "how many of this type land here" stepper. */
interface LandingSlot {
  key: string;
  type: UnitType;
  typeLabel: string;
  nationality: Nationality;
  count: number;
  cap: number;
  canIncrement: boolean;
  canDecrement: boolean;
}

interface ZoneGroup {
  zone: TerritoryName;
  slots: LandingSlot[];
}

/** How many of each type still need a landing zone. */
interface TypeRemaining {
  type: UnitType;
  typeLabel: string;
  remaining: number;
  total: number;
}

const TYPE_LABEL: Partial<Record<UnitType, string>> = {
  [UnitType.FIGHTER_JET]: 'Fighter',
  [UnitType.BOMBER]: 'Bomber',
};

const slotKey = (type: UnitType, zone: TerritoryName): string => `${type}|${zone}`;

/**
 * After a battle, lets the player choose how many surviving aircraft of each type land in each of
 * the zones the flight was designated to. Steppers enforce each zone's per-type capacity and the
 * pool of survivors, so only a complete, valid assignment can be confirmed. Emits the resulting
 * zone-per-aircraft map.
 */
@Component({
  selector: 'ww2-aircraft-landing-picker',
  imports: [MilitaryUnitIcon],
  templateUrl: './aircraft-landing-picker.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './aircraft-landing-picker.scss',
})
export class AircraftLandingPicker {
  readonly request = input.required<LandingAssignmentRequest>();
  readonly landingConfirmed = output<Record<string, TerritoryName>>();

  /** How many of each type the player has placed in each zone, keyed by `${type}|${zone}`. Starts
   * empty — the player assigns every survivor themselves rather than inheriting the flight plans. */
  private readonly counts = signal<Record<string, number>>({});

  /** Distinct aircraft types among the survivors, with their surviving totals. */
  private readonly totalsByType = computed<Map<UnitType, number>>(() => {
    const totals = new Map<UnitType, number>();
    for (const unit of this.request().aircraft) {
      totals.set(unit.type, (totals.get(unit.type) ?? 0) + 1);
    }
    return totals;
  });

  private assignedForType(type: UnitType, counts: Record<string, number>): number {
    const caps = this.request().caps.get(type);
    if (!caps) {
      return 0;
    }
    let assigned = 0;
    for (const zone of caps.keys()) {
      assigned += counts[slotKey(type, zone)] ?? 0;
    }
    return assigned;
  }

  /** Unplaced survivors remaining, per type. */
  protected readonly remainingByType = computed<TypeRemaining[]>(() => {
    const counts = this.counts();
    return [...this.totalsByType().entries()].map(([type, total]) => ({
      type,
      typeLabel: TYPE_LABEL[type] ?? type,
      total,
      remaining: total - this.assignedForType(type, counts),
    }));
  });

  /** The zones (with their per-type steppers) the player distributes survivors across. */
  protected readonly zoneGroups = computed<ZoneGroup[]>(() => {
    const request = this.request();
    const counts = this.counts();
    const nationality = request.aircraft[0]?.nationality;

    // Remaining pool per type, so a stepper's "+" can be blocked once nothing is left to place.
    const remaining = new Map<UnitType, number>();
    for (const { type, remaining: left } of this.remainingByType()) {
      remaining.set(type, left);
    }

    // Zones in a stable order, gathered across every type that can land somewhere.
    const zoneOrder: TerritoryName[] = [];
    const seen = new Set<TerritoryName>();
    for (const [type] of this.totalsByType()) {
      for (const zone of candidateZonesForType(request.caps, type)) {
        if (!seen.has(zone)) {
          seen.add(zone);
          zoneOrder.push(zone);
        }
      }
    }

    return zoneOrder.map((zone) => {
      const slots: LandingSlot[] = [];
      for (const [type] of this.totalsByType()) {
        const cap = request.caps.get(type)?.get(zone);
        if (cap === undefined) {
          continue; // this zone was never a landing zone for this type
        }
        const count = counts[slotKey(type, zone)] ?? 0;
        slots.push({
          key: slotKey(type, zone),
          type,
          typeLabel: TYPE_LABEL[type] ?? type,
          nationality,
          count,
          cap,
          canIncrement: count < cap && (remaining.get(type) ?? 0) > 0,
          canDecrement: count > 0,
        });
      }
      return { zone, slots };
    });
  });

  protected readonly canConfirm = computed(() =>
    this.remainingByType().every((entry) => entry.remaining === 0),
  );

  protected adjust(type: UnitType, zone: TerritoryName, delta: number): void {
    const counts = { ...this.counts() };
    const key = slotKey(type, zone);
    const next = (counts[key] ?? 0) + delta;
    const cap = this.request().caps.get(type)?.get(zone) ?? 0;
    if (next < 0 || next > cap) {
      return;
    }
    if (delta > 0 && this.assignedForType(type, counts) >= (this.totalsByType().get(type) ?? 0)) {
      return; // no survivors of this type left to place
    }
    counts[key] = next;
    this.counts.set(counts);
  }

  protected confirm(): void {
    if (!this.canConfirm()) {
      return;
    }

    const request = this.request();
    const counts = this.counts();
    const unitsByType = new Map<UnitType, MilitaryUnit[]>();
    for (const unit of request.aircraft) {
      const list = unitsByType.get(unit.type) ?? [];
      list.push(unit);
      unitsByType.set(unit.type, list);
    }

    const assignment: Record<string, TerritoryName> = {};
    for (const [type, units] of unitsByType) {
      let index = 0;
      for (const zone of candidateZonesForType(request.caps, type)) {
        const n = counts[slotKey(type, zone)] ?? 0;
        for (let placed = 0; placed < n; placed++) {
          assignment[units[index++].id] = zone;
        }
      }
    }
    this.landingConfirmed.emit(assignment);
  }
}
