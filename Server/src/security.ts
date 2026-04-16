import { z } from "zod";

const playerNameSchema = z
  .string()
  .trim()
  .min(1, "Spielername darf nicht leer sein.")
  .max(30, "Spielername darf maximal 30 Zeichen haben.")
  .regex(/^[\p{L}\p{N} ._\-]+$/u, "Spielername enthaelt ungueltige Zeichen.");

const uuidArray = z.array(z.string().uuid());
const optionalUuid = z.union([z.string().uuid(), z.null()]);

export const createPlayerSchema = z.object({
  name: playerNameSchema
});

export const createSessionSchema = z.object({
  playerIds: uuidArray.min(4, "Es muessen mindestens 4 Spieler angegeben werden.")
});

const importScoreSchema = z.object({
  playerName: playerNameSchema,
  score: z.number().int().min(-9999).max(9999)
});

const importGameSchema = z.object({
  gewonnenVon: z.enum(["Normal", "Hochzeit", "Solo"]),
  siegerPartei: z.enum(["Re", "Kontra", "Solo"]),
  isBockrunde: z.boolean(),
  partyPoints: z.number().int().min(1).max(999),
  soloPlayerName: z.string().max(30).nullable().default(null),
  hochzeitPlayerName: z.string().max(30).nullable().default(null),
  reAnsage: z.string().max(50).default(""),
  kontraAnsage: z.string().max(50).default(""),
  kommentar: z.string().max(500).default(""),
  scores: z.array(importScoreSchema).min(1).max(8)
});

export const importSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss im Format YYYY-MM-DD sein."),
  playerNames: z.array(playerNameSchema).min(4).max(20),
  games: z.array(importGameSchema).min(0).max(500)
});

export const addGameSchema = z.object({
  playerIds: uuidArray.length(4, "Es muessen genau 4 Spieler fuer das Spiel gesetzt werden."),
  winners: uuidArray.min(1, "Mindestens ein Gewinner muss gewaehlt werden.").max(3),
  gewonnenVon: z.enum(["Normal", "Hochzeit", "Solo"]),
  siegerPartei: z.enum(["Re", "Kontra", "Solo"]),
  isBockrunde: z.boolean(),
  partyPoints: z.number().int().min(1).max(999),
  hochzeitPlayerId: optionalUuid,
  soloPlayerId: optionalUuid,
  reAnsage: z.string().max(50).default(""),
  kontraAnsage: z.string().max(50).default(""),
  kommentar: z.string().max(500).default("")
});
