// lib/sheet-data.ts
// Data layer for market prices.
// Priority: DB snapshot (frozen at 3:20 PM IST) → Google Sheet CSV → Yahoo Finance v8 live.

import { dbList } from "./db";
import { fetchAllNiftyStocks, fetchAllIndices } from "./yahoo-finance";
import type { MacroIndicator } from "./macro-fetch";

export interface PriceData {
  close: number;
  changePct: number;
}

export interface SheetData {
  stocks: Map<string, PriceData>;
  indices: Map<string, PriceData>;
  macro?: MacroIndicator[];
  fetchedAt: Date;
}

// ── DB snapshot ───────────────────────────────────────────────────────────────

interface SnapshotRecord {
  id: string;
  data: {
    type: "market_snapshot";
    session_date: string;
    stocks: Record<string, PriceData>;
    indices: Record<string, PriceData>;
    macro?: MacroIndicator[];
    refreshed_at: string;
  };
}

async function readLatestSnapshot(embedToken: string): Promise<SheetData | null> {
  try {
    const rows = await dbList<SnapshotRecord>("items", {}, embedToken);
    const snapshots = rows
      .filter((r) => r.data.type === "market_snapshot")
      .sort((a, b) => b.data.session_date.localeCompare(a.data.session_date));
    if (snapshots.length === 0) return null;

    const latest = snapshots[0];
    return {
      stocks: new Map(Object.entries(latest.data.stocks)),
      indices: new Map(Object.entries(latest.data.indices)),
      macro: latest.data.macro,
      fetchedAt: new Date(latest.data.refreshed_at),
    };
  } catch {
    return null;
  }
}

// ── Google Sheet CSV ───────────────────────────────────────────────────────────

function parseCsvRows(csv: string): Map<string, PriceData> {
  const map = new Map<string, PriceData>();
  const lines = csv.split("\n");
  // Row 0 is header: SYMBOL, Close Prev, Change %
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(",");
    const symbol = cols[0]?.trim().replace(/^"|"$/g, "");
    const closeRaw = cols[1]?.trim().replace(/^"|"$/g, "");
    const changePctRaw = cols[2]?.trim().replace(/^"|"$/g, "");
    if (!symbol || closeRaw === "#N/A" || changePctRaw === "#N/A") continue;
    const close = parseFloat(closeRaw);
    const changePct = parseFloat(changePctRaw);
    if (!isNaN(close) && close > 0 && !isNaN(changePct)) {
      map.set(symbol, { close, changePct });
    }
  }
  return map;
}

// Indices tab has 4 columns: INDEX_KEY, Name, Close Prev, Change %
function parseIndicesCsvRows(csv: string): Map<string, PriceData> {
  const map = new Map<string, PriceData>();
  const lines = csv.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(",");
    const name = cols[1]?.trim().replace(/^"|"$/g, "");
    const closeRaw = cols[2]?.trim().replace(/^"|"$/g, "");
    const changePctRaw = cols[3]?.trim().replace(/^"|"$/g, "");
    if (!name || closeRaw === "#N/A" || changePctRaw === "#N/A") continue;
    const close = parseFloat(closeRaw);
    const changePct = parseFloat(changePctRaw);
    if (!isNaN(close) && close > 0 && !isNaN(changePct)) {
      map.set(name, { close, changePct });
    }
  }
  return map;
}

async function fetchCsv(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
  return res.text();
}

const BASE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQGywigx7GnD4Lp3j00nuxB54LYc10GPu-T1phwN5WRO0xHvN27HVF2rPHpNbIesIQnL3gHjuoDVsOZ/pub";

const SHEET_URLS = {
  stock1:  process.env.GSHEET_STOCK_1_URL  ?? `${BASE}?gid=67337311&single=true&output=csv`,
  stock2:  process.env.GSHEET_STOCK_2_URL  ?? `${BASE}?gid=416273794&single=true&output=csv`,
  stock3:  process.env.GSHEET_STOCK_3_URL  ?? `${BASE}?gid=2037248658&single=true&output=csv`,
  indices: process.env.GSHEET_INDICES_URL  ?? `${BASE}?gid=499639885&single=true&output=csv`,
};

async function fetchFromGoogleSheet(): Promise<SheetData | null> {
  try {
    const [csv1, csv2, csv3, csvIdx] = await Promise.all([
      fetchCsv(SHEET_URLS.stock1),
      fetchCsv(SHEET_URLS.stock2),
      fetchCsv(SHEET_URLS.stock3),
      fetchCsv(SHEET_URLS.indices),
    ]);

    const stocks = new Map<string, PriceData>([
      ...parseCsvRows(csv1),
      ...parseCsvRows(csv2),
      ...parseCsvRows(csv3),
    ]);
    const indices = parseIndicesCsvRows(csvIdx);

    // Treat as failed if Google Sheet returned mostly #N/A
    if (stocks.size < 10 || indices.size === 0) return null;

    return { stocks, indices, fetchedAt: new Date() };
  } catch {
    return null;
  }
}

async function fetchFromYahoo(): Promise<SheetData> {
  const [stocks, indices] = await Promise.all([
    fetchAllNiftyStocks(),
    fetchAllIndices(),
  ]);
  return { stocks, indices, fetchedAt: new Date() };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchSheetData(embedToken?: string): Promise<SheetData> {
  // 1. DB snapshot (frozen at 3:20 PM IST) — preferred source
  if (embedToken) {
    const snapshot = await readLatestSnapshot(embedToken);
    if (snapshot && snapshot.stocks.size >= 10) return snapshot;
  }

  // 2. Google Sheet CSV — may return #N/A outside market hours or on holidays
  const sheetData = await fetchFromGoogleSheet();
  if (sheetData) return sheetData;

  // 3. Yahoo Finance v8/chart per-symbol — reliable live fallback
  return fetchFromYahoo();
}
