import { NextRequest, NextResponse } from "next/server";
import { getGoogleAccessToken, sheetsWrite } from "@/lib/google-auth";

export async function POST(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId)
    return NextResponse.json(
      { error: "GOOGLE_SHEET_ID not configured" },
      { status: 500 }
    );

  try {
    const accessToken = await getGoogleAccessToken();
    const timestamp = new Date().toISOString();
    await sheetsWrite(sheetId, "Meta!B1", [[timestamp]], accessToken);
    return NextResponse.json({ triggered: true, timestamp });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Log but return 200 — warmup failure must not block the 6 AM brief cron
    console.error("warmup-sheet failed:", message);
    return NextResponse.json({ triggered: false, error: message });
  }
}
