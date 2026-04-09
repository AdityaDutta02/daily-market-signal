# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server on port 3000
npm run build        # Production build (standalone output for Docker)
npm run start        # Run production server
```

No test framework, linter, or formatter is configured yet.

## Architecture

This is a Next.js 16 app that runs **inside a Terminal AI iframe**. It generates AI-powered daily market briefs and emails them on a cron schedule. All external services (AI models, DB, email, cron) go through the Terminal AI gateway — there are no direct third-party API calls.

### Auth: Embed Token

The app receives an auth token from its parent iframe via `postMessage` (`hooks/use-embed-token.ts`). Every API route extracts this token from the `Authorization: Bearer` header and passes it to all gateway SDK calls. There is no other auth mechanism.

### AI Pipeline (lib/market-data.ts)

Brief generation is a two-stage pipeline:
1. **Data collection** — `searchWeb()` calls `openai/gpt-4o-search-preview` (2 credits/call) for each ticker batch and preset
2. **Analysis** — `analyzeWithDeepseek()` calls `deepseek/deepseek-v3.2` (1 credit/call) to format collected data into an HTML email

All AI calls go through `lib/terminal-ai.ts` → `POST {GATEWAY_URL}/v1/generate`.

### Database (lib/db.ts)

REST-based DB via `{GATEWAY_URL}/db/{table}`. Uses a single `items` table with a flexible `data` JSON field. Record types are distinguished by `data.type`:
- `"preferences"` — user ticker/preset/schedule config (one per user)
- `"email_log"` — sent email history with token usage

IDs are client-generated UUIDs (`crypto.randomUUID()`). The `db-migrations.sql` is a no-op (`SELECT 1;`) because the platform doesn't support DDL — the gateway handles table creation automatically.

### Cron Flow

1. User sets schedule → `POST /api/schedule` creates a gateway cron task via `lib/task-sdk.ts`
2. Gateway fires `POST /api/cron/send-brief` at the scheduled time
3. Route reads preferences, checks if today is a scheduled day, generates brief, sends email, logs result

### Frontend (app/page.tsx)

Single-page client component (`'use client'`). DOMPurify is **lazy-loaded** (`await import("dompurify")`) to avoid SSR hydration crashes — do not change this to a static import.

### Deployment

- `output: 'standalone'` in next.config.js for Docker
- Multi-stage Dockerfile (Node 20-alpine)
- Deployed via Terminal AI MCP (`terminal-ai.config.json`)
- Platform currently serves HTTP only — HTTPS viewer embedding causes mixed-content blocking (known platform bug)

## Environment Variables

```
TERMINAL_AI_GATEWAY_URL   # Gateway base URL (required, server-side only)
TERMINAL_AI_APP_ID        # App identifier (required)
```

## Key Constraints

- All gateway SDK calls require the embed token — never call `db*`, `sendEmail`, `callGateway`, or task functions without it
- The gateway DB API doesn't support SQL migrations, custom tables, or DDL — use the REST SDK only
- Credit cost formula: `(searchCalls * 2) + 1` where searchCalls = (1 if tickers) + (number of presets)
