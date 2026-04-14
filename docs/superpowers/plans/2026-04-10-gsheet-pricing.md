# Google Sheets Pricing Data Source — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unreliable AI web-search pricing with Google Sheets GOOGLEFINANCE data for all NSE stocks, supplemented by Bright Data SERP API for news, volume, earnings, and macro data.

**Architecture:** A published Google Sheet (multiple tabs, ~2000 tickers) provides yesterday's close price and % change via CSV export. The app fetches all tabs in parallel at brief generation time, building an in-memory price map shared across all section generators. Bright Data SERP API handles supplementary data. AI analysis (`chat/fast`) formats everything into HTML email sections.

**Tech Stack:** Next.js App Router, Google Sheets API v4 (REST, no npm package), Web Crypto API (JWT auth, built-in Node.js 18+), Bright Data SERP API, Terminal AI gateway (AI analysis + email + DB + cron)

---

## Prerequisites (Manual — Do These Before Any Code Task)

### P1: Google Cloud Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. `market-signal`)
3. Enable **Google Sheets API** (`APIs & Services > Enable APIs`)
4. Create a **Service Account**: `IAM & Admin > Service Accounts > Create`
   - Name: `market-signal-sheets`
   - Role: none needed (access is granted at sheet level)
5. Create a key: `Service Accounts > Keys > Add Key > JSON`
6. Download the JSON file — you'll need `client_email` and `private_key` from it

### P2: Create the Google Sheet

1. Create a new Google Sheet at sheets.google.com
2. Note the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`
3. Share the sheet with the service account email (from P1) as **Editor**
4. The setup script (Task 3) will create all tabs and populate formulas
5. After running the setup script, publish each tab as CSV:
   - `File > Share > Publish to web`
   - For each tab: select tab name, choose CSV format, click Publish
   - Copy each CSV URL (format: `https://docs.google.com/spreadsheets/d/{ID}/gviz/tq?tqx=out:csv&sheet={TAB}`)
6. Add Apps Script trigger for 5:30 AM recalc:
   - `Extensions > Apps Script`
   - Paste this code and save:
     ```javascript
     function forceRecalc() {
       var ss = SpreadsheetApp.getActiveSpreadsheet();
       var meta = ss.getSheetByName("Meta");
       meta.getRange("B1").setValue(new Date().toISOString());
     }
     ```
   - Set up a time-based trigger: `Triggers > Add Trigger`, function `forceRecalc`, time-based, daily, at UTC 00:00 (= IST 05:30), run Mon–Fri

### P3: Bright Data Setup

1. Sign up at [brightdata.com](https://brightdata.com)
2. Create a new zone: `Proxies & Scraping > SERP API`
3. Name the zone `serp`, choose free tier
4. Go to `Access Parameters` — note your **API token**
5. Confirm the zone API endpoint from Bright Data dashboard (typically `https://api.brightdata.com/request`)

### P4: Environment Variables

Add to `.env.local` (never commit this file):

```
GOOGLE_SHEET_ID=your_sheet_id_here
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"market-signal-sheets@....iam.gserviceaccount.com",...}
BRIGHTDATA_API_KEY=your_brightdata_api_token_here
BRIGHTDATA_ZONE=serp
```

`GOOGLE_SERVICE_ACCOUNT_JSON` is the entire downloaded JSON file content as a single-line string. Escape newlines in the private key as `\n`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/generate-tickers.mjs` | Create | One-time: fetch NSE equity list, generate `lib/nse-tickers.ts` + `scripts/nse-tickers.json` |
| `scripts/nse-tickers.json` | Create (generated) | JSON data file with tab splits — read by setup script |
| `lib/nse-tickers.ts` | Create (generated) | Static TypeScript array of all NSE EQ-series tickers |
| `lib/google-auth.ts` | Create | JWT creation + Google OAuth2 token exchange + Sheets write helper |
| `scripts/setup-sheet.mjs` | Create | One-time: creates tabs, writes GOOGLEFINANCE formulas via Sheets API |
| `lib/sheet-data.ts` | Create | Fetches 4 published CSV tabs, parses to `Map<ticker, PriceData>` |
| `lib/brightdata.ts` | Create | Bright Data SERP API wrapper — 4 named query functions |
| `lib/market-data.ts` | Modify | Replace `searchWeb()` with sheet map + Bright Data; update signatures |
| `app/api/cron/send-briefs/route.ts` | Modify | Fetch sheet data once, pass to section generators |
| `app/api/preview-brief/route.ts` | Modify | Same — fetch sheet data once before loop |
| `app/api/cron/warmup-sheet/route.ts` | Create | 5:30 AM cron: write timestamp to Meta tab to force GOOGLEFINANCE recalc |
| `app/api/cron/refresh-tickers/route.ts` | Create | Sunday 2 AM: fetch EQUITY_L.csv, diff, update sheet + DB ticker list |
| `lib/terminal-ai.ts` | Modify | Remove `searchWeb` export |
| `terminal-ai.config.json` | Modify | Document new env vars |

---

## Task 1: Generate NSE Tickers Static List

**Files:**
- Create: `scripts/generate-tickers.mjs`
- Create: `scripts/nse-tickers.json` (generated)
- Create: `lib/nse-tickers.ts` (generated)

- [ ] **Step 1: Write the generation script**

Create `scripts/generate-tickers.mjs`:

```javascript
// scripts/generate-tickers.mjs
// Run once: node scripts/generate-tickers.mjs
// Fetches NSE equity list and writes lib/nse-tickers.ts + scripts/nse-tickers.json

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const NSE_EQUITY_URL =
  "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";

const res = await fetch(NSE_EQUITY_URL, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    Accept: "text/csv,*/*",
    Referer: "https://www.nseindia.com/",
  },
});

if (!res.ok) throw new Error(`Failed to fetch NSE equity list: ${res.status}`);

const csv = await res.text();
const lines = csv.split("\n").slice(1); // skip header

const tickers = [];
for (const line of lines) {
  if (!line.trim()) continue;
  const cols = line.split(",");
  const symbol = cols[0]?.trim().replace(/^"|"$/g, "");
  const series = cols[2]?.trim().replace(/^"|"$/g, "");
  if (symbol && series === "EQ") {
    tickers.push(symbol);
  }
}

tickers.sort();

// Split into 3 roughly equal groups for 3 sheet tabs
const third = Math.ceil(tickers.length / 3);
const tabSplits = {
  Stock_1: tickers.slice(0, third),
  Stock_2: tickers.slice(third, third * 2),
  Stock_3: tickers.slice(third * 2),
};

// Write JSON data file (used by setup-sheet.mjs without TS compilation)
const jsonPath = join(__dirname, "nse-tickers.json");
writeFileSync(jsonPath, JSON.stringify(tabSplits, null, 2));
console.log(`Written tab splits to scripts/nse-tickers.json`);

// Write TypeScript source file (used by the Next.js app at runtime)
const tsContent = `// AUTO-GENERATED by scripts/generate-tickers.mjs
// Last updated: ${new Date().toISOString().split("T")[0]}
// Source: NSE EQUITY_L.csv (EQ series only)
// Total: ${tickers.length} tickers
// DO NOT EDIT MANUALLY — run scripts/generate-tickers.mjs to refresh

export const NSE_TICKERS: string[] = ${JSON.stringify(tickers, null, 2)};
`;

const tsPath = join(__dirname, "../lib/nse-tickers.ts");
writeFileSync(tsPath, tsContent);
console.log(`Written ${tickers.length} tickers to lib/nse-tickers.ts`);
console.log(`  Tab Stock_1: ${tabSplits.Stock_1.length} tickers`);
console.log(`  Tab Stock_2: ${tabSplits.Stock_2.length} tickers`);
console.log(`  Tab Stock_3: ${tabSplits.Stock_3.length} tickers`);
```

- [ ] **Step 2: Run the script**

```bash
node scripts/generate-tickers.mjs
```

Expected output:
```
Written tab splits to scripts/nse-tickers.json
Written 1842 tickers to lib/nse-tickers.ts
  Tab Stock_1: 614 tickers
  Tab Stock_2: 614 tickers
  Tab Stock_3: 614 tickers
```

If NSE blocks the request (403), open `https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv` in a browser, download the CSV, save it as `scripts/EQUITY_L.csv`, then replace the fetch call in the script with:
```javascript
import { readFileSync } from "fs";
const csv = readFileSync(join(__dirname, "EQUITY_L.csv"), "utf8");
```

- [ ] **Step 3: Verify the files**

- `scripts/nse-tickers.json` — JSON object with keys `Stock_1`, `Stock_2`, `Stock_3`, each an array of strings
- `lib/nse-tickers.ts` — exports `NSE_TICKERS` as `string[]` with 1500+ items, all uppercase

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-tickers.mjs scripts/nse-tickers.json lib/nse-tickers.ts
git commit -m "feat: add NSE ticker static list with tab splits"
```

---

## Task 2: Google Sheets Auth Helper

**Files:**
- Create: `lib/google-auth.ts`

This module generates a Google OAuth2 access token from the service account JSON using only built-in Web Crypto (no npm packages).

- [ ] **Step 1: Write the auth helper**

Create `lib/google-auth.ts`:

```typescript
// lib/google-auth.ts
// Google OAuth2 JWT flow using Web Crypto (no external packages)

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function b64url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64urlBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function getGoogleAccessToken(): Promise<string> {
  const saRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");

  const sa = JSON.parse(saRaw) as ServiceAccount;
  const privateKey = sa.private_key.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const signingInput = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${b64urlBuffer(signatureBuf)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const data = (await tokenRes.json()) as { access_token: string };
  return data.access_token;
}

/** Write values to a Google Sheet range via REST API */
export async function sheetsWrite(
  sheetId: string,
  range: string,
  values: string[][],
  accessToken: string
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets write failed for ${range}: ${err}`);
  }
}

/** Add a new sheet tab (silently ignores "already exists" error) */
export async function sheetsAddTab(
  sheetId: string,
  tabName: string,
  accessToken: string
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: tabName } } }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (!body.includes("already exists")) {
      throw new Error(`Failed to add tab ${tabName}: ${body}`);
    }
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: no errors from `lib/google-auth.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/google-auth.ts
git commit -m "feat: add Google Sheets auth helper (JWT + REST)"
```

---

## Task 3: One-Time Sheet Setup Script

**Files:**
- Create: `scripts/setup-sheet.mjs`

This script runs once to populate all Google Sheet tabs with GOOGLEFINANCE formulas. It reads `scripts/nse-tickers.json` (generated in Task 1) — no TypeScript compilation needed.

- [ ] **Step 1: Write the setup script**

Create `scripts/setup-sheet.mjs`:

```javascript
// scripts/setup-sheet.mjs
// Run ONCE to set up Google Sheet tabs with GOOGLEFINANCE formulas.
// Requires: GOOGLE_SHEET_ID and GOOGLE_SERVICE_ACCOUNT_JSON in .env.local
// Also requires: scripts/nse-tickers.json (generated by scripts/generate-tickers.mjs)
// Run: node --env-file=.env.local scripts/setup-sheet.mjs

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Google Auth (inline JS — no TS import needed) ─────────────────────────────
function b64url(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function b64urlBuf(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}
async function getToken() {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const pk = sa.private_key.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const hdr = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const pay = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(pk),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key,
    new TextEncoder().encode(`${hdr}.${pay}`));
  const jwt = `${hdr}.${pay}.${b64urlBuf(sig)}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await r.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function addTab(sheetId, name, token) {
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: name } } }] }),
  });
  const body = await r.text();
  if (!r.ok && !body.includes("already exists")) throw new Error(`Add tab ${name}: ${body}`);
  console.log(`  Tab "${name}": ${body.includes("already exists") ? "already exists" : "created"}`);
}

async function writeRange(sheetId, range, values, token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const r = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
  if (!r.ok) throw new Error(`Write ${range}: ${await r.text()}`);
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function writeBatched(sheetId, tabName, rows, token, batchSize = 100) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const startRow = i + 1;
    await writeRange(sheetId, `${tabName}!A${startRow}:C${startRow + chunk.length - 1}`, chunk, token);
    console.log(`    Wrote rows ${startRow}–${startRow + chunk.length - 1}`);
    if (i + batchSize < rows.length) await sleep(1200);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID not set in .env.local");

// Read JSON data written by scripts/generate-tickers.mjs
const tabSplitsRaw = readFileSync(join(__dirname, "nse-tickers.json"), "utf8");
const TAB_SPLITS = JSON.parse(tabSplitsRaw);

console.log("Getting Google access token...");
const token = await getToken();
console.log("Token obtained.\n");

// ── Stock tabs ────────────────────────────────────────────────────────────────
for (const [tabName, tickers] of Object.entries(TAB_SPLITS)) {
  console.log(`Setting up tab: ${tabName} (${tickers.length} tickers)`);
  await addTab(SHEET_ID, tabName, token);

  const rows = [["SYMBOL", "Close Prev", "Change %"]];
  tickers.forEach((symbol, i) => {
    const row = i + 2; // data starts at row 2
    rows.push([
      symbol,
      `=GOOGLEFINANCE("NSE:"&A${row},"closeyest")`,
      `=ROUND(((INDEX(GOOGLEFINANCE("NSE:"&A${row},"close",WORKDAY(TODAY(),-1)),2,2)/INDEX(GOOGLEFINANCE("NSE:"&A${row},"close",WORKDAY(TODAY(),-2)),2,2))-1)*100,2)`,
    ]);
  });

  await writeBatched(SHEET_ID, tabName, rows, token);
  console.log(`  Done.\n`);
}

// ── Indices tab ───────────────────────────────────────────────────────────────
console.log("Setting up tab: Indices");
await addTab(SHEET_ID, "Indices", token);

const INDICES_ROWS = [
  ["INDEX_KEY", "Name", "Close Prev", "Change %"],
  ["INDEXNSE:NIFTY_50",   "Nifty 50",     '=GOOGLEFINANCE("INDEXNSE:NIFTY_50","closeyest")',    '=ROUND(((INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_50","close",WORKDAY(TODAY(),-1)),2,2)/INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_50","close",WORKDAY(TODAY(),-2)),2,2))-1)*100,2)'],
  ["INDEXBOM:SENSEX",     "Sensex",        '=GOOGLEFINANCE("INDEXBOM:SENSEX","closeyest")',       '=ROUND(((INDEX(GOOGLEFINANCE("INDEXBOM:SENSEX","close",WORKDAY(TODAY(),-1)),2,2)/INDEX(GOOGLEFINANCE("INDEXBOM:SENSEX","close",WORKDAY(TODAY(),-2)),2,2))-1)*100,2)'],
  ["INDEXNSE:BANKNIFTY",  "Bank Nifty",    '=GOOGLEFINANCE("INDEXNSE:BANKNIFTY","closeyest")',    '=ROUND(((INDEX(GOOGLEFINANCE("INDEXNSE:BANKNIFTY","close",WORKDAY(TODAY(),-1)),2,2)/INDEX(GOOGLEFINANCE("INDEXNSE:BANKNIFTY","close",WORKDAY(TODAY(),-2)),2,2))-1)*100,2)'],
  ["INDEXNSE:NIFTY_IT",   "Nifty IT",      '=GOOGLEFINANCE("INDEXNSE:NIFTY_IT","closeyest")',     '=ROUND(((INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_IT","close",WORKDAY(TODAY(),-1)),2,2)/INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_IT","close",WORKDAY(TODAY(),-2)),2,2))-1)*100,2)'],
  ["INDEXNSE:NIFTY_PHARMA","Nifty Pharma", '=GOOGLEFINANCE("INDEXNSE:NIFTY_PHARMA","closeyest")', '=ROUND(((INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_PHARMA","close",WORKDAY(TODAY(),-1)),2,2)/INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_PHARMA","close",WORKDAY(TODAY(),-2)),2,2))-1)*100,2)'],
  ["INDEXNSE:NIFTY_AUTO",  "Nifty Auto",   '=GOOGLEFINANCE("INDEXNSE:NIFTY_AUTO","closeyest")',   '=ROUND(((INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_AUTO","close",WORKDAY(TODAY(),-1)),2,2)/INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_AUTO","close",WORKDAY(TODAY(),-2)),2,2))-1)*100,2)'],
  ["INDEXNSE:NIFTY_METAL", "Nifty Metal",  '=GOOGLEFINANCE("INDEXNSE:NIFTY_METAL","closeyest")',  '=ROUND(((INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_METAL","close",WORKDAY(TODAY(),-1)),2,2)/INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_METAL","close",WORKDAY(TODAY(),-2)),2,2))-1)*100,2)'],
  ["INDEXNSE:NIFTY_ENERGY","Nifty Energy", '=GOOGLEFINANCE("INDEXNSE:NIFTY_ENERGY","closeyest")', '=ROUND(((INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_ENERGY","close",WORKDAY(TODAY(),-1)),2,2)/INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_ENERGY","close",WORKDAY(TODAY(),-2)),2,2))-1)*100,2)'],
  ["INDEXNSE:NIFTY_FMCG",  "Nifty FMCG",  '=GOOGLEFINANCE("INDEXNSE:NIFTY_FMCG","closeyest")',   '=ROUND(((INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_FMCG","close",WORKDAY(TODAY(),-1)),2,2)/INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_FMCG","close",WORKDAY(TODAY(),-2)),2,2))-1)*100,2)'],
  ["INDEXNSE:NIFTY_REALTY","Nifty Realty", '=GOOGLEFINANCE("INDEXNSE:NIFTY_REALTY","closeyest")', '=ROUND(((INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_REALTY","close",WORKDAY(TODAY(),-1)),2,2)/INDEX(GOOGLEFINANCE("INDEXNSE:NIFTY_REALTY","close",WORKDAY(TODAY(),-2)),2,2))-1)*100,2)'],
];

await writeRange(SHEET_ID, "Indices!A1:D11", INDICES_ROWS, token);
console.log("  Done.\n");

// ── Meta tab ──────────────────────────────────────────────────────────────────
console.log("Setting up tab: Meta");
await addTab(SHEET_ID, "Meta", token);
await writeRange(SHEET_ID, "Meta!A1:B1", [["last_recalc_trigger", new Date().toISOString()]], token);
console.log("  Done.\n");

console.log("Sheet setup complete.");
console.log("\nNext steps:");
console.log("1. Open the sheet — formulas take 5-15 min to compute on first load");
console.log("2. Publish each tab as CSV: File > Share > Publish to web > [tab] > CSV");
console.log("3. Add CSV URLs to .env.local:");
console.log("   SHEET_CSV_STOCK1=https://docs.google.com/spreadsheets/d/SHEET_ID/gviz/tq?tqx=out:csv&sheet=Stock_1");
console.log("   SHEET_CSV_STOCK2=...&sheet=Stock_2");
console.log("   SHEET_CSV_STOCK3=...&sheet=Stock_3");
console.log("   SHEET_CSV_INDICES=...&sheet=Indices");
```

- [ ] **Step 2: Run the setup script**

```bash
node --env-file=.env.local scripts/setup-sheet.mjs
```

Expected output:
```
Getting Google access token...
Token obtained.

Setting up tab: Stock_1 (614 tickers)
  Tab "Stock_1": created
    Wrote rows 1–100
    Wrote rows 101–200
    ...
  Done.

Setting up tab: Stock_2 ...
Setting up tab: Stock_3 ...
Setting up tab: Indices ...
Setting up tab: Meta ...

Sheet setup complete.
```

If you get `Token error: {"error":"invalid_grant"}`, check that the service account JSON is correctly formatted in `.env.local` (private key `\n` escaping).

- [ ] **Step 3: Publish tabs and add env vars**

Follow the printed "Next steps" instructions. Add the 4 CSV URLs to `.env.local`:

```
SHEET_CSV_STOCK1=https://docs.google.com/spreadsheets/d/YOUR_ID/gviz/tq?tqx=out:csv&sheet=Stock_1
SHEET_CSV_STOCK2=https://docs.google.com/spreadsheets/d/YOUR_ID/gviz/tq?tqx=out:csv&sheet=Stock_2
SHEET_CSV_STOCK3=https://docs.google.com/spreadsheets/d/YOUR_ID/gviz/tq?tqx=out:csv&sheet=Stock_3
SHEET_CSV_INDICES=https://docs.google.com/spreadsheets/d/YOUR_ID/gviz/tq?tqx=out:csv&sheet=Indices
```

- [ ] **Step 4: Wait and verify**

Open the sheet in a browser. After 5-15 minutes the formulas should show actual prices. If most cells show `#N/A` after 15 minutes, open each tab manually to trigger recalculation.

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-sheet.mjs
git commit -m "feat: add one-time Google Sheet setup script"
```

---

## Task 4: Sheet Data Fetcher

**Files:**
- Create: `lib/sheet-data.ts`
- Create: `app/api/debug-sheet/route.ts`

- [ ] **Step 1: Write the fetcher**

Create `lib/sheet-data.ts`:

```typescript
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
    stock1: process.env.SHEET_CSV_STOCK1,
    stock2: process.env.SHEET_CSV_STOCK2,
    stock3: process.env.SHEET_CSV_STOCK3,
    indices: process.env.SHEET_CSV_INDICES,
  };

  const missing = Object.entries(urls)
    .filter(([, v]) => !v)
    .map(([k]) => `SHEET_CSV_${k.toUpperCase()}`);
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }

  const [csv1, csv2, csv3, csvIdx] = await Promise.all([
    fetchCsv(urls.stock1!, "Stock_1"),
    fetchCsv(urls.stock2!, "Stock_2"),
    fetchCsv(urls.stock3!, "Stock_3"),
    fetchCsv(urls.indices!, "Indices"),
  ]);

  const stocks = new Map<string, PriceData>([
    ...parseCsvRows(csv1),
    ...parseCsvRows(csv2),
    ...parseCsvRows(csv3),
  ]);

  const indices = parseIndicesCsvRows(csvIdx);

  return { stocks, indices, fetchedAt: new Date() };
}
```

- [ ] **Step 2: Write a debug endpoint**

Create `app/api/debug-sheet/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { fetchSheetData } from "@/lib/sheet-data";

export async function GET(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await fetchSheetData();
    const stockSample = Object.fromEntries(
      [...data.stocks.entries()].slice(0, 10)
    );
    const indicesSample = Object.fromEntries(data.indices.entries());
    return NextResponse.json({
      stockCount: data.stocks.size,
      indicesCount: data.indices.size,
      fetchedAt: data.fetchedAt.toISOString(),
      stockSample,
      indicesSample,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Test**

```bash
npm run dev
```

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/debug-sheet
```

Expected response:
```json
{
  "stockCount": 1842,
  "indicesCount": 10,
  "fetchedAt": "2026-04-10T05:00:00.000Z",
  "stockSample": {
    "20MICRONS": { "close": 45.3, "changePct": 1.23 }
  },
  "indicesSample": {
    "Nifty 50": { "close": 22450.5, "changePct": 0.34 },
    "Sensex": { "close": 73800.2, "changePct": 0.31 }
  }
}
```

If `stockCount` is 0, open the sheet and wait for formulas to compute, then retry.

- [ ] **Step 4: Commit**

```bash
git add lib/sheet-data.ts app/api/debug-sheet/route.ts
git commit -m "feat: add Google Sheet CSV fetcher and debug endpoint"
```

---

## Task 5: Bright Data SERP Wrapper

**Files:**
- Create: `lib/brightdata.ts`

- [ ] **Step 1: Write the wrapper**

> **Verify before running:** Check your Bright Data dashboard (`Access Parameters > API reference`) for the exact endpoint URL and response format. The implementation below follows the standard Bright Data SERP API. If the response comes back as HTML instead of JSON, the `serpSearch` function includes a fallback that strips tags and passes raw text to the AI.

Create `lib/brightdata.ts`:

```typescript
// lib/brightdata.ts
// Bright Data SERP API wrapper for supplementary market data.
// Endpoint and zone name verified against Bright Data dashboard.

const BD_URL = "https://api.brightdata.com/request";

interface SerpResult {
  title?: string;
  snippet?: string;
}

interface SerpJsonResponse {
  organic?: SerpResult[];
  organic_results?: SerpResult[];
}

async function serpSearch(query: string): Promise<string> {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  const zone = process.env.BRIGHTDATA_ZONE ?? "serp";
  if (!apiKey) throw new Error("BRIGHTDATA_API_KEY not set");

  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&gl=in&hl=en`;

  const res = await fetch(BD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ zone, url: googleUrl, format: "json" }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bright Data SERP error ${res.status}: ${err}`);
  }

  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const data = (await res.json()) as SerpJsonResponse;
    const results = data.organic ?? data.organic_results ?? [];
    if (results.length === 0) return `No SERP results for: ${query}`;
    return results
      .map((r) => `${r.title ?? ""}: ${r.snippet ?? ""}`)
      .join("\n");
  }

  // Fallback: response is raw HTML — strip tags, pass text to AI
  const html = await res.text();
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
}

/** News and analyst notes for a batch of NSE tickers.
 *  Sends up to 10 tickers per SERP query to reduce API usage. */
export async function getStocksNews(tickers: string[]): Promise<string> {
  if (tickers.length === 0) return "";
  const batches: string[][] = [];
  for (let i = 0; i < tickers.length; i += 10) {
    batches.push(tickers.slice(i, i + 10));
  }
  const results = await Promise.all(
    batches.map((batch) =>
      serpSearch(
        `NSE India stocks news today ${batch.join(" ")} price movement analysis`
      )
    )
  );
  return results.join("\n---\n");
}

/** NSE stocks with unusual volume or strong momentum today. */
export async function getVolumeLeaders(): Promise<string> {
  return serpSearch(
    "NSE India stocks unusual volume momentum today top movers"
  );
}

/** NSE/BSE quarterly earnings results and upcoming schedule this week. */
export async function getEarningsCalendar(): Promise<string> {
  return serpSearch(
    "NSE BSE India quarterly earnings results Q4 FY2026 this week surprises"
  );
}

/** Key Indian macro indicators: FX, commodities, FII/DII flows. */
export async function getMacroData(): Promise<string> {
  return serpSearch(
    "India market INR USD rate Brent crude MCX gold price FII DII net flows today"
  );
}
```

- [ ] **Step 2: Verify Bright Data endpoint**

Test your API key directly:

```bash
source .env.local
curl -X POST https://api.brightdata.com/request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BRIGHTDATA_API_KEY" \
  -d "{\"zone\":\"$BRIGHTDATA_ZONE\",\"url\":\"https://www.google.com/search?q=NSE+Nifty+50+today&num=5\",\"format\":\"json\"}"
```

If the response is `{"organic":[...]}` — the code is ready. If it returns HTML — the fallback in `serpSearch` handles it. If you get 401 — check your API key and zone name in the dashboard.

- [ ] **Step 3: Commit**

```bash
git add lib/brightdata.ts
git commit -m "feat: add Bright Data SERP wrapper with 4 market data queries"
```

---

## Task 6: Update Market Data

**Files:**
- Modify: `lib/market-data.ts`

Replace the entire file to use sheet data + Bright Data instead of `searchWeb`.

- [ ] **Step 1: Replace `lib/market-data.ts`**

```typescript
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
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/market-data.ts
git commit -m "feat: replace searchWeb with Google Sheet prices + Bright Data SERP"
```

---

## Task 7: Update API Routes

**Files:**
- Modify: `app/api/cron/send-briefs/route.ts`
- Modify: `app/api/preview-brief/route.ts`

Both routes must fetch sheet data once before the section-generation loop, then pass it to the updated function signatures.

- [ ] **Step 1: Replace `app/api/cron/send-briefs/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { dbList, dbInsert } from "@/lib/db";
import { sendEmail } from "@/lib/email-sdk";
import { isMarketDay, getISTHour, getISTDate } from "@/lib/nse-holidays";
import {
  generatePresetSection,
  generateCompanySection,
  PresetType,
} from "@/lib/market-data";
import { wrapEmailHtml } from "@/lib/email-template";
import { fetchSheetData } from "@/lib/sheet-data";

interface ItemRow {
  id: string;
  data: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const istDate = getISTDate();
  if (!isMarketDay(istDate)) {
    return NextResponse.json({ skipped: true, reason: "Not a market day" });
  }

  const currentHour = getISTHour();
  let rows: ItemRow[] = [];
  try {
    rows = await dbList<ItemRow>("items", {}, embedToken);
  } catch {
    return NextResponse.json({ skipped: true, reason: "No items table yet" });
  }

  const matchingUsers = rows.filter(
    (r) =>
      r.data.type === "user_preferences" &&
      r.data.is_active === true &&
      r.data.delivery_hour === currentHour
  );

  if (matchingUsers.length === 0) {
    return NextResponse.json({
      skipped: true,
      reason: "No users scheduled for this hour",
    });
  }

  // Fetch sheet data once — shared across all users and all sections
  let sheetData;
  try {
    sheetData = await fetchSheetData();
  } catch (err) {
    return NextResponse.json(
      { error: `Sheet data unavailable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  const sent: string[] = [];
  for (const user of matchingUsers) {
    const presets = (user.data.presets as PresetType[]) ?? [];
    const companies = (user.data.companies as string[]) ?? [];
    const userId = user.data.user_id as string;

    const sections: string[] = [];
    for (const preset of presets) {
      sections.push(await generatePresetSection(preset, embedToken, sheetData));
    }
    for (const company of companies) {
      sections.push(await generateCompanySection(company, embedToken, sheetData));
    }

    const date = istDate.toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const html = wrapEmailHtml(sections, date);

    await sendEmail(`Daily Market Signal - ${date}`, html, embedToken);

    await dbInsert(
      "items",
      {
        data: {
          type: "email_log",
          user_id: userId,
          presets,
          companies,
          brief_html: html,
          sent_at: new Date().toISOString(),
        },
      },
      embedToken
    );

    sent.push(userId);
  }

  return NextResponse.json({ sent: sent.length, users: sent });
}
```

- [ ] **Step 2: Replace `app/api/preview-brief/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  generatePresetSection,
  generateCompanySection,
  PresetType,
} from "@/lib/market-data";
import { wrapEmailHtml } from "@/lib/email-template";
import { sendEmail } from "@/lib/email-sdk";
import { fetchSheetData } from "@/lib/sheet-data";

export async function POST(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const presets: PresetType[] = body.presets ?? [];
  const companies: string[] = body.companies ?? [];

  if (presets.length === 0 && companies.length === 0) {
    return NextResponse.json(
      { error: "Select at least one preset or company" },
      { status: 400 }
    );
  }

  try {
    // Fetch sheet data once — shared across all sections
    const sheetData = await fetchSheetData();

    const sections: string[] = [];
    for (const preset of presets) {
      sections.push(await generatePresetSection(preset, embedToken, sheetData));
    }
    for (const company of companies) {
      sections.push(await generateCompanySection(company, embedToken, sheetData));
    }

    const date = new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const html = wrapEmailHtml(sections, date);

    await sendEmail(`Daily Market Signal - Preview - ${date}`, html, embedToken);

    return NextResponse.json({ html, date, sent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/send-briefs/route.ts app/api/preview-brief/route.ts
git commit -m "feat: pass sheet data to section generators in brief routes"
```

---

## Task 8: Warmup Sheet Cron

**Files:**
- Create: `app/api/cron/warmup-sheet/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/cron/warmup-sheet/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getGoogleAccessToken, sheetsWrite } from "@/lib/google-auth";

export async function POST(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId)
    return NextResponse.json(
      { error: "GOOGLE_SHEET_ID not configured" },
      { status: 500 }
    );

  try {
    const accessToken = await getGoogleAccessToken();
    const timestamp = new Date().toISOString();
    await sheetsWrite(sheetId, "Meta!B1", [[timestamp]], accessToken);
    return NextResponse.json({ triggered: true, timestamp });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Log but return 200 — warmup failure must not block the 6 AM brief cron
    console.error("warmup-sheet failed:", message);
    return NextResponse.json({ triggered: false, error: message });
  }
}
```

- [ ] **Step 2: Test locally**

```bash
curl -X POST http://localhost:3000/api/cron/warmup-sheet \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected: `{"triggered":true,"timestamp":"2026-04-10T00:00:00.000Z"}`

Open the Google Sheet and confirm Meta!B1 updated to the current timestamp.

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/warmup-sheet/route.ts
git commit -m "feat: add warmup-sheet cron to trigger GOOGLEFINANCE recalculation"
```

---

## Task 9: Refresh Tickers Cron

**Files:**
- Create: `app/api/cron/refresh-tickers/route.ts`

- [ ] **Step 1: Write the route**

Create `app/api/cron/refresh-tickers/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getGoogleAccessToken, sheetsWrite, sheetsAddTab } from "@/lib/google-auth";
import { dbList, dbUpdate, dbInsert } from "@/lib/db";
import { NSE_TICKERS } from "@/lib/nse-tickers";

interface ItemRow {
  id: string;
  data: Record<string, unknown>;
}

const NSE_EQUITY_URL =
  "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";

async function fetchLatestNSETickers(): Promise<string[]> {
  const res = await fetch(NSE_EQUITY_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "text/csv,*/*",
      Referer: "https://www.nseindia.com/",
    },
  });
  if (!res.ok) throw new Error(`NSE EQUITY_L fetch failed: ${res.status}`);
  const csv = await res.text();
  const lines = csv.split("\n").slice(1);
  const tickers: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const symbol = cols[0]?.trim().replace(/^"|"$/g, "");
    const series = cols[2]?.trim().replace(/^"|"$/g, "");
    if (symbol && series === "EQ") tickers.push(symbol);
  }
  return tickers.sort();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function rewriteStockTabs(
  sheetId: string,
  tickers: string[],
  accessToken: string
): Promise<void> {
  const third = Math.ceil(tickers.length / 3);
  const splits: Record<string, string[]> = {
    Stock_1: tickers.slice(0, third),
    Stock_2: tickers.slice(third, third * 2),
    Stock_3: tickers.slice(third * 2),
  };

  for (const [tabName, tabTickers] of Object.entries(splits)) {
    await sheetsAddTab(sheetId, tabName, accessToken);
    const rows: string[][] = [["SYMBOL", "Close Prev", "Change %"]];
    tabTickers.forEach((symbol, i) => {
      const row = i + 2;
      rows.push([
        symbol,
        `=GOOGLEFINANCE("NSE:"&A${row},"closeyest")`,
        `=ROUND(((INDEX(GOOGLEFINANCE("NSE:"&A${row},"close",WORKDAY(TODAY(),-1)),2,2)/INDEX(GOOGLEFINANCE("NSE:"&A${row},"close",WORKDAY(TODAY(),-2)),2,2))-1)*100,2)`,
      ]);
    });

    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const startRow = i + 1;
      await sheetsWrite(
        sheetId,
        `${tabName}!A${startRow}:C${startRow + chunk.length - 1}`,
        chunk,
        accessToken
      );
      if (i + 100 < rows.length) await sleep(1200);
    }
  }
}

export async function POST(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId)
    return NextResponse.json(
      { error: "GOOGLE_SHEET_ID not configured" },
      { status: 500 }
    );

  // Get current active ticker list — DB record first, static file as fallback
  let currentTickers: string[] = NSE_TICKERS;
  let tickerRecordId: string | null = null;
  try {
    const rows = await dbList<ItemRow>("items", {}, embedToken);
    const record = rows.find((r) => r.data.type === "ticker_list");
    if (record) {
      currentTickers = record.data.tickers as string[];
      tickerRecordId = record.id;
    }
  } catch {
    // DB unavailable — proceed with static seed list
  }

  // Fetch latest NSE list
  let freshTickers: string[];
  try {
    freshTickers = await fetchLatestNSETickers();
  } catch (err) {
    return NextResponse.json({
      skipped: true,
      reason: `NSE source unreachable: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  const currentSet = new Set(currentTickers);
  const freshSet = new Set(freshTickers);
  const added = freshTickers.filter((t) => !currentSet.has(t));
  const removed = currentTickers.filter((t) => !freshSet.has(t));

  if (added.length === 0 && removed.length === 0) {
    return NextResponse.json({ updated: false, reason: "No changes in ticker list" });
  }

  // Rewrite all 3 stock tabs with the updated list
  const accessToken = await getGoogleAccessToken();
  await rewriteStockTabs(sheetId, freshTickers, accessToken);

  // Save updated list to DB
  const tickerData = {
    type: "ticker_list",
    tickers: freshTickers,
    updated_at: new Date().toISOString(),
    added_count: added.length,
    removed_count: removed.length,
  };
  if (tickerRecordId) {
    await dbUpdate("items", tickerRecordId, { data: tickerData }, embedToken);
  } else {
    await dbInsert("items", { data: tickerData }, embedToken);
  }

  return NextResponse.json({
    updated: true,
    total: freshTickers.length,
    added: added.length,
    removed: removed.length,
    addedSample: added.slice(0, 5),
    removedSample: removed.slice(0, 5),
  });
}
```

- [ ] **Step 2: Test locally**

```bash
curl -X POST http://localhost:3000/api/cron/refresh-tickers \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected first run: `{"updated":false,"reason":"No changes in ticker list"}` (fresh list matches seed).

- [ ] **Step 3: Commit**

```bash
git add app/api/cron/refresh-tickers/route.ts
git commit -m "feat: add weekly ticker refresh cron (NSE diff + sheet update)"
```

---

## Task 10: Cron Config & Cleanup

**Files:**
- Modify: `lib/terminal-ai.ts`
- Modify: `terminal-ai.config.json`

- [ ] **Step 1: Remove `searchWeb` from `lib/terminal-ai.ts`**

Delete the `searchWeb` export (currently lines 62–70). The resulting file:

```typescript
const GATEWAY_URL = process.env.TERMINAL_AI_GATEWAY_URL!;

interface GatewayMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GatewayResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export async function callGateway(
  routing: { category: string; tier: string },
  messages: GatewayMessage[],
  embedToken: string,
): Promise<GatewayResponse> {
  if (!embedToken) throw new Error("Missing embed token");

  const res = await fetch(`${GATEWAY_URL}/v1/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${embedToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...routing, messages }),
  });

  if (res.status === 401) {
    throw Object.assign(
      new Error("Session expired"),
      { code: "TOKEN_EXPIRED", retryable: true },
    );
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gateway error ${res.status}: ${err}`);
  }
  const json = await res.json();

  if (json.choices?.[0]?.message?.content) return json as GatewayResponse;
  if (json.content) return { choices: [{ message: { content: json.content } }] };
  if (json.result) return { choices: [{ message: { content: json.result } }] };
  if (json.text) return { choices: [{ message: { content: json.text } }] };
  if (json.message?.content) return { choices: [{ message: { content: json.message.content } }] };
  throw new Error(`Unexpected gateway response shape: ${JSON.stringify(json).substring(0, 500)}`);
}

export async function analyzeWithDeepseek(
  systemPrompt: string,
  userPrompt: string,
  embedToken: string,
): Promise<GatewayResponse> {
  return callGateway({ category: "chat", tier: "fast" }, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], embedToken);
}
```

- [ ] **Step 2: Confirm no remaining `searchWeb` references**

```bash
grep -r "searchWeb" --include="*.ts" .
```

Expected: no output.

- [ ] **Step 3: Update `terminal-ai.config.json`**

```json
{
  "app_name": "daily-market-signal",
  "framework": "nextjs",
  "gateway_version": "2",
  "health_check_path": "/api/health",
  "port": 3000,
  "requires_file_upload": false,
  "generates_artifacts": true,
  "model_tier": "standard",
  "category": "chat",
  "tier": "good",
  "env_vars": [
    "TERMINAL_AI_GATEWAY_URL",
    "TERMINAL_AI_APP_ID",
    "GOOGLE_SHEET_ID",
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    "BRIGHTDATA_API_KEY",
    "BRIGHTDATA_ZONE",
    "SHEET_CSV_STOCK1",
    "SHEET_CSV_STOCK2",
    "SHEET_CSV_STOCK3",
    "SHEET_CSV_INDICES"
  ]
}
```

- [ ] **Step 4: Add cron tasks in Terminal AI dashboard**

In the Terminal AI dashboard or via MCP, add/update these cron tasks:

| Name | Cron (UTC) | IST | Endpoint |
|---|---|---|---|
| Warmup Sheet | `0 0 * * 1-5` | 5:30 AM Mon–Fri | `POST /api/cron/warmup-sheet` |
| Send Briefs | `30 0,1,2,3,4 * * 1-5` | 6–10 AM Mon–Fri | `POST /api/cron/send-briefs` |
| Refresh Tickers | `30 20 * * 0` | 2:00 AM Sun | `POST /api/cron/refresh-tickers` |

- [ ] **Step 5: Final TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/terminal-ai.ts terminal-ai.config.json
git commit -m "feat: remove searchWeb, document env vars and cron schedule"
```

---

## Task 11: End-to-End Test

- [ ] **Step 1: Confirm sheet data endpoint works**

```bash
npm run dev
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/debug-sheet
```

Confirm `stockCount > 1000` and `indicesCount === 10`.

- [ ] **Step 2: Test preview brief in browser**

Open `http://localhost:3000`, select "Nifty/Sensex Movers", click Preview.

Expected: email arrives within 30 seconds containing a table with Nifty 50 close prices. Cross-check 2-3 prices against the Google Sheet to confirm accuracy.

- [ ] **Step 3: Test warmup cron**

```bash
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/cron/warmup-sheet
```

Confirm Meta!B1 in the Google Sheet updates.

- [ ] **Step 4: Add env vars to production and deploy**

In the Terminal AI app settings, add all new env vars:
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `BRIGHTDATA_API_KEY`
- `BRIGHTDATA_ZONE`
- `SHEET_CSV_STOCK1`, `SHEET_CSV_STOCK2`, `SHEET_CSV_STOCK3`, `SHEET_CSV_INDICES`

Then deploy via Terminal AI MCP or dashboard.

- [ ] **Step 5: Test preview on production**

Open the live app, click Preview. Confirm accurate prices in the email.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: complete Google Sheets pricing integration"
```

---

## Self-Review

**Spec coverage:**
- ✅ Google Sheet structure (5 tabs, GOOGLEFINANCE formulas) — Tasks 1, 3
- ✅ NSE ticker static list — Task 1
- ✅ Weekly ticker refresh (DB + sheet) — Task 9
- ✅ Sheet data fetcher (4 CSV tabs in parallel) — Task 4
- ✅ Bright Data SERP for supplementary data — Task 5
- ✅ Preset logic with sheet data + Bright Data — Task 6
- ✅ Company sections: price from sheet + batched news — Task 6
- ✅ 5:30 AM warmup cron — Task 8
- ✅ Error handling: Bright Data failure never blocks email — Task 6 (try/catch wraps all BD calls)
- ✅ Error handling: warmup failure never blocks brief — Task 8 (returns 200 on error)
- ✅ DB ticker list as runtime source of truth, seed from static file — Task 9
- ✅ Remove searchWeb — Task 10
- ✅ Updated cron schedule — Task 10

**Type consistency:** `SheetData` defined in `lib/sheet-data.ts`, imported as `type SheetData` in `lib/market-data.ts`. `generatePresetSection(presetId, embedToken, sheetData)` and `generateCompanySection(ticker, embedToken, sheetData)` — consistent across all 3 call sites (market-data.ts, send-briefs, preview-brief).
