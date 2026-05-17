import { Action, State, StateContext } from '@ngxs/store';
import { Injectable } from '@angular/core';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { AIR_UNIT_TYPES, NEUTRAL_UNIT_TYPES, UnitType } from '@ww2/shared/unit-type';
import { CombatActions, CombatRole } from './combat.actions';
import { CombatRules } from './rules/combat-rules';
import { TEST_ATTACKERS, TEST_DEFENDERS, TEST_NEUTRAL_UNITS } from '../../dev-data';
import { CasualtyPhase, CombatPhase } from './combat-phase';
import { TargetKind } from '@ww2/shared/unit-profile';
import { createResolvedRuleContext } from './rule-context.factory';
import { CombatProfile } from './effective-combat-unit';
import { getCombatProfiles, getHitPoints } from './effective-combat-unit.reducer';
import {
  totalRemainingHitCapacityForTargetKind,
  totalHitPool,
  HitPool,
  targetKindPriorityForUnit,
  addHitsToPool,
  createEmptyHitPool,
  unitMatchesTargetKind,
  unitCanConsumeHit,
} from './hit-pool';
import { RuleContext } from './rule-context';
import { DEFAULT_RULE_STATE, RuleState } from '@ww2/shared/effective-unit';
import { Nationality } from '@ww2/shared/nationality';

export type CombatOutcome = 'ongoing' | 'attackerVictory' | 'defenderVictory';

export type CombatResolutionReason = 'retreat' | 'attackersEliminated' | 'defendersEliminated';

type AssignmentMap = Record<string, number>;
export interface CombatHit {
  targetKind: TargetKind;
  casualtyClearPhases: CasualtyPhase[];
}

type HitAssignmentMap = Record<string, CombatHit[]>;
type DelayedCasualtyMap = Record<string, CombatHit[]>;
type ShotDescriptor = Pick<CombatProfile, 'target' | 'targetKind' | 'casualtyClearPhases'>;

type FirePhase = CombatPhase.OPENING_FIRE | CombatPhase.COMBAT;

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
  ruleState: RuleState; // TODO: Things like this might be better suited to a dedicated state slice.
  attackingArmy: MilitaryUnit[];
  defendingArmy: MilitaryUnit[];
  currentPhase?: CombatPhase;
  attackerReadyToFireIds: string[];
  defenderReadyToFireIds: string[];
  attackerHitsToAssign: CombatHit[];
  defenderHitsToAssign: CombatHit[];
  attackerAssignedHitsByUnitId: HitAssignmentMap;
  defenderAssignedHitsByUnitId: HitAssignmentMap;
  attackerCasualtiesConfirmed: boolean;
  defenderCasualtiesConfirmed: boolean;
  unitDamageById: AssignmentMap;
  delayedCasualtyHitsByUnitId: DelayedCasualtyMap;
  outcome: CombatOutcome;
  canCaptureTerritory: boolean;
  resolutionSummary: BattleResolutionSummary | null;
  round: number;
}

const DEFAULT_STATE: CombatStateModel = {
  territory: 'TestTerritory',
  ruleState: copyRuleState(DEFAULT_RULE_STATE),
  attackingArmy: [],
  defendingArmy: [],
  currentPhase: undefined,
  attackerReadyToFireIds: [],
  defenderReadyToFireIds: [],
  attackerHitsToAssign: [],
  defenderHitsToAssign: [],
  attackerAssignedHitsByUnitId: {},
  defenderAssignedHitsByUnitId: {},
  attackerCasualtiesConfirmed: false,
  defenderCasualtiesConfirmed: false,
  unitDamageById: {},
  delayedCasualtyHitsByUnitId: {},
  outcome: 'ongoing',
  canCaptureTerritory: false,
  resolutionSummary: null,
  round: 0,
};

function copyRuleState(ruleState: RuleState): RuleState {
  return {
    technologiesByNationality: Object.fromEntries(
      Object.entries(ruleState.technologiesByNationality).map(([nationality, technologies]) => [
        nationality,
        [...technologies],
      ]),
    ),
    nationalAdvantages: {
      [Nationality.SOVIET_UNION]: { ...ruleState.nationalAdvantages[Nationality.SOVIET_UNION] },
      [Nationality.GERMANY]: { ...ruleState.nationalAdvantages[Nationality.GERMANY] },
      [Nationality.UNITED_STATES]: { ...ruleState.nationalAdvantages[Nationality.UNITED_STATES] },
    },
  };
}

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
    const defendingArmy = [...TEST_DEFENDERS, ...TEST_NEUTRAL_UNITS];

    const baseState: CombatStateModel = {
      ...DEFAULT_STATE,
      ruleState: this.activateWolfPacksIfQualified(
        copyRuleState(DEFAULT_RULE_STATE),
        attackingArmy,
      ),
      attackingArmy,
      defendingArmy,
      unitDamageById: this.buildInitialDamageMap(attackingArmy, defendingArmy),
    };

    const initialOutcome = this.evaluateOutcome(attackingArmy, defendingArmy);
    if (initialOutcome.outcome !== 'ongoing') {
      context.setState({
        ...baseState,
        ruleState: this.restoreBattleScopedRuleState(baseState.ruleState),
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

    this.startCombatCycle(context, baseState);
  }

  @Action(CombatActions.CombatantsFiring)
  giveThemAVolley(context: CombatStateContext, action: CombatActions.CombatantsFiring) {
    const state = context.getState();
    if (state.outcome !== 'ongoing') {
      return;
    }

    if (
      state.currentPhase !== CombatPhase.OPENING_FIRE &&
      state.currentPhase !== CombatPhase.COMBAT
    ) {
      return;
    }

    const readyIds =
      action.role === 'attack' ? state.attackerReadyToFireIds : state.defenderReadyToFireIds;
    if (readyIds.length === 0) {
      return;
    }

    const readyIdSet = new Set(readyIds);
    const firingUnits: { unit: MilitaryUnit; profile: CombatProfile }[] = [];
    let consumedShotCount = 0;
    const ruleContext = createResolvedRuleContext(state);

    for (const unit of action.units) {
      if (!readyIdSet.has(unit.id)) {
        continue;
      }

      const profile = getCombatProfiles(unit, {
        ...ruleContext,
        role: action.role,
      }).find((candidate) => candidate.id === action.profileId);
      if (!profile || profile.damage.type !== 'unit-hit' || profile.shotsPerRound <= 0) {
        continue;
      }

      if (consumedShotCount + profile.shotsPerRound > action.shotValues.length) {
        continue;
      }

      firingUnits.push({ unit, profile });
      consumedShotCount += profile.shotsPerRound;
    }

    const firingUnitIds = firingUnits.map(({ unit }) => unit.id);
    const shotDescriptors: ShotDescriptor[] = firingUnits.flatMap(({ profile }) =>
      Array.from({ length: profile.shotsPerRound }, () => ({
        target: profile.target,
        targetKind: profile.targetKind,
        casualtyClearPhases: profile.casualtyClearPhases,
      })),
    );

    if (firingUnitIds.length === 0) {
      return;
    }

    let attackerReadyToFireIds = state.attackerReadyToFireIds;
    let defenderReadyToFireIds = state.defenderReadyToFireIds;
    let attackerHitsToAssign = state.attackerHitsToAssign;
    let defenderHitsToAssign = state.defenderHitsToAssign;
    const opposingArmy = action.role === 'attack' ? state.defendingArmy : state.attackingArmy;
    const hitsScored = this.determineCombatHits(
      action.shotValues.slice(0, shotDescriptors.length),
      shotDescriptors,
    );

    if (action.role === 'attack') {
      attackerReadyToFireIds = state.attackerReadyToFireIds.filter(
        (id) => !firingUnitIds.includes(id),
      );
      defenderHitsToAssign = this.addClampedHits(
        state.defenderHitsToAssign,
        hitsScored,
        opposingArmy,
        state.unitDamageById,
        ruleContext,
      );
    } else {
      defenderReadyToFireIds = state.defenderReadyToFireIds.filter(
        (id) => !firingUnitIds.includes(id),
      );
      attackerHitsToAssign = this.addClampedHits(
        state.attackerHitsToAssign,
        hitsScored,
        opposingArmy,
        state.unitDamageById,
        ruleContext,
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

    const hitsToAssign =
      action.role === 'attack' ? state.attackerHitsToAssign : state.defenderHitsToAssign;
    if (hitsToAssign.length <= 0) {
      return;
    }

    const assignments = {
      ...(action.role === 'attack'
        ? state.attackerAssignedHitsByUnitId
        : state.defenderAssignedHitsByUnitId),
    };

    const roleArmy = action.role === 'attack' ? state.attackingArmy : state.defendingArmy;
    const roleArmyIds = new Set(roleArmy.map((unit) => unit.id));
    const ruleContext = createResolvedRuleContext(state);

    let pendingHits = this.getPendingHits(state, action.role, assignments);
    if (pendingHits.length <= 0) {
      return;
    }

    for (const casualty of action.casualties) {
      if (pendingHits.length <= 0) {
        break;
      }

      if (!roleArmyIds.has(casualty.id)) {
        continue;
      }

      const remainingCapacity = this.getRemainingHitCapacityForUnit(
        state,
        action.role,
        casualty,
        assignments,
        ruleContext,
      );
      if (remainingCapacity <= 0) {
        continue;
      }

      const consumedHit = this.consumeHitForUnit(pendingHits, casualty);
      if (!consumedHit) {
        continue;
      }

      assignments[casualty.id] = [...(assignments[casualty.id] ?? []), consumedHit.hit];
      pendingHits = consumedHit.remainingHits;
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
      const currentHits = assignments[casualty.id] ?? [];
      if (currentHits.length <= 0) {
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

    const hitsToAssign =
      action.role === 'attack' ? state.attackerHitsToAssign : state.defenderHitsToAssign;
    const assignments =
      action.role === 'attack'
        ? state.attackerAssignedHitsByUnitId
        : state.defenderAssignedHitsByUnitId;

    const pendingHits = this.getPendingHits(state, action.role, assignments);
    if (hitsToAssign.length === 0 || pendingHits.length > 0) {
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

    this.startCombatCycle(context, state);
  }

  @Action(CombatActions.Retreat)
  retreat(context: CombatStateContext) {
    const state = context.getState();
    if (state.currentPhase !== CombatPhase.REGROUP || state.outcome !== 'ongoing') {
      return;
    }

    context.patchState({
      ruleState: this.restoreBattleScopedRuleState(state.ruleState),
      currentPhase: undefined,
      attackerReadyToFireIds: [],
      defenderReadyToFireIds: [],
      attackerHitsToAssign: [],
      defenderHitsToAssign: [],
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

  private startCombatCycle(context: CombatStateContext, baseState: CombatStateModel) {
    this.startFirePhase(context, CombatPhase.OPENING_FIRE, {
      ...baseState,
      round: baseState.round + 1,
    });
  }

  private startFirePhase(
    context: CombatStateContext,
    phase: FirePhase,
    baseState: CombatStateModel,
  ) {
    const nextState: CombatStateModel = {
      ...baseState,
      ...this.buildFirePhasePatch(baseState, phase),
    };

    if (
      nextState.attackerReadyToFireIds.length === 0 &&
      nextState.defenderReadyToFireIds.length === 0
    ) {
      if (phase === CombatPhase.OPENING_FIRE) {
        this.startFirePhase(context, CombatPhase.COMBAT, nextState);
        return;
      }

      if (this.hasClearableDelayedCasualties(nextState, CombatPhase.COMBAT_CASUALTIES)) {
        this.resolveConfirmedCasualties(context, {
          ...nextState,
          currentPhase: CombatPhase.COMBAT_CASUALTIES,
          attackerCasualtiesConfirmed: true,
          defenderCasualtiesConfirmed: true,
        });
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

  private buildFirePhasePatch(
    state: CombatStateModel,
    phase: FirePhase,
  ): Partial<CombatStateModel> {
    const ruleContext = createResolvedRuleContext(state, { phase });
    const { attackers, defenders } = this.getEligibleUnitsForPhase(
      phase,
      state.attackingArmy,
      state.defendingArmy,
      state.unitDamageById,
      ruleContext,
    );

    const attackerReadyToFireIds = attackers.map((unit) => unit.id);
    const defenderReadyToFireIds = defenders.map((unit) => unit.id);

    return {
      currentPhase: phase,
      attackerReadyToFireIds,
      defenderReadyToFireIds,
      attackerHitsToAssign: [],
      defenderHitsToAssign: [],
      attackerAssignedHitsByUnitId: {},
      defenderAssignedHitsByUnitId: {},
      attackerCasualtiesConfirmed: false,
      defenderCasualtiesConfirmed: false,
      round: state.round,
    };
  }

  private advanceAfterFirePhase(context: CombatStateContext, state: CombatStateModel) {
    const noHitsScoredByEitherSide =
      state.attackerHitsToAssign.length === 0 && state.defenderHitsToAssign.length === 0;

    if (noHitsScoredByEitherSide) {
      const casualtyPhase: CasualtyPhase =
        state.currentPhase === CombatPhase.OPENING_FIRE
          ? CombatPhase.OPENING_FIRE_CASUALTIES
          : CombatPhase.COMBAT_CASUALTIES;

      if (this.hasClearableDelayedCasualties(state, casualtyPhase)) {
        this.resolveConfirmedCasualties(context, {
          ...state,
          currentPhase: casualtyPhase,
          attackerReadyToFireIds: [],
          defenderReadyToFireIds: [],
          attackerCasualtiesConfirmed: true,
          defenderCasualtiesConfirmed: true,
        });
        return;
      }

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
      attackerCasualtiesConfirmed: state.attackerHitsToAssign.length === 0,
      defenderCasualtiesConfirmed: state.defenderHitsToAssign.length === 0,
    });
  }

  private resolveConfirmedCasualties(context: CombatStateContext, state: CombatStateModel) {
    if (!this.isCasualtyPhase(state.currentPhase)) {
      return;
    }
    const currentPhase = state.currentPhase;

    const ruleContext = createResolvedRuleContext(state);

    const nextDamageById: AssignmentMap = { ...state.unitDamageById };
    for (const [unitId, hits] of Object.entries(state.attackerAssignedHitsByUnitId)) {
      nextDamageById[unitId] = (nextDamageById[unitId] ?? 0) + hits.length;
    }
    for (const [unitId, hits] of Object.entries(state.defenderAssignedHitsByUnitId)) {
      nextDamageById[unitId] = (nextDamageById[unitId] ?? 0) + hits.length;
    }

    const nextDelayedCasualtyHitsByUnitId = this.buildNextDelayedCasualtyMap(
      state,
      nextDamageById,
      ruleContext,
    );

    const survivingAttackers = state.attackingArmy.filter(
      (unit) =>
        !this.shouldClearCasualty(
          unit,
          currentPhase,
          nextDamageById,
          nextDelayedCasualtyHitsByUnitId,
          ruleContext,
        ),
    );
    const survivingDefenders = state.defendingArmy.filter(
      (unit) =>
        !this.shouldClearCasualty(
          unit,
          currentPhase,
          nextDamageById,
          nextDelayedCasualtyHitsByUnitId,
          ruleContext,
        ),
    );

    const survivingDamageById = this.buildSurvivingDamageMap(
      survivingAttackers,
      survivingDefenders,
      nextDamageById,
    );
    const survivingUnitIds = new Set(
      [...survivingAttackers, ...survivingDefenders].map((unit) => unit.id),
    );
    const survivingDelayedCasualtyHitsByUnitId: DelayedCasualtyMap = {};
    for (const [unitId, hits] of Object.entries(nextDelayedCasualtyHitsByUnitId)) {
      if (survivingUnitIds.has(unitId)) {
        survivingDelayedCasualtyHitsByUnitId[unitId] = hits;
      }
    }

    const outcome = this.evaluateOutcome(survivingAttackers, survivingDefenders);
    const postResolutionState: CombatStateModel = {
      ...state,
      attackingArmy: survivingAttackers,
      defendingArmy: survivingDefenders,
      unitDamageById: survivingDamageById,
      attackerReadyToFireIds: [],
      defenderReadyToFireIds: [],
      attackerHitsToAssign: [],
      defenderHitsToAssign: [],
      attackerAssignedHitsByUnitId: {},
      defenderAssignedHitsByUnitId: {},
      attackerCasualtiesConfirmed: false,
      defenderCasualtiesConfirmed: false,
      delayedCasualtyHitsByUnitId: survivingDelayedCasualtyHitsByUnitId,
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
        ruleState: this.restoreBattleScopedRuleState(postResolutionState.ruleState),
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
    damageById: AssignmentMap,
    ruleContext: RuleContext,
  ): { attackers: MilitaryUnit[]; defenders: MilitaryUnit[] } {
    const eligibleUnits = CombatRules.filterEligibleUnits(phase, attackers, defenders, ruleContext);
    return {
      attackers: eligibleUnits.attackers.filter((unit) =>
        this.hasEligibleTarget(unit, phase, 'attack', defenders, damageById, ruleContext),
      ),
      defenders: eligibleUnits.defenders.filter((unit) =>
        this.hasEligibleTarget(unit, phase, 'defend', attackers, damageById, ruleContext),
      ),
    };
  }

  private buildInitialDamageMap(
    attackers: MilitaryUnit[],
    defenders: MilitaryUnit[],
  ): AssignmentMap {
    const damageById: AssignmentMap = {};
    for (const unit of [...attackers, ...defenders]) {
      damageById[unit.id] = 0;
    }
    return damageById;
  }

  private activateWolfPacksIfQualified(
    ruleState: RuleState,
    attackingArmy: MilitaryUnit[],
  ): RuleState {
    const germanAdvantages = ruleState.nationalAdvantages[Nationality.GERMANY];
    if (germanAdvantages.wolfPacks !== 'enabled') {
      return ruleState;
    }

    const germanSubmarineCount = attackingArmy.filter(
      (unit) => unit.type === UnitType.SUBMARINE && unit.nationality === Nationality.GERMANY,
    ).length;
    if (germanSubmarineCount < 3) {
      return ruleState;
    }

    return {
      ...ruleState,
      nationalAdvantages: {
        ...ruleState.nationalAdvantages,
        [Nationality.GERMANY]: {
          ...germanAdvantages,
          wolfPacks: 'active',
        },
      },
    };
  }

  private restoreBattleScopedRuleState(ruleState: RuleState): RuleState {
    const germanAdvantages = ruleState.nationalAdvantages[Nationality.GERMANY];
    if (germanAdvantages.wolfPacks !== 'active') {
      return ruleState;
    }

    return {
      ...ruleState,
      nationalAdvantages: {
        ...ruleState.nationalAdvantages,
        [Nationality.GERMANY]: {
          ...germanAdvantages,
          wolfPacks: 'enabled',
        },
      },
    };
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

  private buildNextDelayedCasualtyMap(
    state: CombatStateModel,
    damageById: AssignmentMap,
    ruleContext: RuleContext,
  ): DelayedCasualtyMap {
    const delayed: DelayedCasualtyMap = { ...state.delayedCasualtyHitsByUnitId };
    const assignedHitsByUnitId = {
      ...state.attackerAssignedHitsByUnitId,
      ...state.defenderAssignedHitsByUnitId,
    };

    for (const unit of [...state.attackingArmy, ...state.defendingArmy]) {
      if ((damageById[unit.id] ?? 0) < getHitPoints(unit, ruleContext)) {
        delete delayed[unit.id];
        continue;
      }

      if (delayed[unit.id]?.length) {
        continue;
      }

      const assignedHits = assignedHitsByUnitId[unit.id] ?? [];
      if (assignedHits.length === 0) {
        continue;
      }

      const damageBeforeThisCasualtyPhase = state.unitDamageById[unit.id] ?? 0;
      const remainingHitPointsBeforeAssignment =
        getHitPoints(unit, ruleContext) - damageBeforeThisCasualtyPhase;
      const lethalHitIndex = Math.max(0, remainingHitPointsBeforeAssignment - 1);
      const lethalHit = assignedHits[lethalHitIndex] ?? assignedHits[assignedHits.length - 1];
      delayed[unit.id] = lethalHit ? [lethalHit] : [];
    }

    return delayed;
  }

  private shouldClearCasualty(
    unit: MilitaryUnit,
    phase: CasualtyPhase,
    damageById: AssignmentMap,
    delayedCasualtyHitsByUnitId: DelayedCasualtyMap,
    ruleContext: RuleContext,
  ): boolean {
    if ((damageById[unit.id] ?? 0) < getHitPoints(unit, ruleContext)) {
      return false;
    }

    return (delayedCasualtyHitsByUnitId[unit.id] ?? []).some((hit) =>
      hit.casualtyClearPhases.includes(phase),
    );
  }

  private hasClearableDelayedCasualties(state: CombatStateModel, phase: CasualtyPhase): boolean {
    return Object.values(state.delayedCasualtyHitsByUnitId).some((hits) =>
      hits.some((hit) => hit.casualtyClearPhases.includes(phase)),
    );
  }

  private isCasualtyPhase(phase?: CombatPhase): phase is CasualtyPhase {
    return phase === CombatPhase.OPENING_FIRE_CASUALTIES || phase === CombatPhase.COMBAT_CASUALTIES;
  }

  private determineCombatHits(values: number[], shotDescriptors: ShotDescriptor[]): CombatHit[] {
    const hits: CombatHit[] = [];
    for (const [index, shot] of shotDescriptors.entries()) {
      const value = values[index];
      if (value === undefined) {
        break;
      }

      const hitCount = CombatRules.determineHits({
        values: [value],
        target: shot.target,
      }).hits.length;
      if (hitCount > 0) {
        hits.push({
          targetKind: shot.targetKind,
          casualtyClearPhases: shot.casualtyClearPhases,
        });
      }
    }

    return hits;
  }

  private addClampedHits(
    currentHits: CombatHit[],
    hitsScored: CombatHit[],
    opposingArmy: MilitaryUnit[],
    damageById: AssignmentMap,
    ruleContext: RuleContext,
  ): CombatHit[] {
    const nextHits = [...currentHits];

    for (const hit of hitsScored) {
      const currentPool = this.toHitPool(nextHits);
      const targetKind = hit.targetKind;
      const maxCapacity =
        targetKind === 'unit'
          ? this.getTotalRemainingHitPoints(opposingArmy, damageById, ruleContext)
          : totalRemainingHitCapacityForTargetKind(
              opposingArmy,
              damageById,
              targetKind,
              ruleContext,
            );
      const alreadyPending =
        targetKind === 'unit' ? totalHitPool(currentPool) : (currentPool[targetKind] ?? 0);
      const remainingTargetCapacity = maxCapacity - alreadyPending;
      const remainingTotalCapacity =
        targetKind === 'factory'
          ? remainingTargetCapacity
          : this.getTotalRemainingHitPoints(opposingArmy, damageById, ruleContext) -
            totalHitPool(currentPool);
      if (remainingTargetCapacity > 0 && remainingTotalCapacity > 0) {
        nextHits.push(hit);
      }
    }

    return nextHits;
  }

  private getPendingHits(
    state: CombatStateModel,
    role: CombatRole,
    assignments: HitAssignmentMap,
  ): CombatHit[] {
    let pendingHits = [
      ...(role === 'attack' ? state.attackerHitsToAssign : state.defenderHitsToAssign),
    ];
    const roleArmy = role === 'attack' ? state.attackingArmy : state.defendingArmy;
    const unitById = new Map(roleArmy.map((unit) => [unit.id, unit]));

    for (const [unitId, hits] of Object.entries(assignments)) {
      const unit = unitById.get(unitId);
      if (!unit) {
        continue;
      }

      for (const _hit of hits) {
        const consumedHit = this.consumeHitForUnit(pendingHits, unit);
        if (!consumedHit) {
          return pendingHits;
        }
        pendingHits = consumedHit.remainingHits;
      }
    }

    return pendingHits;
  }

  private getPendingHitPool(
    state: CombatStateModel,
    role: CombatRole,
    assignments: HitAssignmentMap,
  ): HitPool {
    return this.toHitPool(this.getPendingHits(state, role, assignments));
  }

  private consumeHitForUnit(
    hits: CombatHit[],
    unit: MilitaryUnit,
  ): { hit: CombatHit; remainingHits: CombatHit[] } | undefined {
    for (const targetKind of targetKindPriorityForUnit(unit)) {
      const hitIndex = hits.findIndex((hit) => hit.targetKind === targetKind);
      if (hitIndex < 0) {
        continue;
      }

      const hit = hits[hitIndex];
      return {
        hit,
        remainingHits: hits.filter((_, index) => index !== hitIndex),
      };
    }

    return undefined;
  }

  private toHitPool(hits: CombatHit[]): HitPool {
    return hits.reduce((pool, hit) => addHitsToPool(pool, hit.targetKind, 1), createEmptyHitPool());
  }

  private hasEligibleTarget(
    unit: MilitaryUnit,
    phase: FirePhase,
    role: CombatRole,
    opposingArmy: MilitaryUnit[],
    damageById: AssignmentMap,
    ruleContext: RuleContext,
  ): boolean {
    const workingContext = {
      ...ruleContext,
      phase,
      role,
    };
    return getCombatProfiles(unit, workingContext).some((profile) => {
      if (profile.damage.type !== 'unit-hit' || profile.target <= 0 || profile.shotsPerRound <= 0) {
        return false;
      }

      return opposingArmy.some((opposingUnit) => {
        const remainingHitPoints =
          getHitPoints(opposingUnit, workingContext) - (damageById[opposingUnit.id] ?? 0);
        return remainingHitPoints > 0 && unitMatchesTargetKind(opposingUnit, profile.targetKind);
      });
    });
  }

  private getRemainingHitCapacityForUnit(
    state: CombatStateModel,
    role: CombatRole,
    unit: MilitaryUnit,
    assignments: HitAssignmentMap,
    ruleContext: RuleContext,
  ): number {
    const isExpectedRoleUnit =
      role === 'attack'
        ? state.attackingArmy.some((candidate) => candidate.id === unit.id)
        : state.defendingArmy.some((candidate) => candidate.id === unit.id);

    if (!isExpectedRoleUnit) {
      return 0;
    }

    const persistentDamage = state.unitDamageById[unit.id] ?? 0;
    const assignedDamage = assignments[unit.id]?.length ?? 0;
    return getHitPoints(unit, ruleContext) - persistentDamage - assignedDamage;
  }

  canUnitAbsorbPendingHit(
    state: CombatStateModel,
    role: CombatRole,
    unit: MilitaryUnit,
    ruleContext: RuleContext,
    assignments?: HitAssignmentMap,
  ): boolean {
    const effectiveAssignments = assignments ?? {
      ...(role === 'attack'
        ? state.attackerAssignedHitsByUnitId
        : state.defenderAssignedHitsByUnitId),
    };
    if (
      this.getRemainingHitCapacityForUnit(state, role, unit, effectiveAssignments, ruleContext) <= 0
    ) {
      return false;
    }

    return unitCanConsumeHit(this.getPendingHitPool(state, role, effectiveAssignments), unit);
  }

  private getTotalRemainingHitPoints(
    units: MilitaryUnit[],
    damageById: AssignmentMap,
    ruleContext: RuleContext,
  ): number {
    return units.reduce((total, unit) => {
      if (!unitMatchesTargetKind(unit, 'unit')) {
        return total;
      }

      return total + Math.max(0, getHitPoints(unit, ruleContext) - (damageById[unit.id] ?? 0));
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
