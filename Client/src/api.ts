import { Player, Session, SiegerPartei, Spieltyp } from "./types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function getPassword() {
  return sessionStorage.getItem("appPassword") || "";
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Unbekannter Fehler");
  }
  return response.json();
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "x-app-password": getPassword()
  };
}

export async function checkAuth(): Promise<boolean> {
  const response = await fetch(`${API_URL}/api/sessions`, {
    headers: {
      "x-app-password": getPassword()
    }
  });

  if (response.status === 401) {
    return false;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Fehler beim Pruefen des Zugriffs.");
  }

  return true;
}

export async function fetchSessions(): Promise<Session[]> {
  const response = await fetch(`${API_URL}/api/sessions`, {
    headers: {
      "x-app-password": getPassword()
    }
  });
  return handleResponse<Session[]>(response);
}

export async function fetchPlayers(): Promise<Player[]> {
  const response = await fetch(`${API_URL}/api/players`, {
    headers: {
      "x-app-password": getPassword()
    }
  });
  return handleResponse<Player[]>(response);
}

export async function createPlayer(name: string) {
  const response = await fetch(`${API_URL}/api/players`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name })
  });
  return handleResponse<{ ok: true }>(response);
}

export async function createSession(playerIds: string[]) {
  const response = await fetch(`${API_URL}/api/sessions`, {
    method: "POST",
    headers: authHeaders(),
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
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
  return handleResponse<{ ok: true }>(response);
}

export async function undoGame(sessionId: string) {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/undo`, {
    method: "POST",
    headers: {
      "x-app-password": getPassword()
    }
  });
  return handleResponse<{ ok: true }>(response);
}

export async function endSession(sessionId: string) {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/end`, {
    method: "POST",
    headers: {
      "x-app-password": getPassword()
    }
  });
  return handleResponse<{ ok: true }>(response);
}
