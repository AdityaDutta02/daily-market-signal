// lib/sheet-data.ts
// Fetches 4 published Google Sheet CSV tabs and parses into a price map.

export interface PriceData {
  close: number;
  changePct: number;
}

export interface SheetData {
  stocks: Map<string, PriceData>;  // keyed by NSE ticker symbol e.g. "HDFCBANK"
  indices: Map<string, PriceData>; // keyed by index name e.g. "Nifty 50"
  fetchedAt: Date;
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

export async function fetchSheetData(): Promise<SheetData> {
  const urls = {
    GSHEET_STOCK_1_URL: process.env.GSHEET_STOCK_1_URL,
    GSHEET_STOCK_2_URL: process.env.GSHEET_STOCK_2_URL,
    GSHEET_STOCK_3_URL: process.env.GSHEET_STOCK_3_URL,
    GSHEET_INDICES_URL: process.env.GSHEET_INDICES_URL,
  };

  const missing = Object.entries(urls)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }

  const [csv1, csv2, csv3, csvIdx] = await Promise.all([
    fetchCsv(urls.GSHEET_STOCK_1_URL!, "Stock_1"),
    fetchCsv(urls.GSHEET_STOCK_2_URL!, "Stock_2"),
    fetchCsv(urls.GSHEET_STOCK_3_URL!, "Stock_3"),
    fetchCsv(urls.GSHEET_INDICES_URL!, "Indices"),
  ]);

  const stocks = new Map<string, PriceData>([
    ...parseCsvRows(csv1),
    ...parseCsvRows(csv2),
    ...parseCsvRows(csv3),
  ]);

  const indices = parseIndicesCsvRows(csvIdx);

  return { stocks, indices, fetchedAt: new Date() };
}
