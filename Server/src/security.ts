import { z } from "zod";
import { FAMILY_MEMBERS, CATEGORIES } from "./types";

export const createRecipeSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Titel darf nicht leer sein.")
    .max(100, "Titel darf maximal 100 Zeichen haben."),
  link: z.string().max(500, "Link zu lang.").default(""),
  description: z.string().max(2000, "Beschreibung zu lang.").default(""),
  category: z.enum(CATEGORIES).default("Sonstiges")
});

export const updateRecipeSchema = createRecipeSchema;

export const createMealEventSchema = z.object({
  recipe_id: z.string().uuid("Ungültige Rezept-ID."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss im Format YYYY-MM-DD sein."),
  notes: z.string().max(1000, "Notizen zu lang.").default(""),
  ratings: z
    .array(
      z.object({
        family_member: z.enum(FAMILY_MEMBERS, {
          errorMap: () => ({ message: "Ungültiges Familienmitglied." })
        }),
        rating: z
          .number()
          .min(0, "Bewertung muss mindestens 0 sein.")
          .max(10, "Bewertung darf maximal 10 sein.")
      })
    )
    .max(4, "Maximal 4 Bewertungen pro Mahlzeit.")
    .default([])
});
