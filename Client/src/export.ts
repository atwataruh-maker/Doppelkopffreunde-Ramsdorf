import * as XLSX from "xlsx";
import { Game, Player, Session } from "./types";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(date));
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function getPlayerName(players: Player[], playerId: string | null) {
  if (!playerId) return "";
  return players.find((p) => p.id === playerId)?.name ?? "";
}

function getTotalForPlayer(session: Session, playerId: string) {
  return session.games.reduce((sum, game) => {
    const found = game.scores.find((s) => s.playerId === playerId);
    return sum + (found?.score ?? 0);
  }, 0);
}

function buildSessionSheet(session: Session): XLSX.WorkSheet {
  const players = session.players;

  // Header row
  const headerRow = [
    "#",
    "Zeitpunkt",
    "Spieltyp",
    "Siegerpartei",
    "Bockrunde",
    "Parteipunkte",
    "Solo-Spieler",
    "Hochzeit-Spieler",
    "Re-Ansage",
    "Kontra-Ansage",
    "Kommentar",
    ...players.map((p) => p.name)
  ];

  const rows: (string | number)[][] = [headerRow];

  session.games.forEach((game: Game, index: number) => {
    const row: (string | number)[] = [
      index + 1,
      formatDateTime(game.createdAt),
      game.meta.gewonnenVon,
      game.meta.siegerPartei,
      game.meta.isBockrunde ? "Ja" : "Nein",
      game.meta.partyPoints,
      getPlayerName(players, game.meta.soloPlayerId),
      getPlayerName(players, game.meta.hochzeitPlayerId),
      game.meta.reAnsage || "",
      game.meta.kontraAnsage || "",
      game.meta.kommentar || "",
      ...players.map((player) => {
        const score = game.scores.find((s) => s.playerId === player.id);
        return score?.score ?? 0;
      })
    ];
    rows.push(row);
  });

  // Summe row
  const sumRow: (string | number)[] = [
    "Summe",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    ...players.map((player) => getTotalForPlayer(session, player.id))
  ];
  rows.push(sumRow);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  const colWidths = [
    { wch: 5 },   // #
    { wch: 18 },  // Zeitpunkt
    { wch: 12 },  // Spieltyp
    { wch: 12 },  // Siegerpartei
    { wch: 12 },  // Bockrunde
    { wch: 14 },  // Parteipunkte
    { wch: 16 },  // Solo-Spieler
    { wch: 18 },  // Hochzeit-Spieler
    { wch: 14 },  // Re-Ansage
    { wch: 14 },  // Kontra-Ansage
    { wch: 20 },  // Kommentar
    ...players.map(() => ({ wch: 14 }))
  ];
  ws["!cols"] = colWidths;

  return ws;
}

/** Exportiert eine einzelne Runde als .xlsx */
export function exportSession(session: Session) {
  const wb = XLSX.utils.book_new();
  const sheetName = session.title.replace(/[:/\\?*[\]]/g, "_").slice(0, 31);
  const ws = buildSessionSheet(session);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const filename = `Doppelkopf_${formatDate(session.date).replace(/\./g, "-")}_${session.title.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, "_").slice(0, 40)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/** Exportiert alle Runden in eine .xlsx mit je einem Tabellenblatt */
export function exportAllSessions(sessions: Session[]) {
  const wb = XLSX.utils.book_new();

  sessions.forEach((session, idx) => {
    const raw = `${idx + 1}_${formatDate(session.date).replace(/\./g, "-")}_${session.title}`;
    const sheetName = raw.replace(/[:/\\?*[\]]/g, "_").slice(0, 31);
    const ws = buildSessionSheet(session);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  const now = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Doppelkopf_Alle_Runden_${now}.xlsx`);
}
