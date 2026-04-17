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

export type MemberRatings = Partial<Record<FamilyMember, number>>;

export type Recipe = {
  id: string;
  title: string;
  link: string;
  description: string;
  category: string;
  created_at: string;
  avg_rating: number | null;
  times_eaten: number;
  last_eaten: string | null;
  member_ratings: MemberRatings;
};

export type RatingEntry = {
  family_member: string;
  rating: number;
};

export type MealEventHistory = {
  id: string;
  date: string;
  notes: string;
  created_at: string;
  ratings: RatingEntry[];
};

export type RecipeDetail = Recipe & {
  history: MealEventHistory[];
};

export type MealEvent = {
  id: string;
  recipe_id: string;
  recipe_title: string;
  date: string;
  notes: string;
  created_at: string;
  ratings: RatingEntry[];
};

export type WeekPlanDay = {
  day: string;
  recipe: {
    id: string;
    title: string;
    link: string;
    category: string;
  };
  avg_rating: number | null;
  times_eaten: number;
};

export type MemberStat = {
  member: FamilyMember;
  avg: number | null;
  total: number;
};

export type Stats = {
  totalRecipes: number;
  totalMeals: number;
  memberStats: MemberStat[];
  topRecipe: { title: string; avg: number } | null;
};
