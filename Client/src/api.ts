import type { Recipe, RecipeDetail, MealEvent, WeekPlanDay, Stats } from "./types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:3001";

function headers(pw: string): Record<string, string> {
  return { "Content-Type": "application/json", "x-app-password": pw };
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function checkAuth(pw: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/stats`, { headers: headers(pw) });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

export async function fetchRecipes(pw: string): Promise<Recipe[]> {
  return handle(await fetch(`${BASE}/api/recipes`, { headers: headers(pw) }));
}

export async function fetchRecipe(pw: string, id: string): Promise<RecipeDetail> {
  return handle(await fetch(`${BASE}/api/recipes/${id}`, { headers: headers(pw) }));
}

export async function createRecipe(
  pw: string,
  data: { title: string; link: string; description: string; category: string }
): Promise<{ ok: boolean; id: string }> {
  return handle(
    await fetch(`${BASE}/api/recipes`, {
      method: "POST",
      headers: headers(pw),
      body: JSON.stringify(data)
    })
  );
}

export async function updateRecipe(
  pw: string,
  id: string,
  data: { title: string; link: string; description: string; category: string }
): Promise<{ ok: boolean }> {
  return handle(
    await fetch(`${BASE}/api/recipes/${id}`, {
      method: "PUT",
      headers: headers(pw),
      body: JSON.stringify(data)
    })
  );
}

export async function deleteRecipe(pw: string, id: string): Promise<{ ok: boolean }> {
  return handle(
    await fetch(`${BASE}/api/recipes/${id}`, {
      method: "DELETE",
      headers: headers(pw)
    })
  );
}

// ─── Meal Events ─────────────────────────────────────────────────────────────

export async function fetchMealEvents(pw: string): Promise<MealEvent[]> {
  return handle(await fetch(`${BASE}/api/meal-events`, { headers: headers(pw) }));
}

export async function createMealEvent(
  pw: string,
  data: {
    recipe_id: string;
    date: string;
    notes: string;
    ratings: Array<{ family_member: string; rating: number }>;
  }
): Promise<{ ok: boolean; id: string }> {
  return handle(
    await fetch(`${BASE}/api/meal-events`, {
      method: "POST",
      headers: headers(pw),
      body: JSON.stringify(data)
    })
  );
}

export async function deleteMealEvent(pw: string, id: string): Promise<{ ok: boolean }> {
  return handle(
    await fetch(`${BASE}/api/meal-events/${id}`, {
      method: "DELETE",
      headers: headers(pw)
    })
  );
}

// ─── Weekly Plan ─────────────────────────────────────────────────────────────

export async function fetchWeeklyPlan(pw: string, seed?: number): Promise<WeekPlanDay[]> {
  const url = seed !== undefined
    ? `${BASE}/api/weekly-plan?seed=${seed}`
    : `${BASE}/api/weekly-plan`;
  return handle(await fetch(url, { headers: headers(pw) }));
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export async function fetchStats(pw: string): Promise<Stats> {
  return handle(await fetch(`${BASE}/api/stats`, { headers: headers(pw) }));
}
