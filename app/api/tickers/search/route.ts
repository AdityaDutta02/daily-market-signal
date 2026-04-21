import { NextRequest, NextResponse } from "next/server";
import { getTickerList, searchTickers } from "@/lib/nse-tickers";

export async function GET(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (!query.trim()) return NextResponse.json([]);

  const symbols = await getTickerList(embedToken);
  const results = searchTickers(query, symbols);
  return NextResponse.json({ results });
}
