import { dbList, dbInsert, dbUpdate } from "./db";
import { getTodayISO } from "./nse-holidays";

interface ItemRow {
  id: string;
  data: Record<string, unknown>;
}

export async function getCachedPreset(
  presetId: string,
  embedToken: string,
  bust = false
): Promise<{ html_section: string; search_data: string } | null> {
  if (bust) return null;
  const today = getTodayISO();
  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const hit = rows.find(
    (r) =>
      r.data.type === "preset_cache" &&
      r.data.preset_id === presetId &&
      r.data.cached_date === today
  );
  if (!hit) return null;
  return {
    html_section: hit.data.html_section as string,
    search_data: hit.data.search_data as string,
  };
}

export async function setCachedPreset(
  presetId: string,
  htmlSection: string,
  searchData: string,
  embedToken: string
): Promise<void> {
  const today = getTodayISO();
  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const existing = rows.find(
    (r) => r.data.type === "preset_cache" && r.data.preset_id === presetId
  );
  const data = {
    type: "preset_cache",
    preset_id: presetId,
    html_section: htmlSection,
    search_data: searchData,
    cached_date: today,
  };
  if (existing) {
    await dbUpdate("items", existing.id, { data }, embedToken);
  } else {
    await dbInsert("items", { data }, embedToken);
  }
}

export async function getCachedCompany(
  ticker: string,
  embedToken: string,
  bust = false
): Promise<{ html_section: string; search_data: string } | null> {
  if (bust) return null;
  const today = getTodayISO();
  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const hit = rows.find(
    (r) =>
      r.data.type === "company_cache" &&
      r.data.ticker === ticker &&
      r.data.cached_date === today
  );
  if (!hit) return null;
  return {
    html_section: hit.data.html_section as string,
    search_data: hit.data.search_data as string,
  };
}

export async function setCachedCompany(
  ticker: string,
  htmlSection: string,
  searchData: string,
  embedToken: string
): Promise<void> {
  const today = getTodayISO();
  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const existing = rows.find(
    (r) => r.data.type === "company_cache" && r.data.ticker === ticker
  );
  const data = {
    type: "company_cache",
    ticker,
    html_section: htmlSection,
    search_data: searchData,
    cached_date: today,
  };
  if (existing) {
    await dbUpdate("items", existing.id, { data }, embedToken);
  } else {
    await dbInsert("items", { data }, embedToken);
  }
}
