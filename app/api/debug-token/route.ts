import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "No token" }, { status: 401 });

  try {
    const parts = embedToken.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    // Redact sensitive fields but show keys and email-related values
    const safePayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (key.toLowerCase().includes("email") || key === "sub" || key.toLowerCase().includes("user")) {
        safePayload[key] = value;
      } else {
        safePayload[key] = `[${typeof value}]`;
      }
    }
    return NextResponse.json({ keys: Object.keys(payload), safePayload });
  } catch (err) {
    return NextResponse.json({ error: "Failed to parse token", detail: String(err) });
  }
}
