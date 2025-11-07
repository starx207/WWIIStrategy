import { Action, State, StateContext, UpdateState } from '@ngxs/store';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { CombatActions, CombatRole } from './combat.actions';
import { CombatRules } from './combat-rules';
import { Injectable } from '@angular/core';
import { TEST_ATTACKERS, TEST_DEFENDERS } from '../../dev-data';
import { CombatPhase } from './combat-phase';
import { append, compose, patch, removeItem, StateOperator } from '@ngxs/store/operators';
import { removeAll } from '@ww2/shared/store-operators';

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
    const state = context.getState();
    const { attackers, defenders } = CombatRules.filterEligibleUnits(
      action.phase,
      state.attackingArmy,
      state.defendingArmy
    );
    const phaseRole = attackers.length > 0 ? 'attack' : 'defend';

    context.patchState({
      currentPhase: action.phase,
      phaseParticipants: [...(phaseRole === 'attack' ? attackers : defenders).map((a) => a.id)],
      // phaseHitCount: 0,
      phaseCasualties: [],
      pendingCasualties: [],
      // phasePendingHits: [],
      lastDiceRoll: [],
      phaseRole,
    });
  }

  // TODO: This method name is cheeky. Rename it to something meaningful
  @Action(CombatActions.CombatantsFiring)
  giveThemAVolley(context: CombatStateContext, action: CombatActions.CombatantsFiring) {
    const currentState = context.getState();
    context.setState(
      patch<CombatStateModel>({
        // phasePendingHits: append(hitIds),
        phaseParticipants: removeAll(action.units.map((u) => u.id)), //removeItem((id) => action.units.some((u) => u.id === id)),
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
              phaseCasualties: append(updatedState.pendingCasualties),
              pendingCasualties: [],
            })
          );
          return;
        }
      }
      // Start the next phase
      context.dispatch(new CombatActions.CombatPhaseComplete(phase));
    }
  }
}
