import { NextRequest, NextResponse } from "next/server";
import { dbList } from "@/lib/db";
import { sendEmail } from "@/lib/email-sdk";
import { generateMarketBrief, PresetType } from "@/lib/market-data";

interface UserPreference {
  id: string;
  tickers: string[];
  presets: string[];
  schedule_days: number[];
  schedule_time: string;
  timezone: string;
  is_active: boolean;
}

export async function POST(request: NextRequest) {
  // Cron callbacks receive a short-lived token in the Authorization header
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const prefs = await dbList<UserPreference>("user_preferences", {}, embedToken);

    if (prefs.length === 0 || !prefs[0].is_active) {
      return NextResponse.json({ skipped: true, reason: "No active preferences" });
    }

    const pref = prefs[0];
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
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });

    await sendEmail(
      "user",
      `Daily Market Signal - ${date}`,
      result.htmlEmail,
      embedToken,
    );

    // Log the send
    const { dbInsert } = await import("@/lib/db");
    await dbInsert("email_logs", {
      tickers: pref.tickers,
      presets: pref.presets,
      token_usage: result.tokenUsage,
      sent_at: new Date().toISOString(),
    }, embedToken);

    return NextResponse.json({
      sent: true,
      tokenUsage: result.tokenUsage,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
