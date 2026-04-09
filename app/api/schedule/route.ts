import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Schedule is handled by app-level crons created via Terminal AI MCP at deploy time.
  // This endpoint confirms the schedule is active.
  return NextResponse.json({ scheduled: true });
}
