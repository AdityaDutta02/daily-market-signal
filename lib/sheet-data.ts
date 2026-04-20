// lib/sheet-data.ts
// Fetches 4 published Google Sheet CSV tabs and parses into a price map.
// Falls back to Yahoo Finance if the sheet returns all #N/A (pre-market / formula lag).

export interface PriceData {
  close: number;
  changePct: number;
}

export interface SheetData {
  stocks: Map<string, PriceData>;  // keyed by NSE ticker symbol e.g. "HDFCBANK"
  indices: Map<string, PriceData>; // keyed by index name e.g. "Nifty 50"
  fetchedAt: Date;
}

// ── Yahoo Finance fallback ─────────────────────────────────────────────────────

const NIFTY50_YAHOO = [
  "ADANIENT.NS","ADANIPORTS.NS","APOLLOHOSP.NS","ASIANPAINT.NS","AXISBANK.NS",
  "BAJAJ-AUTO.NS","BAJFINANCE.NS","BAJAJFINSV.NS","BPCL.NS","BHARTIARTL.NS",
  "BRITANNIA.NS","CIPLA.NS","COALINDIA.NS","DIVISLAB.NS","DRREDDY.NS",
  "EICHERMOT.NS","GRASIM.NS","HCLTECH.NS","HDFCBANK.NS","HDFCLIFE.NS",
  "HEROMOTOCO.NS","HINDALCO.NS","HINDUNILVR.NS","ICICIBANK.NS","INDUSINDBK.NS",
  "INFY.NS","ITC.NS","JSWSTEEL.NS","KOTAKBANK.NS","LT.NS",
  "LTIM.NS","M%26M.NS","MARUTI.NS","NESTLEIND.NS","NTPC.NS",
  "ONGC.NS","POWERGRID.NS","RELIANCE.NS","SBILIFE.NS","SBIN.NS",
  "SUNPHARMA.NS","TATACONSUM.NS","TATAMOTORS.NS","TATASTEEL.NS","TCS.NS",
  "TECHM.NS","TITAN.NS","TRENT.NS","ULTRACEMCO.NS","WIPRO.NS",
];

const INDEX_YAHOO: Array<{ symbol: string; name: string }> = [
  { symbol: "^NSEI",      name: "Nifty 50"     },
  { symbol: "^BSESN",     name: "Sensex"       },
  { symbol: "^NSEBANK",   name: "Bank Nifty"   },
  { symbol: "^CNXIT",     name: "Nifty IT"     },
  { symbol: "^CNXPHARMA", name: "Nifty Pharma" },
  { symbol: "^CNXAUTO",   name: "Nifty Auto"   },
  { symbol: "^CNXMETAL",  name: "Nifty Metal"  },
  { symbol: "^CNXENERGY", name: "Nifty Energy" },
  { symbol: "^CNXFMCG",   name: "Nifty FMCG"  },
  { symbol: "^CNXREALTY", name: "Nifty Realty" },
];

interface YahooQuoteResult {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
}

async function fetchYahooBatch(symbols: string[]): Promise<Map<string, { close: number; changePct: number }>> {
  const map = new Map<string, { close: number; changePct: number }>();
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(",")}`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketBrief/1.0)" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return map;
    const data = await res.json() as { quoteResponse?: { result?: YahooQuoteResult[] } };
    for (const item of data.quoteResponse?.result ?? []) {
      if (!item.regularMarketPrice) continue;
      map.set(item.symbol, {
        close: item.regularMarketPrice,
        changePct: item.regularMarketChangePercent ?? 0,
      });
    }
  } catch { /* return empty map */ }
  return map;
}

async function fetchYahooFallbackStocks(): Promise<Map<string, PriceData>> {
  const raw = await fetchYahooBatch(NIFTY50_YAHOO);
  const out = new Map<string, PriceData>();
  for (const [sym, data] of raw) {
    // Strip .NS suffix; decode M%26M → M&M
    const ticker = sym.replace(".NS", "").replace("M%26M", "M&M");
    out.set(ticker, data);
  }
  return out;
}

async function fetchYahooFallbackIndices(): Promise<Map<string, PriceData>> {
  const symbols = INDEX_YAHOO.map((i) => i.symbol);
  const raw = await fetchYahooBatch(symbols);
  const out = new Map<string, PriceData>();
  for (const { symbol, name } of INDEX_YAHOO) {
    const d = raw.get(symbol);
    if (d) out.set(name, d);
  }
  return out;
}

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
// We key by Name (col 1) for human-readable lookup.
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

async function fetchCsv(url: string, label: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} CSV fetch failed: ${res.status}`);
  return res.text();
}

const BASE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQGywigx7GnD4Lp3j00nuxB54LYc10GPu-T1phwN5WRO0xHvN27HVF2rPHpNbIesIQnL3gHjuoDVsOZ/pub";

const SHEET_URLS = {
  stock1: process.env.GSHEET_STOCK_1_URL ?? `${BASE}?gid=67337311&single=true&output=csv`,
  stock2: process.env.GSHEET_STOCK_2_URL ?? `${BASE}?gid=416273794&single=true&output=csv`,
  stock3: process.env.GSHEET_STOCK_3_URL ?? `${BASE}?gid=2037248658&single=true&output=csv`,
  indices: process.env.GSHEET_INDICES_URL ?? `${BASE}?gid=499639885&single=true&output=csv`,
};

export async function fetchSheetData(): Promise<SheetData> {
  const [csv1, csv2, csv3, csvIdx] = await Promise.all([
    fetchCsv(SHEET_URLS.stock1, "Stock_1"),
    fetchCsv(SHEET_URLS.stock2, "Stock_2"),
    fetchCsv(SHEET_URLS.stock3, "Stock_3"),
    fetchCsv(SHEET_URLS.indices, "Indices"),
  ]);

  let stocks = new Map<string, PriceData>([
    ...parseCsvRows(csv1),
    ...parseCsvRows(csv2),
    ...parseCsvRows(csv3),
  ]);

  let indices = parseIndicesCsvRows(csvIdx);

  // Sheet formulas return #N/A outside market hours — fall back to Yahoo Finance
  const [fallbackStocks, fallbackIndices] = await Promise.all([
    stocks.size === 0 ? fetchYahooFallbackStocks() : Promise.resolve(null),
    indices.size === 0 ? fetchYahooFallbackIndices() : Promise.resolve(null),
  ]);
  if (fallbackStocks) stocks = fallbackStocks;
  if (fallbackIndices) indices = fallbackIndices;

  return { stocks, indices, fetchedAt: new Date() };
}
