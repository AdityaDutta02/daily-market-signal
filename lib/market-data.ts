// lib/market-data.ts
import { analyzeWithDeepseek, searchWeb } from "./terminal-ai";
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
  { id: "nifty_movers",    name: "Nifty / Sensex Movers", description: "Top gainers and losers today" },
  { id: "stocks_to_watch", name: "Stocks to Watch",        description: "Trending by volume and news" },
  { id: "sectoral_pulse",  name: "Sectoral Pulse",          description: "Nifty sectoral index performance" },
  { id: "earnings_radar",  name: "Earnings Radar",          description: "Upcoming results and surprises" },
  { id: "macro_dashboard", name: "Macro Dashboard",         description: "Key Indian macro indicators" },
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

// Section header rendered in code — AI never touches the heading style
function sectionHeader(label: string): string {
  return `<div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#0A1628;border-bottom:2px solid #C9A84C;padding-bottom:8px;margin:0 0 20px;">${label}</div>`;
}

const TABLE_STYLE = `style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;"`;
const TH = `style="background:#0A1628;color:#C9A84C;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:10px 12px;text-align:left;"`;
const TD = `style="padding:10px 12px;border-bottom:1px solid #EEF0F3;color:#1A2332;font-size:13px;"`;
const TD_ALT = `style="padding:10px 12px;border-bottom:1px solid #EEF0F3;color:#1A2332;font-size:13px;background:#F8F9FB;"`;
const POS = `style="padding:10px 12px;border-bottom:1px solid #EEF0F3;color:#00875A;font-weight:600;font-size:13px;"`;
const NEG = `style="padding:10px 12px;border-bottom:1px solid #EEF0F3;color:#DE350B;font-weight:600;font-size:13px;"`;
const POS_ALT = `style="padding:10px 12px;border-bottom:1px solid #EEF0F3;color:#00875A;font-weight:600;font-size:13px;background:#F8F9FB;"`;
const NEG_ALT = `style="padding:10px 12px;border-bottom:1px solid #EEF0F3;color:#DE350B;font-weight:600;font-size:13px;background:#F8F9FB;"`;

function insightBox(label: string, text: string): string {
  return `<div style="background:#F0F4FF;border-left:3px solid #0A1628;padding:14px 16px;margin-top:4px;">
  <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#C9A84C;margin-bottom:6px;">${label}</div>
  <div style="font-size:13px;line-height:1.7;color:#1A2332;">${text}</div>
</div>`;
}

function fmt(close: number, changePct: number): string {
  const sign = changePct >= 0 ? "+" : "";
  return `₹${close.toLocaleString("en-IN", { maximumFractionDigits: 2 })} (${sign}${changePct.toFixed(2)}%)`;
}

function fmtClose(close: number): string {
  return `₹${close.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function fmtPct(pct: number): string {
  return (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
}

// ── Nifty Movers ──────────────────────────────────────────────────────────────

async function buildNiftyMoversHtml(sheetData: SheetData, embedToken: string): Promise<string> {
  const entries = NIFTY50_SYMBOLS
    .map((sym) => { const p = sheetData.stocks.get(sym); return p ? { symbol: sym, ...p } : null; })
    .filter((e): e is { symbol: string; close: number; changePct: number } => e !== null);

  entries.sort((a, b) => b.changePct - a.changePct);
  const gainers = entries.slice(0, 5);
  const losers  = [...entries].sort((a, b) => a.changePct - b.changePct).slice(0, 5);

  const nifty  = sheetData.indices.get("Nifty 50");
  const sensex = sheetData.indices.get("Sensex");
  const bnifty = sheetData.indices.get("Bank Nifty");

  // Index table
  const indexRows = [
    nifty  ? `<tr><td ${TD}>Nifty 50</td><td ${TD}>${fmtClose(nifty.close)}</td><td ${nifty.changePct >= 0 ? POS : NEG}>${fmtPct(nifty.changePct)}</td></tr>` : "",
    sensex ? `<tr><td ${TD_ALT}>Sensex</td><td ${TD_ALT}>${fmtClose(sensex.close)}</td><td ${sensex.changePct >= 0 ? POS_ALT : NEG_ALT}>${fmtPct(sensex.changePct)}</td></tr>` : "",
    bnifty ? `<tr><td ${TD}>Bank Nifty</td><td ${TD}>${fmtClose(bnifty.close)}</td><td ${bnifty.changePct >= 0 ? POS : NEG}>${fmtPct(bnifty.changePct)}</td></tr>` : "",
  ].filter(Boolean).join("");

  const indexTable = `<table ${TABLE_STYLE}><thead><tr><th ${TH}>Index</th><th ${TH}>Level</th><th ${TH}>Change</th></tr></thead><tbody>${indexRows}</tbody></table>`;

  // Gainers table
  const gainerRows = gainers.map((e, i) => {
    const alt = i % 2 === 1;
    return `<tr><td ${alt ? TD_ALT : TD}>${e.symbol}</td><td ${alt ? TD_ALT : TD}>${fmtClose(e.close)}</td><td ${alt ? POS_ALT : POS}>${fmtPct(e.changePct)}</td></tr>`;
  }).join("");

  // Losers table
  const loserRows = losers.map((e, i) => {
    const alt = i % 2 === 1;
    return `<tr><td ${alt ? TD_ALT : TD}>${e.symbol}</td><td ${alt ? TD_ALT : TD}>${fmtClose(e.close)}</td><td ${alt ? NEG_ALT : NEG}>${fmtPct(e.changePct)}</td></tr>`;
  }).join("");

  const moverTables = `<table ${TABLE_STYLE} style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
  <thead><tr>
    <th ${TH} colspan="3">Top 5 Gainers</th>
    <th ${TH} style="background:#0A1628;color:#C9A84C;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:10px 12px;text-align:left;border-left:4px solid #EDEEF0;" colspan="3">Top 5 Losers</th>
  </tr></thead>
  <tbody>
    ${gainers.map((g, i) => {
      const l = losers[i];
      const alt = i % 2 === 1;
      return `<tr>
        <td ${alt ? TD_ALT : TD}>${g.symbol}</td>
        <td ${alt ? TD_ALT : TD}>${fmtClose(g.close)}</td>
        <td ${alt ? POS_ALT : POS}>${fmtPct(g.changePct)}</td>
        <td ${alt ? TD_ALT : TD} style="border-left:4px solid #EDEEF0;">${l?.symbol ?? ""}</td>
        <td ${alt ? TD_ALT : TD}>${l ? fmtClose(l.close) : ""}</td>
        <td ${alt ? NEG_ALT : NEG}>${l ? fmtPct(l.changePct) : ""}</td>
      </tr>`;
    }).join("")}
  </tbody>
</table>`;

  // Market Pulse — AI generates insight text only
  const topSymbols = [...gainers, ...losers].map((e) => e.symbol);
  let newsCtx = "";
  try { newsCtx = await getStocksNews(topSymbols); } catch { /* no news */ }

  const dataCtx = [
    gainers.map((e) => `${e.symbol}: ${fmt(e.close, e.changePct)}`).join(", "),
    losers.map((e) => `${e.symbol}: ${fmt(e.close, e.changePct)}`).join(", "),
    newsCtx ? `\nNews context:\n${newsCtx}` : "",
  ].join("\n");

  const pulse = await analyzeWithDeepseek(
    `You are a senior Indian equity analyst. Write 2–3 sentences for a "Market Pulse" insight box.
Name the sector theme driving today's Nifty movers. If news context is provided, use it to explain specific moves — do not invent facts not in the data.
Give one specific actionable observation. Plain text only — no HTML tags, no bullet points.`,
    `Gainers: ${gainers.map((e) => `${e.symbol} ${fmtPct(e.changePct)}`).join(", ")}\nLosers: ${losers.map((e) => `${e.symbol} ${fmtPct(e.changePct)}`).join(", ")}\n${newsCtx ? "News:\n" + newsCtx : "(No news data available)"}`,
    embedToken
  );

  return indexTable + moverTables + insightBox("MARKET PULSE", pulse.choices[0].message.content);
}

// ── Stocks to Watch ───────────────────────────────────────────────────────────

async function buildStocksToWatchHtml(sheetData: SheetData, embedToken: string): Promise<string> {
  const all = [...sheetData.stocks.entries()]
    .map(([symbol, p]) => ({ symbol, ...p }))
    .filter((e) => Math.abs(e.changePct) > 0);
  all.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const top10 = all.slice(0, 10);

  const rows = top10.map((e, i) => {
    const alt = i % 2 === 1;
    const pctCell = e.changePct >= 0 ? (alt ? POS_ALT : POS) : (alt ? NEG_ALT : NEG);
    return `<tr><td ${alt ? TD_ALT : TD}>${e.symbol}</td><td ${alt ? TD_ALT : TD}>${fmtClose(e.close)}</td><td ${pctCell}>${fmtPct(e.changePct)}</td></tr>`;
  }).join("");

  const table = `<table ${TABLE_STYLE}><thead><tr><th ${TH}>Stock</th><th ${TH}>Price</th><th ${TH}>Change</th></tr></thead><tbody>${rows}</tbody></table>`;

  let volumeCtx = "";
  try { volumeCtx = await getVolumeLeaders(); } catch { /* skip */ }

  const signals = await analyzeWithDeepseek(
    `You are a senior Indian equity analyst. Write 3–5 bullet points for a "Signals" insight box.
Each bullet: name one specific stock and give a one-line reason why it's worth watching (catalyst, breakout, volume, upcoming event).
Plain text bullets only — use • as bullet character. No HTML tags.`,
    `Top movers:\n${top10.map((e) => `${e.symbol}: ${fmt(e.close, e.changePct)}`).join("\n")}\n${volumeCtx ? "\nVolume data:\n" + volumeCtx : ""}`,
    embedToken
  );

  return table + insightBox("SIGNALS", signals.choices[0].message.content.replace(/\n/g, "<br>"));
}

// ── Sectoral Pulse ────────────────────────────────────────────────────────────

async function buildSectoralPulseHtml(sheetData: SheetData, embedToken: string): Promise<string> {
  const names = [
    "Nifty 50","Sensex","Bank Nifty","Nifty IT",
    "Nifty Pharma","Nifty Auto","Nifty Metal",
    "Nifty Energy","Nifty FMCG","Nifty Realty",
  ];

  const available = names
    .map((name) => { const d = sheetData.indices.get(name); return d ? { name, ...d } : null; })
    .filter((e): e is { name: string; close: number; changePct: number } => e !== null)
    .sort((a, b) => b.changePct - a.changePct);

  const rows = available.map((e, i) => {
    const alt = i % 2 === 1;
    const pctCell = e.changePct >= 0 ? (alt ? POS_ALT : POS) : (alt ? NEG_ALT : NEG);
    return `<tr><td ${alt ? TD_ALT : TD}>${e.name}</td><td ${alt ? TD_ALT : TD}>${fmtClose(e.close)}</td><td ${pctCell}>${fmtPct(e.changePct)}</td></tr>`;
  }).join("");

  const table = `<table ${TABLE_STYLE}><thead><tr><th ${TH}>Sector</th><th ${TH}>Level</th><th ${TH}>Change</th></tr></thead><tbody>${rows}</tbody></table>`;

  const rotation = await analyzeWithDeepseek(
    `You are a senior Indian equity analyst. Write 2–3 sentences for a "Rotation Theme" insight box.
Name the 2 leading and 1–2 lagging sectors. Explain the macro or fundamental story driving the rotation.
End with one specific sector to position in for the next session and why. Plain text only — no HTML.`,
    available.map((e) => `${e.name}: ${fmtPct(e.changePct)}`).join("\n"),
    embedToken
  );

  return table + insightBox("ROTATION THEME", rotation.choices[0].message.content);
}

// ── Earnings Radar ────────────────────────────────────────────────────────────

async function buildEarningsRadarHtml(embedToken: string): Promise<string> {
  let rawData = "";
  try { rawData = await getEarningsCalendar(); } catch { /* skip */ }

  const result = await analyzeWithDeepseek(
    `You are a senior Indian equity analyst. Using the earnings data provided (or your knowledge of the current Q4 FY2026 earnings season if data is sparse), write:
1. A plain-text table of upcoming results in this exact format, one per line:
   COMPANY | DATE | EXPECTATION | SURPRISE_RISK
2. Then write 1–2 sentences for an "Earnings Watch" insight box naming the results with highest surprise potential.
Separate the table and insight with the text "---INSIGHT---".
For the table, use plain text only.`,
    rawData || "Q4 FY2026 earnings season, NSE/BSE India. Use your knowledge of major upcoming results.",
    embedToken
  );

  const content = result.choices[0].message.content;
  const parts = content.split("---INSIGHT---");
  const tableData = parts[0]?.trim() ?? "";
  const insightText = parts[1]?.trim() ?? content;

  const tableRows = tableData.split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("COMPANY") && line.includes("|"))
    .map((line, i) => {
      const [company, date, expectation, risk] = line.split("|").map((s) => s.trim());
      const alt = i % 2 === 1;
      const riskColor = risk?.toLowerCase().includes("high") ? "#DE350B" : risk?.toLowerCase().includes("medium") ? "#C9A84C" : "#00875A";
      return `<tr>
        <td ${alt ? TD_ALT : TD}>${company ?? ""}</td>
        <td ${alt ? TD_ALT : TD}>${date ?? ""}</td>
        <td ${alt ? TD_ALT : TD}>${expectation ?? ""}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #EEF0F3;font-size:13px;color:${riskColor};font-weight:600;${alt ? "background:#F8F9FB;" : ""}">${risk ?? ""}</td>
      </tr>`;
    }).join("");

  const table = tableRows
    ? `<table ${TABLE_STYLE}><thead><tr><th ${TH}>Company</th><th ${TH}>Date</th><th ${TH}>Expectation</th><th ${TH}>Surprise Risk</th></tr></thead><tbody>${tableRows}</tbody></table>`
    : `<p style="font-size:13px;color:#6B7280;margin:0 0 16px;">Earnings data not available for this period.</p>`;

  return table + insightBox("EARNINGS WATCH", insightText);
}

// ── Macro Dashboard ───────────────────────────────────────────────────────────

async function buildMacroDashboardHtml(sheetData: SheetData, embedToken: string): Promise<string> {
  // Sector proxies from sheet (always available)
  const energy = sheetData.indices.get("Nifty Energy");
  const metal  = sheetData.indices.get("Nifty Metal");
  const fmcg   = sheetData.indices.get("Nifty FMCG");

  // Try gateway web search for live macro data
  let searchData = "";
  try {
    const res = await searchWeb(
      "Current INR USD exchange rate, Brent crude oil price today, MCX gold price today India, FII DII net flows NSE today April 2026. Give exact numbers.",
      embedToken
    );
    searchData = res.choices[0].message.content;
  } catch { /* fall through to sector proxies */ }

  // Build table rows from sector data we always have
  const sectorRows = [
    energy ? `<tr><td ${TD}>Nifty Energy (proxy)</td><td ${energy.changePct >= 0 ? POS : NEG}>${fmtClose(energy.close)} ${fmtPct(energy.changePct)}</td></tr>` : "",
    metal  ? `<tr><td ${TD_ALT}>Nifty Metal (proxy)</td><td ${metal.changePct >= 0 ? POS_ALT : NEG_ALT}>${fmtClose(metal.close)} ${fmtPct(metal.changePct)}</td></tr>` : "",
    fmcg   ? `<tr><td ${TD}>Nifty FMCG (proxy)</td><td ${fmcg.changePct >= 0 ? POS : NEG}>${fmtClose(fmcg.close)} ${fmtPct(fmcg.changePct)}</td></tr>` : "",
  ].filter(Boolean).join("");

  const table = `<table ${TABLE_STYLE}><thead><tr><th ${TH}>Indicator</th><th ${TH}>Value</th></tr></thead><tbody>${sectorRows}</tbody></table>`;

  const macroRead = await analyzeWithDeepseek(
    `You are a senior Indian equity analyst. Write 2–3 sentences for a "MACRO READ" insight box.
Use the live search data (if any) for exact FX/commodity figures. Use sector proxy data for commodity sentiment.
Explain: 1) what the energy/metal/FMCG performance signals for the macro backdrop, 2) whether this is a headwind or tailwind for broader Indian equities, 3) one specific sector implication.
If live FX data is available in the search results, cite the exact rate. Never invent numbers. Plain text only — no HTML.`,
    `Sector proxies:\n${energy ? `Nifty Energy: ${fmt(energy.close, energy.changePct)}` : ""}${metal ? `\nNifty Metal: ${fmt(metal.close, metal.changePct)}` : ""}${fmcg ? `\nNifty FMCG: ${fmt(fmcg.close, fmcg.changePct)}` : ""}\n\n${searchData ? "Live search data:\n" + searchData : "(Live FX/commodity search unavailable)"}`,
    embedToken
  );

  return table + insightBox("MACRO READ", macroRead.choices[0].message.content);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generatePresetSection(
  presetId: PresetType,
  embedToken: string,
  sheetData: SheetData,
  bust = false
): Promise<string> {
  const cached = await getCachedPreset(presetId, embedToken, bust);
  if (cached) return cached.html_section;

  const label = PRESETS.find((p) => p.id === presetId)?.name ?? presetId;
  let content: string;

  switch (presetId) {
    case "nifty_movers":    content = await buildNiftyMoversHtml(sheetData, embedToken); break;
    case "stocks_to_watch": content = await buildStocksToWatchHtml(sheetData, embedToken); break;
    case "sectoral_pulse":  content = await buildSectoralPulseHtml(sheetData, embedToken); break;
    case "earnings_radar":  content = await buildEarningsRadarHtml(embedToken); break;
    case "macro_dashboard": content = await buildMacroDashboardHtml(sheetData, embedToken); break;
    default:                content = `<p style="font-size:13px;color:#6B7280;">No data available for: ${presetId}</p>`;
  }

  const htmlSection = sectionHeader(label) + content;
  await setCachedPreset(presetId, htmlSection, "", embedToken);
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
  let newsCtx = "";
  try { newsCtx = await getStocksNews([ticker]); } catch { /* skip */ }

  const analysis = await analyzeWithDeepseek(
    `You are a senior Indian equity analyst. Write a brief stock note with:
1. A one-line summary of the stock's performance today
2. 2–3 bullet points on news or catalysts (use only what's in the data — no invented facts)
3. A one-sentence analyst take: bullish / neutral / bearish and the key reason
Use • as bullet character. Plain text only — no HTML tags.`,
    `${ticker}: ${price ? fmt(price.close, price.changePct) : "price unavailable"}\n${newsCtx ? "News:\n" + newsCtx : "(No news data)"}`,
    embedToken
  );

  const text = analysis.choices[0].message.content;
  const lines = text.split("\n").filter(Boolean);
  const summary = lines[0] ?? "";
  const bullets = lines.slice(1, -1).join("<br>");
  const take = lines[lines.length - 1] ?? "";

  const priceRow = price
    ? `<div style="font-size:22px;font-weight:700;color:#0A1628;margin-bottom:4px;">${fmtClose(price.close)} <span style="font-size:14px;color:${price.changePct >= 0 ? "#00875A" : "#DE350B"};font-weight:600;">${fmtPct(price.changePct)}</span></div>`
    : `<div style="font-size:14px;color:#6B7280;margin-bottom:8px;">Price data unavailable</div>`;

  const htmlSection = sectionHeader(ticker) +
    priceRow +
    `<div style="font-size:13px;color:#1A2332;margin:12px 0 8px;">${summary}</div>` +
    (bullets ? `<div style="font-size:13px;color:#1A2332;line-height:1.8;margin-bottom:8px;">${bullets}</div>` : "") +
    insightBox("ANALYST TAKE", take);

  await setCachedCompany(ticker, htmlSection, "", embedToken);
  return htmlSection;
}
