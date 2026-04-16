import * as XLSX from "xlsx";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function getPassword() {
  return sessionStorage.getItem("appPassword") || "";
}

type ImportScore = { playerName: string; score: number };

type ImportGame = {
  gewonnenVon: string;
  siegerPartei: string;
  isBockrunde: boolean;
  partyPoints: number;
  soloPlayerName: string | null;
  hochzeitPlayerName: string | null;
  reAnsage: string;
  kontraAnsage: string;
  kommentar: string;
  scores: ImportScore[];
};

export type ImportSession = {
  date: string;
  playerNames: string[];
  games: ImportGame[];
};

const FIXED_COLS = 11; // #, Zeitpunkt, Spieltyp, Siegerpartei, Bockrunde, Parteipunkte,
                       // Solo-Spieler, Hochzeit-Spieler, Re-Ansage, Kontra-Ansage, Kommentar

function cellStr(row: unknown[], idx: number): string {
  const val = row[idx];
  return val != null ? String(val).trim() : "";
}

function cellNum(row: unknown[], idx: number): number | null {
  const val = row[idx];
  if (val === "" || val == null) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function parseSheet(ws: XLSX.WorkSheet): ImportSession | null {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];
  if (rows.length < 2) return null;

  const header = rows[0] as unknown[];
  const playerNames: string[] = [];
  for (let c = FIXED_COLS; c < header.length; c++) {
    const name = String(header[c] ?? "").trim();
    if (name) playerNames.push(name);
  }
  if (playerNames.length < 4) return null;

  // Datum aus dem Tabellenblatt-Name ist nicht verfügbar hier,
  // wir nehmen Datum aus der ersten Zeitpunkt-Zelle oder heute.
  let date = new Date().toISOString().slice(0, 10);

  const games: ImportGame[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const numStr = cellStr(row, 0);
    // Summe-Zeile überspringen
    if (numStr === "Summe" || numStr === "") continue;

    const zeitpunkt = cellStr(row, 1);
    if (zeitpunkt && r === 1) {
      // Datum aus dem ersten Zeitpunkt-Eintrag extrahieren (DD.MM.YYYY)
      const match = zeitpunkt.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
      if (match) {
        date = `${match[3]}-${match[2]}-${match[1]}`;
      }
    }

    const gewonnenVon = cellStr(row, 2) || "Normal";
    const siegerPartei = cellStr(row, 3) || "Re";
    const bockStr = cellStr(row, 4).toLowerCase();
    const isBockrunde = bockStr === "ja" || bockStr === "true" || bockStr === "1";
    const partyPoints = cellNum(row, 5) ?? 1;
    const soloPlayerName = cellStr(row, 6) || null;
    const hochzeitPlayerName = cellStr(row, 7) || null;
    const reAnsage = cellStr(row, 8);
    const kontraAnsage = cellStr(row, 9);
    const kommentar = cellStr(row, 10);

    const scores: ImportScore[] = [];
    for (let c = 0; c < playerNames.length; c++) {
      const val = cellNum(row, FIXED_COLS + c);
      // leere Zelle = Spieler war nicht am Tisch
      if (val !== null) {
        scores.push({ playerName: playerNames[c], score: val });
      }
    }

    // Mindestens 4 Spieler müssen am Tisch sein
    if (scores.length < 4) continue;

    games.push({
      gewonnenVon,
      siegerPartei,
      isBockrunde,
      partyPoints,
      soloPlayerName,
      hochzeitPlayerName,
      reAnsage,
      kontraAnsage,
      kommentar,
      scores
    });
  }

  return { date, playerNames, games };
}

/** Liest eine Excel-Datei und gibt alle geparsten Runden zurück */
export function parseExcelFile(file: File): Promise<ImportSession[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sessions: ImportSession[] = [];
        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const session = parseSheet(ws);
          if (session) sessions.push(session);
        }
        resolve(sessions);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsArrayBuffer(file);
  });
}

/** Sendet eine geparste Runde an den Server */
export async function importSession(session: ImportSession): Promise<void> {
  const response = await fetch(`${API_URL}/api/sessions/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-app-password": getPassword()
    },
    body: JSON.stringify(session)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || "Import fehlgeschlagen.");
  }
}
