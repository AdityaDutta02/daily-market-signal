import { NextRequest, NextResponse } from "next/server";
import { validateTickers } from "@/lib/nse-tickers";

export async function POST(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const tickers: string[] = body.tickers ?? [];
  if (tickers.length === 0) {
    return NextResponse.json({ valid: [], invalid: [] });
  }

  const result = await validateTickers(tickers, embedToken);
  return NextResponse.json(result);
}
