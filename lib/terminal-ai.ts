const GATEWAY_URL = process.env.TERMINAL_AI_GATEWAY_URL!;

interface GatewayMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GatewayResponse {
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export async function callGateway(
  routing: { category: string; tier: string },
  messages: GatewayMessage[],
  embedToken: string,
): Promise<GatewayResponse> {
  if (!embedToken) throw new Error("Missing embed token");

  const res = await fetch(`${GATEWAY_URL}/v1/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${embedToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...routing, messages }),
  });

  if (res.status === 401) {
    throw Object.assign(
      new Error("Session expired"),
      { code: "TOKEN_EXPIRED", retryable: true },
    );
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gateway error ${res.status}: ${err}`);
  }
  return res.json() as Promise<GatewayResponse>;
}

export async function searchWeb(
  query: string,
  embedToken: string,
): Promise<GatewayResponse> {
  return callGateway({ category: "web_search", tier: "good" }, [
    { role: "system", content: "You are a financial data assistant specializing in Indian equity markets (NSE/BSE). Return accurate, current market data for Indian stocks. Include specific numbers, percentages, and prices in INR. Always cite your sources." },
    { role: "user", content: query },
  ], embedToken);
}

export async function analyzeWithDeepseek(
  systemPrompt: string,
  userPrompt: string,
  embedToken: string,
): Promise<GatewayResponse> {
  return callGateway({ category: "chat", tier: "fast" }, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], embedToken);
}
