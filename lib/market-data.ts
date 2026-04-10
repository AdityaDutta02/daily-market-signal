// lib/market-data.ts
import { analyzeWithDeepseek } from "./terminal-ai";
import {
  getCachedPreset,
  setCachedPreset,
  getCachedCompany,
  setCachedCompany,
} from "./cache";
import {
  getStocksNews,
  getVolumeLeaders,
  getEarningsCalendar,
  getMacroData,
} from "./brightdata";
import type { SheetData } from "./sheet-data";

export type PresetType =
  | "nifty_movers"
  | "stocks_to_watch"
  | "sectoral_pulse"
  | "earnings_radar"
  | "macro_dashboard";

export interface PresetInfo {
  id: PresetType;
  name: string;
  description: string;
}

export const PRESETS: PresetInfo[] = [
  { id: "nifty_movers",    name: "Nifty/Sensex Movers", description: "Top gainers and losers today" },
  { id: "stocks_to_watch", name: "Stocks to Watch",      description: "Trending by volume and news" },
  { id: "sectoral_pulse",  name: "Sectoral Pulse",        description: "Nifty sectoral index performance" },
  { id: "earnings_radar",  name: "Earnings Radar",        description: "Upcoming results and surprises" },
  { id: "macro_dashboard", name: "Macro Dashboard",       description: "Key Indian macro indicators" },
];

// Nifty 50 composition — update when NSE rebalances the index
const NIFTY50_SYMBOLS: string[] = [
  "ADANIENT","ADANIPORTS","APOLLOHOSP","ASIANPAINT","AXISBANK",
  "BAJAJ-AUTO","BAJFINANCE","BAJAJFINSV","BPCL","BHARTIARTL",
  "BRITANNIA","CIPLA","COALINDIA","DIVISLAB","DRREDDY",
  "EICHERMOT","GRASIM","HCLTECH","HDFCBANK","HDFCLIFE",
  "HEROMOTOCO","HINDALCO","HINDUNILVR","ICICIBANK","INDUSINDBK",
  "INFY","ITC","JSWSTEEL","KOTAKBANK","LT",
  "LTIM","M&M","MARUTI","NESTLEIND","NTPC",
  "ONGC","POWERGRID","RELIANCE","SBILIFE","SBIN",
  "SUNPHARMA","TATACONSUM","TATAMOTORS","TATASTEEL","TCS",
  "TECHM","TITAN","TRENT","ULTRACEMCO","WIPRO",
];

const SECTION_FORMAT_PROMPT = `You are an expert financial analyst writing a section of a morning Indian market brief email.
Format the data into clean HTML suitable for email clients.
Use inline styles only. Font: system-ui, -apple-system, sans-serif.
Colors: #1A1A1A for text, #5B5BD6 for accents, #2E7D32 for positive, #C62828 for negative.
Use tables with borders for data, bullet points for insights.
Keep it concise and scannable. Return ONLY the HTML section content, no wrapping body/html tags.`;

function fmt(close: number, changePct: number): string {
  const sign = changePct >= 0 ? "+" : "";
  return `₹${close.toLocaleString("en-IN", { maximumFractionDigits: 2 })} (${sign}${changePct.toFixed(2)}%)`;
}

async function buildNiftyMoversContext(sheetData: SheetData): Promise<string> {
  const entries = NIFTY50_SYMBOLS
    .map((sym) => {
      const p = sheetData.stocks.get(sym);
      return p ? { symbol: sym, ...p } : null;
    })
    .filter((e): e is { symbol: string; close: number; changePct: number } => e !== null);

  entries.sort((a, b) => b.changePct - a.changePct);
  const gainers = entries.slice(0, 5);
  const losers = [...entries].sort((a, b) => a.changePct - b.changePct).slice(0, 5);

  const nifty = sheetData.indices.get("Nifty 50");
  const sensex = sheetData.indices.get("Sensex");
  const bnifty = sheetData.indices.get("Bank Nifty");

  const lines: string[] = [
    "=== INDEX LEVELS ===",
    nifty  ? `Nifty 50:   ${fmt(nifty.close,  nifty.changePct)}`  : "Nifty 50:  data unavailable",
    sensex ? `Sensex:     ${fmt(sensex.close, sensex.changePct)}` : "Sensex:    data unavailable",
    bnifty ? `Bank Nifty: ${fmt(bnifty.close, bnifty.changePct)}` : "Bank Nifty: data unavailable",
    "",
    "=== NIFTY 50 TOP 5 GAINERS ===",
    ...gainers.map((e) => `${e.symbol}: ${fmt(e.close, e.changePct)}`),
    "",
    "=== NIFTY 50 TOP 5 LOSERS ===",
    ...losers.map((e) => `${e.symbol}: ${fmt(e.close, e.changePct)}`),
  ];
  return lines.join("\n");
}

async function buildStocksToWatchContext(sheetData: SheetData): Promise<string> {
  const all = [...sheetData.stocks.entries()]
    .map(([symbol, p]) => ({ symbol, ...p }))
    .filter((e) => Math.abs(e.changePct) > 0);
  all.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const top20 = all.slice(0, 20);

  const priceCtx = [
    "=== TOP 20 NSE MOVERS BY % CHANGE ===",
    ...top20.map((e) => `${e.symbol}: ${fmt(e.close, e.changePct)}`),
  ].join("\n");

  let volumeCtx = "";
  try {
    volumeCtx = "\n\n=== VOLUME LEADERS ===\n" + (await getVolumeLeaders());
  } catch {
    volumeCtx = "\n\n(Volume data unavailable)";
  }

  return priceCtx + volumeCtx;
}

async function buildSectoralPulseContext(sheetData: SheetData): Promise<string> {
  const names = [
    "Nifty 50","Sensex","Bank Nifty","Nifty IT",
    "Nifty Pharma","Nifty Auto","Nifty Metal",
    "Nifty Energy","Nifty FMCG","Nifty Realty",
  ];
  const lines = ["=== SECTORAL INDEX PERFORMANCE ==="];
  for (const name of names) {
    const data = sheetData.indices.get(name);
    lines.push(data ? `${name}: ${fmt(data.close, data.changePct)}` : `${name}: data unavailable`);
  }
  return lines.join("\n");
}

async function buildEarningsRadarContext(): Promise<string> {
  try {
    return "=== EARNINGS CALENDAR ===\n" + (await getEarningsCalendar());
  } catch {
    return "=== EARNINGS CALENDAR ===\n(Earnings data unavailable)";
  }
}

async function buildMacroDashboardContext(): Promise<string> {
  try {
    return "=== MACRO INDICATORS ===\n" + (await getMacroData());
  } catch {
    return "=== MACRO INDICATORS ===\n(Macro data unavailable)";
  }
}

export async function generatePresetSection(
  presetId: PresetType,
  embedToken: string,
  sheetData: SheetData
): Promise<string> {
  const cached = await getCachedPreset(presetId, embedToken);
  if (cached) return cached.html_section;

  let contextData: string;
  switch (presetId) {
    case "nifty_movers":    contextData = await buildNiftyMoversContext(sheetData); break;
    case "stocks_to_watch": contextData = await buildStocksToWatchContext(sheetData); break;
    case "sectoral_pulse":  contextData = await buildSectoralPulseContext(sheetData); break;
    case "earnings_radar":  contextData = await buildEarningsRadarContext(); break;
    case "macro_dashboard": contextData = await buildMacroDashboardContext(); break;
    default:                contextData = `No data available for preset: ${presetId}`;
  }

  const label = PRESETS.find((p) => p.id === presetId)?.name ?? presetId;
  const result = await analyzeWithDeepseek(
    SECTION_FORMAT_PROMPT,
    `Format this "${label}" data into an HTML section with a heading:\n\n${contextData}`,
    embedToken
  );
  const htmlSection = result.choices[0].message.content;

  await setCachedPreset(presetId, htmlSection, contextData, embedToken);
  return htmlSection;
}

export async function generateCompanySection(
  ticker: string,
  embedToken: string,
  sheetData: SheetData
): Promise<string> {
  const cached = await getCachedCompany(ticker, embedToken);
  if (cached) return cached.html_section;

  const price = sheetData.stocks.get(ticker);
  const priceCtx = price
    ? `${ticker} — Yesterday's Close: ${fmt(price.close, price.changePct)}`
    : `${ticker} — Price data unavailable`;

  let newsCtx = "";
  try {
    newsCtx = "\n\nRecent news:\n" + (await getStocksNews([ticker]));
  } catch {
    newsCtx = "\n\n(News data unavailable)";
  }

  const contextData = priceCtx + newsCtx;
  const result = await analyzeWithDeepseek(
    SECTION_FORMAT_PROMPT,
    `Format this data for "${ticker}" into a compact HTML section:\n\n${contextData}`,
    embedToken
  );
  const htmlSection = result.choices[0].message.content;

  await setCachedCompany(ticker, htmlSection, contextData, embedToken);
  return htmlSection;
}
