import { MapActions } from './map/map-actions';

export const MENU_ACTIONS = {
  'undo-move': () => new MapActions.UndoSquadMovementStep(),
  'reset-squad-moves': () => new MapActions.ClearSelectedSquadMovementPlan(),
  'reset-all-moves': () => new MapActions.ClearAllMovementPlans(),
};

export type MenuAction = keyof typeof MENU_ACTIONS;

export type MenuOptionId = MenuAction | 'header-label';

export interface MenuOption {
  id: MenuOptionId;
  label: string;
  disabled?: boolean;
}
