import { NextRequest, NextResponse } from "next/server";
import {
  generatePresetSection,
  generateCompanySection,
  PresetType,
} from "@/lib/market-data";
import { wrapEmailHtml } from "@/lib/email-template";
import { sendEmail } from "@/lib/email-sdk";
import { fetchSheetData } from "@/lib/sheet-data";

export async function POST(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const presets: PresetType[] = body.presets ?? [];
  const companies: string[] = body.companies ?? [];

  if (presets.length === 0 && companies.length === 0) {
    return NextResponse.json(
      { error: "Select at least one preset or company" },
      { status: 400 }
    );
  }

  try {
    const sheetData = await fetchSheetData();
    const sections: string[] = [];
    for (const preset of presets) {
      sections.push(await generatePresetSection(preset, embedToken, sheetData));
    }
    for (const company of companies) {
      sections.push(await generateCompanySection(company, embedToken, sheetData));
    }

    const date = new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const html = wrapEmailHtml(sections, date);

    await sendEmail(
      `Daily Market Signal - Preview - ${date}`,
      html,
      embedToken
    );

    return NextResponse.json({ html, date, sent: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
