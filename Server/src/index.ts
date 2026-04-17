import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { db } from "./db";
import { Player, Session } from "./types";
import { addGameSchema, createPlayerSchema, createSessionSchema, importSessionSchema } from "./security";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const NODE_ENV = process.env.NODE_ENV || "development";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:8080")
  .split(",")
  .map((origin) => origin.trim())
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
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type"]
  })
);

app.use(express.json({ limit: "100kb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Anfragen. Bitte spaeter erneut versuchen." }
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Schreibzugriffe. Bitte spaeter erneut versuchen." }
});

function getClientIp(req: Request) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.ip || "unbekannt";
}

function audit(
  action: string,
  sessionId: string | null,
  req: Request,
  details?: Record<string, unknown>
) {
  db.prepare(`
    INSERT INTO audit_log (id, created_at, action, session_id, ip_address, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    new Date().toISOString(),
    action,
    sessionId,
    getClientIp(req),
    details ? JSON.stringify(details) : null
  );
}

function assertUniqueIds(values: string[], errorMessage: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(errorMessage);
  }
}

function buildSessionTitle(playerNames: string[]) {
  if (playerNames.length <= 4) {
    return playerNames.join(" | ");
  }

  const visible = playerNames.slice(0, 4).join(" | ");
  return `${visible} +${playerNames.length - 4}`;
}

function calculateLossScores(
  playerIds: string[],
  winners: string[],
  partyPoints: number,
  gewonnenVon: "Normal" | "Hochzeit" | "Solo",
  hochzeitPlayerId: string | null,
  soloPlayerId: string | null
) {
  const winnerSet = new Set(winners);
  const scores = new Map<string, number>();

  playerIds.forEach((playerId) => {
    scores.set(playerId, 0);
  });

  if (gewonnenVon === "Solo") {
    if (!soloPlayerId) {
      throw new Error("Bitte den Solo-Spieler auswaehlen.");
    }

    const soloIsWinner = winnerSet.has(soloPlayerId);

    if (soloIsWinner && winners.length !== 1) {
      throw new Error("Wenn der Solo-Spieler gewinnt, darf nur 1 Gewinner markiert sein.");
    }

    if (!soloIsWinner && winners.length !== 3) {
      throw new Error("Wenn der Solo-Spieler verliert, muessen 3 Gewinner markiert sein.");
    }

    if (soloIsWinner) {
      playerIds.forEach((playerId) => {
        if (!winnerSet.has(playerId)) {
          scores.set(playerId, (scores.get(playerId) ?? 0) - partyPoints);
        }
      });
    } else {
      scores.set(soloPlayerId, (scores.get(soloPlayerId) ?? 0) - partyPoints * 3);
    }
  } else if (gewonnenVon === "Hochzeit") {
    if (![1, 2, 3].includes(winners.length)) {
      throw new Error("Bei Hochzeit bitte 1, 2 oder 3 Gewinner auswaehlen.");
    }

    playerIds.forEach((playerId) => {
      if (!winnerSet.has(playerId)) {
        scores.set(playerId, (scores.get(playerId) ?? 0) - partyPoints);
      }
    });
  } else {
    if (winners.length !== 2) {
      throw new Error("Bei Normal bitte genau 2 Gewinner auswaehlen.");
    }

    playerIds.forEach((playerId) => {
      if (!winnerSet.has(playerId)) {
        scores.set(playerId, (scores.get(playerId) ?? 0) - partyPoints);
      }
    });
  }

  if (gewonnenVon === "Hochzeit") {
    if (!hochzeitPlayerId) {
      throw new Error("Bitte den Hochzeit-Spieler auswaehlen.");
    }

    playerIds.forEach((playerId) => {
      if (playerId !== hochzeitPlayerId) {
        scores.set(playerId, (scores.get(playerId) ?? 0) - 1);
      }
    });
  }

  return playerIds.map((playerId) => ({
    playerId,
    score: scores.get(playerId) ?? 0,
    isWinner: winnerSet.has(playerId)
  }));
}

function getPlayers(): Player[] {
  return db
    .prepare(`
      SELECT id, name
      FROM global_players
      ORDER BY name COLLATE NOCASE ASC
    `)
    .all() as Player[];
}

function getSessions(): Session[] {
  const sessions = db
    .prepare(`
      SELECT id, title, date, active
      FROM sessions
      ORDER BY date DESC, created_at DESC
    `)
    .all() as Array<{ id: string; title: string; date: string; active: number }>;

  return sessions.map((session) => {
    const players = db
      .prepare(`
        SELECT gp.id, gp.name
        FROM session_players sp
        JOIN global_players gp ON gp.id = sp.player_id
        WHERE sp.session_id = ?
        ORDER BY sp.sort_order ASC, gp.name COLLATE NOCASE ASC
      `)
      .all(session.id) as Player[];

    const games = db
      .prepare(`
        SELECT
          id,
          created_at,
          gewonnen_von,
          sieger_partei,
          is_bockrunde,
          party_points,
          hochzeit_player_id,
          solo_player_id,
          re_ansage,
          kontra_ansage,
          kommentar
        FROM games
        WHERE session_id = ?
        ORDER BY created_at ASC
      `)
      .all(session.id) as Array<{
        id: string;
        created_at: string;
        gewonnen_von: "Normal" | "Hochzeit" | "Solo";
        sieger_partei: "Re" | "Kontra" | "Solo";
        is_bockrunde: number;
        party_points: number;
        hochzeit_player_id: string | null;
        solo_player_id: string | null;
        re_ansage: string;
        kontra_ansage: string;
        kommentar: string;
      }>;

    return {
      id: session.id,
      title: session.title,
      date: session.date,
      active: session.active === 1,
      players,
      games: games.map((game) => {
        const scores = db
          .prepare(`
            SELECT player_id, score, is_winner
            FROM game_scores
            WHERE game_id = ?
          `)
          .all(game.id) as Array<{ player_id: string; score: number; is_winner: number }>;

        return {
          id: game.id,
          createdAt: game.created_at,
          meta: {
            gewonnenVon: game.gewonnen_von,
            siegerPartei: game.sieger_partei,
            isBockrunde: game.is_bockrunde === 1,
            partyPoints: game.party_points,
            hochzeitPlayerId: game.hochzeit_player_id,
            soloPlayerId: game.solo_player_id,
            reAnsage: game.re_ansage,
            kontraAnsage: game.kontra_ansage,
            kommentar: game.kommentar
          },
          scores: scores.map((score) => ({
            playerId: score.player_id,
            score: score.score,
            isWinner: score.is_winner === 1
          }))
        };
      })
    };
  });
}

app.use("/api", apiLimiter);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, env: NODE_ENV });
});

app.get("/api/players", (req, res) => {
  audit("players.list", null, req);
  res.json(getPlayers());
});

app.post("/api/players", writeLimiter, (req, res, next) => {
  try {
    const parsed = createPlayerSchema.parse(req.body);
    const existing = db
      .prepare(`
        SELECT id
        FROM global_players
        WHERE name = ?
        COLLATE NOCASE
      `)
      .get(parsed.name) as { id: string } | undefined;

    if (existing) {
      return res.status(400).json({ error: "Spieler existiert bereits." });
    }

    db.prepare(`
      INSERT INTO global_players (id, name, created_at)
      VALUES (?, ?, ?)
    `).run(crypto.randomUUID(), parsed.name.trim(), new Date().toISOString());

    audit("player.create", null, req, { name: parsed.name.trim() });
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sessions", (req, res) => {
  audit("sessions.list", null, req);
  res.json(getSessions());
});

app.post("/api/sessions", writeLimiter, (req, res, next) => {
  try {
    const parsed = createSessionSchema.parse(req.body);
    assertUniqueIds(parsed.playerIds, "Jeder Spieler darf in der Runde nur einmal vorkommen.");

    const placeholders = parsed.playerIds.map(() => "?").join(", ");
    const selectedPlayers = db
      .prepare(`
        SELECT id, name
        FROM global_players
        WHERE id IN (${placeholders})
      `)
      .all(...parsed.playerIds) as Player[];

    if (selectedPlayers.length !== parsed.playerIds.length) {
      return res.status(400).json({ error: "Mindestens ein Spieler ist ungueltig." });
    }

    const playerNameMap = new Map(selectedPlayers.map((player) => [player.id, player.name]));
    const orderedNames = parsed.playerIds.map((playerId) => playerNameMap.get(playerId) ?? "Unbekannt");

    const sessionId = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const title = buildSessionTitle(orderedNames);

    const insertSession = db.prepare(`
      INSERT INTO sessions (id, title, date, active, created_at)
      VALUES (?, ?, ?, 1, ?)
    `);

    const insertSessionPlayer = db.prepare(`
      INSERT INTO session_players (session_id, player_id, sort_order)
      VALUES (?, ?, ?)
    `);

    const tx = db.transaction(() => {
      insertSession.run(sessionId, title, today, now);
      parsed.playerIds.forEach((playerId, index) => {
        insertSessionPlayer.run(sessionId, playerId, index);
      });
    });

    tx();
    audit("session.create", sessionId, req, { playerIds: parsed.playerIds });
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/sessions/:id/games", writeLimiter, (req, res, next) => {
  try {
    const sessionId = String(req.params.id);
    const parsed = addGameSchema.parse(req.body);

    assertUniqueIds(parsed.playerIds, "Es muessen 4 verschiedene Spieler am Tisch sitzen.");
    assertUniqueIds(parsed.winners, "Ein Gewinner darf nur einmal markiert werden.");

    if (parsed.gewonnenVon === "Solo" && parsed.siegerPartei !== "Solo") {
      return res.status(400).json({ error: "Bei Spieltyp Solo muss die Siegerpartei Solo sein." });
    }

    if (parsed.gewonnenVon !== "Solo" && parsed.siegerPartei === "Solo") {
      return res.status(400).json({ error: "Solo als Siegerpartei ist nur bei Spieltyp Solo erlaubt." });
    }

    if (parsed.gewonnenVon === "Hochzeit" && !parsed.hochzeitPlayerId) {
      return res.status(400).json({ error: "Bitte den Hochzeit-Spieler auswaehlen." });
    }

    if (parsed.gewonnenVon !== "Hochzeit" && parsed.hochzeitPlayerId) {
      return res.status(400).json({ error: "Hochzeit-Spieler darf nur bei Hochzeit gesetzt sein." });
    }

    if (parsed.gewonnenVon === "Solo" && !parsed.soloPlayerId) {
      return res.status(400).json({ error: "Bitte den Solo-Spieler auswaehlen." });
    }

    if (parsed.gewonnenVon !== "Solo" && parsed.soloPlayerId) {
      return res.status(400).json({ error: "Solo-Spieler darf nur bei Solo gesetzt sein." });
    }

    const session = db
      .prepare(`
        SELECT id, active
        FROM sessions
        WHERE id = ?
      `)
      .get(sessionId) as { id: string; active: number } | undefined;

    if (!session) {
      return res.status(404).json({ error: "Runde nicht gefunden." });
    }

    if (session.active !== 1) {
      return res.status(400).json({ error: "Runde ist bereits beendet." });
    }

    const sessionPlayers = db
      .prepare(`
        SELECT gp.id, gp.name
        FROM session_players sp
        JOIN global_players gp ON gp.id = sp.player_id
        WHERE sp.session_id = ?
      `)
      .all(sessionId) as Player[];

    const validPlayerIds = new Set(sessionPlayers.map((player) => player.id));

    if (parsed.playerIds.some((playerId) => !validPlayerIds.has(playerId))) {
      return res.status(400).json({ error: "Es sind ungueltige Spieler in der Tischbesetzung." });
    }

    if (parsed.winners.some((playerId) => !parsed.playerIds.includes(playerId))) {
      return res.status(400).json({ error: "Gewinner muessen Teil der 4 Spieler am Tisch sein." });
    }

    if (parsed.hochzeitPlayerId && !parsed.playerIds.includes(parsed.hochzeitPlayerId)) {
      return res.status(400).json({ error: "Der Hochzeit-Spieler muss am Tisch sitzen." });
    }

    if (parsed.soloPlayerId && !parsed.playerIds.includes(parsed.soloPlayerId)) {
      return res.status(400).json({ error: "Der Solo-Spieler muss am Tisch sitzen." });
    }

    const calculatedScores = calculateLossScores(
      parsed.playerIds,
      parsed.winners,
      parsed.partyPoints,
      parsed.gewonnenVon,
      parsed.hochzeitPlayerId,
      parsed.soloPlayerId
    );

    const gameId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const insertGame = db.prepare(`
      INSERT INTO games (
        id,
        session_id,
        created_at,
        gewonnen_von,
        sieger_partei,
        is_bockrunde,
        party_points,
        hochzeit_player_id,
        solo_player_id,
        re_ansage,
        kontra_ansage,
        kommentar
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertScore = db.prepare(`
      INSERT INTO game_scores (id, game_id, player_id, score, is_winner)
      VALUES (?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      insertGame.run(
        gameId,
        sessionId,
        createdAt,
        parsed.gewonnenVon,
        parsed.siegerPartei,
        parsed.isBockrunde ? 1 : 0,
        parsed.partyPoints,
        parsed.hochzeitPlayerId,
        parsed.soloPlayerId,
        parsed.reAnsage,
        parsed.kontraAnsage,
        parsed.kommentar
      );

      calculatedScores.forEach((score) => {
        insertScore.run(
          crypto.randomUUID(),
          gameId,
          score.playerId,
          score.score,
          score.isWinner ? 1 : 0
        );
      });
    });

    tx();
    audit("game.create", sessionId, req, parsed);
    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/sessions/import", writeLimiter, (req, res, next) => {
  try {
    const parsed = importSessionSchema.parse(req.body);

    // Alle Spielernamen zu IDs auflösen
    const playerIdByName = new Map<string, string>();
    const unknownNames: string[] = [];

    const uniqueNames = Array.from(new Set([
      ...parsed.playerNames,
      ...parsed.games.flatMap((g) => [g.soloPlayerName, g.hochzeitPlayerName].filter(Boolean) as string[]),
      ...parsed.games.flatMap((g) => g.scores.map((s) => s.playerName))
    ]));

    for (const name of uniqueNames) {
      const row = db
        .prepare(`SELECT id FROM global_players WHERE name = ? COLLATE NOCASE`)
        .get(name) as { id: string } | undefined;
      if (row) {
        playerIdByName.set(name.toLowerCase(), row.id);
      } else {
        unknownNames.push(name);
      }
    }

    if (unknownNames.length > 0) {
      return res.status(400).json({
        error: `Folgende Spieler existieren nicht und muessen zuerst angelegt werden: ${unknownNames.join(", ")}`
      });
    }

    const resolveId = (name: string | null) =>
      name ? (playerIdByName.get(name.toLowerCase()) ?? null) : null;

    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const orderedPlayerIds = parsed.playerNames.map((n) => playerIdByName.get(n.toLowerCase())!);
    const title = buildSessionTitle(parsed.playerNames);

    const insertSession = db.prepare(`
      INSERT INTO sessions (id, title, date, active, created_at)
      VALUES (?, ?, ?, 0, ?)
    `);
    const insertSessionPlayer = db.prepare(`
      INSERT INTO session_players (session_id, player_id, sort_order)
      VALUES (?, ?, ?)
    `);
    const insertGame = db.prepare(`
      INSERT INTO games (
        id, session_id, created_at, gewonnen_von, sieger_partei,
        is_bockrunde, party_points, hochzeit_player_id, solo_player_id,
        re_ansage, kontra_ansage, kommentar
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertScore = db.prepare(`
      INSERT INTO game_scores (id, game_id, player_id, score, is_winner)
      VALUES (?, ?, ?, ?, ?)
    `);

    const tx = db.transaction(() => {
      insertSession.run(sessionId, title, parsed.date, now);
      orderedPlayerIds.forEach((playerId, index) => {
        insertSessionPlayer.run(sessionId, playerId, index);
      });

      parsed.games.forEach((game) => {
        const gameId = crypto.randomUUID();
        insertGame.run(
          gameId, sessionId, now,
          game.gewonnenVon, game.siegerPartei,
          game.isBockrunde ? 1 : 0, game.partyPoints,
          resolveId(game.hochzeitPlayerName), resolveId(game.soloPlayerName),
          game.reAnsage, game.kontraAnsage, game.kommentar
        );
        game.scores.forEach((s) => {
          const playerId = playerIdByName.get(s.playerName.toLowerCase())!;
          insertScore.run(crypto.randomUUID(), gameId, playerId, s.score, s.score >= 0 ? 1 : 0);
        });
      });
    });

    tx();
    audit("session.import", sessionId, req, { playerNames: parsed.playerNames, gameCount: parsed.games.length });
    res.status(201).json({ ok: true, sessionId });
  } catch (error) {
    next(error);
  }
});

app.post("/api/sessions/:sessionId/games/:gameId/edit", writeLimiter, (req, res, next) => {
  try {
    const sessionId = String(req.params.sessionId);
    const gameId = String(req.params.gameId);
    const parsed = addGameSchema.parse(req.body);

    assertUniqueIds(parsed.playerIds, "Es muessen 4 verschiedene Spieler am Tisch sitzen.");
    assertUniqueIds(parsed.winners, "Ein Gewinner darf nur einmal markiert werden.");

    if (parsed.gewonnenVon === "Solo" && parsed.siegerPartei !== "Solo") {
      return res.status(400).json({ error: "Bei Spieltyp Solo muss die Siegerpartei Solo sein." });
    }
    if (parsed.gewonnenVon !== "Solo" && parsed.siegerPartei === "Solo") {
      return res.status(400).json({ error: "Solo als Siegerpartei ist nur bei Spieltyp Solo erlaubt." });
    }

    const session = db.prepare(`SELECT id FROM sessions WHERE id = ?`).get(sessionId) as { id: string } | undefined;
    if (!session) return res.status(404).json({ error: "Runde nicht gefunden." });

    const game = db.prepare(`SELECT id FROM games WHERE id = ? AND session_id = ?`).get(gameId, sessionId) as { id: string } | undefined;
    if (!game) return res.status(404).json({ error: "Spiel nicht gefunden." });

    const sessionPlayers = db.prepare(`
      SELECT gp.id FROM session_players sp
      JOIN global_players gp ON gp.id = sp.player_id
      WHERE sp.session_id = ?
    `).all(sessionId) as { id: string }[];
    const validPlayerIds = new Set(sessionPlayers.map((p) => p.id));

    if (parsed.playerIds.some((id) => !validPlayerIds.has(id))) {
      return res.status(400).json({ error: "Ungueltige Spieler in der Tischbesetzung." });
    }
    if (parsed.winners.some((id) => !parsed.playerIds.includes(id))) {
      return res.status(400).json({ error: "Gewinner muessen Teil der 4 Spieler am Tisch sein." });
    }

    const calculatedScores = calculateLossScores(
      parsed.playerIds, parsed.winners, parsed.partyPoints,
      parsed.gewonnenVon, parsed.hochzeitPlayerId, parsed.soloPlayerId
    );

    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM game_scores WHERE game_id = ?`).run(gameId);
      db.prepare(`
        UPDATE games SET
          gewonnen_von = ?, sieger_partei = ?, is_bockrunde = ?,
          party_points = ?, hochzeit_player_id = ?, solo_player_id = ?,
          re_ansage = ?, kontra_ansage = ?, kommentar = ?
        WHERE id = ?
      `).run(
        parsed.gewonnenVon, parsed.siegerPartei, parsed.isBockrunde ? 1 : 0,
        parsed.partyPoints, parsed.hochzeitPlayerId, parsed.soloPlayerId,
        parsed.reAnsage, parsed.kontraAnsage, parsed.kommentar, gameId
      );
      calculatedScores.forEach((score) => {
        db.prepare(`INSERT INTO game_scores (id, game_id, player_id, score, is_winner) VALUES (?, ?, ?, ?, ?)`)
          .run(crypto.randomUUID(), gameId, score.playerId, score.score, score.isWinner ? 1 : 0);
      });
    });
    tx();
    audit("game.edit", sessionId, req, { gameId });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/sessions", writeLimiter, (req, res) => {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM game_scores WHERE game_id IN (SELECT id FROM games)`).run();
    db.prepare(`DELETE FROM games`).run();
    db.prepare(`DELETE FROM session_players`).run();
    db.prepare(`DELETE FROM sessions`).run();
  });
  tx();
  audit("sessions.clear_all", null, req);
  res.json({ ok: true });
});

app.post("/api/sessions/:id/undo", writeLimiter, (req, res) => {
  const sessionId = String(req.params.id);

  const session = db
    .prepare(`
      SELECT id
      FROM sessions
      WHERE id = ?
    `)
    .get(sessionId) as { id: string } | undefined;

  if (!session) {
    return res.status(404).json({ error: "Runde nicht gefunden." });
  }

  const lastGame = db
    .prepare(`
      SELECT id
      FROM games
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .get(sessionId) as { id: string } | undefined;

  if (!lastGame) {
    return res.status(400).json({ error: "Kein Spiel zum Rueckgaengigmachen vorhanden." });
  }

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM game_scores WHERE game_id = ?`).run(lastGame.id);
    db.prepare(`DELETE FROM games WHERE id = ?`).run(lastGame.id);
  });

  tx();
  audit("game.undo", sessionId, req, { gameId: lastGame.id });

  res.json({ ok: true });
});

app.post("/api/sessions/:id/end", writeLimiter, (req, res) => {
  const sessionId = String(req.params.id);

  const result = db
    .prepare(`
      UPDATE sessions
      SET active = 0
      WHERE id = ?
    `)
    .run(sessionId);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Runde nicht gefunden." });
  }

  audit("session.end", sessionId, req);
  res.json({ ok: true });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);

  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ZodError" &&
    "issues" in error &&
    Array.isArray((error as { issues: unknown[] }).issues)
  ) {
    const firstIssue = (error as { issues: Array<{ message: string }> }).issues[0];
    return res.status(400).json({ error: firstIssue?.message || "Ungueltige Eingabe." });
  }

  if (error instanceof Error && error.message === "Origin nicht erlaubt") {
    return res.status(403).json({ error: "Origin nicht erlaubt." });
  }

  if (error instanceof Error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(500).json({ error: "Interner Serverfehler." });
});

app.listen(PORT, () => {
  console.log(`Server laeuft auf Port ${PORT}`);
});
