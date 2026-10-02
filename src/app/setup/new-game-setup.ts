import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { Alliance, NATION_ALLIANCE, NATIONALITIES, Nationality } from '@ww2/shared/nationality';
import { VICTORY_CONDITION_LABEL, VictoryCondition } from '@ww2/victory/data/victory-cities';
import { ALL_TECH_IDS } from '../session/session-state';
import { GameSessionService } from '../game/game-session.service';

interface DraftPlayer {
  id: string;
  name: string;
}

const NATION_LABELS: Record<Nationality, string> = {
  [Nationality.SOVIET_UNION]: 'Soviet Union',
  [Nationality.GERMANY]: 'Germany',
  [Nationality.UNITED_KINGDOM]: 'United Kingdom',
  [Nationality.JAPAN]: 'Japan',
  [Nationality.UNITED_STATES]: 'United States',
};

/** The player a nation defaults to: all Allies to player 1, all Axis to player 2. */
function defaultPlayerFor(nationality: Nationality): string {
  return NATION_ALLIANCE[nationality] === Alliance.AXIS ? 'p2' : 'p1';
}

@Component({
  selector: 'ww2-new-game-setup',
  imports: [],
  templateUrl: './new-game-setup.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './new-game-setup.scss',
})
export class NewGameSetup {
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);

  protected readonly nationalities = NATIONALITIES;

  private nextPlayerId = 3;
  protected readonly players = signal<DraftPlayer[]>([
    { id: 'p1', name: 'Player 1' },
    { id: 'p2', name: 'Player 2' },
  ]);

  protected readonly nationAssignments = signal<Partial<Record<Nationality, string>>>(
    NATIONALITIES.reduce(
      (assignments, nationality) => {
        assignments[nationality] = defaultPlayerFor(nationality);
        return assignments;
      },
      {} as Partial<Record<Nationality, string>>,
    ),
  );

  protected readonly victoryConditions: VictoryCondition[] = ['minor', 'major', 'total'];
  protected readonly victoryCondition = signal<VictoryCondition>('minor');

  protected victoryLabel(condition: VictoryCondition): string {
    return VICTORY_CONDITION_LABEL[condition];
  }

  protected setVictoryCondition(condition: VictoryCondition): void {
    this.victoryCondition.set(condition);
  }

  protected readonly canStart = computed(() => {
    const players = this.players();
    if (players.length < 2 || players.some((player) => !player.name.trim())) {
      return false;
    }
    const assignments = this.nationAssignments();
    return NATIONALITIES.every((nationality) =>
      players.some((player) => player.id === assignments[nationality]),
    );
  });

  protected nationLabel(nationality: Nationality): string {
    return NATION_LABELS[nationality];
  }

  protected addPlayer(): void {
    const number = this.nextPlayerId++;
    const id = `p${number}`;
    this.players.update((players) => [...players, { id, name: `Player ${number}` }]);
  }

  protected removePlayer(id: string): void {
    if (this.players().length <= 2) {
      return;
    }
    this.players.update((players) => players.filter((player) => player.id !== id));
    // Reassign any nations that pointed at the removed player back to the first player.
    const firstId = this.players()[0]?.id;
    this.nationAssignments.update((assignments) => {
      const updated = { ...assignments };
      for (const nationality of NATIONALITIES) {
        if (updated[nationality] === id) {
          updated[nationality] = firstId;
        }
      }
      return updated;
    });
  }

  protected setPlayerName(id: string, name: string): void {
    this.players.update((players) =>
      players.map((player) => (player.id === id ? { ...player, name } : player)),
    );
  }

  protected assignNation(nationality: Nationality, playerId: string): void {
    this.nationAssignments.update((assignments) => ({
      ...assignments,
      [nationality]: playerId,
    }));
  }

  protected back(): void {
    this.router.navigateByUrl('/');
  }

  protected async startGame(): Promise<void> {
    if (!this.canStart()) {
      return;
    }
    const players = this.players().map((player) => ({
      id: player.id,
      name: player.name.trim(),
    }));
    this.session.startNewGame({
      players,
      nationAssignments: this.nationAssignments(),
      houseRules: {
        // All implemented technologies are always available for research.
        allowedTechIds: [...ALL_TECH_IDS],
        victoryCondition: this.victoryCondition(),
      },
    });
    await this.router.navigateByUrl('/game');
  }
}
