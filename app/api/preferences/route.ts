import { NextRequest, NextResponse } from "next/server";
import { dbList, dbInsert, dbUpdate } from "@/lib/db";

interface ItemRow {
  id: string;
  data: Record<string, unknown>;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await dbList<ItemRow>("items", {}, embedToken);
    const pref = rows.find((r) => r.data.type === "preferences");
    if (!pref) return NextResponse.json(null);
    return NextResponse.json({ id: pref.id, ...pref.data });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const data = {
    type: "preferences",
    tickers: body.tickers ?? [],
    presets: body.presets ?? [],
    schedule_days: body.schedule_days ?? [1, 2, 3, 4, 5],
    schedule_time: body.schedule_time ?? "08:00",
    timezone: body.timezone ?? "America/New_York",
    is_active: body.is_active ?? true,
  };

  try {
    const rows = await dbList<ItemRow>("items", {}, embedToken);
    const existing = rows.find((r) => r.data.type === "preferences");
    if (existing) {
      const updated = await dbUpdate("items", existing.id, { data }, embedToken);
      return NextResponse.json(updated);
    }
    const created = await dbInsert("items", { data }, embedToken);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
