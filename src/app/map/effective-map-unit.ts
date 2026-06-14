import { EffectiveUnit, isEffectiveUnit } from '@ww2/shared/effective-unit';
import { MilitaryUnit } from '@ww2/shared/military-unit';
import { MovementPhase } from '@ww2/game/turn-phase';

export type MovementProfileId = 'standard-movement';
export type MovementProfileKind = 'standard-movement';

export interface MovementProfile {
  id: MovementProfileId;
  kind: MovementProfileKind;
  maxMovement: number;
  movementPhases: MovementPhase[];
}

export type EffectiveMapUnit = EffectiveUnit & {
  movementProfiles: MovementProfile[];
};

export const isEffectiveMapUnit = (
  unit: EffectiveMapUnit | MilitaryUnit,
): unit is EffectiveMapUnit => isEffectiveUnit(unit) && 'movementProfiles' in unit;
