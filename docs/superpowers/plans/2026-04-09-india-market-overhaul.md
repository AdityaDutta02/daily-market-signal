# India Market Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Daily Market Signal app into an India-only (NSE/BSE) morning market brief with shared caching, setup wizard, and premium Stripe/Notion-inspired UI.

**Architecture:** Single Next.js app using Terminal AI gateway for AI calls, app-scoped DB for shared caching. 6 AM IST cron warms preset/company caches; hourly crons assemble from cache and send emails with zero AI calls. Setup wizard for first-time users, dashboard with settings + brief history for returning users.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, DOMPurify (with sanitizeHtml wrapper for XSS prevention), Terminal AI Gateway SDK (searchWeb, analyzeWithDeepseek), Terminal AI DB/Email/Task SDKs.

**Spec:** `docs/superpowers/specs/2026-04-09-india-market-overhaul-design.md`

---

## File Structure

```
lib/
  terminal-ai.ts        [modify] - update system prompts for Indian market
  market-data.ts        [rewrite] - Indian presets, per-section HTML generation
  db.ts                 [keep] - no changes needed
  email-sdk.ts          [keep] - no changes needed
  task-sdk.ts           [keep] - no changes needed
  nse-holidays.ts       [create] - 2026 holiday calendar + isMarketDay()
  nse-tickers.ts        [create] - ticker validation + search helpers
  cache.ts              [create] - cache read/write/upsert for presets and companies
  email-template.ts     [create] - static HTML email wrapper
  token.ts              [create] - extract userId from embed token JWT

hooks/
  use-embed-token.ts    [keep] - no changes needed

app/
  page.tsx              [rewrite] - setup wizard + dashboard
  globals.css           [rewrite] - warm/premium design system
  layout.tsx            [keep] - no changes needed

app/api/
  health/route.ts       [keep]
  preferences/route.ts  [rewrite] - user_id filtering, enforce limits
  preview-brief/route.ts [rewrite] - use cache, India-only
  schedule/route.ts     [rewrite] - hourly IST slots only
  briefs/route.ts       [create] - user's email history
  tickers/search/route.ts    [create] - search NSE tickers
  tickers/validate/route.ts  [create] - validate ticker array
  cron/cache-warm/route.ts   [create] - 6 AM cache warming
  cron/send-briefs/route.ts  [create] - hourly delivery from cache
  cron/refresh-tickers/route.ts [create] - weekly ticker list refresh
  cron/send-brief/route.ts  [delete] - replaced by send-briefs
```

---

## Task 1: Core utilities - token, holidays, tickers

**Files:**
- Create: `lib/token.ts`
- Create: `lib/nse-holidays.ts`
- Create: `lib/nse-tickers.ts`

- [ ] **Step 1: Create `lib/token.ts` - extract userId from embed token**

```typescript
export function getUserId(embedToken: string): string {
  try {
    const payload = JSON.parse(
      Buffer.from(embedToken.split(".")[1], "base64").toString()
    );
    return payload.userId ?? payload.user_id ?? "anonymous";
  } catch {
    return "anonymous";
  }
}
```

- [ ] **Step 2: Create `lib/nse-holidays.ts`**

```typescript
const NSE_HOLIDAYS_2026: string[] = [
  "2026-01-26", // Republic Day
  "2026-03-10", // Holi
  "2026-03-31", // Id-Ul-Fitr
  "2026-04-02", // Ram Navami
  "2026-04-14", // Dr. Ambedkar Jayanti
  "2026-04-18", // Good Friday
  "2026-05-01", // Maharashtra Day
  "2026-06-07", // Eid-Ul-Adha
  "2026-07-07", // Muharram
  "2026-08-15", // Independence Day
  "2026-08-26", // Janmashtami
  "2026-09-05", // Milad-Un-Nabi
  "2026-10-02", // Mahatma Gandhi Jayanti
  "2026-10-20", // Dussehra
  "2026-10-21", // Dussehra (additional)
  "2026-11-09", // Diwali (Laxmi Pujan)
  "2026-11-10", // Diwali Balipratipada
  "2026-11-27", // Gurunanak Jayanti
  "2026-12-25", // Christmas
];

const HOLIDAYS_BY_YEAR: Record<number, string[]> = {
  2026: NSE_HOLIDAYS_2026,
};

export function isMarketDay(date?: Date): boolean {
  const d = date ?? new Date();
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const iso = d.toISOString().split("T")[0];
  const year = d.getFullYear();
  const holidays = HOLIDAYS_BY_YEAR[year] ?? [];
  return !holidays.includes(iso);
}

export function getISTDate(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

export function getISTHour(): number {
  return getISTDate().getHours();
}

export function getTodayISO(): string {
  return getISTDate().toISOString().split("T")[0];
}
```

- [ ] **Step 3: Create `lib/nse-tickers.ts`**

```typescript
import { dbList } from "./db";

interface TickerRecord {
  id: string;
  data: {
    type: string;
    symbols: string[];
    updated_at: string;
  };
}

export async function getTickerList(embedToken: string): Promise<string[]> {
  const rows = await dbList<TickerRecord>("items", {}, embedToken);
  const record = rows.find((r) => r.data.type === "nse_tickers");
  return record?.data.symbols ?? [];
}

export async function validateTickers(
  tickers: string[],
  embedToken: string
): Promise<{ valid: string[]; invalid: string[] }> {
  const symbols = await getTickerList(embedToken);
  const symbolSet = new Set(symbols);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const t of tickers) {
    const upper = t.trim().toUpperCase();
    if (symbolSet.has(upper)) valid.push(upper);
    else invalid.push(upper);
  }
  return { valid, invalid };
}

export function searchTickers(query: string, symbols: string[]): string[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  return symbols
    .filter((s) => s.startsWith(q))
    .slice(0, 10);
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/token.ts lib/nse-holidays.ts lib/nse-tickers.ts
git commit -m "feat: add token parser, NSE holiday calendar, ticker validation"
```

---

## Task 2: Cache layer

**Files:**
- Create: `lib/cache.ts`
- Create: `lib/email-template.ts`

- [ ] **Step 1: Create `lib/cache.ts`**

```typescript
import { dbList, dbInsert, dbUpdate } from "./db";
import { getTodayISO } from "./nse-holidays";

interface ItemRow {
  id: string;
  data: Record<string, unknown>;
}

export async function getCachedPreset(
  presetId: string,
  embedToken: string
): Promise<{ html_section: string; search_data: string } | null> {
  const today = getTodayISO();
  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const hit = rows.find(
    (r) =>
      r.data.type === "preset_cache" &&
      r.data.preset_id === presetId &&
      r.data.cached_date === today
  );
  if (!hit) return null;
  return {
    html_section: hit.data.html_section as string,
    search_data: hit.data.search_data as string,
  };
}

export async function setCachedPreset(
  presetId: string,
  htmlSection: string,
  searchData: string,
  embedToken: string
): Promise<void> {
  const today = getTodayISO();
  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const existing = rows.find(
    (r) => r.data.type === "preset_cache" && r.data.preset_id === presetId
  );
  const data = {
    type: "preset_cache",
    preset_id: presetId,
    html_section: htmlSection,
    search_data: searchData,
    cached_date: today,
  };
  if (existing) {
    await dbUpdate("items", existing.id, { data }, embedToken);
  } else {
    await dbInsert("items", { data }, embedToken);
  }
}

export async function getCachedCompany(
  ticker: string,
  embedToken: string
): Promise<{ html_section: string; search_data: string } | null> {
  const today = getTodayISO();
  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const hit = rows.find(
    (r) =>
      r.data.type === "company_cache" &&
      r.data.ticker === ticker &&
      r.data.cached_date === today
  );
  if (!hit) return null;
  return {
    html_section: hit.data.html_section as string,
    search_data: hit.data.search_data as string,
  };
}

export async function setCachedCompany(
  ticker: string,
  htmlSection: string,
  searchData: string,
  embedToken: string
): Promise<void> {
  const today = getTodayISO();
  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const existing = rows.find(
    (r) => r.data.type === "company_cache" && r.data.ticker === ticker
  );
  const data = {
    type: "company_cache",
    ticker,
    html_section: htmlSection,
    search_data: searchData,
    cached_date: today,
  };
  if (existing) {
    await dbUpdate("items", existing.id, { data }, embedToken);
  } else {
    await dbInsert("items", { data }, embedToken);
  }
}
```

- [ ] **Step 2: Create `lib/email-template.ts`**

```typescript
export function wrapEmailHtml(sections: string[], date: string): string {
  const body = sections.join(
    '<hr style="border:none;border-top:1px solid #E8E5E0;margin:24px 0;">'
  );
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 24px;">
  <div style="margin-bottom:24px;">
    <h1 style="font-size:22px;font-weight:700;color:#1A1A1A;margin:0 0 4px;">Daily Market Signal</h1>
    <p style="font-size:13px;color:#9B9B9B;margin:0;">${date} - Indian Market Brief</p>
  </div>
  <div style="background:#FFFFFF;border-radius:12px;padding:24px;border:1px solid #E8E5E0;">
    ${body}
  </div>
  <div style="margin-top:24px;text-align:center;">
    <p style="font-size:12px;color:#9B9B9B;margin:0;">Powered by Daily Market Signal - NSE/BSE Market Intelligence</p>
  </div>
</div>
</body>
</html>`;
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/cache.ts lib/email-template.ts
git commit -m "feat: add cache layer and email template"
```

---

## Task 3: Rewrite market-data.ts for Indian presets

**Files:**
- Modify: `lib/market-data.ts` (full rewrite)
- Modify: `lib/terminal-ai.ts` (update system prompt)

- [ ] **Step 1: Update `lib/terminal-ai.ts` - change searchWeb system prompt**

Replace the system prompt string in the `searchWeb` function:

Old:
```
"You are a financial data assistant. Return accurate, current market data. Include specific numbers, percentages, and prices. Always cite your sources."
```

New:
```
"You are a financial data assistant specializing in Indian equity markets (NSE/BSE). Return accurate, current market data for Indian stocks. Include specific numbers, percentages, and prices in INR. Always cite your sources."
```

- [ ] **Step 2: Rewrite `lib/market-data.ts`**

```typescript
import { searchWeb, analyzeWithDeepseek } from "./terminal-ai";
import {
  getCachedPreset,
  setCachedPreset,
  getCachedCompany,
  setCachedCompany,
} from "./cache";

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
  {
    id: "nifty_movers",
    name: "Nifty/Sensex Movers",
    description: "Top gainers and losers today",
  },
  {
    id: "stocks_to_watch",
    name: "Stocks to Watch",
    description: "Trending by volume and news",
  },
  {
    id: "sectoral_pulse",
    name: "Sectoral Pulse",
    description: "Nifty sectoral index performance",
  },
  {
    id: "earnings_radar",
    name: "Earnings Radar",
    description: "Upcoming results and surprises",
  },
  {
    id: "macro_dashboard",
    name: "Macro Dashboard",
    description: "Key Indian macro indicators",
  },
];

const PRESET_QUERIES: Record<PresetType, string> = {
  nifty_movers:
    "Today's top 10 NSE Nifty 50 and Sensex stock gainers and losers by percentage change. Include ticker, price in INR, and % change.",
  stocks_to_watch:
    "Which stocks are trending on NSE today by unusual volume, momentum, and breaking news? List top 10 with reasons.",
  sectoral_pulse:
    "How are Nifty sectoral indices performing today? Include Bank Nifty, Nifty IT, Pharma, Auto, Metal, Energy, FMCG, Realty with % change and key drivers.",
  earnings_radar:
    "What major Indian companies report quarterly earnings this week? Include any recent earnings surprises and their stock impact on NSE.",
  macro_dashboard:
    "Today's key Indian market indicators: Nifty 50, Sensex levels and change, Bank Nifty, INR/USD exchange rate, RBI policy stance, Brent crude in INR, MCX Gold price, FII/DII flows.",
};

const SECTION_FORMAT_PROMPT = `You are an expert financial analyst writing a section of a morning Indian market brief email.
Format the data into clean HTML suitable for email clients.
Use inline styles only. Font: system-ui, -apple-system, sans-serif.
Colors: #1A1A1A for text, #5B5BD6 for accents, #2E7D32 for positive, #C62828 for negative.
Use tables with borders for data, bullet points for insights.
Keep it concise and scannable. Return ONLY the HTML section content, no wrapping body/html tags.`;

export async function generatePresetSection(
  presetId: PresetType,
  embedToken: string
): Promise<string> {
  const cached = await getCachedPreset(presetId, embedToken);
  if (cached) return cached.html_section;

  const query = PRESET_QUERIES[presetId];
  const searchResult = await searchWeb(query, embedToken);
  const searchData = searchResult.choices[0].message.content;

  const label =
    PRESETS.find((p) => p.id === presetId)?.name ?? presetId;
  const analysisResult = await analyzeWithDeepseek(
    SECTION_FORMAT_PROMPT,
    `Format this "${label}" data into an HTML section with a heading:\n\n${searchData}`,
    embedToken
  );
  const htmlSection = analysisResult.choices[0].message.content;

  await setCachedPreset(presetId, htmlSection, searchData, embedToken);
  return htmlSection;
}

export async function generateCompanySection(
  ticker: string,
  embedToken: string
): Promise<string> {
  const cached = await getCachedCompany(ticker, embedToken);
  if (cached) return cached.html_section;

  const searchResult = await searchWeb(
    `Current NSE stock price, daily change percentage, recent news, and analyst outlook for ${ticker}. Include price in INR.`,
    embedToken
  );
  const searchData = searchResult.choices[0].message.content;

  const analysisResult = await analyzeWithDeepseek(
    SECTION_FORMAT_PROMPT,
    `Format this data for "${ticker}" into a compact HTML section:\n\n${searchData}`,
    embedToken
  );
  const htmlSection = analysisResult.choices[0].message.content;

  await setCachedCompany(ticker, htmlSection, searchData, embedToken);
  return htmlSection;
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/market-data.ts lib/terminal-ai.ts
git commit -m "feat: rewrite market-data for Indian presets with caching"
```

---

## Task 4: API routes - preferences, tickers, briefs

**Files:**
- Modify: `app/api/preferences/route.ts` (rewrite)
- Create: `app/api/tickers/search/route.ts`
- Create: `app/api/tickers/validate/route.ts`
- Create: `app/api/briefs/route.ts`

- [ ] **Step 1: Rewrite `app/api/preferences/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { dbList, dbInsert, dbUpdate } from "@/lib/db";
import { getUserId } from "@/lib/token";

interface ItemRow {
  id: string;
  data: Record<string, unknown>;
}

const VALID_PRESETS = new Set([
  "nifty_movers",
  "stocks_to_watch",
  "sectoral_pulse",
  "earnings_radar",
  "macro_dashboard",
]);

export async function GET(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getUserId(embedToken);
  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const pref = rows.find(
    (r) =>
      r.data.type === "user_preferences" && r.data.user_id === userId
  );
  if (!pref) return NextResponse.json(null);
  return NextResponse.json({ id: pref.id, ...pref.data });
}

export async function POST(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getUserId(embedToken);
  const body = await request.json();

  const presets = (body.presets ?? []).filter((p: string) =>
    VALID_PRESETS.has(p)
  );
  if (presets.length > 2) {
    return NextResponse.json(
      { error: "Maximum 2 presets allowed" },
      { status: 400 }
    );
  }
  const companies = (body.companies ?? [])
    .slice(0, 3)
    .map((c: string) => c.trim().toUpperCase());
  const deliveryHour = Math.min(
    10,
    Math.max(6, body.delivery_hour ?? 8)
  );

  const data = {
    type: "user_preferences",
    user_id: userId,
    presets,
    companies,
    delivery_hour: deliveryHour,
    schedule_days: body.schedule_days ?? [1, 2, 3, 4, 5],
    is_active: body.is_active ?? true,
    setup_complete: body.setup_complete ?? true,
  };

  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const existing = rows.find(
    (r) =>
      r.data.type === "user_preferences" && r.data.user_id === userId
  );
  if (existing) {
    const updated = await dbUpdate(
      "items",
      existing.id,
      { data },
      embedToken
    );
    return NextResponse.json(updated);
  }
  const created = await dbInsert("items", { data }, embedToken);
  return NextResponse.json(created, { status: 201 });
}
```

- [ ] **Step 2: Create `app/api/tickers/search/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getTickerList, searchTickers } from "@/lib/nse-tickers";

export async function GET(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (!query.trim()) return NextResponse.json([]);

  const symbols = await getTickerList(embedToken);
  const results = searchTickers(query, symbols);
  return NextResponse.json(results);
}
```

- [ ] **Step 3: Create `app/api/tickers/validate/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { validateTickers } from "@/lib/nse-tickers";

export async function POST(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const tickers: string[] = body.tickers ?? [];
  if (tickers.length === 0) {
    return NextResponse.json({ valid: [], invalid: [] });
  }

  const result = await validateTickers(tickers, embedToken);
  return NextResponse.json(result);
}
```

- [ ] **Step 4: Create `app/api/briefs/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { dbList } from "@/lib/db";
import { getUserId } from "@/lib/token";

interface ItemRow {
  id: string;
  data: Record<string, unknown>;
}

export async function GET(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getUserId(embedToken);
  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const briefs = rows
    .filter(
      (r) =>
        r.data.type === "email_log" && r.data.user_id === userId
    )
    .sort((a, b) => {
      const aDate = a.data.sent_at as string;
      const bDate = b.data.sent_at as string;
      return bDate.localeCompare(aDate);
    })
    .slice(0, 30)
    .map((r) => ({
      id: r.id,
      presets: r.data.presets,
      companies: r.data.companies,
      sent_at: r.data.sent_at,
      brief_html: r.data.brief_html,
    }));

  return NextResponse.json(briefs);
}
```

- [ ] **Step 5: Commit**

```bash
git add app/api/preferences/route.ts app/api/tickers/search/route.ts app/api/tickers/validate/route.ts app/api/briefs/route.ts
git commit -m "feat: add preferences with user_id, ticker search/validate, briefs history"
```

---

## Task 5: API routes - preview, schedule, cron endpoints

**Files:**
- Modify: `app/api/preview-brief/route.ts` (rewrite)
- Modify: `app/api/schedule/route.ts` (rewrite)
- Create: `app/api/cron/cache-warm/route.ts`
- Create: `app/api/cron/send-briefs/route.ts`
- Create: `app/api/cron/refresh-tickers/route.ts`
- Delete: `app/api/cron/send-brief/route.ts`

- [ ] **Step 1: Rewrite `app/api/preview-brief/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
  generatePresetSection,
  generateCompanySection,
  PresetType,
} from "@/lib/market-data";
import { wrapEmailHtml } from "@/lib/email-template";

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

  const sections: string[] = [];
  for (const preset of presets) {
    sections.push(await generatePresetSection(preset, embedToken));
  }
  for (const company of companies) {
    sections.push(await generateCompanySection(company, embedToken));
  }

  const date = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const html = wrapEmailHtml(sections, date);

  return NextResponse.json({ html, date });
}
```

- [ ] **Step 2: Rewrite `app/api/schedule/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Schedule is handled by app-level crons created via Terminal AI MCP at deploy time.
  // This endpoint confirms the schedule is active.
  return NextResponse.json({ scheduled: true });
}
```

- [ ] **Step 3: Create `app/api/cron/cache-warm/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { dbList } from "@/lib/db";
import { isMarketDay, getISTDate } from "@/lib/nse-holidays";
import {
  generatePresetSection,
  generateCompanySection,
  PresetType,
} from "@/lib/market-data";

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
    return NextResponse.json({
      skipped: true,
      reason: "Not a market day",
    });
  }

  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const activeUsers = rows.filter(
    (r) =>
      r.data.type === "user_preferences" && r.data.is_active === true
  );

  if (activeUsers.length === 0) {
    return NextResponse.json({
      skipped: true,
      reason: "No active users",
    });
  }

  const presetSet = new Set<PresetType>();
  const companySet = new Set<string>();
  for (const user of activeUsers) {
    for (const p of (user.data.presets as PresetType[]) ?? []) {
      presetSet.add(p);
    }
    for (const c of (user.data.companies as string[]) ?? []) {
      companySet.add(c);
    }
  }

  const presetResults: string[] = [];
  for (const presetId of presetSet) {
    await generatePresetSection(presetId, embedToken);
    presetResults.push(presetId);
  }

  const companyResults: string[] = [];
  for (const ticker of companySet) {
    await generateCompanySection(ticker, embedToken);
    companyResults.push(ticker);
  }

  return NextResponse.json({
    warmed: true,
    presets: presetResults,
    companies: companyResults,
  });
}
```

- [ ] **Step 4: Create `app/api/cron/send-briefs/route.ts`**

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
    return NextResponse.json({
      skipped: true,
      reason: "Not a market day",
    });
  }

  const currentHour = getISTHour();
  const rows = await dbList<ItemRow>("items", {}, embedToken);
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

  const sent: string[] = [];
  for (const user of matchingUsers) {
    const presets = (user.data.presets as PresetType[]) ?? [];
    const companies = (user.data.companies as string[]) ?? [];
    const userId = user.data.user_id as string;

    const sections: string[] = [];
    for (const preset of presets) {
      sections.push(await generatePresetSection(preset, embedToken));
    }
    for (const company of companies) {
      sections.push(
        await generateCompanySection(company, embedToken)
      );
    }

    const date = istDate.toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const html = wrapEmailHtml(sections, date);

    await sendEmail(
      "user",
      `Daily Market Signal - ${date}`,
      html,
      embedToken
    );

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

- [ ] **Step 5: Create `app/api/cron/refresh-tickers/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { searchWeb } from "@/lib/terminal-ai";
import { dbList, dbInsert, dbUpdate } from "@/lib/db";

interface ItemRow {
  id: string;
  data: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await searchWeb(
    "Complete list of all currently listed NSE (National Stock Exchange of India) company ticker symbols. Return as a comma-separated list of ticker symbols only, no company names.",
    embedToken
  );

  const raw = result.choices[0].message.content;
  const symbols = raw
    .split(/[,\n]+/)
    .map((s: string) => s.trim().toUpperCase())
    .filter((s: string) => /^[A-Z][A-Z0-9&-]*$/.test(s));

  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const existing = rows.find((r) => r.data.type === "nse_tickers");

  const data = {
    type: "nse_tickers",
    symbols,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await dbUpdate("items", existing.id, { data }, embedToken);
  } else {
    await dbInsert("items", { data }, embedToken);
  }

  return NextResponse.json({ updated: true, count: symbols.length });
}
```

- [ ] **Step 6: Delete old cron route**

```bash
rm app/api/cron/send-brief/route.ts
```

- [ ] **Step 7: Commit**

```bash
git add app/api/preview-brief/route.ts app/api/schedule/route.ts
git add app/api/cron/cache-warm/route.ts app/api/cron/send-briefs/route.ts app/api/cron/refresh-tickers/route.ts
git add -u app/api/cron/send-brief/route.ts
git commit -m "feat: add cache-warm, send-briefs, refresh-tickers cron routes"
```

---

## Task 6: CSS design system overhaul

**Files:**
- Modify: `app/globals.css` (full rewrite)

- [ ] **Step 1: Rewrite `app/globals.css` with warm/premium design system**

Full CSS content is defined in the spec (Section 6: Design System). The CSS implements:
- CSS custom properties for all design tokens (colors, spacing, radii, shadows)
- Card, button (primary/secondary/ghost), input, chip, preset-card components
- Time selector and day selector button styles
- Wizard layout (centered card with step dots)
- Dashboard layout (header with status pill, settings rows, brief history items)
- Ticker autocomplete dropdown
- Toast notifications
- Spinner animation
- Single responsive breakpoint at 640px

See spec section 6 for exact values. Key properties:
- Background: `#FAFAF8`, Card: `#FFFFFF`, Accent: `#5B5BD6`
- Shadow: `0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)`
- Border radius: 12px cards, 8px buttons/inputs, 6px chips
- All transitions: 150ms ease
- Max width: 640px centered single column
- Inter font via Google Fonts import

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git commit -m "feat: overhaul CSS with warm/premium Stripe-inspired design"
```

---

## Task 7: Frontend - setup wizard + dashboard

**Files:**
- Modify: `app/page.tsx` (full rewrite)

The page.tsx component is split into three parts:

1. **Root component (`Home`)** - loads user preferences, shows loading spinner while fetching, routes to SetupWizard or Dashboard based on `setup_complete` flag.

2. **SetupWizard** - 5-step flow (welcome, presets, companies, time, confirm). Uses ticker autocomplete against `/api/tickers/search`. Enforces max 2 presets, max 3 companies. Final step saves preferences via `/api/preferences` POST and optionally triggers preview email.

3. **Dashboard** - shows current settings with inline edit mode, previous briefs list with expand-to-view. Active/Paused toggle. Edit mode uses same preset grid, ticker autocomplete, time/day selectors as wizard. Brief HTML is rendered using DOMPurify's sanitizeHtml wrapper (lazy-loaded to avoid SSR issues - this is critical, do not change to static import).

Key implementation details:
- `authHeaders(token)` helper returns `{ Authorization: "Bearer {token}", "Content-Type": "application/json" }`
- Ticker search uses 200ms debounce via `setTimeout` ref
- Preset toggle enforces max 2 by returning early if `prev.length >= 2`
- DOMPurify is lazy-loaded: `const DOMPurify = (await import("dompurify")).default` inside async `sanitizeHtml()` function
- Brief HTML display uses DOMPurify-sanitized content for XSS prevention

- [ ] **Step 1: Write the full page.tsx**

Implement the three components as described above. Full code provided in spec review - see Task 7 in the plan writing session for the complete implementation.

- [ ] **Step 2: Verify build compiles**

```bash
npm run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: rewrite frontend with setup wizard and dashboard"
```

---

## Task 8: Update terminal-ai.ts and clean up em dashes

**Files:**
- Modify: `lib/terminal-ai.ts`
- All `.ts`, `.tsx`, `.css` files: search and replace em dashes

- [ ] **Step 1: Update searchWeb system prompt in `lib/terminal-ai.ts`**

Replace:
```
"You are a financial data assistant. Return accurate, current market data. Include specific numbers, percentages, and prices. Always cite your sources."
```
With:
```
"You are a financial data assistant specializing in Indian equity markets (NSE/BSE). Return accurate, current market data for Indian stocks. Include specific numbers, percentages, and prices in INR. Always cite your sources."
```

- [ ] **Step 2: Search all files for em dashes and replace with hyphens**

Search for Unicode characters `\u2014` (em dash) and `\u2013` (en dash) across all `.ts`, `.tsx`, and `.css` files. Replace each occurrence with `-` (regular hyphen).

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "fix: update AI prompts for Indian market, replace em dashes with hyphens"
```

---

## Task 9: Build verification and deploy

**Files:** None (verification only)

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 2: Start dev server and smoke test**

```bash
npm run dev
```

Verify: `/api/health` returns 200, page loads without console errors, setup wizard renders.

- [ ] **Step 3: Push to remote**

```bash
git push origin main
```

- [ ] **Step 4: Deploy via Terminal AI MCP**

Redeploy the existing app using `redeploy_app` with app_id `2cda9da0-6bee-4be8-8fd2-c0ea656beb24`.

- [ ] **Step 5: Create cron jobs via Terminal AI MCP**

Create 3 scheduled tasks:
1. Name: `cache-warm`, schedule: `30 0 * * 1-5`, callback: `/api/cron/cache-warm`, timezone: `Asia/Kolkata`
2. Name: `send-briefs`, schedule: `30 1-4 * * 1-5`, callback: `/api/cron/send-briefs`, timezone: `Asia/Kolkata`
3. Name: `refresh-tickers`, schedule: `30 18 * * 0`, callback: `/api/cron/refresh-tickers`, timezone: `Asia/Kolkata`

- [ ] **Step 6: Trigger initial ticker list refresh**

Manually POST to `/api/cron/refresh-tickers` to seed the NSE ticker list for the first time.
