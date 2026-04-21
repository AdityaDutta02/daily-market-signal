// lib/market-snapshot.ts
// Scheduled snapshot: fetches all market data at 3:20 PM IST, stores frozen
// in DB, serves it to report generation until next 3:20 PM snapshot.

import { dbList, dbInsert, dbUpdate } from "./db";
import { fetchAllNiftyStocks, fetchAllIndices, type QuoteData } from "./yahoo-finance";
import { fetchMacroIndicators, type MacroIndicator } from "./macro-fetch";

export interface SnapshotData {
  stocks: Map<string, QuoteData>;
  indices: Map<string, QuoteData>;
  macro: MacroIndicator[];
  sessionDate: string;
  fetchedAt: Date;
}

interface SnapshotRecord {
  id: string;
  data: {
    type: "market_snapshot";
    session_date: string;
    stocks: Record<string, QuoteData>;
    indices: Record<string, QuoteData>;
    macro: MacroIndicator[];
    refreshed_at: string;
  };
}

function getISTDateStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export async function refreshMarketSnapshot(embedToken: string): Promise<{ stocks: number; indices: number }> {
  const [stocks, indices, macro] = await Promise.all([
    fetchAllNiftyStocks(),
    fetchAllIndices(),
    fetchMacroIndicators(),
  ]);

  const sessionDate = getISTDateStr();
  const payload = {
    type: "market_snapshot" as const,
    session_date: sessionDate,
    stocks: Object.fromEntries(stocks),
    indices: Object.fromEntries(indices),
    macro,
    refreshed_at: new Date().toISOString(),
  };

  const rows = await dbList<SnapshotRecord>("items", {}, embedToken);
  const existing = rows.find(
    (r) => r.data.type === "market_snapshot" && r.data.session_date === sessionDate
  );

  if (existing) {
    await dbUpdate("items", existing.id, { data: payload }, embedToken);
  } else {
    await dbInsert("items", { data: payload }, embedToken);
  }

  return { stocks: stocks.size, indices: indices.size };
}

export async function getLatestSnapshot(embedToken: string): Promise<SnapshotData | null> {
  const rows = await dbList<SnapshotRecord>("items", {}, embedToken);
  const snapshots = rows
    .filter((r) => r.data.type === "market_snapshot")
    .sort((a, b) => b.data.session_date.localeCompare(a.data.session_date));

  if (snapshots.length === 0) return null;

  const latest = snapshots[0];
  return {
    stocks: new Map(Object.entries(latest.data.stocks)),
    indices: new Map(Object.entries(latest.data.indices)),
    macro: latest.data.macro ?? [],
    sessionDate: latest.data.session_date,
    fetchedAt: new Date(latest.data.refreshed_at),
  };
}
