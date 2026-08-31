import { Component, computed, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { MapSelectors } from '@ww2/map/map-selectors';
import { GameSelectors } from '@ww2/game/game-selectors';
import { nationalityForGamePhase } from '@ww2/game/game-phase';
import { TerritoryName } from '../../territories/territory-names';
import { CombatOrchestrator } from '../combat-orchestrator';
import { computePendingBattles } from '../combat-orchestration';

@Component({
  selector: 'ww2-conduct-combat-panel',
  imports: [],
  templateUrl: './conduct-combat-panel.html',
  styleUrl: './conduct-combat-panel.scss',
})
export class ConductCombatPanel {
  private readonly store = inject(Store);
  private readonly orchestrator = inject(CombatOrchestrator);

  private readonly gamePhase = this.store.selectSignal(GameSelectors.gamePhase);
  private readonly plans = this.store.selectSignal(MapSelectors.movementPlans);
  private readonly units = this.store.selectSignal(MapSelectors.unitsByTerritoryName);

  private readonly activeNation = computed(() => nationalityForGamePhase(this.gamePhase()));

  protected readonly battles = computed(() => {
    const nation = this.activeNation();
    return nation ? computePendingBattles(nation, this.plans(), this.units()) : [];
  });

  protected resolve(territory: TerritoryName): void {
    this.orchestrator.startBattle(territory);
  }
}
