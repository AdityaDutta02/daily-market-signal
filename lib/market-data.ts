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

const HTML_BASE = `You are a senior Indian equity analyst writing a premium institutional morning brief.
Style guide (inline styles only — no external CSS, no classes):
- Font: 'Helvetica Neue',Helvetica,Arial,sans-serif
- Section heading: font-size:13px; font-weight:700; letter-spacing:1.8px; text-transform:uppercase; color:#0A1628; border-bottom:2px solid #C9A84C; padding-bottom:8px; margin:0 0 18px;
- Table: width:100%; border-collapse:collapse; font-size:13px; margin-bottom:4px;
- Table header row: background:#0A1628; color:#C9A84C; font-size:11px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; padding:10px 12px;
- Table data row: padding:10px 12px; border-bottom:1px solid #EEF0F3; color:#1A2332;
- Alternating row: background:#F8F9FB for even rows
- Positive value: color:#00875A; font-weight:600;
- Negative value: color:#DE350B; font-weight:600;
- Insight box: background:#F0F4FF; border-left:3px solid #0A1628; padding:14px 16px; margin-top:18px; font-size:13px; line-height:1.7; color:#1A2332;
- Insight label: font-size:10px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#C9A84C; margin-bottom:6px;
Return ONLY the HTML section content — no body, html, head, or style tags.`;

const SECTION_PROMPTS: Record<PresetType, string> = {
  nifty_movers: `${HTML_BASE}

Write a "Nifty / Sensex Movers" section in the style of a Goldman Sachs morning note:
1. Index levels table with 3 columns: Index | Level | Change %. Omit any index row where data is "data unavailable".
2. Two tables side by side (or stacked if space): Top 5 Gainers and Top 5 Losers. Columns: Stock | Price | Change %. Color-code change column.
3. An insight box labelled "MARKET PULSE": 2–3 sentences naming the sector theme, the key catalyst from news context (if news is provided), and one specific actionable observation for tomorrow.
Be concrete — name sectors, catalysts, and stocks. No generic filler. No hallucinated facts.`,

  stocks_to_watch: `${HTML_BASE}

Write a "Stocks to Watch" section for active institutional traders:
1. Table of top 10 movers: Stock | Price | Change %. Color-code change.
2. An insight box labelled "SIGNALS": 3–5 bullet points, each naming a specific stock and a one-line reason (catalyst, breakout level, volume anomaly, upcoming event).
3. One sentence at the bottom on overall breadth and momentum tone.
Be opinionated and specific — name stocks, not themes.`,

  sectoral_pulse: `${HTML_BASE}

Write a "Sectoral Pulse" section showing institutional rotation:
1. Full sector table: Sector | Level | Change %. Sort by change descending. Color-code change column. Include all sectors — even those flat or unavailable.
2. An insight box labelled "ROTATION THEME": which 2–3 sectors are leading, which are lagging, the macro or fundamental story explaining the rotation, and one sector to position in for the next session.
Be specific about what the data signals, not just what the data shows.`,

  earnings_radar: `${HTML_BASE}

Write an "Earnings Radar" section for active investors:
1. Table: Company | Reporting Period | Street Expectation | Surprise Risk (High/Medium/Low). Use any earnings data provided.
2. An insight box labelled "EARNINGS WATCH": flag the 1–2 results with highest surprise potential and explain why in one line each.
3. One sentence on overall earnings season tone.
If specific earnings data is sparse or unavailable, write a brief note on what major sectors are expected to report this week based on the quarter, and flag which are historically prone to surprises.`,

  macro_dashboard: `${HTML_BASE}

Write a "Macro Dashboard" section using ONLY the data provided — do not hallucinate figures:
1. Build a table using only indicators where a real value is given in the data. Skip any indicator that says "unavailable" or has no number — do NOT show N/A rows.
2. Use the sector proxies provided (Nifty Energy, Nifty Metal) as commodity sentiment indicators in the table with a "Proxy" label in the source column.
3. An insight box labelled "MACRO READ": interpret what the available data signals for Indian equities — FII/DII flow direction, commodity tailwinds/headwinds from sector proxies, and FX impact if data is available. Be specific about which sectors benefit or suffer.
Never invent numbers. If truly no data is available, the insight box should acknowledge the data gap and note what to watch for.`,
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
  sheetData: SheetData,
  bust = false
): Promise<string> {
  const cached = await getCachedPreset(presetId, embedToken, bust);
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
  sheetData: SheetData,
  bust = false
): Promise<string> {
  const cached = await getCachedCompany(ticker, embedToken, bust);
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
