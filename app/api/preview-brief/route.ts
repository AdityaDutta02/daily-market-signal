import { NextRequest, NextResponse } from "next/server";
import {
  generatePresetSection,
  generateCompanySection,
  PresetType,
} from "@/lib/market-data";
import { wrapEmailHtml } from "@/lib/email-template";
import { sendEmail } from "@/lib/email-sdk";
import { fetchSheetData } from "@/lib/sheet-data";
import { checkAndDeductCredits, EMAIL_CREDIT_COST } from "@/lib/credits";

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
    // Deduct credits before generating — fails fast if insufficient
    await checkAndDeductCredits(embedToken);

    const sheetData = await fetchSheetData(embedToken);
    const sections: string[] = [];
    for (const preset of presets) {
      sections.push(await generatePresetSection(preset, embedToken, sheetData, true));
    }
    for (const company of companies) {
      sections.push(await generateCompanySection(company, embedToken, sheetData, true));
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

    return NextResponse.json({ html, date, sent: true, creditsUsed: EMAIL_CREDIT_COST });
  } catch (err) {
    const error = err as Error & { code?: string; status?: number };
    if (error.code === "INSUFFICIENT_CREDITS") {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }
    return NextResponse.json({ error: error.message ?? "Unknown error" }, { status: 500 });
  }
}
