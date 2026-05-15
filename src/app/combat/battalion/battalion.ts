import { Component, computed, inject, Input, input, signal, Signal } from '@angular/core';
import {
  SquadContextAction,
  SquadDirection,
  SquadComponent,
} from '@ww2/shared/squad-component/squad-component';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { Store } from '@ngxs/store';
import { CombatActions, CombatRole } from '../combat.actions';
import { CombatSelectors } from '../combat-selectors';
import { CombatPhase } from '../combat-phase';
import { UnitType } from '@ww2/shared/unit-type';
import { CombatHit } from '../combat-state';
import { CombatProfile, EffectiveCombatUnit } from '../effective-combat-unit';
import { getDefaultCombatTarget, getPrimaryCombatProfile } from '../effective-combat-unit.reducer';
import { HitPool, unitCanConsumeHit } from '../hit-pool';
import { createSquads } from '../create-squads';

type AssignmentMap = Record<string, CombatHit[]>;

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
    this.readyUnitIds = this.store.selectSignal(CombatSelectors.battleReadyIds(value));
    this.pendingHitCountForRole = this.store.selectSignal(
      CombatSelectors.pendingHitCountForRole(value),
    );
    this.pendingHitPoolForRole = this.store.selectSignal(
      CombatSelectors.pendingHitPoolForRole(value),
    );
    this.casualtiesConfirmed = this.store.selectSignal(CombatSelectors.casualtiesConfirmed(value));
    this.assignedHitsByUnitId = this.store.selectSignal(
      CombatSelectors.assignedHitsByUnitId(value),
    );
  }
  get role(): CombatRole {
    return this.roleFilter;
  }

  fromArmy = input<EffectiveCombatUnit[]>([]);
  protected phase = this.store.selectSignal(CombatSelectors.currentPhase);

  battalionUnits = computed(() => {
    return this.fromArmy().filter(
      (unit) => getDefaultCombatTarget(unit, this.roleFilter) == this.strength(),
    );
  });
  casualtyIds = this.store.selectSignal(CombatSelectors.allCasualtyIds);
  pendingCasualtyIds = this.store.selectSignal(CombatSelectors.pendingCasualties);
  healthyUnits = computed(() => {
    return this.battalionUnits().filter((unit) => !this.casualtyIds().includes(unit.id));
  });
  casualtyUnits = computed(() => {
    return this.battalionUnits().filter((unit) => this.casualtyIds().includes(unit.id));
  });
  protected reloadingUnits = computed(() => {
    return this.battalionUnits().filter((unit) => !this.readyUnitIds().includes(unit.id));
  });
  selectableUnits = computed(() => {
    const battalionUnits = this.battalionUnits();
    if (this.isFirePhase()) {
      return battalionUnits.filter((unit) => this.readyUnitIds().includes(unit.id));
    }

    return [];
  });
  selectedProfile = computed<CombatProfile | undefined>(() => {
    const firstUnit = this.selectableUnits()[0];
    const profilePhase = this.getProfilePhase(this.phase());
    if (!firstUnit || !profilePhase) {
      return undefined;
    }

    return getPrimaryCombatProfile(firstUnit, this.role, { phase: profilePhase });
  });
  selectedShotCount = computed(() => {
    const profilePhase = this.getProfilePhase(this.phase());
    const profileId = this.selectedProfile()?.id;
    if (!profilePhase || !profileId) {
      return 0;
    }

    return this.selectableUnits().reduce((total, unit) => {
      const profile = getPrimaryCombatProfile(unit, this.role, { phase: profilePhase });
      if (!profile || profile.id !== profileId || profile.target !== this.strength()) {
        return total;
      }

      return total + profile.shotsPerRound;
    }, 0);
  });
  canFire = computed(() => {
    const selectedProfile = this.selectedProfile();
    return (
      this.selectableUnits().length > 0 &&
      this.selectedShotCount() > 0 &&
      selectedProfile !== undefined &&
      selectedProfile.target === this.strength()
    );
  });

  readyUnitIds: Signal<string[]> = signal<string[]>([]).asReadonly();
  damageMap = this.store.selectSignal(CombatSelectors.damageMap);
  pendingHitCountForRole: Signal<number> = signal(0).asReadonly();
  pendingHitPoolForRole: Signal<HitPool> = signal<HitPool>({}).asReadonly();
  casualtiesConfirmed: Signal<boolean> = signal(false).asReadonly();
  assignedHitsByUnitId: Signal<AssignmentMap> = signal<AssignmentMap>({}).asReadonly();

  protected hostClasses = computed(
    () =>
      `battalion battalion__${this.roleFilter} ${
        this.healthySquads().some((s) => s.enabled) || this.casualtySquads().some((s) => s.enabled)
          ? 'battalion__selectable'
          : ''
      }`,
  );
  protected squadDirection = computed<SquadDirection>(() =>
    this.roleFilter == 'defend' ? 'left-face' : 'right-face',
  );
  protected isCasualtyPhase = this.store.selectSignal(CombatSelectors.isCasualtyPhase);
  protected isFirePhase = this.store.selectSignal(CombatSelectors.isFirePhase);
  protected canAssignCasualties = computed(
    () =>
      this.isCasualtyPhase() && this.pendingHitCountForRole() > 0 && !this.casualtiesConfirmed(),
  );
  protected canUndoCasualties = computed(
    () => this.isCasualtyPhase() && !this.casualtiesConfirmed(),
  );
  private readonly repairBattleshipAction: SquadContextAction = {
    id: 'repair-battleship',
    label: 'Repair',
    isEnabled: (squad) => this.getRepairTarget(squad) !== undefined,
    execute: (squad) => {
      const repairTarget = this.getRepairTarget(squad);
      if (!repairTarget) {
        return;
      }

      this.store.dispatch(new CombatActions.UndoCasualties([repairTarget], this.role));
    },
  };

  protected healthySquads = computed(() => {
    const readyUnits = this.readyUnitIds();
    return createSquads(this.healthyUnits(), {
      separateUnits: readyUnits,
      damageMap: this.damageMap(),
    }).map((squad) => ({
      squad,
      enabled:
        (!this.isCasualtyPhase() && this.canFire() && !squad.isSubsetOf(this.reloadingUnits())) ||
        (this.canAssignCasualties() &&
          squad.units.some((unit) => unitCanConsumeHit(this.pendingHitPoolForRole(), unit))),
    }));
  });

  protected casualtySquads = computed(() => {
    const readyUnits = this.readyUnitIds();
    const squads = createSquads(this.casualtyUnits(), { separateUnits: readyUnits });
    squads.sort((a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0));
    return squads.map((squad) => ({
      squad,
      enabled:
        (this.canUndoCasualties() && squad.intersectsWith(this.pendingCasualtyIds())) ||
        (this.isFirePhase() && this.canFire() && !squad.isSubsetOf(this.reloadingUnits())),
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

  protected contextActionsForSquad(squad: MilitaryUnitSquad): SquadContextAction[] {
    if (squad.type === UnitType.BATTLESHIP) {
      return [this.repairBattleshipAction];
    }

    return [];
  }

  private getRepairTarget(squad: MilitaryUnitSquad): MilitaryUnit | undefined {
    if (!this.canUndoCasualties()) {
      return undefined;
    }

    const assignedHits = this.assignedHitsByUnitId();
    return squad.units.find(
      (unit) => unit.type === UnitType.BATTLESHIP && (assignedHits[unit.id]?.length ?? 0) > 0,
    );
  }

  private getProfilePhase(phase?: CombatPhase): CombatPhase | undefined {
    if (phase === CombatPhase.OPENING_FIRE || phase === CombatPhase.COMBAT) {
      return phase;
    }

    return undefined;
  }
}
