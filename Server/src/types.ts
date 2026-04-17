export type Recipe = {
  id: string;
  title: string;
  link: string;
  description: string;
  category: string;
  created_at: string;
};

export type MealEvent = {
  id: string;
  recipe_id: string;
  date: string;
  notes: string;
  created_at: string;
};

export type Rating = {
  id: string;
  meal_event_id: string;
  family_member: string;
  rating: number;
  created_at: string;
};

export const FAMILY_MEMBERS = ["Matteo", "Klara", "Mama", "Papa"] as const;
export type FamilyMember = (typeof FAMILY_MEMBERS)[number];

export const CATEGORIES = [
  "Pasta & Nudeln",
  "Fleisch",
  "Fisch & Meeresfrüchte",
  "Vegetarisch",
  "Suppen & Eintöpfe",
  "Salate",
  "Backen",
  "Sonstiges"
] as const;
export type Category = (typeof CATEGORIES)[number];
