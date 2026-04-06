import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "doppelkopf.db");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS global_players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_players (
  session_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (session_id, player_id),
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(player_id) REFERENCES global_players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  gewonnen_von TEXT NOT NULL DEFAULT 'Normal',
  sieger_partei TEXT NOT NULL DEFAULT 'Re',
  is_bockrunde INTEGER NOT NULL DEFAULT 0,
  party_points INTEGER NOT NULL DEFAULT 1,
  hochzeit_player_id TEXT,
  solo_player_id TEXT,
  re_ansage TEXT NOT NULL DEFAULT '',
  kontra_ansage TEXT NOT NULL DEFAULT '',
  kommentar TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_scores (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  is_winner INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  action TEXT NOT NULL,
  session_id TEXT,
  ip_address TEXT,
  details TEXT
);
`);

function ensureColumn(tableName: string, columnName: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  const exists = columns.some((col) => col.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

ensureColumn("sessions", "created_at", `TEXT NOT NULL DEFAULT ''`);
ensureColumn("games", "gewonnen_von", `TEXT NOT NULL DEFAULT 'Normal'`);
ensureColumn("games", "sieger_partei", `TEXT NOT NULL DEFAULT 'Re'`);
ensureColumn("games", "is_bockrunde", `INTEGER NOT NULL DEFAULT 0`);
ensureColumn("games", "party_points", `INTEGER NOT NULL DEFAULT 1`);
ensureColumn("games", "hochzeit_player_id", `TEXT`);
ensureColumn("games", "solo_player_id", `TEXT`);
ensureColumn("games", "re_ansage", `TEXT NOT NULL DEFAULT ''`);
ensureColumn("games", "kontra_ansage", `TEXT NOT NULL DEFAULT ''`);
ensureColumn("games", "kommentar", `TEXT NOT NULL DEFAULT ''`);

const selectGlobalPlayerByName = db.prepare(`
  SELECT id, name
  FROM global_players
  WHERE name = ?
  COLLATE NOCASE
`);

const insertGlobalPlayer = db.prepare(`
  INSERT INTO global_players (id, name, created_at)
  VALUES (?, ?, ?)
`);

const insertSessionPlayer = db.prepare(`
  INSERT OR IGNORE INTO session_players (session_id, player_id, sort_order)
  VALUES (?, ?, ?)
`);

function findOrCreateGlobalPlayer(name: string) {
  const existing = selectGlobalPlayerByName.get(name) as { id: string; name: string } | undefined;
  if (existing) {
    return existing.id;
  }

  const id = crypto.randomUUID();
  insertGlobalPlayer.run(id, name, new Date().toISOString());
  return id;
}

function migrateLegacyPlayers() {
  const legacyPlayers = db
    .prepare(`
      SELECT id, session_id, name, sort_order
      FROM players
      ORDER BY session_id ASC, sort_order ASC
    `)
    .all() as Array<{
    id: string;
    session_id: string;
    name: string;
    sort_order: number;
  }>;

  if (legacyPlayers.length === 0) {
    return;
  }

  const tx = db.transaction(() => {
    legacyPlayers.forEach((legacyPlayer) => {
      const globalPlayerId = findOrCreateGlobalPlayer(legacyPlayer.name.trim());
      insertSessionPlayer.run(legacyPlayer.session_id, globalPlayerId, legacyPlayer.sort_order);
      db.prepare(`UPDATE game_scores SET player_id = ? WHERE player_id = ?`).run(globalPlayerId, legacyPlayer.id);
    });
  });

  tx();
}

migrateLegacyPlayers();
