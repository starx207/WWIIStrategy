import * as modifiers from './modifiers';
import { UnitRule } from './unit-rule';

export const UNIT_RULES: UnitRule[] = [
  {
    id: 'aa-gun-fires-per-aircraft',
    modify: modifiers.aaGunShotsRule,
  },
  {
    id: 'submarine-vs-destroyer',
    modify: modifiers.subVsDestroyerRule,
  },
  {
    id: 'artillery-support',
    modify: modifiers.artillerySupportRule,
  },
];
