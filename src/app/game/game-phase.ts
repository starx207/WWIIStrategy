import { Nationality } from '@ww2/shared/nationality';

export enum GamePhase {
  SOVIET_TURN = 0,
  GERMAN_TURN = 1,
  UK_TURN = 2,
  JAPANESE_TURN = 3,
  US_TURN = 4,
  CHECK_FOR_VICTORY = 5,
}

const NATIONALITY_BY_GAME_PHASE: Partial<Record<GamePhase, Nationality>> = {
  [GamePhase.SOVIET_TURN]: Nationality.SOVIET_UNION,
  [GamePhase.GERMAN_TURN]: Nationality.GERMANY,
  [GamePhase.UK_TURN]: Nationality.UNITED_KINGDOM,
  [GamePhase.JAPANESE_TURN]: Nationality.JAPAN,
  [GamePhase.US_TURN]: Nationality.UNITED_STATES,
};

/** The powers in the order they take their turns (Soviet → Germany → UK → Japan → USA). */
export const NATIONALITIES_IN_TURN_ORDER: Nationality[] = [
  Nationality.SOVIET_UNION,
  Nationality.GERMANY,
  Nationality.UNITED_KINGDOM,
  Nationality.JAPAN,
  Nationality.UNITED_STATES,
];

/** The nation whose turn it is, or undefined for the CHECK_FOR_VICTORY phase. */
export function nationalityForGamePhase(phase: GamePhase): Nationality | undefined {
  return NATIONALITY_BY_GAME_PHASE[phase];
}

/** The game phase for a nation's turn (inverse of nationalityForGamePhase). */
export function gamePhaseForNationality(nation: Nationality): GamePhase {
  const match = Object.entries(NATIONALITY_BY_GAME_PHASE).find(
    ([, phaseNation]) => phaseNation === nation,
  );
  return match ? (Number(match[0]) as GamePhase) : GamePhase.SOVIET_TURN;
}
