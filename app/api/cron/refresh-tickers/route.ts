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
