import { NextRequest, NextResponse } from "next/server";
import { generateMarketBrief, PresetType } from "@/lib/market-data";

export async function POST(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { tickers = [], presets = [] } = body as { tickers: string[]; presets: PresetType[] };

  if (tickers.length === 0 && presets.length === 0) {
    return NextResponse.json({ error: "Select at least one ticker or preset" }, { status: 400 });
  }

  try {
    const result = await generateMarketBrief({ tickers, presets, embedToken });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
