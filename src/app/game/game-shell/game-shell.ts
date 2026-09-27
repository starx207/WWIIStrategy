import { Component, computed, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { AppHeader } from '../../app-header/app-header';
import { GameMap } from '@ww2/map/game-map/game-map';
import { GameSelectors } from '@ww2/game/game-selectors';
import { MOVEMENT_PHASES, TurnPhase } from '@ww2/game/turn-phase';
import { SquadDetachmentPicker } from '@ww2/map/squad-detachment-picker/squad-detachment-picker';
import { CargoUnloadPicker } from '@ww2/map/cargo-unload-picker/cargo-unload-picker';
import { PurchasePanel } from '../../production/purchase-panel/purchase-panel';
import { TechPanel } from '../../production/tech-panel/tech-panel';
import { PlacementPanel } from '../../production/placement-panel/placement-panel';
import { ConductCombatPanel } from '../../combat/conduct-combat-panel/conduct-combat-panel';
import { BattleBoard } from '../../combat/battle-board/battle-board';
import { AircraftLandingPicker } from '../../combat/aircraft-landing-picker/aircraft-landing-picker';
import { CombatOrchestrator } from '../../combat/combat-orchestrator';
import { TerritoryName } from '../../territories/territory-names';
import { HandoffScreen } from '../handoff/handoff-screen';
import { VictoryScreen } from '../../victory/victory-screen/victory-screen';
import { GameControlsWidget } from '../game-controls/game-controls-widget';
import { TurnFlowService } from '../turn-flow.service';

@Component({
  selector: 'ww2-game-shell',
  imports: [
    AppHeader,
    GameMap,
    PurchasePanel,
    TechPanel,
    PlacementPanel,
    ConductCombatPanel,
    BattleBoard,
    AircraftLandingPicker,
    SquadDetachmentPicker,
    CargoUnloadPicker,
    HandoffScreen,
    VictoryScreen,
    GameControlsWidget,
  ],
  templateUrl: './game-shell.html',
  styleUrl: './game-shell.scss',
})
export class GameShell {
  private readonly store = inject(Store);
  private readonly combatOrchestrator = inject(CombatOrchestrator);
  private readonly turnFlow = inject(TurnFlowService);

  protected readonly TurnPhase = TurnPhase;
  protected readonly turnPhase = this.store.selectSignal(GameSelectors.turnPhase);
  protected readonly movementPhaseActive = computed(() =>
    [...MOVEMENT_PHASES].includes(this.turnPhase()),
  );
  protected readonly battleActive = computed(
    () => this.combatOrchestrator.activeBattleTerritory() !== null,
  );
  protected readonly shoreBombardment = this.combatOrchestrator.shoreBombardmentReport;
  protected readonly pendingLandingAssignment = this.combatOrchestrator.pendingLandingAssignment;
  protected readonly handoffPending = this.turnFlow.handoffPending;
  protected readonly victoryResult = this.turnFlow.victoryResult;

  protected onBattleAcknowledged(): void {
    // If surviving aircraft have a landing choice, prompt for it and hold the result until confirmed.
    if (this.combatOrchestrator.requiresLandingAssignment()) {
      this.combatOrchestrator.beginLandingAssignment();
      return;
    }
    this.combatOrchestrator.finishBattle();
    this.advanceIfBattlesDone();
  }

  protected onLandingConfirmed(assignment: Record<string, TerritoryName>): void {
    this.combatOrchestrator.finishBattle(assignment);
    this.advanceIfBattlesDone();
  }

  /** When the last battle is resolved, advance straight out of combat resolution. */
  private advanceIfBattlesDone(): void {
    if (this.combatOrchestrator.pendingBattles().length === 0) {
      this.turnFlow.advancePhase();
    }
  }
}
