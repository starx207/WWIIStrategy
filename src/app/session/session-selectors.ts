import { Selector } from '@ngxs/store';
import { Nationality } from '@ww2/shared/nationality';
import { Player, SessionState, SessionStateModel } from './session-state';

export class SessionSelectors {
  @Selector([SessionState])
  static started(state: SessionStateModel): boolean {
    return state.started;
  }

  @Selector([SessionState])
  static players(state: SessionStateModel): Player[] {
    return state.players;
  }

  @Selector([SessionState])
  static nationAssignments(state: SessionStateModel): Partial<Record<Nationality, string>> {
    return state.nationAssignments;
  }

  @Selector([SessionState])
  static roundNumber(state: SessionStateModel): number {
    return state.roundNumber;
  }

  @Selector([SessionState])
  static loadedFileName(state: SessionStateModel): string | null {
    return state.loadedFileName;
  }
}

/**
 * The player controlling a given nation, or undefined if unassigned. Pure helper for components
 * that have already selected `players` and `nationAssignments` signals.
 */
export function playerForNation(
  nationality: Nationality,
  players: Player[],
  nationAssignments: Partial<Record<Nationality, string>>,
): Player | undefined {
  const playerId = nationAssignments[nationality];
  return players.find((player) => player.id === playerId);
}
