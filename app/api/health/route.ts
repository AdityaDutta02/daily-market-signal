import { NextResponse } from "next/server";

export async function GET() {
  const gatewayUrl = process.env.TERMINAL_AI_GATEWAY_URL;
  const appId = process.env.TERMINAL_AI_APP_ID;

  let gatewayReachable = false;
  let gatewayError = "";
  if (gatewayUrl) {
    try {
      const res = await fetch(`${gatewayUrl}/db/items?limit=1`, {
        headers: { "x-app-id": appId ?? "" },
        signal: AbortSignal.timeout(5000),
      });
      gatewayReachable = true;
      gatewayError = `status=${res.status}`;
    } catch (err) {
      gatewayError = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    gateway_url_set: !!gatewayUrl,
    gateway_url_prefix: gatewayUrl?.substring(0, 30),
    app_id_set: !!appId,
    gateway_reachable: gatewayReachable,
    gateway_error: gatewayError,
  });
}
