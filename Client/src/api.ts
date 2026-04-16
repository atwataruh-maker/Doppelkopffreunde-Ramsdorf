import { Player, Session, SiegerPartei, Spieltyp } from "./types";

// "" (Docker/nginx) → same-origin requests, nginx proxies /api
// undefined (dev, nicht gesetzt) → localhost
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Unbekannter Fehler");
  }
  return response.json();
}

export async function fetchSessions(): Promise<Session[]> {
  const response = await fetch(`${API_URL}/api/sessions`);
  return handleResponse<Session[]>(response);
}

export async function fetchPlayers(): Promise<Player[]> {
  const response = await fetch(`${API_URL}/api/players`);
  return handleResponse<Player[]>(response);
}

export async function createPlayer(name: string) {
  const response = await fetch(`${API_URL}/api/players`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  return handleResponse<{ ok: true }>(response);
}

export async function createSession(playerIds: string[]) {
  const response = await fetch(`${API_URL}/api/sessions`, {
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
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return handleResponse<{ ok: true }>(response);
}

export async function undoGame(sessionId: string) {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/undo`, {
    method: "POST"
  });
  return handleResponse<{ ok: true }>(response);
}

export async function endSession(sessionId: string) {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/end`, {
    method: "POST"
  });
  return handleResponse<{ ok: true }>(response);
}
