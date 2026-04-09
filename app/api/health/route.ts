import { NextResponse } from "next/server";
export async function GET() {
  const gwUrl = process.env.TERMINAL_AI_GATEWAY_URL;
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    gateway_configured: !!gwUrl,
    gateway_prefix: gwUrl ? gwUrl.substring(0, 30) + "..." : "NOT SET",
    app_id: process.env.TERMINAL_AI_APP_ID ? "set" : "NOT SET",
  });
}
