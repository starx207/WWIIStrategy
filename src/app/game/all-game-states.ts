import { CombatState } from '@ww2/combat/combat-state';
import { EconomyState } from '@ww2/economy/economy-state';
import { MapState } from '@ww2/map/map-state';
import { ProductionState } from '@ww2/production/production-state';
import { SessionState } from '@ww2/session/session-state';
import { SettingsState } from '@ww2/settings/settings-state';
import { GameState } from './game-state';

export const ALL_GAME_STATES = [
  MapState,
  GameState,
  SessionState,
  CombatState,
  EconomyState,
  ProductionState,
  SettingsState,
];
