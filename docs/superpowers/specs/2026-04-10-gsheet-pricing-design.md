# Google Sheets Pricing Data Source — Design Spec

**Date:** 2026-04-10

---

## Goal

Replace unreliable AI web-search pricing with a Google Sheets data source backed by `GOOGLEFINANCE()` formulas, supplemented by Bright Data SERP API for data not available in the sheet (news, volume, earnings, macro indicators).

## Architecture

The app fetches price data from a published Google Sheet (CSV export) at brief generation time. The sheet covers all ~2000 NSE-listed stocks across multiple tabs, updated daily via a Google Apps Script recalculation trigger at 5:30 AM IST. A weekly cron job keeps the ticker list current. Bright Data SERP API handles supplementary data (news, volume anomalies, earnings calendar, macro indicators) using batched queries to minimise API usage.

**Tech Stack:** Next.js App Router, Google Sheets API v4, Google Apps Script, Bright Data SERP API, Terminal AI gateway (AI analysis + email + DB + cron)

---

## Google Sheet Structure

One Google Sheet with five tabs. Tabs 1–3 are split alphabetically to stay under GOOGLEFINANCE's ~1000 formula-per-tab rate limit.

| Tab | Name | Content |
|---|---|---|
| 1 | NSE_A-H | ~700 stock tickers |
| 2 | NSE_I-P | ~600 stock tickers |
| 3 | NSE_Q-Z | ~700 stock tickers |
| 4 | Indices | Nifty 50, Sensex, Bank Nifty + 8 sectoral indices |
| 5 | Meta | Dummy recalc cell, last-updated timestamp |

Each stock row (tabs 1–3):
- Column A: `SYMBOL` (e.g. `HINDALCO`)
- Column B: `=GOOGLEFINANCE("NSE:"&A2, "closeyest")`
- Column C: `=ROUND(((INDEX(GOOGLEFINANCE("NSE:"&A2,"close",WORKDAY(TODAY(),-1)),2,2)/INDEX(GOOGLEFINANCE("NSE:"&A2,"close",WORKDAY(TODAY(),-2)),2,2))-1)*100,2)`

Indices tab uses the same formula pattern with symbols like `NIFTY50`, `BANKNIFTY`, `CNXIT`, etc.

Each tab is published as a separate CSV (`File > Share > Publish to web > CSV`). The app fetches all four data tabs in parallel.

**Recalculation trigger:** A Google Apps Script time-based trigger fires at 5:30 AM IST (Monday–Friday). It writes the current timestamp to the Meta tab's dummy cell, which forces all `GOOGLEFINANCE()` formulas to recalculate before the 6 AM brief cron runs.

---

## Data Pipeline

```
Brief generation time:
1. Fetch 4 CSV tabs in parallel → parse into Map<ticker, {close, changePct}>
2. Per preset/company:
   a. Look up prices from map (instant)
   b. If supplementary data needed → Bright Data SERP query (batched)
   c. Feed prices + supplementary data → analyzeWithDeepseek() → HTML section
3. Wrap sections → send email
```

### What each preset uses

| Preset | Sheet data | Bright Data SERP |
|---|---|---|
| Nifty/Sensex Movers | Top 10 by changePct from all tabs | No |
| Stocks to Watch | Top movers by changePct | Yes — volume leaders + news |
| Sectoral Pulse | Indices tab — all sectoral % changes | No |
| Earnings Radar | None | Yes — NSE earnings calendar this week |
| Macro Dashboard | None | Yes — INR/USD, Brent crude, MCX gold, FII/DII |
| Company (per ticker) | close + changePct from stock tabs | Yes — batched news (up to 10 tickers/query) |

### Bright Data call budget

- Fixed preset calls: max 5/day (only if those presets are selected by at least 1 user)
- Company calls: 1 query per 10 unique companies tracked across all users
- Daily total: ~5 + ceil(N/10) where N = unique companies
- Monthly (22 market days): stays well within 1,000 free-tier calls for up to ~200 unique companies
- Upgrade plan: move to paid tier when usage approaches limit

---

## New Files

### `lib/nse-tickers.ts`
Static array of all NSE symbols. Auto-generated. Refreshed weekly by the refresh-tickers cron. Symbols in the format required by `GOOGLEFINANCE()` (e.g. `HINDALCO`, not `NSE:HINDALCO` — the sheet formula adds the prefix).

### `lib/sheet-data.ts`
Fetches all 4 published CSV tabs in parallel. Parses each CSV row. Skips rows with `#N/A`, non-numeric, or zero values (treats as unavailable). Returns `Map<string, {close: number, changePct: number}>`. Re-fetched on each brief generation run — no additional caching needed.

### `lib/brightdata.ts`
Bright Data SERP API wrapper. All calls use the SERP API endpoint with the configured API key (direct from the Next.js app, not through the Terminal AI gateway).

Exported functions:
- `getStocksNews(tickers: string[]): Promise<string>` — batches up to 10 tickers per query, returns raw search result text
- `getEarningsCalendar(): Promise<string>` — NSE earnings results/upcoming this week
- `getMacroData(): Promise<string>` — INR/USD, Brent crude INR, MCX gold, FII/DII net flows
- `getVolumeLeaders(): Promise<string>` — NSE stocks with unusual volume today

### `app/api/cron/warmup-sheet/route.ts`
Fires at 5:30 AM IST (Mon–Fri). Writes current IST timestamp to the Meta tab dummy cell via Sheets API. Forces GOOGLEFINANCE recalculation. Responds immediately — does not wait for sheet to finish recalculating. Auth: gateway cron bearer token.

### `app/api/cron/refresh-tickers/route.ts`
Fires Sunday 2:00 AM IST. Fetches latest NSE ticker list from source. Diffs against the active ticker list (DB record `type: "ticker_list"` if present, else falls back to `lib/nse-tickers.ts` seed). Writes new rows (with GOOGLEFINANCE formulas) to the appropriate tab, removes delisted tickers. Writes in batches of 100 rows with 1s delay between batches to stay within Sheets API quota (300 req/min). Saves updated list to DB (`type: "ticker_list"`). Auth: gateway cron bearer token.

`lib/nse-tickers.ts` is the initial seed list only. At runtime, `lib/sheet-data.ts` checks DB for a `type: "ticker_list"` record first; if found, that list is used instead of the static file.

## Modified Files

### `lib/market-data.ts`
- `generatePresetSection()`: receives sheet data map as parameter, looks up prices directly, calls appropriate Bright Data functions for supplementary data, feeds combined context to `analyzeWithDeepseek()`
- `generateCompanySection()`: looks up ticker in map for price, batches news call via `getStocksNews()`
- Removes all `searchWeb()` calls

### `lib/cache.ts`
- Add `getSheetData()` / `setSheetData()` — caches the parsed price map for the duration of one brief run (in-memory, not DB) so all presets and companies share one fetch

### `lib/terminal-ai.ts`
- Remove `searchWeb()` export

---

## Environment Variables

```
GOOGLE_SHEET_ID               # From the sheet URL: /d/{SHEET_ID}/
GOOGLE_SERVICE_ACCOUNT_JSON   # Full service account JSON as a single-line string
BRIGHTDATA_API_KEY            # Bright Data SERP API key
```

`GOOGLE_SHEET_ID` and `BRIGHTDATA_API_KEY` are server-side only. `GOOGLE_SERVICE_ACCOUNT_JSON` is server-side only and must never be exposed to the client bundle.

---

## Cron Schedule

| Task | Cron (UTC) | IST equivalent | Endpoint |
|---|---|---|---|
| Warmup Sheet | `0 0 * * 1-5` | 5:30 AM IST | `POST /api/cron/warmup-sheet` |
| Send Briefs | `30 0,1,2,3,4 * * 1-5` | 6–10 AM IST | `POST /api/cron/send-briefs` |
| Refresh Tickers | `30 20 * * 0` | Sun 2:00 AM IST | `POST /api/cron/refresh-tickers` |

Note: UTC `0:00` = IST `5:30 AM`. Warmup runs 30 minutes before the earliest brief delivery.

---

## Error Handling

| Failure | Behaviour |
|---|---|
| CSV fetch fails (any tab) | Retry once; if still failing, fall back to Bright Data SERP for pricing on that range only |
| `#N/A` / zero in CSV row | Skip row — ticker marked unavailable in map |
| Bright Data SERP fails | Generate section with price data only; note "live news unavailable" in HTML; never block email send |
| Warmup Sheet cron fails | Log error; 6 AM brief cron runs anyway using whatever CSV data is currently in the sheet |
| Refresh Tickers source unreachable | Skip refresh; keep existing static list; log warning |
| Sheets API write quota exceeded | Retry with exponential backoff; abort after 3 attempts; log failure |

---

## NSE Ticker Source

Static list in `lib/nse-tickers.ts`. Initial source: NSE official bhavcopy / equity list CSV (publicly available at `nseindia.com` download section). Weekly refresh diffs this list against the live source to add new listings and remove delisted stocks.
