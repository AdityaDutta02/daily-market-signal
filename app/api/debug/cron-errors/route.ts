import { NextRequest, NextResponse } from "next/server";
import { dbList } from "@/lib/db";

interface ItemRow {
  id: string;
  data: Record<string, unknown>;
}

export async function GET(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const errors = rows
    .filter((r) => r.data.type === "cron_error")
    .sort((a, b) =>
      String(b.data.ts ?? "").localeCompare(String(a.data.ts ?? "")),
    )
    .slice(0, 50)
    .map((r) => ({ id: r.id, ...r.data }));

  return NextResponse.json(errors);
}
