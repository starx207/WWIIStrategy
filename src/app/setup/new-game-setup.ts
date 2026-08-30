import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NATIONALITIES, Nationality } from '@ww2/shared/nationality';
import { TechnologyId } from '@ww2/settings/settings-state';
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

const TECH_LABELS: Record<TechnologyId, string> = {
  'jet-fighters': 'Jet Fighters',
  'heavy-bombers': 'Heavy Bombers',
  'super-submarines': 'Super Submarines',
};

@Component({
  selector: 'ww2-new-game-setup',
  imports: [],
  templateUrl: './new-game-setup.html',
  styleUrl: './new-game-setup.scss',
})
export class NewGameSetup {
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);

  protected readonly nationalities = NATIONALITIES;
  protected readonly allTechIds = ALL_TECH_IDS;

  private nextPlayerId = 3;
  protected readonly players = signal<DraftPlayer[]>([
    { id: 'p1', name: '' },
    { id: 'p2', name: '' },
  ]);

  protected readonly nationAssignments = signal<Partial<Record<Nationality, string>>>(
    NATIONALITIES.reduce(
      (assignments, nationality) => {
        assignments[nationality] = 'p1';
        return assignments;
      },
      {} as Partial<Record<Nationality, string>>,
    ),
  );

  protected readonly allowedTechIds = signal<Set<TechnologyId>>(new Set(ALL_TECH_IDS));

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

  protected techLabel(techId: TechnologyId): string {
    return TECH_LABELS[techId];
  }

  protected addPlayer(): void {
    const id = `p${this.nextPlayerId++}`;
    this.players.update((players) => [...players, { id, name: '' }]);
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

  protected toggleTech(techId: TechnologyId): void {
    this.allowedTechIds.update((current) => {
      const updated = new Set(current);
      if (updated.has(techId)) {
        updated.delete(techId);
      } else {
        updated.add(techId);
      }
      return updated;
    });
  }

  protected isTechAllowed(techId: TechnologyId): boolean {
    return this.allowedTechIds().has(techId);
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
      houseRules: { allowedTechIds: [...this.allowedTechIds()] },
    });
    await this.router.navigateByUrl('/game');
  }
}
