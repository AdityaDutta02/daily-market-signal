import { NextRequest, NextResponse } from "next/server";
import { refreshMarketSnapshot } from "@/lib/market-snapshot";
import { isMarketDay, getISTDate } from "@/lib/nse-holidays";

export async function POST(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const istDate = getISTDate();
  if (!isMarketDay(istDate)) {
    return NextResponse.json({ skipped: true, reason: "Not a market day" });
  }

  try {
    const result = await refreshMarketSnapshot(embedToken);
    return NextResponse.json({
      ok: true,
      stocks: result.stocks,
      indices: result.indices,
      refreshedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
