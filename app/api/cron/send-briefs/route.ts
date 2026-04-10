import { NextRequest, NextResponse } from "next/server";
import { dbList, dbInsert } from "@/lib/db";
import { sendEmail } from "@/lib/email-sdk";
import { isMarketDay, getISTHour, getISTDate } from "@/lib/nse-holidays";
import {
  generatePresetSection,
  generateCompanySection,
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

  const currentHour = getISTHour();
  let rows: ItemRow[] = [];
  try {
    rows = await dbList<ItemRow>("items", {}, embedToken);
  } catch {
    return NextResponse.json({ skipped: true, reason: "No items table yet" });
  }
  const matchingUsers = rows.filter(
    (r) =>
      r.data.type === "user_preferences" &&
      r.data.is_active === true &&
      r.data.delivery_hour === currentHour
  );

  if (matchingUsers.length === 0) {
    return NextResponse.json({
      skipped: true,
      reason: "No users scheduled for this hour",
    });
  }

  const sent: string[] = [];
  for (const user of matchingUsers) {
    const presets = (user.data.presets as PresetType[]) ?? [];
    const companies = (user.data.companies as string[]) ?? [];
    const userId = user.data.user_id as string;

    const sheetData = await fetchSheetData();
    const sections: string[] = [];
    for (const preset of presets) {
      sections.push(await generatePresetSection(preset, embedToken, sheetData));
    }
    for (const company of companies) {
      sections.push(
        await generateCompanySection(company, embedToken, sheetData)
      );
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
      embedToken
    );

    await dbInsert(
      "items",
      {
        data: {
          type: "email_log",
          user_id: userId,
          presets,
          companies,
          brief_html: html,
          sent_at: new Date().toISOString(),
        },
      },
      embedToken
    );

    sent.push(userId);
  }

  return NextResponse.json({ sent: sent.length, users: sent });
}
