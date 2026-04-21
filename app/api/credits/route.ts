import { NextRequest, NextResponse } from "next/server";
import { getCredits, addCredits } from "@/lib/credits";

export async function GET(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const balance = await getCredits(embedToken);
  return NextResponse.json({ balance });
}

// Add credits (admin action — call from setup or Terminal AI MCP env injection)
export async function POST(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { amount } = await request.json() as { amount: number };
  if (!amount || amount <= 0)
    return NextResponse.json({ error: "amount must be positive" }, { status: 400 });

  const balance = await addCredits(amount, embedToken);
  return NextResponse.json({ balance });
}
