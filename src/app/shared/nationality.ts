export enum Nationality {
  UNITED_STATES = 'us',
  UNITED_KINGDOM = 'uk',
  SOVIET_UNION = 'su',
  GERMANY = 'de',
  JAPAN = 'ja',
}

export const NATIONALITIES = Object.values(Nationality);

export enum Alliance {
  AXIS = 'axis',
  ALLIES = 'allies',
}

export const ALLIANCE_OPTIONS = Object.values(Alliance);

export const ALLIANCES: Record<Alliance, Nationality[]> = {
  [Alliance.AXIS]: [Nationality.GERMANY, Nationality.JAPAN],
  [Alliance.ALLIES]: [
    Nationality.UNITED_STATES,
    Nationality.UNITED_KINGDOM,
    Nationality.SOVIET_UNION,
  ],
};

export const NATION_ALLIANCE: Record<Nationality, Alliance> = NATIONALITIES.reduce(
  (acc, nationality) => {
    const alliance = Object.entries(ALLIANCES).find(([_, members]) =>
      members.includes(nationality),
    )![0] as Alliance;
    acc[nationality] = alliance;
    return acc;
  },
  {} as Record<Nationality, Alliance>,
);
