import { NextRequest, NextResponse } from "next/server";
import { dbList, dbInsert } from "@/lib/db";
import { sendEmail } from "@/lib/email-sdk";
import { generateMarketBrief, PresetType } from "@/lib/market-data";

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
}

export async function POST(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await dbList<PrefRow>("user_preferences", {}, embedToken);

    if (rows.length === 0 || !rows[0].data.is_active) {
      return NextResponse.json({ skipped: true, reason: "No active preferences" });
    }

    const pref = rows[0].data;
    const today = new Date().getDay();

    if (!pref.schedule_days.includes(today)) {
      return NextResponse.json({ skipped: true, reason: "Not a scheduled day" });
    }

    const result = await generateMarketBrief({
      tickers: pref.tickers,
      presets: pref.presets as PresetType[],
      embedToken,
    });

    const date = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    await sendEmail(
      "user",
      `Daily Market Signal - ${date}`,
      result.htmlEmail,
      embedToken,
    );

    await dbInsert("email_logs", {
      data: {
        tickers: pref.tickers,
        presets: pref.presets,
        token_usage: result.tokenUsage,
        sent_at: new Date().toISOString(),
      },
    }, embedToken);

    return NextResponse.json({ sent: true, tokenUsage: result.tokenUsage });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
