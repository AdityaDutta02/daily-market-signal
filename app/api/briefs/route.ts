import { NextRequest, NextResponse } from "next/server";
import { dbList } from "@/lib/db";
import { getUserId } from "@/lib/token";

interface ItemRow {
  id: string;
  data: Record<string, unknown>;
}

export async function GET(request: NextRequest) {
  const embedToken = request.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!embedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getUserId(embedToken);
  const rows = await dbList<ItemRow>("items", {}, embedToken);
  const briefs = rows
    .filter((r) => r.data.type === "email_log" && r.data.user_id === userId)
    .sort((a, b) => {
      const aDate = a.data.sent_at as string;
      const bDate = b.data.sent_at as string;
      return bDate.localeCompare(aDate);
    })
    .slice(0, 30)
    .map((r) => ({
      id: r.id,
      presets: r.data.presets,
      companies: r.data.companies,
      sent_at: r.data.sent_at,
      brief_html: r.data.brief_html,
    }));

  return NextResponse.json(briefs);
}
