import { Injectable, inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { Nationality } from '@ww2/shared/nationality';
import { HouseRules, Player } from '../session/session-state';
import { SessionActions } from '../session/session-actions';
import { GameActions } from './game-actions';
import { GamePhase } from './game-phase';
import { FIRST_TURN_PHASE } from './turn-phase';
import { TurnFlowService } from './turn-flow.service';
import { CombatOrchestrator } from '@ww2/combat/combat-orchestrator';
import { defaultSaveFileName, deserializeGame, serializeGame } from './game-serialization';

export interface NewGameConfig {
  players: Player[];
  nationAssignments: Partial<Record<Nationality, string>>;
  houseRules: HouseRules;
}

/**
 * Orchestrates the lifecycle of a game session: starting a fresh game, loading one from a save
 * file, and exporting the current game to a downloadable JSON file. Captures the pristine
 * post-bootstrap snapshot so a second "New Game" fully resets every slice.
 */
@Injectable({ providedIn: 'root' })
export class GameSessionService {
  private readonly store = inject(Store);
  private readonly turnFlow = inject(TurnFlowService);
  private readonly combatOrchestrator = inject(CombatOrchestrator);

  /**
   * The default state of every slice, captured the first time this service is constructed —
   * before any gameplay has mutated the store (the landing page is the first screen).
   */
  private readonly pristineSnapshot = this.store.snapshot();

  /** Reset all slices to defaults, then record the chosen players / rules and start the first turn. */
  startNewGame(config: NewGameConfig): void {
    this.store.reset(this.pristineSnapshot);
    this.turnFlow.reset();
    this.combatOrchestrator.reset();
    this.store.dispatch([
      new SessionActions.StartNewGame(config.players, config.nationAssignments, config.houseRules),
      // A game begins with the Soviet Union's first turn. (Turn-order / starting-phase specifics
      // are finalized in the turn-flow workstream.)
      new GameActions.SetGamePhase(GamePhase.SOVIET_TURN),
      new GameActions.SetTurnPhase(FIRST_TURN_PHASE),
    ]);
  }

  /** Load a game from the contents of a save file. Throws if the file is invalid. */
  loadFromFile(fileName: string, json: string): void {
    const state = deserializeGame(json);
    this.store.reset(state);
    this.turnFlow.reset();
    this.combatOrchestrator.reset();
    this.store.dispatch(new SessionActions.SetLoadedFileName(fileName));
  }

  /** Serialize the current game and trigger a browser download under `fileName`. */
  saveToFile(fileName: string): void {
    const json = serializeGame(this.store.snapshot());
    this.downloadJson(fileName, json);
  }

  /** Suggested filename for the save dialog: the loaded file's name, else a timestamped default. */
  suggestedSaveFileName(): string {
    const loaded = this.store.selectSnapshot((state) => state['session']?.loadedFileName) as
      | string
      | null
      | undefined;
    return loaded ?? defaultSaveFileName();
  }

  private downloadJson(fileName: string, json: string): void {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}
