import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "rezepte.db");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Sonstiges',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_events (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  meal_event_id TEXT NOT NULL,
  family_member TEXT NOT NULL,
  rating REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(meal_event_id) REFERENCES meal_events(id) ON DELETE CASCADE
);
`);
