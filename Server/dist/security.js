"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addGameSchema = exports.createSessionSchema = exports.createPlayerSchema = void 0;
const zod_1 = require("zod");
const playerNameSchema = zod_1.z
    .string()
    .trim()
    .min(1, "Spielername darf nicht leer sein.")
    .max(30, "Spielername darf maximal 30 Zeichen haben.")
    .regex(/^[\p{L}\p{N} ._\-]+$/u, "Spielername enthaelt ungueltige Zeichen.");
const uuidArray = zod_1.z.array(zod_1.z.string().uuid());
const optionalUuid = zod_1.z.union([zod_1.z.string().uuid(), zod_1.z.null()]);
exports.createPlayerSchema = zod_1.z.object({
    name: playerNameSchema
});
exports.createSessionSchema = zod_1.z.object({
    playerIds: uuidArray.min(4, "Es muessen mindestens 4 Spieler angegeben werden.")
});
exports.addGameSchema = zod_1.z.object({
    playerIds: uuidArray.length(4, "Es muessen genau 4 Spieler fuer das Spiel gesetzt werden."),
    winners: uuidArray.min(1, "Mindestens ein Gewinner muss gewaehlt werden.").max(3),
    gewonnenVon: zod_1.z.enum(["Normal", "Hochzeit", "Solo"]),
    siegerPartei: zod_1.z.enum(["Re", "Kontra", "Solo"]),
    isBockrunde: zod_1.z.boolean(),
    partyPoints: zod_1.z.number().int().min(1).max(999),
    hochzeitPlayerId: optionalUuid,
    soloPlayerId: optionalUuid,
    reAnsage: zod_1.z.string().max(50).default(""),
    kontraAnsage: zod_1.z.string().max(50).default(""),
    kommentar: zod_1.z.string().max(500).default("")
});
