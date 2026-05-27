import { MilitaryUnit } from '@ww2/shared/military-unit';
import { CombatPhase } from './combat-phase';
import { CombatRole } from './combat.actions';
import { RuleState } from '@ww2/settings/settings-state';

export interface RuleContext {
  phase?: CombatPhase;
  role?: CombatRole;
  attackingArmy: MilitaryUnit[];
  defendingArmy: MilitaryUnit[];
  ruleState: RuleState;
}

export type RuleContextInput = Partial<Pick<RuleContext, 'phase' | 'role' | 'ruleState'>>;
