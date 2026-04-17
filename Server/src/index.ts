import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { db } from "./db";
import { FAMILY_MEMBERS } from "./types";
import { createRecipeSchema, updateRecipeSchema, createMealEventSchema } from "./security";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const NODE_ENV = process.env.NODE_ENV || "development";

if (!APP_PASSWORD || APP_PASSWORD.length < 4) {
  console.warn("WARNUNG: APP_PASSWORD fehlt oder ist zu kurz. Bitte in .env setzen.");
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:8080")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" }
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin nicht erlaubt"));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "x-app-password"]
  })
);

app.use(express.json({ limit: "100kb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Anfragen. Bitte später erneut versuchen." }
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Schreibzugriffe. Bitte später erneut versuchen." }
});

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/api/health") return next();
  const provided = req.header("x-app-password");
  if (!APP_PASSWORD || provided !== APP_PASSWORD) {
    return res.status(401).json({ error: "Nicht autorisiert." });
  }
  next();
}

app.use("/api", apiLimiter);
app.use(requireAuth);

// ─── Health ──────────────────────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, env: NODE_ENV });
});

// ─── Recipes ─────────────────────────────────────────────────────────────────

app.get("/api/recipes", (_req, res) => {
  const recipes = db
    .prepare(
      `
      SELECT
        r.id,
        r.title,
        r.link,
        r.description,
        r.category,
        r.created_at,
        ROUND(AVG(rt.rating), 1) AS avg_rating,
        COUNT(DISTINCT me.id)    AS times_eaten,
        MAX(me.date)             AS last_eaten
      FROM recipes r
      LEFT JOIN meal_events me ON me.recipe_id = r.id
      LEFT JOIN ratings rt     ON rt.meal_event_id = me.id
      GROUP BY r.id
      ORDER BY r.title COLLATE NOCASE ASC
    `
    )
    .all();

  // Per-member averages
  const memberStmt = db.prepare(`
    SELECT rt.family_member, ROUND(AVG(rt.rating), 1) AS avg
    FROM ratings rt
    JOIN meal_events me ON rt.meal_event_id = me.id
    WHERE me.recipe_id = ?
    GROUP BY rt.family_member
  `);

  const enriched = (recipes as Record<string, unknown>[]).map((r) => {
    const rows = memberStmt.all(r.id as string) as Array<{ family_member: string; avg: number }>;
    const member_ratings: Record<string, number> = {};
    rows.forEach((row) => {
      member_ratings[row.family_member] = row.avg;
    });
    return { ...r, member_ratings };
  });

  res.json(enriched);
});

app.get("/api/recipes/:id", (req, res) => {
  const id = String(req.params.id);

  const recipe = db
    .prepare(
      `
      SELECT
        r.id, r.title, r.link, r.description, r.category, r.created_at,
        ROUND(AVG(rt.rating), 1) AS avg_rating,
        COUNT(DISTINCT me.id)    AS times_eaten,
        MAX(me.date)             AS last_eaten
      FROM recipes r
      LEFT JOIN meal_events me ON me.recipe_id = r.id
      LEFT JOIN ratings rt     ON rt.meal_event_id = me.id
      WHERE r.id = ?
      GROUP BY r.id
    `
    )
    .get(id) as Record<string, unknown> | undefined;

  if (!recipe) return res.status(404).json({ error: "Rezept nicht gefunden." });

  const memberRows = db
    .prepare(
      `
      SELECT rt.family_member, ROUND(AVG(rt.rating), 1) AS avg
      FROM ratings rt
      JOIN meal_events me ON rt.meal_event_id = me.id
      WHERE me.recipe_id = ?
      GROUP BY rt.family_member
    `
    )
    .all(id) as Array<{ family_member: string; avg: number }>;

  const member_ratings: Record<string, number> = {};
  memberRows.forEach((r) => (member_ratings[r.family_member] = r.avg));

  const events = db
    .prepare(
      `
      SELECT id, date, notes, created_at
      FROM meal_events
      WHERE recipe_id = ?
      ORDER BY date DESC
    `
    )
    .all(id) as Array<{ id: string; date: string; notes: string; created_at: string }>;

  const ratingStmt = db.prepare(`
    SELECT family_member, rating
    FROM ratings
    WHERE meal_event_id = ?
    ORDER BY family_member ASC
  `);

  const history = events.map((ev) => ({
    ...ev,
    ratings: ratingStmt.all(ev.id) as Array<{ family_member: string; rating: number }>
  }));

  res.json({ ...recipe, member_ratings, history });
});

app.post("/api/recipes", writeLimiter, (req, res, next) => {
  try {
    const data = createRecipeSchema.parse(req.body);
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO recipes (id, title, link, description, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, data.title, data.link, data.description, data.category, new Date().toISOString());
    res.status(201).json({ ok: true, id });
  } catch (err) {
    next(err);
  }
});

app.put("/api/recipes/:id", writeLimiter, (req, res, next) => {
  try {
    const id = String(req.params.id);
    const data = updateRecipeSchema.parse(req.body);

    const result = db
      .prepare(
        `UPDATE recipes SET title=?, link=?, description=?, category=? WHERE id=?`
      )
      .run(data.title, data.link, data.description, data.category, id);

    if (result.changes === 0) return res.status(404).json({ error: "Rezept nicht gefunden." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/recipes/:id", writeLimiter, (req, res) => {
  const id = String(req.params.id);
  const result = db.prepare(`DELETE FROM recipes WHERE id = ?`).run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Rezept nicht gefunden." });
  res.json({ ok: true });
});

// ─── Meal Events ─────────────────────────────────────────────────────────────

app.get("/api/meal-events", (_req, res) => {
  const events = db
    .prepare(
      `
      SELECT me.id, me.recipe_id, r.title AS recipe_title, me.date, me.notes, me.created_at
      FROM meal_events me
      JOIN recipes r ON r.id = me.recipe_id
      ORDER BY me.date DESC, me.created_at DESC
      LIMIT 100
    `
    )
    .all() as Array<{
    id: string;
    recipe_id: string;
    recipe_title: string;
    date: string;
    notes: string;
    created_at: string;
  }>;

  const ratingStmt = db.prepare(`
    SELECT family_member, rating
    FROM ratings
    WHERE meal_event_id = ?
    ORDER BY family_member ASC
  `);

  const result = events.map((ev) => ({
    ...ev,
    ratings: ratingStmt.all(ev.id) as Array<{ family_member: string; rating: number }>
  }));

  res.json(result);
});

app.post("/api/meal-events", writeLimiter, (req, res, next) => {
  try {
    const data = createMealEventSchema.parse(req.body);

    const recipe = db.prepare(`SELECT id FROM recipes WHERE id = ?`).get(data.recipe_id);
    if (!recipe) return res.status(404).json({ error: "Rezept nicht gefunden." });

    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();

    const insertEvent = db.prepare(
      `INSERT INTO meal_events (id, recipe_id, date, notes, created_at) VALUES (?, ?, ?, ?, ?)`
    );
    const insertRating = db.prepare(
      `INSERT INTO ratings (id, meal_event_id, family_member, rating, created_at) VALUES (?, ?, ?, ?, ?)`
    );

    const tx = db.transaction(() => {
      insertEvent.run(eventId, data.recipe_id, data.date, data.notes, now);
      data.ratings.forEach(({ family_member, rating }) => {
        insertRating.run(crypto.randomUUID(), eventId, family_member, rating, now);
      });
    });

    tx();
    res.status(201).json({ ok: true, id: eventId });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/meal-events/:id", writeLimiter, (req, res) => {
  const id = String(req.params.id);
  const result = db.prepare(`DELETE FROM meal_events WHERE id = ?`).run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Mahlzeit nicht gefunden." });
  res.json({ ok: true });
});

// ─── Weekly Plan ─────────────────────────────────────────────────────────────

app.get("/api/weekly-plan", (req, res) => {
  const seed = req.query.seed ? Number(req.query.seed) : Date.now();

  const recipes = db
    .prepare(
      `
      SELECT
        r.id, r.title, r.link, r.category,
        ROUND(AVG(rt.rating), 1) AS avg_rating,
        COUNT(DISTINCT me.id)    AS times_eaten,
        MAX(me.date)             AS last_eaten
      FROM recipes r
      LEFT JOIN meal_events me ON me.recipe_id = r.id
      LEFT JOIN ratings rt     ON rt.meal_event_id = me.id
      GROUP BY r.id
    `
    )
    .all() as Array<{
    id: string;
    title: string;
    link: string;
    category: string;
    avg_rating: number | null;
    times_eaten: number;
    last_eaten: string | null;
  }>;

  if (recipes.length === 0) return res.json([]);

  const today = new Date();

  // Deterministic pseudo-random using seed
  function seededRandom(s: number) {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  }

  const scored = recipes.map((r, i) => {
    const baseRating = r.avg_rating ?? 5;

    let recencyFactor = 1.0;
    if (r.last_eaten) {
      const days = Math.floor(
        (today.getTime() - new Date(r.last_eaten).getTime()) / 86400000
      );
      if (days < 7) recencyFactor = 0.05;
      else if (days < 14) recencyFactor = 0.45;
    }

    const jitter = (seededRandom(seed + i * 137) - 0.5) * 2.0;
    const score = baseRating * recencyFactor + jitter;

    return { recipe: r, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

  const plan = scored.slice(0, 7).map((item, idx) => ({
    day: DAYS[idx],
    recipe: {
      id: item.recipe.id,
      title: item.recipe.title,
      link: item.recipe.link,
      category: item.recipe.category
    },
    avg_rating: item.recipe.avg_rating,
    times_eaten: item.recipe.times_eaten
  }));

  res.json(plan);
});

// ─── Stats ───────────────────────────────────────────────────────────────────

app.get("/api/stats", (_req, res) => {
  const totalRecipes = (
    db.prepare(`SELECT COUNT(*) AS n FROM recipes`).get() as { n: number }
  ).n;

  const totalMeals = (
    db.prepare(`SELECT COUNT(*) AS n FROM meal_events`).get() as { n: number }
  ).n;

  const memberStats = FAMILY_MEMBERS.map((member) => {
    const row = db
      .prepare(
        `SELECT ROUND(AVG(rating), 1) AS avg, COUNT(*) AS total
         FROM ratings WHERE family_member = ?`
      )
      .get(member) as { avg: number | null; total: number };
    return { member, avg: row.avg, total: row.total };
  });

  const topRecipe = db
    .prepare(
      `
      SELECT r.title, ROUND(AVG(rt.rating), 1) AS avg
      FROM recipes r
      JOIN meal_events me ON me.recipe_id = r.id
      JOIN ratings rt ON rt.meal_event_id = me.id
      GROUP BY r.id
      HAVING COUNT(DISTINCT me.id) >= 1
      ORDER BY avg DESC
      LIMIT 1
    `
    )
    .get() as { title: string; avg: number } | undefined;

  res.json({ totalRecipes, totalMeals, memberStats, topRecipe: topRecipe ?? null });
});

// ─── Error handler ───────────────────────────────────────────────────────────

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: string }).name === "ZodError" &&
    "issues" in err
  ) {
    const first = (err as { issues: Array<{ message: string }> }).issues[0];
    return res.status(400).json({ error: first?.message ?? "Ungültige Eingabe." });
  }
  if (err instanceof Error && err.message === "Origin nicht erlaubt") {
    return res.status(403).json({ error: "Origin nicht erlaubt." });
  }
  if (err instanceof Error) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: "Interner Serverfehler." });
});

app.listen(PORT, () => {
  console.log(`Rezepte-Server läuft auf Port ${PORT}`);
});
