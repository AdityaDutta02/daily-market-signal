// lib/market-data.ts
import { analyzeWithGemini as analyze } from "./terminal-ai";
import {
  getCachedPreset,
  setCachedPreset,
  getCachedCompany,
  setCachedCompany,
} from "./cache";
import {
  getStocksNews,
  getVolumeLeaders,
  fetchNSEEarningsCalendar,
} from "./brightdata";
import { fetchMacroIndicators } from "./macro-fetch";
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

  const noDataNote = `<p style="font-size:12px;color:#6B7280;margin:0 0 16px;font-style:italic;">Markets open at 9:15 AM IST — data reflects previous session close.</p>`;
  const indexTable = indexRows
    ? `<table ${TABLE_STYLE}><thead><tr><th ${TH}>Index</th><th ${TH}>Level</th><th ${TH}>Change</th></tr></thead><tbody>${indexRows}</tbody></table>`
    : noDataNote;

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

  const moverTables = gainers.length === 0 ? "" : `<table ${TABLE_STYLE} style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
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

  // Market Pulse — skip AI call when there is no live mover data
  if (gainers.length === 0) {
    return indexTable + insightBox("MARKET PULSE", "Live session data unavailable — market pulse will generate once NSE opens at 9:15 AM IST.");
  }

  const topSymbols = [...gainers, ...losers].map((e) => e.symbol);
  let newsCtx = "";
  try { newsCtx = await getStocksNews(topSymbols); } catch { /* no news */ }

  const pulse = await analyze(
    `You are a senior Indian equity analyst at a top-tier institutional firm. Write a 2–3 sentence "Market Pulse" in the style of a Goldman Sachs morning note.

Rules:
- Name the sector theme with precise language (e.g. "defensive rotation into staples", "earnings-driven re-rating in utilities")
- If news context is provided, reference it to explain specific moves — do not invent facts absent from the data
- End with one actionable, directional observation with a clear rationale
- Be specific, opinionated, and concise. No hedge words ("may", "could", "might"). No filler phrases
- Output ONLY the insight text — no HTML, no bullet points, no preamble

Example style (use synthetic names below as style reference ONLY — never use these names in output):
"ALPHACORP +4.7%, BETAFMCG +2.7% — defensive rotation into staples as GAMMAIT -3.7% extends de-rating on muted guidance. Institutional accumulation breadth across price points confirms the rotation is durable, not retail-led. Tactically overweight ALPHACORP through month-end; trim GAMMAIT into any bounce."`,
    `Gainers: ${gainers.map((e) => `${e.symbol} ${fmtPct(e.changePct)}`).join(", ")}\nLosers: ${losers.map((e) => `${e.symbol} ${fmtPct(e.changePct)}`).join(", ")}\n${newsCtx ? "News:\n" + newsCtx : "(No news data)"}`,
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

  if (top10.length === 0) {
    return insightBox("SIGNALS", "Live session data unavailable — signals will generate once NSE opens at 9:15 AM IST.");
  }

  let volumeCtx = "";
  try { volumeCtx = await getVolumeLeaders(); } catch { /* skip */ }

  const signals = await analyze(
    `You are a senior Indian equity analyst at a top-tier institutional firm. Write 3–5 bullet points for a "Signals" watchlist in the style of a Morgan Stanley daily note.

Rules:
- Each bullet: stock ticker, current move, and a one-line thesis (catalyst, key level, volume anomaly, upcoming event, or risk/reward setup)
- Be directional — say "buy", "avoid", "watch for", "trim" — not just "interesting"
- Include price levels where relevant (e.g. "support at ₹195", "resistance at ₹310")
- No filler. No invented facts. Use only what's in the data.
- Use • as bullet character. Plain text only — no HTML.

Example style (synthetic names for style reference ONLY — never use these names in output):
• ALPHACORP (+4.72%) — earnings-led breakout above ₹2,200 resistance; next target ₹2,350. Add on any intraday pullback to ₹2,210.
• GAMMATECH (-3.70%) — volume 2.3x average on guidance miss; avoid until ₹195 support is tested. Risk-reward skewed negative through results season.
• DELTAUTILITY (+2.39%) — steady FII-driven bid ahead of RBI; hold existing positions, not a chase.`,
    `Top movers:\n${top10.map((e) => `${e.symbol}: ${fmt(e.close, e.changePct)}`).join("\n")}\n${volumeCtx ? "\nVolume leaders:\n" + volumeCtx : ""}`,
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

  if (available.length === 0) {
    return insightBox("ROTATION THEME", "Live session data unavailable — sector rotation analysis will generate once NSE opens at 9:15 AM IST.");
  }

  const rotation = await analyze(
    `You are a senior Indian equity analyst at a top-tier institutional firm. Write 2–3 sentences on sector rotation in the style of a BlackRock Investment Institute daily note.

Rules:
- Name the 1–2 leading sectors and 1–2 lagging sectors with their exact % moves
- Explain the macro or fundamental story driving the rotation (risk-on/off, rate sensitivity, earnings cycle, FII flows, commodity linkage)
- End with one specific sector to position in for the next session with a clear rationale and risk
- Be precise and opinionated. No hedging language. Plain text only — no HTML.

Example output style:
"Energy (+2.62%) and FMCG (+2.43%) lead today's advance, consistent with a defensive/commodity tilt as IT (-0.73%) and Pharma (-0.04%) underperform — the latter two are underweight in current FII positioning ahead of US Q1 earnings risk. The rotation out of growth into value/defensives mirrors last Thursday's pattern before the RBI policy surprise. Position in Nifty Energy for tomorrow; upstream oil names (ONGC, OIL) offer the best risk-reward if Brent holds above $82."`,
    available.map((e) => `${e.name}: ${fmtPct(e.changePct)}`).join("\n"),
    embedToken
  );

  return table + insightBox("ROTATION THEME", rotation.choices[0].message.content);
}

// ── Earnings Radar ────────────────────────────────────────────────────────────

const NIFTY50_SET = new Set(NIFTY50_SYMBOLS);

async function buildEarningsRadarHtml(embedToken: string): Promise<string> {
  const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const todayDate = new Date(todayIST);
  const cutoff = new Date(todayDate);
  cutoff.setDate(cutoff.getDate() + 21); // next 3 weeks

  // Fetch real NSE earnings calendar
  let upcoming: Array<{ symbol: string; company: string; date: string }> = [];
  try {
    const entries = await fetchNSEEarningsCalendar();
    upcoming = entries
      .filter((e) => {
        const d = new Date(e.date); // "22-Apr-2026" parses fine in V8
        return d >= todayDate && d <= cutoff;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 12);
    // Sort: Nifty50 first, then others
    upcoming.sort((a, b) => {
      const aN = NIFTY50_SET.has(a.symbol) ? 0 : 1;
      const bN = NIFTY50_SET.has(b.symbol) ? 0 : 1;
      if (aN !== bN) return aN - bN;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    upcoming = upcoming.slice(0, 8);
  } catch { /* fall through to unavailable */ }

  if (upcoming.length === 0) {
    return `<p style="font-size:13px;color:#6B7280;margin:0 0 16px;">Earnings calendar not available right now.</p>`;
  }

  // Ask AI only for expectation + surprise risk — dates and companies come from NSE
  const companyList = upcoming.map((e) => `${e.company} (${e.symbol})`).join(", ");
  const result = await analyze(
    `You are a senior Indian equity analyst. For each company listed, provide:
- EXPECTATION: a brief analyst consensus estimate (e.g. "18% YoY PAT growth", "margin pressure expected")
- SURPRISE_RISK: one word — High, Medium, or Low

Return one line per company in this exact format (no header, no extra text):
SYMBOL | EXPECTATION | SURPRISE_RISK

Companies: ${companyList}`,
    `Q4 FY2026 earnings season. Companies reporting soon.`,
    embedToken
  );

  const aiLines = (result.choices[0].message.content ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes("|"));

  const aiMap = new Map<string, { expectation: string; risk: string }>();
  for (const line of aiLines) {
    const [sym, exp, risk] = line.split("|").map((s) => s.trim());
    if (sym) aiMap.set(sym.toUpperCase(), { expectation: exp ?? "", risk: risk ?? "" });
  }

  const tableRows = upcoming.map((entry, i) => {
    const ai = aiMap.get(entry.symbol.toUpperCase()) ?? { expectation: "—", risk: "Medium" };
    const alt = i % 2 === 1;
    const riskColor = ai.risk.toLowerCase().includes("high") ? "#DE350B"
      : ai.risk.toLowerCase().includes("low") ? "#00875A" : "#C9A84C";
    const displayDate = new Date(entry.date).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
    });
    return `<tr>
      <td ${alt ? TD_ALT : TD}>${entry.company}</td>
      <td ${alt ? TD_ALT : TD}>${displayDate}</td>
      <td ${alt ? TD_ALT : TD}>${ai.expectation}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #EEF0F3;font-size:13px;color:${riskColor};font-weight:600;${alt ? "background:#F8F9FB;" : ""}">${ai.risk}</td>
    </tr>`;
  }).join("");

  // Generate insight blurb
  const highRisk = upcoming.filter((e) => {
    const ai = aiMap.get(e.symbol.toUpperCase());
    return ai?.risk?.toLowerCase().includes("high");
  }).map((e) => e.company);
  const insightResult = await analyze(
    `Write 1–2 sentences for an "Earnings Watch" box. Focus on the highest-surprise companies among: ${companyList}. Be specific, no generic filler.`,
    `High-surprise candidates: ${highRisk.join(", ") || companyList}`,
    embedToken
  );
  const insightText = insightResult.choices[0].message.content?.trim() ?? "";

  const table = `<table ${TABLE_STYLE}><thead><tr><th ${TH}>Company</th><th ${TH}>Date</th><th ${TH}>Expectation</th><th ${TH}>Surprise Risk</th></tr></thead><tbody>${tableRows}</tbody></table>`;
  return table + insightBox("EARNINGS WATCH", insightText);
}

// ── Macro Dashboard ───────────────────────────────────────────────────────────

async function buildMacroDashboardHtml(sheetData: SheetData, embedToken: string): Promise<string> {
  // Fetch live FX/commodity data and sector proxies in parallel
  const energy = sheetData.indices.get("Nifty Energy");
  const metal  = sheetData.indices.get("Nifty Metal");
  const fmcg   = sheetData.indices.get("Nifty FMCG");

  const liveIndicators = sheetData.macro?.length ? sheetData.macro : await fetchMacroIndicators();

  // Build table: live indicators first, then sector proxies
  const liveRows = liveIndicators.map((ind, i) => {
    const alt = i % 2 === 0;
    const changeColor = ind.changePct >= 0
      ? (alt ? POS : POS_ALT)
      : (alt ? NEG : NEG_ALT);
    return `<tr>
      <td ${alt ? TD : TD_ALT}>${ind.label}</td>
      <td ${alt ? TD : TD_ALT}>${ind.value}</td>
      <td ${changeColor}>${ind.change}</td>
    </tr>`;
  }).join("");

  const offset = liveIndicators.length;
  const proxyRows = [
    energy ? { name: "Nifty Energy (proxy)", ...energy } : null,
    metal  ? { name: "Nifty Metal (proxy)",  ...metal  } : null,
    fmcg   ? { name: "Nifty FMCG (proxy)",   ...fmcg   } : null,
  ].filter(Boolean).map((ind, i) => {
    if (!ind) return "";
    const alt = (offset + i) % 2 === 0;
    const changeColor = ind.changePct >= 0
      ? (alt ? POS : POS_ALT)
      : (alt ? NEG : NEG_ALT);
    return `<tr>
      <td ${alt ? TD : TD_ALT}>${ind.name}</td>
      <td ${alt ? TD : TD_ALT}>${fmtClose(ind.close)}</td>
      <td ${changeColor}>${fmtPct(ind.changePct)}</td>
    </tr>`;
  }).join("");

  const table = `<table ${TABLE_STYLE}>
    <thead><tr><th ${TH}>Indicator</th><th ${TH}>Value</th><th ${TH}>Change</th></tr></thead>
    <tbody>${liveRows}${proxyRows}</tbody>
  </table>`;

  // Build context string for AI insight
  const liveCtx = liveIndicators.map((ind) => `${ind.label}: ${ind.value} ${ind.change}`).join("\n");
  const proxyCtx = [
    energy ? `Nifty Energy: ${fmt(energy.close, energy.changePct)}` : "",
    metal  ? `Nifty Metal: ${fmt(metal.close, metal.changePct)}`   : "",
    fmcg   ? `Nifty FMCG: ${fmt(fmcg.close, fmcg.changePct)}`     : "",
  ].filter(Boolean).join("\n");

  const macroRead = await analyze(
    `You are a senior macro strategist at a top-tier institutional firm. Write 2–3 sentences for a "MACRO READ" insight box in the style of a JPMorgan Global Markets daily note.

Rules:
- Cite exact figures from the data (e.g. "Brent at $82.4/bbl, +1.2%")
- Explain the direct transmission mechanism to Indian equities (CAD impact, FII flow direction, rate sensitivity, INR pressure)
- End with one sector implication — which sector benefits or suffers and why
- Be precise and directional. No hedging. Plain text only — no HTML.

Example output style:
"Brent at $82.4/bbl (+1.2%) adds ~12 bps upside risk to India's April CPI and widens the current account by an estimated $0.8bn/month at current run rates — net negative for INR, which is already testing 84.3 resistance. Nifty Energy's +2.62% advance prices ONGC and OIL as upstream beneficiaries, though downstream OMCs (BPCL, HPCL) face margin compression if under-recovery mechanisms are not revised. Gold at $3,300/oz signals persistent risk aversion globally; watch for FII equity outflows if the metal clears $3,350."`,
    `Live FX/Commodity data:\n${liveCtx || "(unavailable — Yahoo Finance blocked)"}\n\nSector proxies:\n${proxyCtx}`,
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

  const analysis = await analyze(
    `You are a senior Indian equity analyst at a top-tier institutional firm. Write a stock note in the style of a Jefferies equity research flash note.

Format (plain text, • for bullets, no HTML):
Line 1: One-line performance summary with the % move and what drove it (use news if available; if not, infer from sector context)
• Bullet 1: Key catalyst or news item with specific detail
• Bullet 2: Technical or positioning observation (key level, volume, support/resistance)
• Bullet 3: Risk to the thesis or upcoming catalyst to watch
ANALYST TAKE: [Bullish/Neutral/Bearish] — one sentence with price target or key level and the primary reason

Rules:
- Cite exact prices from the data
- Do not invent news not in the data
- Be directional and specific — no hedging language

Example style (synthetic names for style reference ONLY — never use these names in output):
ALPHACORP +4.72% to ₹2,240 on Q4 PAT beat of ~8% vs consensus, driven by rural volume recovery.
• Q4 volume growth of 4% YoY marks first positive quarter in six, signalling the rural demand inflection thesis is materialising
• Stock broke above ₹2,200 resistance on 1.8x average volume — next technical target ₹2,350
• Risk: commodity cost inflation (palm oil +12% QTD) could pressure margins in Q1 FY27
ANALYST TAKE: Bullish — add to ₹2,200–₹2,230 with target ₹2,400; rural recovery and premiumisation drive a sustainable re-rating.`,
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
