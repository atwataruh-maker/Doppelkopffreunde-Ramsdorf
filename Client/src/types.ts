export type Player = {
  id: string;
  name: string;
};

export type GameScore = {
  playerId: string;
  score: number;
  isWinner: boolean;
};

export type Spieltyp = "Normal" | "Hochzeit" | "Solo";
export type SiegerPartei = "Re" | "Kontra" | "Solo";

export type GameMeta = {
  gewonnenVon: Spieltyp;
  siegerPartei: SiegerPartei;
  isBockrunde: boolean;
  partyPoints: number;
  hochzeitPlayerId: string | null;
  soloPlayerId: string | null;
  reAnsage: string;
  kontraAnsage: string;
  kommentar: string;
};

export type Game = {
  id: string;
  createdAt: string;
  scores: GameScore[];
  meta: GameMeta;
};

export type Session = {
  id: string;
  title: string;
  date: string;
  active: boolean;
  players: Player[];
  games: Game[];
};

export type PlayerStats = {
  id: string;
  name: string;
  totalPoints: number;
  totalPaidIn: number;
  totalGames: number;
  wins: number;
  winRate: number;
  bockRounds: number;
  hochzeiten: number;
  solos: number;
};
