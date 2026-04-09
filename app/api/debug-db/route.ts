import { NextRequest, NextResponse } from "next/server";
import { dbList, dbInsert } from "@/lib/db";

export async function GET(request: NextRequest) {
  const embedToken =
    request.headers.get("authorization")?.replace("Bearer ", "") ?? "";

  const results: Record<string, unknown> = { token_present: !!embedToken };

  // Test dbList
  try {
    const rows = await dbList("items", {}, embedToken);
    results.list_ok = true;
    results.list_count = rows.length;
  } catch (err) {
    results.list_ok = false;
    results.list_error = err instanceof Error ? err.message : String(err);
  }

  // Test dbInsert
  try {
    const row = await dbInsert(
      "items",
      { data: { type: "debug_test", ts: new Date().toISOString() } },
      embedToken
    );
    results.insert_ok = true;
    results.insert_result = row;
  } catch (err) {
    results.insert_ok = false;
    results.insert_error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(results);
}
