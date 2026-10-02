import { Component, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { UnitType } from '@ww2/shared/unit-type';
import { MilitaryUnitIcon } from '@ww2/shared/military-unit-icon';
import { UNIT_TYPE_LABEL } from '@ww2/shared/unit-type-label';
import { TurnFlowService } from '@ww2/game/turn-flow.service';
import { TerritoryName } from '../../territories/territory-names';
import { PlacementService, StagedPlacement } from '../placement.service';

interface StagedGroup {
  unitType: UnitType;
  placements: StagedPlacement[];
}

/**
 * View over PlacementService: the player clicks a highlighted factory / sea zone / new-IC
 * territory on the map to focus it (see GameMap), then this panel shows what can be placed there
 * and what's already staged there. The map and this panel share the same service, so clicking the
 * map and using the panel stay in sync.
 */
@Component({
  selector: 'ww2-placement-panel',
  imports: [MilitaryUnitIcon],
  templateUrl: './placement-panel.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './placement-panel.scss',
})
export class PlacementPanel {
  private readonly turnFlow = inject(TurnFlowService);
  protected readonly placementService = inject(PlacementService);

  protected readonly activeNation = this.placementService.activeNation;
  protected readonly pending = this.placementService.pending;
  protected readonly capacityRows = this.placementService.capacityRows;
  protected readonly focusedTerritory = this.placementService.focusedTerritory;
  private readonly stagedAtFocus = this.placementService.stagedAtFocus;
  protected readonly placeableGroups = this.placementService.placeableGroupsAtFocus;

  /** Staged placements at the focus, grouped by unit type so "Placed here" shows one icon per
   * type with a count badge instead of a duplicate icon per unit. */
  protected readonly stagedGroupsAtFocus = computed<StagedGroup[]>(() => {
    const groups = new Map<UnitType, StagedPlacement[]>();
    for (const placement of this.stagedAtFocus()) {
      const list = groups.get(placement.unit.type) ?? [];
      list.push(placement);
      groups.set(placement.unit.type, list);
    }
    return [...groups.entries()].map(([unitType, placements]) => ({ unitType, placements }));
  });

  protected label(unitType: UnitType): string {
    return UNIT_TYPE_LABEL[unitType];
  }

  protected place(unitType: UnitType): void {
    const group = this.placeableGroups().find((candidate) => candidate.unitType === unitType);
    if (group && group.availableUnits.length > 0) {
      this.placementService.place(group.availableUnits[0]);
    }
  }

  /** Undo one unit from a staged group (e.g. clicking a "Placed here" chip). */
  protected undoOne(group: StagedGroup): void {
    const placement = group.placements[0];
    if (placement) {
      this.placementService.undo(placement.unit.id);
    }
  }

  protected clearFocus(): void {
    this.placementService.clearFocus();
  }

  protected reviewTerritory(territory: TerritoryName): void {
    this.placementService.focusDirect(territory);
  }

  /** Commit every staged placement to the map, then end the turn. */
  protected confirm(): void {
    this.placementService.confirmAll();
    this.turnFlow.advancePhase();
  }
}
