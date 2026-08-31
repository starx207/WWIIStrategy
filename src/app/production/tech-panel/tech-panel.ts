import { Component, computed, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';
import { TechnologyId } from '@ww2/settings/settings-state';
import {
  RESEARCH_DIE_COST,
  TECHNOLOGY_EFFECT,
  TECHNOLOGY_LABEL,
  TECH_TARGET_NUMBER,
} from '@ww2/settings/technology';
import { SettingsActions } from '@ww2/settings/settings-actions';
import { SettingsSelectors } from '@ww2/settings/settings-selectors';
import { EconomyActions } from '@ww2/economy/economy-actions';
import { EconomySelectors } from '@ww2/economy/economy-selectors';
import { GameSelectors } from '@ww2/game/game-selectors';
import { nationalityForGamePhase } from '@ww2/game/game-phase';
import { TurnFlowService } from '@ww2/game/turn-flow.service';
import { Dice } from '@ww2/shared/dice/dice';
import { SessionSelectors } from '../../session/session-selectors';

@Component({
  selector: 'ww2-tech-panel',
  imports: [Dice],
  templateUrl: './tech-panel.html',
  styleUrl: './tech-panel.scss',
})
export class TechPanel {
  private readonly store = inject(Store);
  private readonly turnFlow = inject(TurnFlowService);

  private readonly gamePhase = this.store.selectSignal(GameSelectors.gamePhase);
  private readonly treasuries = this.store.selectSignal(EconomySelectors.treasuryByNationality);
  private readonly techsByNation = this.store.selectSignal(
    SettingsSelectors.technologiesByNationality,
  );
  private readonly houseRules = this.store.selectSignal(SessionSelectors.houseRules);

  protected readonly activeNation = computed(() => nationalityForGamePhase(this.gamePhase()));

  protected readonly treasury = computed(() => {
    const nation = this.activeNation();
    return nation ? this.treasuries()[nation] : 0;
  });

  protected readonly ownedTechs = computed(() => {
    const nation = this.activeNation();
    return nation ? (this.techsByNation()[nation] ?? []) : [];
  });

  protected readonly availableTechs = computed(() =>
    this.houseRules().allowedTechIds.filter((tech) => !this.ownedTechs().includes(tech)),
  );

  private readonly chosenTech = signal<TechnologyId | null>(null);
  /** Falls back to the first available tech until the player picks one. */
  protected readonly selectedTech = computed<TechnologyId | null>(
    () => this.chosenTech() ?? this.availableTechs()[0] ?? null,
  );

  protected readonly diceCount = signal(1);
  protected readonly maxDice = computed(() => Math.floor(this.treasury() / RESEARCH_DIE_COST));
  protected readonly cost = computed(() => this.diceCount() * RESEARCH_DIE_COST);

  protected readonly hasRolled = signal(false);
  protected readonly rollResults = signal<number[]>([]);
  protected readonly rollSuccess = signal(false);

  protected label(tech: TechnologyId): string {
    return TECHNOLOGY_LABEL[tech];
  }

  protected effect(tech: TechnologyId): string {
    return TECHNOLOGY_EFFECT[tech];
  }

  protected target(tech: TechnologyId): number {
    return TECH_TARGET_NUMBER[tech];
  }

  protected isHit(result: number): boolean {
    const tech = this.selectedTech();
    return tech != null && result === this.target(tech);
  }

  protected selectTech(tech: TechnologyId): void {
    if (!this.hasRolled()) {
      this.chosenTech.set(tech);
    }
  }

  protected adjustDice(delta: number): void {
    const next = Math.min(Math.max(1, this.diceCount() + delta), Math.max(1, this.maxDice()));
    this.diceCount.set(next);
  }

  protected canRoll(): boolean {
    return !this.hasRolled() && this.selectedTech() != null && this.maxDice() >= 1;
  }

  protected roll(): void {
    const nation = this.activeNation();
    const tech = this.selectedTech();
    if (!nation || !tech || !this.canRoll()) {
      return;
    }

    const dice = Math.min(Math.max(1, this.diceCount()), this.maxDice());
    this.store.dispatch(new EconomyActions.SpendIpc(nation, dice * RESEARCH_DIE_COST));

    const results = Array.from({ length: dice }, () => Math.floor(Math.random() * 6) + 1);
    const success = results.includes(this.target(tech));

    this.rollResults.set(results);
    this.rollSuccess.set(success);
    this.hasRolled.set(true);

    if (success) {
      this.store.dispatch(new SettingsActions.GrantTechnology(nation, tech));
    }
  }

  /** Advance to the next phase (after rolling, or skipping research entirely). */
  protected advance(): void {
    this.turnFlow.advancePhase();
  }
}
