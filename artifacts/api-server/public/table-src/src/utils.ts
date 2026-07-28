export function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Read the server-injected table config from the <script id="table-config"> tag */
export function readTableConfig(): { storeId: string; tableNumber: string; stripePublishableKey?: string } {
  try {
    const el = document.getElementById("table-config");
    if (el?.textContent) {
      return JSON.parse(el.textContent);
    }
  } catch {
    // ignore
  }
  // Dev fallback: read from query params
  const params = new URLSearchParams(window.location.search);
  return {
    storeId: params.get("storeId") ?? "dev-store",
    tableNumber: params.get("table") ?? "1",
    stripePublishableKey: params.get("stripeKey") ?? undefined,
  };
}

/** Resolve API URL relative to the current page origin */
export function apiUrl(path: string): string {
  return `/api${path}`;
}

export function dietaryLabel(tag: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    vegan: { label: "Vegan", color: "bg-green-100 text-green-800" },
    vegetarian: { label: "Veg", color: "bg-green-100 text-green-700" },
    "gluten-free": { label: "GF", color: "bg-yellow-100 text-yellow-800" },
    dairyfree: { label: "DF", color: "bg-blue-100 text-blue-800" },
    "dairy-free": { label: "DF", color: "bg-blue-100 text-blue-800" },
    "nut-free": { label: "NF", color: "bg-orange-100 text-orange-800" },
    halal: { label: "Halal", color: "bg-teal-100 text-teal-800" },
  };
  const lower = tag.toLowerCase().replace(/\s+/g, "-");
  return map[lower] ?? { label: tag, color: "bg-gray-100 text-gray-700" };
}
