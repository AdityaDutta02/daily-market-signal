# Daily Market Signal - India Market Overhaul

**Date:** 2026-04-09
**Status:** Draft

## Overview

Transform the Daily Market Signal app from a US-focused market brief tool into an India-only (NSE/BSE) morning market brief with shared caching, a first-time setup wizard, and a premium Stripe/Notion-inspired UI. All em dashes replaced with hyphens throughout.

## Constraints

- Up to 2 presets, up to 3 companies per user
- NSE/BSE tickers only, validated against a static list refreshed weekly
- 5 credits per email send, 5 minimum credits for app
- DB is app-scoped (shared across all users of this deployed app)
- Delivery time is hourly slots only (6 AM - 10 AM IST)
- No cost-per-run display in the UI

---

## 1. Data Model

All records stored in the existing `items` table via REST SDK, differentiated by `data.type`.

### user_preferences
```json
{
  "type": "user_preferences",
  "user_id": "from-embed-token",
  "presets": ["nifty_movers", "sectoral_pulse"],
  "companies": ["RELIANCE", "TCS", "INFY"],
  "delivery_hour": 8,
  "schedule_days": [1, 2, 3, 4, 5],
  "is_active": true,
  "setup_complete": true
}
```

### preset_cache
```json
{
  "type": "preset_cache",
  "preset_id": "nifty_movers",
  "html_section": "<div>...</div>",
  "search_data": "raw markdown from search",
  "cached_date": "2026-04-09"
}
```

### company_cache
```json
{
  "type": "company_cache",
  "ticker": "RELIANCE",
  "html_section": "<div>...</div>",
  "search_data": "raw markdown from search",
  "cached_date": "2026-04-09"
}
```

### email_log
```json
{
  "type": "email_log",
  "user_id": "from-embed-token",
  "presets": ["nifty_movers"],
  "companies": ["RELIANCE"],
  "brief_html": "<full email html>",
  "sent_at": "2026-04-09T08:00:00Z"
}
```

### nse_tickers
```json
{
  "type": "nse_tickers",
  "symbols": ["RELIANCE", "TCS", "INFY", "...2000+ symbols"],
  "updated_at": "2026-04-07T00:00:00Z"
}
```

### nse_holidays
```json
{
  "type": "nse_holidays",
  "year": 2026,
  "dates": ["2026-01-26", "2026-03-10", "2026-03-31", "..."]
}
```

---

## 2. Indian Market Presets

5 presets available, user selects up to 2.

| ID | Name | Description | Search query |
|---|---|---|---|
| `nifty_movers` | Nifty/Sensex Movers | Top gainers and losers today | "Today's top 10 NSE Nifty 50 and Sensex stock gainers and losers by percentage change. Include ticker, price in INR, and % change." |
| `stocks_to_watch` | Stocks to Watch | Trending by volume and news | "Which stocks are trending on NSE today by unusual volume, momentum, and breaking news? List top 10 with reasons." |
| `sectoral_pulse` | Sectoral Pulse | Nifty sectoral index performance | "How are Nifty sectoral indices performing today? Include Bank Nifty, Nifty IT, Pharma, Auto, Metal, Energy, FMCG, Realty with % change and key drivers." |
| `earnings_radar` | Earnings Radar | Upcoming results and surprises | "What major Indian companies report quarterly earnings this week? Include any recent earnings surprises and their stock impact on NSE." |
| `macro_dashboard` | Macro Dashboard | Key Indian macro indicators | "Today's key Indian market indicators: Nifty 50, Sensex levels and change, Bank Nifty, INR/USD exchange rate, RBI policy stance, Brent crude in INR, MCX Gold price, FII/DII flows." |

---

## 3. Caching Architecture

### 3.1 Cache-warm (6 AM IST daily, market days only)

**Endpoint:** `POST /api/cron/cache-warm`

1. Check `isMarketDay()` - skip if weekend or NSE holiday
2. Query all `user_preferences` where `is_active = true`
3. Collect unique preset IDs across all users
4. For each unique preset:
   - Call `searchWeb()` with preset query (2 credits)
   - Call `analyzeWithDeepseek()` to format into an HTML section (1 credit)
   - Upsert `preset_cache` record with today's date
5. Collect unique company tickers across all users
6. For each unique ticker:
   - Call `searchWeb()` with "Current NSE price, daily change, and latest news for {TICKER}" (2 credits)
   - Call `analyzeWithDeepseek()` to format into an HTML section (1 credit)
   - Upsert `company_cache` record with today's date

**Cost per day:** (unique_presets + unique_companies) * 3 credits, shared across all users.

### 3.2 Send-briefs (hourly, 7-10 AM IST, market days only)

**Endpoint:** `POST /api/cron/send-briefs`

1. Check `isMarketDay()`
2. Determine current IST hour
3. Query `user_preferences` where `delivery_hour = current_hour` and `is_active = true`
4. For each matching user:
   a. Pull `preset_cache` entries for user's selected presets (today's date)
   b. Pull `company_cache` entries for user's selected companies (today's date)
   c. Handle cache miss: if any entry missing, run on-demand search + analyze, then cache
   d. Assemble email from cached HTML sections using static email template
   e. Call `sendEmail()` (5 credits)
   f. Insert `email_log` record with user_id and brief_html

### 3.3 Refresh-tickers (weekly, Monday midnight IST)

**Endpoint:** `POST /api/cron/refresh-tickers`

1. Call `searchWeb()` with "Complete list of all NSE listed company ticker symbols as of today"
2. Parse response into symbol array
3. Upsert `nse_tickers` record

### 3.4 On-demand cache fallback

When a user adds a new company after 6 AM:
- Preview or next delivery checks `company_cache` for today
- Cache miss: run search + analyze, write to cache
- Subsequent users with same company get cached version

---

## 4. Setup Wizard (first-time users)

Shown when `user_preferences` for this user_id doesn't exist or `setup_complete = false`.

### Step 1: Welcome
- App name and one-line description
- "Get started" button

### Step 2: Select Presets (required, 1-2)
- 5 preset cards in a grid
- Each card: name, short description, subtle icon
- Selection indicator: border highlight + checkmark
- Enforce min 1, max 2
- "Continue" button (disabled until at least 1 selected)

### Step 3: Add Companies (optional, 0-3)
- Search input with autocomplete against `nse_tickers` list
- Type-ahead dropdown showing matching symbols + company names
- Selected companies shown as removable chips
- Enforce max 3 with clear messaging
- "Continue" and "Skip" buttons

### Step 4: Delivery Time
- Horizontal selector for hour: 6 AM, 7 AM, 8 AM, 9 AM, 10 AM (IST)
- Day toggles for Mon-Sat (weekdays pre-selected)
- Note: "Briefs are sent on NSE market days only"

### Step 5: Confirmation
- Summary card showing selections
- "Activate" button saves preferences and creates/updates cron
- "Send a preview email now" toggle/checkbox
- If preview toggled: fires preview generation, then sends email

---

## 5. Post-Setup Dashboard

Shown when `setup_complete = true`.

### 5.1 Header
- App name left-aligned
- Status pill (Active/Paused) + toggle
- Settings icon

### 5.2 Settings Section
- Compact display of current config: presets, companies, delivery time, days
- "Edit" opens inline editing (not a modal, not the wizard again)
- Same validation rules: max 2 presets, max 3 companies, hourly slots
- Save updates preferences + reschedules cron if time changed

### 5.3 Previous Briefs Section
- List of past briefs for this user (from `email_log` filtered by `user_id`)
- Each entry: date, presets used, companies included
- Click to expand and view the cached HTML inline
- Show last 30 days, paginated or scrollable

---

## 6. Design System

**Style:** Warm/premium, inspired by Stripe and Notion.

### Colors
- Background: `#FAFAF8` (warm off-white)
- Card background: `#FFFFFF` with `box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)`
- Text primary: `#1A1A1A`
- Text secondary: `#6B6B6B`
- Text muted: `#9B9B9B`
- Border: `#E8E5E0`
- Accent primary: `#5B5BD6` (warm indigo) - CTAs, selected states
- Accent green: `#2E7D32` - positive data, active states
- Accent red: `#C62828` - negative data, errors
- Surface hover: `#F5F3EF`

### Typography
- Font stack: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Base size: 15px
- Scale: 13px (caption), 15px (body), 17px (subtitle), 22px (heading), 28px (display)
- Font weights: 400 (body), 500 (medium), 600 (semibold), 700 (bold)
- Line height: 1.5 for body, 1.3 for headings
- Letter spacing: -0.01em for headings, normal for body

### Spacing
- Base unit: 4px
- Common spacing: 8, 12, 16, 24, 32, 48px
- Card padding: 24px
- Section gaps: 32px
- Page max-width: 640px (centered, single column)

### Components
- **Cards**: 12px border-radius, white background, soft shadow, 24px padding
- **Buttons (primary)**: `#5B5BD6` background, white text, 8px border-radius, 500 weight, 14px font, 40px height
- **Buttons (secondary)**: transparent background, `#5B5BD6` text, 1px `#E8E5E0` border
- **Inputs**: 8px radius, 1px `#E8E5E0` border, 40px height, `#FAFAF8` background on focus
- **Chips/tags**: 6px radius, `#F5F3EF` background, 13px font, 28px height
- **Preset cards**: 12px radius, `#FFFFFF` background, 1px border, selected state adds `#5B5BD6` 2px border + light indigo wash `rgba(91,91,214,0.04)`
- **Transitions**: 150ms ease for hover/focus states, transform translateY(-1px) on card hover
- **No emoji icons** - use text labels or minimal SVG icons
- **No glassmorphism, no gradients, no backdrop-filter**
- **No animations on page load** - content renders immediately

### Layout
- Single column, 640px max-width, centered
- Wizard: centered card, step indicator as numbered dots at top
- Dashboard: stacked sections with clear dividers

---

## 7. NSE Holiday Calendar

Static file `lib/nse-holidays.ts` exporting:

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

function isMarketDay(date?: Date): boolean
```

Checks: not Saturday, not Sunday, not in holiday list.

---

## 8. API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/preferences` | GET | Get current user's preferences (uses user_id from token) |
| `/api/preferences` | POST | Create/update preferences, enforce limits |
| `/api/tickers/search` | GET | Search NSE tickers by query string |
| `/api/tickers/validate` | POST | Validate array of tickers against list |
| `/api/briefs` | GET | Get user's email_log history |
| `/api/preview-brief` | POST | Generate preview from cache (or on-demand) |
| `/api/schedule` | POST | Create/update delivery cron |
| `/api/cron/cache-warm` | POST | 6 AM cache warming (cron callback) |
| `/api/cron/send-briefs` | POST | Hourly delivery from cache (cron callback) |
| `/api/cron/refresh-tickers` | POST | Weekly ticker list refresh (cron callback) |
| `/api/health` | GET | Health check |

---

## 9. File Map

### New files
- `lib/nse-holidays.ts` - holiday calendar + `isMarketDay()`
- `lib/nse-tickers.ts` - ticker validation helpers
- `lib/email-template.ts` - static HTML email wrapper template
- `lib/cache.ts` - cache read/write/check helpers
- `app/api/cron/cache-warm/route.ts`
- `app/api/cron/send-briefs/route.ts`
- `app/api/cron/refresh-tickers/route.ts`
- `app/api/briefs/route.ts`
- `app/api/tickers/search/route.ts`
- `app/api/tickers/validate/route.ts`

### Modified files
- `app/page.tsx` - full rewrite (setup wizard + dashboard)
- `app/globals.css` - full rewrite (warm/premium design)
- `lib/market-data.ts` - rewrite with Indian presets + caching integration
- `lib/terminal-ai.ts` - update search prompts for Indian market context
- `app/api/preferences/route.ts` - add user_id, enforce limits
- `app/api/preview-brief/route.ts` - use cache, India-only
- `app/api/schedule/route.ts` - hourly slots, IST timezone only

### Deleted files
- `app/api/cron/send-brief/route.ts` - replaced by `send-briefs`

---

## 10. Cron Configuration

3 scheduled tasks created via Terminal AI MCP:

| Name | Schedule (UTC) | IST equivalent | Callback |
|---|---|---|---|
| `cache-warm` | `30 0 * * 1-5` | 6:00 AM IST Mon-Fri | `/api/cron/cache-warm` |
| `send-briefs-7` | `30 1 * * 1-5` | 7:00 AM IST | `/api/cron/send-briefs` |
| `send-briefs-8` | `30 2 * * 1-5` | 8:00 AM IST | `/api/cron/send-briefs` |
| `send-briefs-9` | `30 3 * * 1-5` | 9:00 AM IST | `/api/cron/send-briefs` |
| `send-briefs-10` | `30 4 * * 1-5` | 10:00 AM IST | `/api/cron/send-briefs` |
| `refresh-tickers` | `30 18 * * 0` | Monday 12:00 AM IST | `/api/cron/refresh-tickers` |

Note: IST is UTC+5:30. The send-briefs cron fires every hour 7-10 AM; the handler determines current IST hour and matches users.

Actually, simpler: one `send-briefs` cron running hourly `30 1-4 * * 1-5` that checks which users have matching delivery_hour.

Final cron list:
| Name | Schedule (UTC) | Callback |
|---|---|---|
| `cache-warm` | `30 0 * * 1-5` | `/api/cron/cache-warm` |
| `send-briefs` | `30 1-4 * * 1-5` | `/api/cron/send-briefs` |
| `refresh-tickers` | `30 18 * * 0` | `/api/cron/refresh-tickers` |
