import { Action, State, StateContext } from '@ngxs/store';
import { Injectable } from '@angular/core';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { AIR_UNIT_TYPES } from '@ww2/shared/unit-type';
import { CombatActions, CombatRole } from './combat.actions';
import { CombatRules } from './combat-rules';
import { TEST_ATTACKERS, TEST_DEFENDERS } from '../../dev-data';
import { CombatPhase } from './combat-phase';
import { getCombatProfiles, getHitPoints } from '@ww2/shared/effective-unit';

export type CombatOutcome =
  | 'ongoing'
  | 'attackerVictory'
  | 'defenderVictory';

export type CombatResolutionReason =
  | 'retreat'
  | 'attackersEliminated'
  | 'defendersEliminated';

type AssignmentMap = Record<string, number>;

type FirePhase = CombatPhase.OPENING_FIRE | CombatPhase.COMBAT;
type CasualtyPhase = CombatPhase.OPENING_FIRE_CASUALTIES | CombatPhase.COMBAT_CASUALTIES;

interface OutcomeResolution {
  outcome: CombatOutcome;
  canCaptureTerritory: boolean;
  resolutionReason?: CombatResolutionReason;
}

export interface BattleResolutionSummary {
  outcome: Exclude<CombatOutcome, 'ongoing'>;
  winner: CombatRole;
  resolutionReason: CombatResolutionReason;
  territory?: string;
  territoryCaptured: boolean;
  canCaptureTerritory: boolean;
  attackerRetreated: boolean;
  rounds: number;
  attackingUnitsRemaining: number;
  defendingUnitsRemaining: number;
}

export interface CombatStateModel {
  territory?: string;
  attackingArmy: MilitaryUnit[];
  defendingArmy: MilitaryUnit[];
  currentPhase?: CombatPhase;
  attackerReadyToFireIds: string[];
  defenderReadyToFireIds: string[];
  attackerHitsToAssign: number;
  defenderHitsToAssign: number;
  attackerAssignedHitsByUnitId: AssignmentMap;
  defenderAssignedHitsByUnitId: AssignmentMap;
  attackerCasualtiesConfirmed: boolean;
  defenderCasualtiesConfirmed: boolean;
  unitDamageById: AssignmentMap;
  outcome: CombatOutcome;
  canCaptureTerritory: boolean;
  resolutionSummary: BattleResolutionSummary | null;
  round: number;
}

const DEFAULT_STATE: CombatStateModel = {
  territory: 'TestTerritory',
  attackingArmy: [],
  defendingArmy: [],
  currentPhase: undefined,
  attackerReadyToFireIds: [],
  defenderReadyToFireIds: [],
  attackerHitsToAssign: 0,
  defenderHitsToAssign: 0,
  attackerAssignedHitsByUnitId: {},
  defenderAssignedHitsByUnitId: {},
  attackerCasualtiesConfirmed: false,
  defenderCasualtiesConfirmed: false,
  unitDamageById: {},
  outcome: 'ongoing',
  canCaptureTerritory: false,
  resolutionSummary: null,
  round: 0,
};

type CombatStateContext = StateContext<CombatStateModel>;

@State<CombatStateModel>({
  name: 'activeCombat',
  defaults: DEFAULT_STATE,
})
@Injectable()
export class CombatState {
  @Action(CombatActions.PreparingBattlefield)
  prepareBattlefield(context: CombatStateContext) {
    const attackingArmy = [...TEST_ATTACKERS];
    const defendingArmy = [...TEST_DEFENDERS];

    const baseState: CombatStateModel = {
      ...DEFAULT_STATE,
      attackingArmy,
      defendingArmy,
      unitDamageById: this.buildInitialDamageMap(attackingArmy, defendingArmy),
    };

    const initialOutcome = this.evaluateOutcome(attackingArmy, defendingArmy);
    if (initialOutcome.outcome !== 'ongoing') {
      context.setState({
        ...baseState,
        outcome: initialOutcome.outcome,
        canCaptureTerritory: initialOutcome.canCaptureTerritory,
        resolutionSummary: this.buildResolutionSummary(
          baseState,
          attackingArmy,
          defendingArmy,
          initialOutcome,
        ),
      });
      return;
    }

    const openingFireEligible = this.getEligibleUnitsForPhase(
      CombatPhase.OPENING_FIRE,
      attackingArmy,
      defendingArmy,
    );

    const shouldStartWithOpeningFire =
      openingFireEligible.attackers.length > 0 || openingFireEligible.defenders.length > 0;
    const startingPhase = shouldStartWithOpeningFire ? CombatPhase.OPENING_FIRE : CombatPhase.COMBAT;

    this.startFirePhase(context, startingPhase, baseState);
  }

  @Action(CombatActions.CombatantsFiring)
  giveThemAVolley(context: CombatStateContext, action: CombatActions.CombatantsFiring) {
    const state = context.getState();
    if (state.outcome !== 'ongoing') {
      return;
    }

    if (state.currentPhase !== CombatPhase.OPENING_FIRE && state.currentPhase !== CombatPhase.COMBAT) {
      return;
    }

    const readyIds =
      action.role === 'attack' ? state.attackerReadyToFireIds : state.defenderReadyToFireIds;
    if (readyIds.length === 0) {
      return;
    }

    const readyIdSet = new Set(readyIds);
    const targetByFiringUnitId: Record<string, number> = {};
    const shotsByFiringUnitId: Record<string, number> = {};
    let availableShotCount = action.shotValues.length;
    const firingUnitIds = action.units
      .filter((unit) => readyIdSet.has(unit.id))
      .filter((unit) => {
        const profile = getCombatProfiles(unit, {
          phase: state.currentPhase,
          role: action.role,
        }).find((candidate) => candidate.id === action.profileId);
        if (!profile) {
          return false;
        }
        if (profile.targetKind !== 'unit' || profile.damage.type !== 'unit-hit') {
          return false;
        }

        targetByFiringUnitId[unit.id] = profile.target;
        shotsByFiringUnitId[unit.id] = profile.shotsPerRound;
        return true;
      })
      .filter((unit) => {
        const shotsPerRound = shotsByFiringUnitId[unit.id] ?? 0;
        if (shotsPerRound <= 0 || shotsPerRound > availableShotCount) {
          return false;
        }

        availableShotCount -= shotsPerRound;
        return true;
      })
      .map((unit) => unit.id);

    if (firingUnitIds.length === 0) {
      return;
    }

    const targetValue = targetByFiringUnitId[firingUnitIds[0]];
    if (targetValue === undefined) {
      return;
    }
    const shotCount = firingUnitIds.reduce(
      (total, unitId) => total + (shotsByFiringUnitId[unitId] ?? 0),
      0,
    );

    const hitsScored = CombatRules.determineHits({
      values: action.shotValues.slice(0, shotCount),
      target: targetValue,
    }).hits.length;
    const opposingArmyRemainingHitPoints = this.getTotalRemainingHitPoints(
      action.role === 'attack' ? state.defendingArmy : state.attackingArmy,
      state.unitDamageById,
    );

    let attackerReadyToFireIds = state.attackerReadyToFireIds;
    let defenderReadyToFireIds = state.defenderReadyToFireIds;
    let attackerHitsToAssign = state.attackerHitsToAssign;
    let defenderHitsToAssign = state.defenderHitsToAssign;

    if (action.role === 'attack') {
      attackerReadyToFireIds = state.attackerReadyToFireIds.filter((id) => !firingUnitIds.includes(id));
      defenderHitsToAssign = Math.min(
        state.defenderHitsToAssign + hitsScored,
        opposingArmyRemainingHitPoints,
      );
    } else {
      defenderReadyToFireIds = state.defenderReadyToFireIds.filter((id) => !firingUnitIds.includes(id));
      attackerHitsToAssign = Math.min(
        state.attackerHitsToAssign + hitsScored,
        opposingArmyRemainingHitPoints,
      );
    }

    const updatedState: CombatStateModel = {
      ...state,
      attackerReadyToFireIds,
      defenderReadyToFireIds,
      attackerHitsToAssign,
      defenderHitsToAssign,
    };

    context.setState(updatedState);

    if (attackerReadyToFireIds.length === 0 && defenderReadyToFireIds.length === 0) {
      this.advanceAfterFirePhase(context, updatedState);
    }
  }

  @Action(CombatActions.CasualtiesElected)
  addCasualties(context: CombatStateContext, action: CombatActions.CasualtiesElected) {
    const state = context.getState();
    if (!this.isCasualtyPhase(state.currentPhase)) {
      return;
    }

    if (action.role === 'attack' && state.attackerCasualtiesConfirmed) {
      return;
    }
    if (action.role === 'defend' && state.defenderCasualtiesConfirmed) {
      return;
    }

    const hitsToAssign = action.role === 'attack' ? state.attackerHitsToAssign : state.defenderHitsToAssign;
    if (hitsToAssign <= 0) {
      return;
    }

    const assignments = {
      ...(action.role === 'attack'
        ? state.attackerAssignedHitsByUnitId
        : state.defenderAssignedHitsByUnitId),
    };

    const roleArmy = action.role === 'attack' ? state.attackingArmy : state.defendingArmy;
    const roleArmyIds = new Set(roleArmy.map((unit) => unit.id));

    let remainingHits = hitsToAssign - this.totalAssignedHits(assignments);
    if (remainingHits <= 0) {
      return;
    }

    for (const casualty of action.casualties) {
      if (remainingHits <= 0) {
        break;
      }

      if (!roleArmyIds.has(casualty.id)) {
        continue;
      }

      const remainingCapacity = this.getRemainingHitCapacityForUnit(state, action.role, casualty, assignments);
      if (remainingCapacity <= 0) {
        continue;
      }

      assignments[casualty.id] = (assignments[casualty.id] ?? 0) + 1;
      remainingHits -= 1;
    }

    if (action.role === 'attack') {
      context.patchState({
        attackerAssignedHitsByUnitId: assignments,
      });
    } else {
      context.patchState({
        defenderAssignedHitsByUnitId: assignments,
      });
    }
  }

  @Action(CombatActions.UndoCasualties)
  undoCasualties(context: CombatStateContext, action: CombatActions.UndoCasualties) {
    const state = context.getState();
    if (!this.isCasualtyPhase(state.currentPhase)) {
      return;
    }

    if (action.role === 'attack' && state.attackerCasualtiesConfirmed) {
      return;
    }
    if (action.role === 'defend' && state.defenderCasualtiesConfirmed) {
      return;
    }

    const assignments = {
      ...(action.role === 'attack'
        ? state.attackerAssignedHitsByUnitId
        : state.defenderAssignedHitsByUnitId),
    };

    for (const casualty of action.casualties) {
      const currentHits = assignments[casualty.id] ?? 0;
      if (currentHits <= 0) {
        continue;
      }

      delete assignments[casualty.id];
    }

    if (action.role === 'attack') {
      context.patchState({
        attackerAssignedHitsByUnitId: assignments,
      });
    } else {
      context.patchState({
        defenderAssignedHitsByUnitId: assignments,
      });
    }
  }

  @Action(CombatActions.ConfirmCasualties)
  confirmCasualties(context: CombatStateContext, action: CombatActions.ConfirmCasualties) {
    const state = context.getState();
    if (!this.isCasualtyPhase(state.currentPhase)) {
      return;
    }

    const hitsToAssign = action.role === 'attack' ? state.attackerHitsToAssign : state.defenderHitsToAssign;
    const assignments =
      action.role === 'attack'
        ? state.attackerAssignedHitsByUnitId
        : state.defenderAssignedHitsByUnitId;

    if (this.totalAssignedHits(assignments) !== hitsToAssign) {
      return;
    }

    if (action.role === 'attack') {
      context.patchState({ attackerCasualtiesConfirmed: true });
    } else {
      context.patchState({ defenderCasualtiesConfirmed: true });
    }

    const updatedState = context.getState();
    if (updatedState.attackerCasualtiesConfirmed && updatedState.defenderCasualtiesConfirmed) {
      this.resolveConfirmedCasualties(context, updatedState);
    }
  }

  @Action(CombatActions.PressAttack)
  pressAttack(context: CombatStateContext) {
    const state = context.getState();
    if (state.currentPhase !== CombatPhase.REGROUP || state.outcome !== 'ongoing') {
      return;
    }

    this.startFirePhase(context, CombatPhase.COMBAT, state);
  }

  @Action(CombatActions.Retreat)
  retreat(context: CombatStateContext) {
    const state = context.getState();
    if (state.currentPhase !== CombatPhase.REGROUP || state.outcome !== 'ongoing') {
      return;
    }

    context.patchState({
      currentPhase: undefined,
      attackerReadyToFireIds: [],
      defenderReadyToFireIds: [],
      attackerHitsToAssign: 0,
      defenderHitsToAssign: 0,
      attackerAssignedHitsByUnitId: {},
      defenderAssignedHitsByUnitId: {},
      attackerCasualtiesConfirmed: false,
      defenderCasualtiesConfirmed: false,
      outcome: 'defenderVictory',
      canCaptureTerritory: false,
      resolutionSummary: this.buildResolutionSummary(
        state,
        state.attackingArmy,
        state.defendingArmy,
        {
          outcome: 'defenderVictory',
          canCaptureTerritory: false,
          resolutionReason: 'retreat',
        },
      ),
    });
  }

  private startFirePhase(context: CombatStateContext, phase: FirePhase, baseState: CombatStateModel) {
    const nextState: CombatStateModel = {
      ...baseState,
      ...this.buildFirePhasePatch(baseState, phase),
    };

    if (nextState.attackerReadyToFireIds.length === 0 && nextState.defenderReadyToFireIds.length === 0) {
      if (phase === CombatPhase.OPENING_FIRE) {
        this.startFirePhase(context, CombatPhase.COMBAT, nextState);
        return;
      }

      context.setState({
        ...nextState,
        currentPhase: CombatPhase.REGROUP,
      });
      return;
    }

    context.setState(nextState);
  }

  private buildFirePhasePatch(state: CombatStateModel, phase: FirePhase): Partial<CombatStateModel> {
    const { attackers, defenders } = this.getEligibleUnitsForPhase(
      phase,
      state.attackingArmy,
      state.defendingArmy,
    );

    const attackerReadyToFireIds = attackers.map((unit) => unit.id);
    const defenderReadyToFireIds = defenders.map((unit) => unit.id);

    return {
      currentPhase: phase,
      attackerReadyToFireIds,
      defenderReadyToFireIds,
      attackerHitsToAssign: 0,
      defenderHitsToAssign: 0,
      attackerAssignedHitsByUnitId: {},
      defenderAssignedHitsByUnitId: {},
      attackerCasualtiesConfirmed: false,
      defenderCasualtiesConfirmed: false,
      round: phase === CombatPhase.COMBAT ? state.round + 1 : state.round,
    };
  }

  private advanceAfterFirePhase(context: CombatStateContext, state: CombatStateModel) {
    const noHitsScoredByEitherSide = state.attackerHitsToAssign === 0 && state.defenderHitsToAssign === 0;

    if (noHitsScoredByEitherSide) {
      if (state.currentPhase === CombatPhase.OPENING_FIRE) {
        this.startFirePhase(context, CombatPhase.COMBAT, state);
        return;
      }

      context.setState({
        ...state,
        currentPhase: CombatPhase.REGROUP,
      });
      return;
    }

    const casualtyPhase: CasualtyPhase =
      state.currentPhase === CombatPhase.OPENING_FIRE
        ? CombatPhase.OPENING_FIRE_CASUALTIES
        : CombatPhase.COMBAT_CASUALTIES;

    context.setState({
      ...state,
      currentPhase: casualtyPhase,
      attackerReadyToFireIds: [],
      defenderReadyToFireIds: [],
      attackerCasualtiesConfirmed: state.attackerHitsToAssign === 0,
      defenderCasualtiesConfirmed: state.defenderHitsToAssign === 0,
    });
  }

  private resolveConfirmedCasualties(context: CombatStateContext, state: CombatStateModel) {
    if (!this.isCasualtyPhase(state.currentPhase)) {
      return;
    }

    const nextDamageById: AssignmentMap = { ...state.unitDamageById };
    for (const [unitId, hits] of Object.entries(state.attackerAssignedHitsByUnitId)) {
      nextDamageById[unitId] = (nextDamageById[unitId] ?? 0) + hits;
    }
    for (const [unitId, hits] of Object.entries(state.defenderAssignedHitsByUnitId)) {
      nextDamageById[unitId] = (nextDamageById[unitId] ?? 0) + hits;
    }

    const survivingAttackers = state.attackingArmy.filter(
      (unit) => (nextDamageById[unit.id] ?? 0) < getHitPoints(unit),
    );
    const survivingDefenders = state.defendingArmy.filter(
      (unit) => (nextDamageById[unit.id] ?? 0) < getHitPoints(unit),
    );

    const survivingDamageById = this.buildSurvivingDamageMap(
      survivingAttackers,
      survivingDefenders,
      nextDamageById,
    );

    const outcome = this.evaluateOutcome(survivingAttackers, survivingDefenders);
    const postResolutionState: CombatStateModel = {
      ...state,
      attackingArmy: survivingAttackers,
      defendingArmy: survivingDefenders,
      unitDamageById: survivingDamageById,
      attackerReadyToFireIds: [],
      defenderReadyToFireIds: [],
      attackerHitsToAssign: 0,
      defenderHitsToAssign: 0,
      attackerAssignedHitsByUnitId: {},
      defenderAssignedHitsByUnitId: {},
      attackerCasualtiesConfirmed: false,
      defenderCasualtiesConfirmed: false,
      outcome: outcome.outcome,
      canCaptureTerritory: outcome.canCaptureTerritory,
      resolutionSummary: this.buildResolutionSummary(
        state,
        survivingAttackers,
        survivingDefenders,
        outcome,
      ),
    };

    if (outcome.outcome !== 'ongoing') {
      context.setState({
        ...postResolutionState,
        currentPhase: undefined,
      });
      return;
    }

    if (state.currentPhase === CombatPhase.OPENING_FIRE_CASUALTIES) {
      this.startFirePhase(context, CombatPhase.COMBAT, postResolutionState);
      return;
    }

    context.setState({
      ...postResolutionState,
      currentPhase: CombatPhase.REGROUP,
    });
  }

  private getEligibleUnitsForPhase(
    phase: FirePhase,
    attackers: MilitaryUnit[],
    defenders: MilitaryUnit[],
  ): { attackers: MilitaryUnit[]; defenders: MilitaryUnit[] } {
    return CombatRules.filterEligibleUnits(phase, attackers, defenders);
  }

  private buildInitialDamageMap(attackers: MilitaryUnit[], defenders: MilitaryUnit[]): AssignmentMap {
    const damageById: AssignmentMap = {};
    for (const unit of [...attackers, ...defenders]) {
      damageById[unit.id] = 0;
    }
    return damageById;
  }

  private buildSurvivingDamageMap(
    attackers: MilitaryUnit[],
    defenders: MilitaryUnit[],
    damageById: AssignmentMap,
  ): AssignmentMap {
    const map: AssignmentMap = {};
    for (const unit of [...attackers, ...defenders]) {
      const damage = damageById[unit.id] ?? 0;
      if (damage > 0) {
        map[unit.id] = damage;
      }
    }
    return map;
  }

  private isCasualtyPhase(phase?: CombatPhase): phase is CasualtyPhase {
    return phase === CombatPhase.OPENING_FIRE_CASUALTIES || phase === CombatPhase.COMBAT_CASUALTIES;
  }

  private totalAssignedHits(assignments: AssignmentMap): number {
    return Object.values(assignments).reduce((total, hits) => total + hits, 0);
  }

  private getRemainingHitCapacityForUnit(
    state: CombatStateModel,
    role: CombatRole,
    unit: MilitaryUnit,
    assignments: AssignmentMap,
  ): number {
    const isExpectedRoleUnit =
      role === 'attack'
        ? state.attackingArmy.some((candidate) => candidate.id === unit.id)
        : state.defendingArmy.some((candidate) => candidate.id === unit.id);

    if (!isExpectedRoleUnit) {
      return 0;
    }

    const persistentDamage = state.unitDamageById[unit.id] ?? 0;
    const assignedDamage = assignments[unit.id] ?? 0;
    return getHitPoints(unit) - persistentDamage - assignedDamage;
  }

  private getTotalRemainingHitPoints(units: MilitaryUnit[], damageById: AssignmentMap): number {
    return units.reduce((total, unit) => {
      return total + Math.max(0, getHitPoints(unit) - (damageById[unit.id] ?? 0));
    }, 0);
  }

  private evaluateOutcome(attackers: MilitaryUnit[], defenders: MilitaryUnit[]): OutcomeResolution {
    const attackingCombatants = attackers.filter((unit) => !NEUTRAL_UNIT_TYPES.includes(unit.type));
    const defendingCombatants = defenders.filter((unit) => !NEUTRAL_UNIT_TYPES.includes(unit.type));

    if (attackingCombatants.length === 0) {
      return {
        outcome: 'defenderVictory',
        canCaptureTerritory: false,
        resolutionReason: 'attackersEliminated',
      };
    }

    if (defendingCombatants.length === 0) {
      const hasCaptureEligibleAttacker = attackingCombatants.some(
        (unit) => !AIR_UNIT_TYPES.includes(unit.type),
      );
      return {
        outcome: 'attackerVictory',
        canCaptureTerritory: hasCaptureEligibleAttacker,
        resolutionReason: 'defendersEliminated',
      };
    }

    return {
      outcome: 'ongoing',
      canCaptureTerritory: false,
    };
  }

  private buildResolutionSummary(
    state: Pick<CombatStateModel, 'territory' | 'round'>,
    attackers: MilitaryUnit[],
    defenders: MilitaryUnit[],
    outcome: OutcomeResolution,
  ): BattleResolutionSummary | null {
    if (outcome.outcome === 'ongoing' || !outcome.resolutionReason) {
      return null;
    }

    return {
      outcome: outcome.outcome,
      winner: outcome.outcome === 'attackerVictory' ? 'attack' : 'defend',
      resolutionReason: outcome.resolutionReason,
      territory: state.territory,
      territoryCaptured: outcome.outcome === 'attackerVictory' && outcome.canCaptureTerritory,
      canCaptureTerritory: outcome.canCaptureTerritory,
      attackerRetreated: outcome.resolutionReason === 'retreat',
      rounds: state.round,
      attackingUnitsRemaining: attackers.length,
      defendingUnitsRemaining: defenders.length,
    };
  }
}
