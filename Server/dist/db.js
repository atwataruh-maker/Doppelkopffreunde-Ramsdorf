"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dataDir = path_1.default.join(process.cwd(), "data");
if (!fs_1.default.existsSync(dataDir)) {
    fs_1.default.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path_1.default.join(dataDir, "doppelkopf.db");
exports.db = new better_sqlite3_1.default(dbPath);
exports.db.pragma("journal_mode = WAL");
exports.db.pragma("foreign_keys = ON");
exports.db.exec(`
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
function ensureColumn(tableName, columnName, definition) {
    const columns = exports.db.prepare(`PRAGMA table_info(${tableName})`).all();
    const exists = columns.some((col) => col.name === columnName);
    if (!exists) {
        exports.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
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
const selectGlobalPlayerByName = exports.db.prepare(`
  SELECT id, name
  FROM global_players
  WHERE name = ?
  COLLATE NOCASE
`);
const insertGlobalPlayer = exports.db.prepare(`
  INSERT INTO global_players (id, name, created_at)
  VALUES (?, ?, ?)
`);
const insertSessionPlayer = exports.db.prepare(`
  INSERT OR IGNORE INTO session_players (session_id, player_id, sort_order)
  VALUES (?, ?, ?)
`);
function findOrCreateGlobalPlayer(name) {
    const existing = selectGlobalPlayerByName.get(name);
    if (existing) {
        return existing.id;
    }
    const id = crypto_1.default.randomUUID();
    insertGlobalPlayer.run(id, name, new Date().toISOString());
    return id;
}
function migrateLegacyPlayers() {
    const legacyPlayers = exports.db
        .prepare(`
      SELECT id, session_id, name, sort_order
      FROM players
      ORDER BY session_id ASC, sort_order ASC
    `)
        .all();
    if (legacyPlayers.length === 0) {
        return;
    }
    const tx = exports.db.transaction(() => {
        legacyPlayers.forEach((legacyPlayer) => {
            const globalPlayerId = findOrCreateGlobalPlayer(legacyPlayer.name.trim());
            insertSessionPlayer.run(legacyPlayer.session_id, globalPlayerId, legacyPlayer.sort_order);
            exports.db.prepare(`UPDATE game_scores SET player_id = ? WHERE player_id = ?`).run(globalPlayerId, legacyPlayer.id);
        });
    });
    tx();
}
migrateLegacyPlayers();
