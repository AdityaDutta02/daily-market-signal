import { NextRequest, NextResponse } from "next/server";
import { dbList } from "@/lib/db";
import { isMarketDay, getISTDate } from "@/lib/nse-holidays";
import {
  generatePresetSection,
  generateCompanySection,
  PresetType,
} from "@/lib/market-data";
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

  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const activeUsers = rows.filter(
    (r) =>
      r.data.type === "user_preferences" && r.data.is_active === true
  );

  if (activeUsers.length === 0) {
    return NextResponse.json({
      skipped: true,
      reason: "No active users",
    });
  }

  const presetSet = new Set<PresetType>();
  const companySet = new Set<string>();
  for (const user of activeUsers) {
    for (const p of (user.data.presets as PresetType[]) ?? []) {
      presetSet.add(p);
    }
    for (const c of (user.data.companies as string[]) ?? []) {
      companySet.add(c);
    }
  }

  const sheetData = await fetchSheetData();

  const presetResults: string[] = [];
  for (const presetId of presetSet) {
    await generatePresetSection(presetId, embedToken, sheetData);
    presetResults.push(presetId);
  }

  const companyResults: string[] = [];
  for (const ticker of companySet) {
    await generateCompanySection(ticker, embedToken, sheetData);
    companyResults.push(ticker);
  }

  return NextResponse.json({
    warmed: true,
    presets: presetResults,
    companies: companyResults,
  });
}
