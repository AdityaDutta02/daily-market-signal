import { NextRequest, NextResponse } from "next/server";
import { dbList, dbInsert, dbUpdate } from "@/lib/db";
import { getUserId } from "@/lib/token";

interface ItemRow {
  id: string;
  data: Record<string, unknown>;
}

const VALID_PRESETS = new Set([
  "nifty_movers", "stocks_to_watch", "sectoral_pulse",
  "earnings_radar", "macro_dashboard",
]);

export async function GET(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const userId = getUserId(embedToken);
    let rows: ItemRow[] = [];
    try {
      rows = await dbList<ItemRow>("items", {}, embedToken);
    } catch {
      // Table may not exist yet on fresh deploy — treat as empty
    }
    const pref = rows.find(
      (r) => r.data.type === "user_preferences" && r.data.user_id === userId
    );
    if (!pref) return NextResponse.json(null);
    return NextResponse.json({ id: pref.id, ...pref.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const userId = getUserId(embedToken);
    const body = await request.json();

    const presets = (body.presets ?? []).filter((p: string) => VALID_PRESETS.has(p));
    if (presets.length > 2) {
      return NextResponse.json({ error: "Maximum 2 presets allowed" }, { status: 400 });
    }
    const companies = (body.companies ?? []).slice(0, 3).map((c: string) => c.trim().toUpperCase());
    const deliveryHour = Math.min(10, Math.max(6, body.delivery_hour ?? 8));

    const data = {
      type: "user_preferences",
      user_id: userId,
      presets,
      companies,
      delivery_hour: deliveryHour,
      schedule_days: body.schedule_days ?? [1, 2, 3, 4, 5],
      is_active: body.is_active ?? true,
      setup_complete: body.setup_complete ?? true,
    };

    let existing: ItemRow | undefined;
    try {
      const rows = await dbList<ItemRow>("items", {}, embedToken);
      existing = rows.find(
        (r) => r.data.type === "user_preferences" && r.data.user_id === userId
      );
    } catch {
      // Table may not exist yet — will be created by insert
    }
    if (existing) {
      const updated = await dbUpdate("items", existing.id, { data }, embedToken);
      return NextResponse.json(updated);
    }
    const created = await dbInsert("items", { data }, embedToken);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
