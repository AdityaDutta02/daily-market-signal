import { NextRequest, NextResponse } from "next/server";
import {
  generatePresetSection,
  generateCompanySection,
  PresetType,
} from "@/lib/market-data";
import { wrapEmailHtml } from "@/lib/email-template";
import { sendEmail } from "@/lib/email-sdk";

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

  const sections: string[] = [];
  for (const preset of presets) {
    sections.push(await generatePresetSection(preset, embedToken));
  }
  for (const company of companies) {
    sections.push(await generateCompanySection(company, embedToken));
  }

  const date = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const html = wrapEmailHtml(sections, date);

  await sendEmail(
    "user",
    `Daily Market Signal - Preview - ${date}`,
    html,
    embedToken
  );

  return NextResponse.json({ html, date, sent: true });
}
