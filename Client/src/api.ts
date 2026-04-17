import { Player, Session, SiegerPartei, Spieltyp } from "./types";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Unbekannter Fehler");
  }
  return response.json();
}

export async function fetchSessions(): Promise<Session[]> {
  const response = await fetch("/api/sessions");
  return handleResponse<Session[]>(response);
}

export async function fetchPlayers(): Promise<Player[]> {
  const response = await fetch("/api/players");
  return handleResponse<Player[]>(response);
}

export async function createPlayer(name: string) {
  const response = await fetch("/api/players", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  return handleResponse<{ ok: true }>(response);
}

export async function createSession(playerIds: string[]) {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerIds })
  });
  return handleResponse<{ ok: true }>(response);
}

export async function addGame(
  sessionId: string,
  payload: {
    playerIds: string[];
    winners: string[];
    gewonnenVon: Spieltyp;
    siegerPartei: SiegerPartei;
    isBockrunde: boolean;
    partyPoints: number;
    hochzeitPlayerId: string | null;
    soloPlayerId: string | null;
    reAnsage: string;
    kontraAnsage: string;
    kommentar: string;
  }
) {
  const response = await fetch(`/api/sessions/${sessionId}/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return handleResponse<{ ok: true }>(response);
}

export async function undoGame(sessionId: string) {
  const response = await fetch(`/api/sessions/${sessionId}/undo`, { method: "POST" });
  return handleResponse<{ ok: true }>(response);
}

export async function endSession(sessionId: string) {
  const response = await fetch(`/api/sessions/${sessionId}/end`, { method: "POST" });
  return handleResponse<{ ok: true }>(response);
}

export async function editGame(
  sessionId: string,
  gameId: string,
  payload: {
    playerIds: string[];
    winners: string[];
    gewonnenVon: Spieltyp;
    siegerPartei: SiegerPartei;
    isBockrunde: boolean;
    partyPoints: number;
    hochzeitPlayerId: string | null;
    soloPlayerId: string | null;
    reAnsage: string;
    kontraAnsage: string;
    kommentar: string;
  }
) {
  const response = await fetch(`/api/sessions/${sessionId}/games/${gameId}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return handleResponse<{ ok: true }>(response);
}

export async function clearAllSessions() {
  const response = await fetch("/api/sessions", { method: "DELETE" });
  return handleResponse<{ ok: true }>(response);
}
