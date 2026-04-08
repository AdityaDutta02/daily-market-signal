import { NextRequest, NextResponse } from "next/server";
import { dbList, dbInsert, dbUpdate } from "@/lib/db";

interface UserPreference {
  id: string;
  tickers: string[];
  presets: string[];
  schedule_days: number[];
  schedule_time: string;
  timezone: string;
  is_active: boolean;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const prefs = await dbList<UserPreference>("user_preferences", {}, embedToken);
    return NextResponse.json(prefs[0] ?? null);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { tickers = [], presets = [], schedule_days = [1,2,3,4,5], schedule_time = "08:00", timezone = "America/New_York", is_active = true } = body;

  try {
    const existing = await dbList<UserPreference>("user_preferences", {}, embedToken);
    if (existing.length > 0) {
      const updated = await dbUpdate("user_preferences", existing[0].id, {
        tickers, presets, schedule_days, schedule_time, timezone, is_active,
      }, embedToken);
      return NextResponse.json(updated);
    }
    const created = await dbInsert("user_preferences", {
      tickers, presets, schedule_days, schedule_time, timezone, is_active,
    }, embedToken);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
