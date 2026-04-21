import { NextRequest, NextResponse } from "next/server";
import { fetchSheetData } from "@/lib/sheet-data";

export async function GET(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = await fetchSheetData(embedToken);
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
