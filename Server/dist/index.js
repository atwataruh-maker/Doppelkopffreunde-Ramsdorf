"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("./db");
const security_1 = require("./security");
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT || 3001);
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const NODE_ENV = process.env.NODE_ENV || "development";
if (!APP_PASSWORD || APP_PASSWORD.length < 4) {
    console.warn("WARNUNG: APP_PASSWORD fehlt oder ist zu kurz. Bitte unbedingt setzen.");
}
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:8080")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
app.set("trust proxy", 1);
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" }
}));
app.use((0, cors_1.default)({
    origin(origin, callback) {
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin))
            return callback(null, true);
        return callback(new Error("Origin nicht erlaubt"));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "x-app-password"]
}));
app.use(express_1.default.json({ limit: "100kb" }));
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Zu viele Anfragen. Bitte spaeter erneut versuchen." }
});
const writeLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 80,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Zu viele Schreibzugriffe. Bitte spaeter erneut versuchen." }
});
function getClientIp(req) {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.length > 0) {
        return xff.split(",")[0].trim();
    }
    return req.ip || "unbekannt";
}
function audit(action, sessionId, req, details) {
    db_1.db.prepare(`
    INSERT INTO audit_log (id, created_at, action, session_id, ip_address, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(crypto_1.default.randomUUID(), new Date().toISOString(), action, sessionId, getClientIp(req), details ? JSON.stringify(details) : null);
}
function requireAppPassword(req, res, next) {
    if (req.path === "/api/health") {
        return next();
    }
    const providedPassword = req.header("x-app-password");
    if (!APP_PASSWORD || providedPassword !== APP_PASSWORD) {
        return res.status(401).json({ error: "Nicht autorisiert." });
    }
    next();
}
function assertUniqueIds(values, errorMessage) {
    if (new Set(values).size !== values.length) {
        throw new Error(errorMessage);
    }
}
function buildSessionTitle(playerNames) {
    if (playerNames.length <= 4) {
        return playerNames.join(" | ");
    }
    const visible = playerNames.slice(0, 4).join(" | ");
    return `${visible} +${playerNames.length - 4}`;
}
function calculateLossScores(playerIds, winners, partyPoints, gewonnenVon, hochzeitPlayerId, soloPlayerId) {
    const winnerSet = new Set(winners);
    const scores = new Map();
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
        }
        else {
            scores.set(soloPlayerId, (scores.get(soloPlayerId) ?? 0) - partyPoints * 3);
        }
    }
    else if (gewonnenVon === "Hochzeit") {
        if (![1, 2, 3].includes(winners.length)) {
            throw new Error("Bei Hochzeit bitte 1, 2 oder 3 Gewinner auswaehlen.");
        }
        playerIds.forEach((playerId) => {
            if (!winnerSet.has(playerId)) {
                scores.set(playerId, (scores.get(playerId) ?? 0) - partyPoints);
            }
        });
    }
    else {
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
function validateGamePayload(sessionId, parsed) {
    if (parsed.gewonnenVon === "Solo" && parsed.siegerPartei !== "Solo") {
        throw new Error("Bei Spieltyp Solo muss die Siegerpartei Solo sein.");
    }
    if (parsed.gewonnenVon !== "Solo" && parsed.siegerPartei === "Solo") {
        throw new Error("Solo als Siegerpartei ist nur bei Spieltyp Solo erlaubt.");
    }
    if (parsed.gewonnenVon === "Hochzeit" && !parsed.hochzeitPlayerId) {
        throw new Error("Bitte den Hochzeit-Spieler auswaehlen.");
    }
    if (parsed.gewonnenVon !== "Hochzeit" && parsed.hochzeitPlayerId) {
        throw new Error("Hochzeit-Spieler darf nur bei Hochzeit gesetzt sein.");
    }
    if (parsed.gewonnenVon === "Solo" && !parsed.soloPlayerId) {
        throw new Error("Bitte den Solo-Spieler auswaehlen.");
    }
    if (parsed.gewonnenVon !== "Solo" && parsed.soloPlayerId) {
        throw new Error("Solo-Spieler darf nur bei Solo gesetzt sein.");
    }
    assertUniqueIds(parsed.playerIds, "Es muessen 4 verschiedene Spieler am Tisch sitzen.");
    assertUniqueIds(parsed.winners, "Ein Gewinner darf nur einmal markiert werden.");
    const session = db_1.db
        .prepare(`
      SELECT id, active
      FROM sessions
      WHERE id = ?
    `)
        .get(sessionId);
    if (!session) {
        throw new Error("Runde nicht gefunden.");
    }
    const sessionPlayers = db_1.db
        .prepare(`
      SELECT gp.id, gp.name
      FROM session_players sp
      JOIN global_players gp ON gp.id = sp.player_id
      WHERE sp.session_id = ?
    `)
        .all(sessionId);
    const validPlayerIds = new Set(sessionPlayers.map((player) => player.id));
    if (parsed.playerIds.some((playerId) => !validPlayerIds.has(playerId))) {
        throw new Error("Es sind ungueltige Spieler in der Tischbesetzung.");
    }
    if (parsed.winners.some((playerId) => !parsed.playerIds.includes(playerId))) {
        throw new Error("Gewinner muessen Teil der 4 Spieler am Tisch sein.");
    }
    if (parsed.hochzeitPlayerId && !parsed.playerIds.includes(parsed.hochzeitPlayerId)) {
        throw new Error("Der Hochzeit-Spieler muss am Tisch sitzen.");
    }
    if (parsed.soloPlayerId && !parsed.playerIds.includes(parsed.soloPlayerId)) {
        throw new Error("Der Solo-Spieler muss am Tisch sitzen.");
    }
    return {
        session,
        calculatedScores: calculateLossScores(parsed.playerIds, parsed.winners, parsed.partyPoints, parsed.gewonnenVon, parsed.hochzeitPlayerId, parsed.soloPlayerId)
    };
}
function getPlayers() {
    return db_1.db
        .prepare(`
      SELECT id, name
      FROM global_players
      ORDER BY name COLLATE NOCASE ASC
    `)
        .all();
}
function getSessions() {
    const sessions = db_1.db
        .prepare(`
      SELECT id, title, date, active
      FROM sessions
      ORDER BY date DESC, created_at DESC
    `)
        .all();
    return sessions.map((session) => {
        const players = db_1.db
            .prepare(`
        SELECT gp.id, gp.name
        FROM session_players sp
        JOIN global_players gp ON gp.id = sp.player_id
        WHERE sp.session_id = ?
        ORDER BY sp.sort_order ASC, gp.name COLLATE NOCASE ASC
      `)
            .all(session.id);
        const games = db_1.db
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
            .all(session.id);
        return {
            id: session.id,
            title: session.title,
            date: session.date,
            active: session.active === 1,
            players,
            games: games.map((game) => {
                const scores = db_1.db
                    .prepare(`
            SELECT player_id, score, is_winner
            FROM game_scores
            WHERE game_id = ?
          `)
                    .all(game.id);
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
app.use(requireAppPassword);
app.get("/api/health", (_req, res) => {
    res.json({ ok: true, env: NODE_ENV });
});
app.get("/api/players", (req, res) => {
    audit("players.list", null, req);
    res.json(getPlayers());
});
app.post("/api/players", writeLimiter, (req, res, next) => {
    try {
        const parsed = security_1.createPlayerSchema.parse(req.body);
        const existing = db_1.db
            .prepare(`
        SELECT id
        FROM global_players
        WHERE name = ?
        COLLATE NOCASE
      `)
            .get(parsed.name);
        if (existing) {
            return res.status(400).json({ error: "Spieler existiert bereits." });
        }
        db_1.db.prepare(`
      INSERT INTO global_players (id, name, created_at)
      VALUES (?, ?, ?)
    `).run(crypto_1.default.randomUUID(), parsed.name.trim(), new Date().toISOString());
        audit("player.create", null, req, { name: parsed.name.trim() });
        res.status(201).json({ ok: true });
    }
    catch (error) {
        next(error);
    }
});
app.get("/api/sessions", (req, res) => {
    audit("sessions.list", null, req);
    res.json(getSessions());
});
app.post("/api/sessions", writeLimiter, (req, res, next) => {
    try {
        const parsed = security_1.createSessionSchema.parse(req.body);
        assertUniqueIds(parsed.playerIds, "Jeder Spieler darf in der Runde nur einmal vorkommen.");
        const placeholders = parsed.playerIds.map(() => "?").join(", ");
        const selectedPlayers = db_1.db
            .prepare(`
        SELECT id, name
        FROM global_players
        WHERE id IN (${placeholders})
      `)
            .all(...parsed.playerIds);
        if (selectedPlayers.length !== parsed.playerIds.length) {
            return res.status(400).json({ error: "Mindestens ein Spieler ist ungueltig." });
        }
        const playerNameMap = new Map(selectedPlayers.map((player) => [player.id, player.name]));
        const orderedNames = parsed.playerIds.map((playerId) => playerNameMap.get(playerId) ?? "Unbekannt");
        const sessionId = crypto_1.default.randomUUID();
        const today = new Date().toISOString().slice(0, 10);
        const now = new Date().toISOString();
        const title = buildSessionTitle(orderedNames);
        const insertSession = db_1.db.prepare(`
      INSERT INTO sessions (id, title, date, active, created_at)
      VALUES (?, ?, ?, 1, ?)
    `);
        const insertSessionPlayer = db_1.db.prepare(`
      INSERT INTO session_players (session_id, player_id, sort_order)
      VALUES (?, ?, ?)
    `);
        const tx = db_1.db.transaction(() => {
            insertSession.run(sessionId, title, today, now);
            parsed.playerIds.forEach((playerId, index) => {
                insertSessionPlayer.run(sessionId, playerId, index);
            });
        });
        tx();
        audit("session.create", sessionId, req, { playerIds: parsed.playerIds });
        res.status(201).json({ ok: true });
    }
    catch (error) {
        next(error);
    }
});
app.post("/api/sessions/:id/games", writeLimiter, (req, res, next) => {
    try {
        const sessionId = String(req.params.id);
        const parsed = security_1.addGameSchema.parse(req.body);
        const { session, calculatedScores } = validateGamePayload(sessionId, parsed);
        if (session.active !== 1) {
            return res.status(400).json({ error: "Runde ist bereits beendet." });
        }
        const gameId = crypto_1.default.randomUUID();
        const createdAt = new Date().toISOString();
        const insertGame = db_1.db.prepare(`
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
        const insertScore = db_1.db.prepare(`
      INSERT INTO game_scores (id, game_id, player_id, score, is_winner)
      VALUES (?, ?, ?, ?, ?)
    `);
        const tx = db_1.db.transaction(() => {
            insertGame.run(gameId, sessionId, createdAt, parsed.gewonnenVon, parsed.siegerPartei, parsed.isBockrunde ? 1 : 0, parsed.partyPoints, parsed.hochzeitPlayerId, parsed.soloPlayerId, parsed.reAnsage, parsed.kontraAnsage, parsed.kommentar);
            calculatedScores.forEach((score) => {
                insertScore.run(crypto_1.default.randomUUID(), gameId, score.playerId, score.score, score.isWinner ? 1 : 0);
            });
        });
        tx();
        audit("game.create", sessionId, req, parsed);
        res.status(201).json({ ok: true });
    }
    catch (error) {
        if (error instanceof Error && error.message === "Runde nicht gefunden.") {
            return res.status(404).json({ error: error.message });
        }
        next(error);
    }
});
app.post("/api/sessions/:sessionId/games/:gameId", writeLimiter, (req, res, next) => {
    try {
        const sessionId = String(req.params.sessionId);
        const gameId = String(req.params.gameId);
        const parsed = security_1.addGameSchema.parse(req.body);
        const game = db_1.db
            .prepare(`
        SELECT id
        FROM games
        WHERE id = ? AND session_id = ?
      `)
            .get(gameId, sessionId);
        if (!game) {
            return res.status(404).json({ error: "Spiel nicht gefunden." });
        }
        const { calculatedScores } = validateGamePayload(sessionId, parsed);
        const updateGame = db_1.db.prepare(`
      UPDATE games
      SET
        gewonnen_von = ?,
        sieger_partei = ?,
        is_bockrunde = ?,
        party_points = ?,
        hochzeit_player_id = ?,
        solo_player_id = ?,
        re_ansage = ?,
        kontra_ansage = ?,
        kommentar = ?
      WHERE id = ? AND session_id = ?
    `);
        const insertScore = db_1.db.prepare(`
      INSERT INTO game_scores (id, game_id, player_id, score, is_winner)
      VALUES (?, ?, ?, ?, ?)
    `);
        const tx = db_1.db.transaction(() => {
            updateGame.run(parsed.gewonnenVon, parsed.siegerPartei, parsed.isBockrunde ? 1 : 0, parsed.partyPoints, parsed.hochzeitPlayerId, parsed.soloPlayerId, parsed.reAnsage, parsed.kontraAnsage, parsed.kommentar, gameId, sessionId);
            db_1.db.prepare(`DELETE FROM game_scores WHERE game_id = ?`).run(gameId);
            calculatedScores.forEach((score) => {
                insertScore.run(crypto_1.default.randomUUID(), gameId, score.playerId, score.score, score.isWinner ? 1 : 0);
            });
        });
        tx();
        audit("game.update", sessionId, req, { gameId, ...parsed });
        res.json({ ok: true });
    }
    catch (error) {
        if (error instanceof Error && error.message === "Runde nicht gefunden.") {
            return res.status(404).json({ error: error.message });
        }
        next(error);
    }
});
app.post("/api/sessions/:id/undo", writeLimiter, (req, res) => {
    const sessionId = String(req.params.id);
    const session = db_1.db
        .prepare(`
      SELECT id
      FROM sessions
      WHERE id = ?
    `)
        .get(sessionId);
    if (!session) {
        return res.status(404).json({ error: "Runde nicht gefunden." });
    }
    const lastGame = db_1.db
        .prepare(`
      SELECT id
      FROM games
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
        .get(sessionId);
    if (!lastGame) {
        return res.status(400).json({ error: "Kein Spiel zum Rueckgaengigmachen vorhanden." });
    }
    const tx = db_1.db.transaction(() => {
        db_1.db.prepare(`DELETE FROM game_scores WHERE game_id = ?`).run(lastGame.id);
        db_1.db.prepare(`DELETE FROM games WHERE id = ?`).run(lastGame.id);
    });
    tx();
    audit("game.undo", sessionId, req, { gameId: lastGame.id });
    res.json({ ok: true });
});
app.post("/api/sessions/:id/end", writeLimiter, (req, res) => {
    const sessionId = String(req.params.id);
    const result = db_1.db
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
app.use((error, _req, res, _next) => {
    console.error(error);
    if (typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "ZodError" &&
        "issues" in error &&
        Array.isArray(error.issues)) {
        const firstIssue = error.issues[0];
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
