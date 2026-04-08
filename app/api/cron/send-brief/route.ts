import { NextRequest, NextResponse } from "next/server";
import { dbList, dbInsert } from "@/lib/db";
import { sendEmail } from "@/lib/email-sdk";
import { generateMarketBrief, PresetType } from "@/lib/market-data";

interface ItemRow {
  id: string;
  data: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await dbList<ItemRow>("items", {}, embedToken);
    const prefRow = rows.find((r) => r.data.type === "preferences");

    if (!prefRow || !prefRow.data.is_active) {
      return NextResponse.json({ skipped: true, reason: "No active preferences" });
    }

    const pref = prefRow.data;
    const today = new Date().getDay();
    const scheduleDays = pref.schedule_days as number[];

    if (!scheduleDays.includes(today)) {
      return NextResponse.json({ skipped: true, reason: "Not a scheduled day" });
    }

    const result = await generateMarketBrief({
      tickers: pref.tickers as string[],
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

    await dbInsert("items", {
      data: {
        type: "email_log",
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
