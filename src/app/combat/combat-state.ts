import { Action, State, StateContext, UpdateState } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { CombatActions, CombatRole } from './combat.actions';
import { CombatRules } from './combat-rules';
import { Injectable } from '@angular/core';
import { TEST_ATTACKERS, TEST_DEFENDERS } from '../../dev-data';
import { CombatPhase } from './combat-phase';
import { append, compose, patch, removeItem, StateOperator } from '@ngxs/store/operators';
import { removeAll } from '@ww2/shared/store-operators';

/*
  TODO: Once in the regroup phase, play gets stuck.
        I want to be able to undo the last selected casualties,
        but I also need to be able to select a new battalion to start the next round.
        The problem is, the participant Ids are not reset until I start the next round, so all battalions are non-selectable.
        I could either handle this at the state level (adjusting when the participant Ids are updated),
        or at the component level (more complex selection enabled/disabled logic based on the current phase)
*/
export interface CombatStateModel {
  territory?: string;
  attackingArmy?: MilitaryUnit[];
  defendingArmy?: MilitaryUnit[];
  currentPhase?: CombatPhase;
  phaseParticipants: string[];
  // phaseHitCount: number;
  phaseCasualties: string[];
  pendingCasualties: string[];
  //phasePendingHits: string[];
  lastDiceRoll: number[];
  diceTarget: number;
  phaseRole: CombatRole;
}

const DEFAULT_STATE: CombatStateModel = {
  territory: 'TestTerritory',
  phaseParticipants: [],
  // phaseHitCount: 0,
  phaseCasualties: [],
  pendingCasualties: [],
  //phasePendingHits: [],
  lastDiceRoll: [],
  diceTarget: 0,
  phaseRole: 'attack',
};

type CombatStateContext = StateContext<CombatStateModel>;

@State<CombatStateModel>({
  name: 'activeCombat',
  defaults: DEFAULT_STATE,
})
@Injectable()
export class CombatState {
  @Action(CombatActions.PreparingBattlefield)
  prepareBattlefield(context: StateContext<CombatStateModel>) {
    // TODO: get the router snapshot here and pull in the attackers being moved into the territory indicated by the router.
    //       Then set those as the attacking forces.
    //       Then get all the defenders in the territory being attacked and set those as the defending forces
    context.patchState({ attackingArmy: [...TEST_ATTACKERS], defendingArmy: [...TEST_DEFENDERS] });

    // TODO: We'll actually want to start opening fire at this point, but I haven't implemented that yet
    context.dispatch(new CombatActions.CombatPhaseInitiated(CombatPhase.COMBAT));
  }

  @Action(CombatActions.CombatPhaseInitiated)
  initiateCombatPhase(context: CombatStateContext, action: CombatActions.CombatPhaseInitiated) {
    switch (action.phase) {
      case CombatPhase.OPENING_FIRE:
        this.startBattleCycle(context, action);
        break;

      // case CombatPhase.OPENING_FIRE_CASUALTIES:
      //   this.clearCasualties(context, action);
      //   break;

      case CombatPhase.COMBAT:
        this.startBattleCycle(context, action);
        break;

      // case CombatPhase.COMBAT_CASUALTIES:
      //   this.clearCasualties(context, action);
      //   break;

      default:
        context.patchState({
          currentPhase: action.phase,
        });
        context.dispatch(new CombatActions.CombatPhaseComplete(action.phase));
        break;
    }
  }

  @Action(CombatActions.CombatPhaseComplete)
  completeCombatPhase(context: CombatStateContext, action: CombatActions.CombatPhaseComplete) {
    switch (action.phase) {
      case CombatPhase.OPENING_FIRE:
        context.dispatch(
          new CombatActions.CombatPhaseInitiated(CombatPhase.OPENING_FIRE_CASUALTIES)
        );
        break;

      case CombatPhase.OPENING_FIRE_CASUALTIES:
        this.checkForVictory(context);
        break;

      case CombatPhase.COMBAT:
        context.dispatch(new CombatActions.CombatPhaseInitiated(CombatPhase.COMBAT_CASUALTIES));
        break;

      case CombatPhase.COMBAT_CASUALTIES:
        this.checkForVictory(context);
        break;

      default:
        break;
    }
  }

  // TODO: This method name is cheeky. Rename it to something meaningful
  @Action(CombatActions.CombatantsFiring)
  giveThemAVolley(context: CombatStateContext, action: CombatActions.CombatantsFiring) {
    const currentState = context.getState();
    const participatingUnitIds = action.units
      .map((u) => u.id)
      .filter((id) => currentState.phaseParticipants.includes(id));
    const firingUnitIds = participatingUnitIds.slice(0, action.shotValues.length);
    context.setState(
      patch<CombatStateModel>({
        // phasePendingHits: append(hitIds),
        phaseParticipants: removeAll(firingUnitIds), //removeItem((id) => action.units.some((u) => u.id === id)),
        // phaseHitCount: context.getState().phaseHitCount + hits.length,
        phaseCasualties: append(currentState.pendingCasualties),
        pendingCasualties: [],
        lastDiceRoll: action.shotValues,
        diceTarget: action.targetValue,
      })
    );

    this.checkForEndOfTurn(context);
  }

  @Action(CombatActions.CasualtiesElected)
  addCasualties(context: CombatStateContext, action: CombatActions.CasualtiesElected) {
    const casualtyIds = action.casualties.map((c) => c.id);

    context.setState(
      patch<CombatStateModel>({
        pendingCasualties: append(casualtyIds),
      })
    );

    const updatedState = context.getState();
    const hits = CombatRules.determineHits({
      values: updatedState.lastDiceRoll,
      target: updatedState.diceTarget,
    }).hits.length;
    const casualtyCount = updatedState.pendingCasualties.length;

    if (casualtyCount < hits) {
      return; // Still have casualties to assign
    }

    this.checkForEndOfTurn(context);
  }

  @Action(CombatActions.UndoCasualties)
  undoCasualties(context: CombatStateContext, action: CombatActions.UndoCasualties) {
    const casualtyIds = action.casualties.map((c) => c.id);

    context.setState(
      patch<CombatStateModel>({
        pendingCasualties: removeAll(casualtyIds),
      })
    );
  }

  @Action(CombatActions.PressAttack)
  pressAttack(context: CombatStateContext) {
    context.dispatch(new CombatActions.CombatPhaseInitiated(CombatPhase.COMBAT));
  }

  @Action(CombatActions.Retreat)
  retreat(context: CombatStateContext) {
    context.dispatch(new CombatActions.CombatEnded());
  }

  @Action(CombatActions.CombatEnded)
  endCombat(context: CombatStateContext) {
    context.setState({
      ...DEFAULT_STATE,
    });
  }

  private startBattleCycle(
    context: CombatStateContext,
    action: CombatActions.CombatPhaseInitiated
  ) {
    const state = context.getState();

    // Clear casualties
    const casualties = [...state.pendingCasualties, ...state.phaseCasualties];

    const remainingAttackers = state.attackingArmy!.filter((unit) => !casualties.includes(unit.id));
    const remainingDefenders = state.defendingArmy!.filter((unit) => !casualties.includes(unit.id));

    // Determine which units are eligible for fire
    const { attackers, defenders } = CombatRules.filterEligibleUnits(
      action.phase,
      remainingAttackers,
      remainingDefenders
    );
    const phaseRole = attackers.length > 0 ? 'attack' : 'defend';

    // Update the state
    context.patchState({
      currentPhase: action.phase,
      attackingArmy: remainingAttackers,
      defendingArmy: remainingDefenders,
      phaseParticipants: [...(phaseRole === 'attack' ? attackers : defenders).map((a) => a.id)],
      phaseCasualties: [],
      pendingCasualties: [],
      lastDiceRoll: [],
      phaseRole,
    });
  }

  // private clearCasualties(context: CombatStateContext, action: CombatActions.CombatPhaseInitiated) {
  //   const currentState = context.getState();
  //   const casualties = currentState.phaseCasualties;

  //   const remainingAttackers = currentState.attackingArmy?.filter(
  //     (unit) => !casualties.includes(unit.id)
  //   );
  //   const remainingDefenders = currentState.defendingArmy?.filter(
  //     (unit) => !casualties.includes(unit.id)
  //   );

  //   context.patchState({
  //     currentPhase: action.phase,
  //     attackingArmy: remainingAttackers,
  //     defendingArmy: remainingDefenders,
  //   });

  //   context.dispatch(new CombatActions.CombatPhaseComplete(action.phase));
  // }

  private checkForEndOfTurn(context: CombatStateContext) {
    const updatedState = context.getState();
    const phase = updatedState.currentPhase!;
    const hitCount = CombatRules.determineHits({
      values: updatedState.lastDiceRoll,
      target: updatedState.diceTarget,
    }).hits.length;
    const pendingHits = hitCount - updatedState.pendingCasualties.length;

    if (pendingHits <= 0 && updatedState.phaseParticipants.length === 0) {
      // All eligible units have fired and the opponent has no hits to deal with
      if (updatedState.phaseRole === 'attack') {
        // Switch to the defender's turn
        const { defenders } = CombatRules.filterEligibleUnits(
          phase,
          updatedState.attackingArmy,
          updatedState.defendingArmy
        );
        if (defenders.length > 0) {
          context.setState(
            patch<CombatStateModel>({
              phaseRole: 'defend',
              phaseParticipants: defenders.map((d) => d.id),
              diceTarget: undefined,
              lastDiceRoll: [],
            })
          );
          return;
        }
      }
      // Start the next phase
      context.dispatch(new CombatActions.CombatPhaseComplete(phase));
    }
  }

  private checkForVictory(context: CombatStateContext) {
    const state = context.getState();
    const casualties = [...state.pendingCasualties, ...state.phaseCasualties];
    const attackerCount =
      state.attackingArmy?.filter((unit) => !casualties.includes(unit.id)).length ?? 0;
    const defenderCount =
      state.defendingArmy?.filter((unit) => !casualties.includes(unit.id)).length ?? 0;

    if (attackerCount === 0 || defenderCount === 0) {
      // We have a victor!
      context.dispatch(new CombatActions.CombatEnded());
    } else if (state.currentPhase === CombatPhase.OPENING_FIRE_CASUALTIES) {
      // Opening fire doesn't have the option to retreat, so just start combat
      context.dispatch(new CombatActions.CombatPhaseInitiated(CombatPhase.COMBAT));
    } else {
      context.dispatch(new CombatActions.CombatPhaseInitiated(CombatPhase.REGROUP));
    }
  }
}
