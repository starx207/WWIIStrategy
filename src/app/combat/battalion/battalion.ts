import { Component, computed, inject, Input, input, Signal } from '@angular/core';
import { SquadDirection, SquadComponent } from '@ww2/shared/squad-component/squad-component';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { createSquads, MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { Store } from '@ngxs/store';
import { CombatActions, CombatRole } from '../combat.actions';
import { CombatSelectors } from '../combat-selectors';

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
  }
  get role(): CombatRole {
    return this.roleFilter;
  }

  fromArmy = input<MilitaryUnit[]>([]);

  battalionUnits = computed(() =>
    this.fromArmy().filter(
      (unit) => (this.roleFilter == 'attack' ? unit.attack : unit.defense) == this.strength()
    )
  );
  casualtyIds = this.store.selectSignal(CombatSelectors.allCasualtyIds);
  healthyUnits = computed(() => {
    return this.battalionUnits().filter((unit) => !this.casualtyIds().includes(unit.id));
  });
  casualtyUnits = computed(() => {
    return this.battalionUnits().filter((unit) => this.casualtyIds().includes(unit.id));
  });

  readyUnits!: Signal<MilitaryUnit[]>;

  protected hostClasses = computed(() => `battalion battalion__${this.roleFilter}`);
  protected squadDirection = computed<SquadDirection>(() =>
    this.roleFilter == 'defend' ? 'left-face' : 'right-face'
  );
  protected pendingHits = this.store.selectSignal(CombatSelectors.pendingHitValues);
  protected activeRole = this.store.selectSignal(CombatSelectors.activeCombatRole);
  protected readyToFire = computed(
    () => this.role === this.activeRole() && this.pendingHits().length === 0
  );
  protected casualtiesPending = computed(
    () => this.role !== this.activeRole() && this.pendingHits().length > 0
  );

  protected healthySquads = computed(() => {
    const readyUnits = this.readyUnits();
    return createSquads(this.healthyUnits(), { separateUnits: readyUnits }).map((squad) => ({
      squad,
      enabled: this.casualtiesPending() || (this.readyToFire() && squad.isSubsetOf(readyUnits)),
    }));
  });

  protected casualtySquads = computed(() => {
    const readyUnits = this.readyUnits();
    return createSquads(this.casualtyUnits(), { separateUnits: readyUnits }).map((squad) => ({
      squad,
      enabled: this.casualtiesPending() || (this.readyToFire() && squad.isSubsetOf(readyUnits)),
    }));
  });

  protected selectSquad(squad: MilitaryUnitSquad) {
    // Squad selection is for electing casualties,
    // so if the current role is the same role as this battalion,
    // squad selection does nothing.
    const currentRole = this.store.selectSnapshot(CombatSelectors.activeCombatRole);
    if (currentRole === this.role) {
      return;
    }

    const pendingHits = this.store.selectSnapshot(CombatSelectors.pendingHitValues);
    if (pendingHits.length === 0) {
      return;
    }

    const casualty = squad.units[0];
    this.store.dispatch(new CombatActions.CasualtiesElected([casualty]));
  }
}
