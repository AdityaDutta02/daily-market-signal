import { dbList } from "./db";

interface TickerRecord {
  id: string;
  data: {
    type: string;
    symbols: string[];
    updated_at: string;
  };
}

export async function getTickerList(embedToken: string): Promise<string[]> {
  const rows = await dbList<TickerRecord>("items", {}, embedToken);
  const record = rows.find((r) => r.data.type === "nse_tickers");
  return record?.data.symbols ?? [];
}

export async function validateTickers(
  tickers: string[],
  embedToken: string
): Promise<{ valid: string[]; invalid: string[] }> {
  const symbols = await getTickerList(embedToken);
  const symbolSet = new Set(symbols);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const t of tickers) {
    const upper = t.trim().toUpperCase();
    if (symbolSet.has(upper)) valid.push(upper);
    else invalid.push(upper);
  }
  return { valid, invalid };
}

export function searchTickers(query: string, symbols: string[]): string[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  return symbols
    .filter((s) => s.startsWith(q))
    .slice(0, 10);
}
