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

const HTML_BASE = `You are a senior Indian equity analyst writing a morning market brief email.
Use inline styles only. Font: system-ui,-apple-system,sans-serif.
Colors: #1A1A1A text, #5B5BD6 accents, #2E7D32 positive, #C62828 negative.
Compact tables for data (border-collapse:collapse, 1px solid #E8E5E0 borders, 8px cell padding).
Return ONLY the HTML section content — no body, html, or head tags.`;

const SECTION_PROMPTS: Record<PresetType, string> = {
  nifty_movers: `${HTML_BASE}

Write a "Nifty/Sensex Movers" section a fund manager would find useful:
1. Index levels table (omit any index where data is unavailable)
2. Top 5 Gainers and Top 5 Losers tables side by side or stacked
3. "Market Pulse" paragraph (2–3 sentences): name the sector theme driving today's moves, explain any unusual single-stock moves using the news context provided, give one specific actionable observation.
Be concrete — name sectors, stocks, and catalysts. No generic filler.`,

  stocks_to_watch: `${HTML_BASE}

Write a "Stocks to Watch" section for active traders:
1. Table of top movers by % change
2. Highlight 3–5 specific stocks worth watching with a one-line reason each (catalyst, breakout, volume spike, earnings proximity)
3. One sentence on overall breadth and momentum tone.
Be opinionated — traders need signals, not observations.`,

  sectoral_pulse: `${HTML_BASE}

Write a "Sectoral Pulse" section showing money rotation:
1. Sector indices table color-coded by performance (green positive, red negative)
2. "Rotation Theme" paragraph: which 2–3 sectors are leading, which lagging, and the macro or fundamental story behind it
3. One sector to watch tomorrow.
Be specific about what the rotation signals for the next session.`,

  earnings_radar: `${HTML_BASE}

Write an "Earnings Radar" section for the week ahead:
1. Upcoming results as a table (Company | Date | Street Expectation | Surprise Risk)
2. Flag results with highest beat/miss potential with a one-line reason
3. One sentence on the overall earnings season tone.
If data is sparse, note what major companies are reporting and what consensus expects.`,

  macro_dashboard: `${HTML_BASE}

Write a "Macro Dashboard" section covering Indian market drivers:
1. Table with rows for: INR/USD, Brent Crude, MCX Gold, US 10Y yield — extract exact figures where available, mark "N/A" where not
2. FII/DII flows row: net buyer or seller, quantum if available
3. "Macro Read" paragraph (2–3 sentences): how today's macro backdrop is a headwind or tailwind for Indian equities, and one specific implication for sector rotation.
Do not omit rows — show N/A rather than hiding missing data.`,
};

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

  const nifty   = sheetData.indices.get("Nifty 50");
  const sensex  = sheetData.indices.get("Sensex");
  const bnifty  = sheetData.indices.get("Bank Nifty");

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

  // Fetch news for top movers to give AI catalyst context
  const topSymbols = [...gainers, ...losers].map((e) => e.symbol);
  try {
    const news = await getStocksNews(topSymbols);
    lines.push("", "=== NEWS & CATALYSTS FOR TOP MOVERS ===", news);
  } catch {
    // no news available — AI will work from price data alone
  }

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

async function buildMacroDashboardContext(sheetData: SheetData): Promise<string> {
  // Build sector proxy fallback from sheet data (Energy/Metal signal commodity sentiment)
  const energy = sheetData.indices.get("Nifty Energy");
  const metal  = sheetData.indices.get("Nifty Metal");
  const sectorProxy = [
    "=== SECTOR PROXIES (commodity sentiment) ===",
    energy ? `Nifty Energy: ${fmt(energy.close, energy.changePct)}` : "Nifty Energy: data unavailable",
    metal  ? `Nifty Metal:  ${fmt(metal.close,  metal.changePct)}`  : "Nifty Metal:  data unavailable",
  ].join("\n");

  try {
    const serpData = await getMacroData();
    return "=== MACRO INDICATORS ===\n" + serpData + "\n\n" + sectorProxy;
  } catch {
    return "=== MACRO INDICATORS ===\n(Live FX/commodity data unavailable)\n\n" + sectorProxy;
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
    case "macro_dashboard": contextData = await buildMacroDashboardContext(sheetData); break;
    default:                contextData = `No data available for preset: ${presetId}`;
  }

  const label = PRESETS.find((p) => p.id === presetId)?.name ?? presetId;
  const systemPrompt = SECTION_PROMPTS[presetId as PresetType] ?? SECTION_PROMPTS.nifty_movers;

  const result = await analyzeWithDeepseek(
    systemPrompt,
    `Here is the raw market data for the "${label}" section:\n\n${contextData}`,
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
  const systemPrompt = `${HTML_BASE}

Write a compact stock brief for ${ticker}:
1. Price row with % change color-coded
2. 2–3 bullet points on recent news or catalysts
3. One-line analyst take: bullish, bearish, or neutral, and why.
Be specific and opinionated — not a news summary.`;

  const result = await analyzeWithDeepseek(
    systemPrompt,
    `Here is the data for ${ticker}:\n\n${contextData}`,
    embedToken
  );
  const htmlSection = result.choices[0].message.content;

  await setCachedCompany(ticker, htmlSection, contextData, embedToken);
  return htmlSection;
}
