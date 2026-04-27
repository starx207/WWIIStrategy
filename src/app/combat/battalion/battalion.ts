import { Component, computed, inject, Input, input, signal, Signal } from '@angular/core';
import { SquadDirection, SquadComponent } from '@ww2/shared/squad-component/squad-component';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { createSquads, MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { Store } from '@ngxs/store';
import { CombatActions, CombatRole } from '../combat.actions';
import { CombatSelectors } from '../combat-selectors';
import { CombatPhase } from '../combat-phase';

@Component({
  selector: 'ww2-battalion',
  imports: [SquadComponent],
  templateUrl: './battalion.html',
  styleUrl: './battalion.scss',
  host: {
    '[class]': 'hostClasses()',
  },
})
export class Battalion {
  private roleFilter!: CombatRole;
  private readonly store = inject(Store);

  strength = input.required<number>();
  @Input({ required: true })
  set role(value: CombatRole) {
    this.roleFilter = value;
    this.readyUnits = this.store.selectSignal(CombatSelectors.battleReadyUnits(value));
    this.pendingHitCountForRole = this.store.selectSignal(
      CombatSelectors.pendingHitCountForRole(value),
    );
    this.casualtiesConfirmed = this.store.selectSignal(CombatSelectors.casualtiesConfirmed(value));
  }
  get role(): CombatRole {
    return this.roleFilter;
  }

  fromArmy = input<MilitaryUnit[]>([]);

  battalionUnits = computed(() =>
    this.fromArmy().filter(
      (unit) => (this.roleFilter == 'attack' ? unit.attack : unit.defense) == this.strength(),
    ),
  );
  casualtyIds = this.store.selectSignal(CombatSelectors.allCasualtyIds);
  pendingCasualtyIds = this.store.selectSignal(CombatSelectors.pendingCasualties);
  healthyUnits = computed(() => {
    return this.battalionUnits().filter((unit) => !this.casualtyIds().includes(unit.id));
  });
  casualtyUnits = computed(() => {
    return this.battalionUnits().filter((unit) => this.casualtyIds().includes(unit.id));
  });
  protected reloadingUnits = computed(() => {
    return this.battalionUnits().filter((unit) => !this.readyUnits().includes(unit));
  });

  readyUnits: Signal<MilitaryUnit[]> = signal<MilitaryUnit[]>([]).asReadonly();
  damageMap = this.store.selectSignal(CombatSelectors.damageMap);
  pendingHitCountForRole: Signal<number> = signal(0).asReadonly();
  casualtiesConfirmed: Signal<boolean> = signal(false).asReadonly();
  protected phase = this.store.selectSignal(CombatSelectors.currentPhase);

  protected hostClasses = computed(
    () =>
      `battalion battalion__${this.roleFilter} ${this.healthySquads().some((s) => s.enabled) ? 'battalion__selectable' : ''}`,
  );
  protected squadDirection = computed<SquadDirection>(() =>
    this.roleFilter == 'defend' ? 'left-face' : 'right-face',
  );
  protected isCasualtyPhase = this.store.selectSignal(CombatSelectors.isCasualtyPhase);
  protected canAssignCasualties = computed(
    () =>
      this.isCasualtyPhase() && this.pendingHitCountForRole() > 0 && !this.casualtiesConfirmed(),
  );
  protected canUndoCasualties = computed(
    () => this.isCasualtyPhase() && !this.casualtiesConfirmed(),
  );

  protected healthySquads = computed(() => {
    const readyUnits = this.readyUnits();
    return createSquads(this.healthyUnits(), {
      separateUnits: readyUnits,
      damageMap: this.damageMap(),
    }).map((squad) => ({
      squad,
      enabled:
        (!this.isCasualtyPhase() && !squad.isSubsetOf(this.reloadingUnits())) ||
        this.canAssignCasualties() ||
        (this.phase() === CombatPhase.REGROUP &&
          this.role === 'attack' &&
          squad.units.some((unit) => unit.attack > 0)),
    }));
  });

  protected casualtySquads = computed(() => {
    const readyUnits = this.readyUnits();
    const squads = createSquads(this.casualtyUnits(), { separateUnits: readyUnits });
    squads.sort((a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0));
    return squads.map((squad) => ({
      squad,
      enabled: this.canUndoCasualties() && squad.intersectsWith(this.pendingCasualtyIds()),
    }));
  });

  protected electCasualty(squad: MilitaryUnitSquad) {
    if (!this.canAssignCasualties()) {
      return;
    }

    const casualty = squad.units[0];
    this.store.dispatch(new CombatActions.CasualtiesElected([casualty], this.role));
  }

  protected undoCasualty(squad: MilitaryUnitSquad) {
    if (!this.canUndoCasualties()) {
      return;
    }

    const casualty = squad.units[0];
    this.store.dispatch(new CombatActions.UndoCasualties([casualty], this.role));
  }
}
