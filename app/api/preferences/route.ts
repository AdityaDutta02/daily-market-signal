import { NextRequest, NextResponse } from "next/server";
import { dbList, dbInsert, dbUpdate } from "@/lib/db";

interface PrefRow {
  id: string;
  data: {
    tickers: string[];
    presets: string[];
    schedule_days: number[];
    schedule_time: string;
    timezone: string;
    is_active: boolean;
  };
  created_at: string;
}

export async function GET(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await dbList<PrefRow>("user_preferences", {}, embedToken);
    if (rows.length === 0) return NextResponse.json(null);
    return NextResponse.json({ id: rows[0].id, ...rows[0].data });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const data = {
    tickers: body.tickers ?? [],
    presets: body.presets ?? [],
    schedule_days: body.schedule_days ?? [1, 2, 3, 4, 5],
    schedule_time: body.schedule_time ?? "08:00",
    timezone: body.timezone ?? "America/New_York",
    is_active: body.is_active ?? true,
  };

  try {
    const existing = await dbList<PrefRow>("user_preferences", {}, embedToken);
    if (existing.length > 0) {
      const updated = await dbUpdate("user_preferences", existing[0].id, { data }, embedToken);
      return NextResponse.json(updated);
    }
    const created = await dbInsert("user_preferences", { data }, embedToken);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
