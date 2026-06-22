import { TurnPhase } from '@ww2/game/turn-phase';
import { RuleState } from '@ww2/settings/settings-state';
import { LandTerritoryName, TerritoryName } from '../territories/territory-names';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { Nationality } from '@ww2/shared/nationality';

export interface RuleContext {
  turnPhase: TurnPhase;
  unitsByTerritory: Partial<Record<TerritoryName, MilitaryUnit[]>>;
  landControlMap: Partial<Record<LandTerritoryName, Nationality>>;
  ruleState: RuleState;
}

export type RuleContextInput = Partial<Pick<RuleContext, 'ruleState' | 'turnPhase'>>;
