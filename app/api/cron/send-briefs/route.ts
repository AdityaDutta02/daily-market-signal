import { NextRequest, NextResponse } from "next/server";
import { dbList, dbInsert } from "@/lib/db";
import { sendEmail } from "@/lib/email-sdk";
import { isMarketDay, getISTDate } from "@/lib/nse-holidays";
import {
  generatePresetSection,
  generateTop3MoversSection,
  PresetType,
} from "@/lib/market-data";
import { wrapEmailHtml } from "@/lib/email-template";
import { fetchSheetData } from "@/lib/sheet-data";

interface ItemRow {
  id: string;
  data: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const istDate = getISTDate();
  if (!isMarketDay(istDate)) {
    return NextResponse.json({
      skipped: true,
      reason: "Not a market day",
    });
  }

  let rows: ItemRow[] = [];
  try {
    rows = await dbList<ItemRow>("items", {}, embedToken);
  } catch {
    return NextResponse.json({ skipped: true, reason: "No items table yet" });
  }
  const matchingUsers = rows.filter(
    (r) =>
      r.data.type === "user_preferences" &&
      r.data.is_active === true
  );

  if (matchingUsers.length === 0) {
    return NextResponse.json({
      skipped: true,
      reason: "No active subscribers",
    });
  }

  const sent: string[] = [];
  const skipped: string[] = [];

  let sheetData: Awaited<ReturnType<typeof fetchSheetData>>;
  let top3Section: string;
  try {
    sheetData = await fetchSheetData(embedToken);
    top3Section = await generateTop3MoversSection(embedToken, sheetData);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await dbInsert(
      "items",
      {
        data: {
          type: "cron_error",
          source: "send-briefs:prelude",
          message,
          ts: new Date().toISOString(),
        },
      },
      embedToken,
    ).catch(() => {});
    return NextResponse.json(
      { error: `prelude failed: ${message}` },
      { status: 200 }, // 200 so the gateway doesn't mark the cron failed and hide the body
    );
  }

  const errors: string[] = [];

  for (const user of matchingUsers) {
    const userId = user.data.user_id as string;
    try {
      const presets = (user.data.presets as PresetType[]) ?? [];
      const sections: string[] = [top3Section];
      for (const preset of presets) {
        sections.push(await generatePresetSection(preset, embedToken, sheetData));
      }

      const date = istDate.toLocaleDateString("en-IN", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const html = wrapEmailHtml(sections, date);

      await sendEmail(
        `Daily Market Signal - ${date}`,
        html,
        embedToken,
        { recipientUserId: userId },
      );

      await dbInsert(
        "items",
        {
          data: {
            type: "email_log",
            user_id: userId,
            presets,
            brief_html: html,
            sent_at: new Date().toISOString(),
          },
        },
        embedToken,
      );

      sent.push(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${userId}: ${message}`);
      // Persist for post-mortem since runtime logs are not retrievable.
      try {
        await dbInsert(
          "items",
          {
            data: {
              type: "cron_error",
              source: "send-briefs",
              user_id: userId,
              message,
              ts: new Date().toISOString(),
            },
          },
          embedToken,
        );
      } catch {
        // Swallow secondary failure; primary error already captured in response.
      }
    }
  }

  return NextResponse.json({ sent: sent.length, users: sent, skipped, errors });
}
