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
