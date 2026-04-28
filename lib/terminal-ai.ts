const GATEWAY_URL = process.env.TERMINAL_AI_GATEWAY_URL!;

const NO_ADVICE_PREFIX = `CRITICAL RULE — NEVER VIOLATE: This is an informational market data brief. You MUST NOT use any investment recommendation language. Strictly forbidden words and phrases: buy, sell, hold, accumulate, add, trim, exit, avoid, overweight, underweight, long, short, position in, go long, go short, price target, target price, stop loss, take profit, profit-taking, entry point, initiate coverage. If you catch yourself about to write any of these, replace with observational language (e.g. "watch", "monitor", "levels to observe", "setup to track"). Violation of this rule is not acceptable under any circumstance.\n\n`;

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
  const json = await res.json();

  // Gateway may return content directly or in choices array
  if (json.choices?.[0]?.message?.content) {
    return json as GatewayResponse;
  }
  // Normalize: if response has a different shape, wrap it
  if (json.content) {
    return { choices: [{ message: { content: json.content } }] };
  }
  if (json.result) {
    return { choices: [{ message: { content: json.result } }] };
  }
  if (json.text) {
    return { choices: [{ message: { content: json.text } }] };
  }
  if (json.message?.content) {
    return { choices: [{ message: { content: json.message.content } }] };
  }
  // Last resort: stringify the whole response so we can debug
  throw new Error(`Unexpected gateway response shape: ${JSON.stringify(json).substring(0, 500)}`);
}

export async function analyzeWithDeepseek(
  systemPrompt: string,
  userPrompt: string,
  embedToken: string,
): Promise<GatewayResponse> {
  return callGateway({ category: "chat", tier: "fast" }, [
    { role: "system", content: NO_ADVICE_PREFIX + systemPrompt },
    { role: "user", content: userPrompt },
  ], embedToken);
}

export async function analyzeWithGemini(
  systemPrompt: string,
  userPrompt: string,
  embedToken: string,
): Promise<GatewayResponse> {
  // Try Gemini Flash for reasoning-heavy insight generation; fall back to Deepseek on error
  try {
    return await callGateway({ category: "reasoning", tier: "standard" }, [
      { role: "system", content: NO_ADVICE_PREFIX + systemPrompt },
      { role: "user", content: userPrompt },
    ], embedToken);
  } catch {
    return callGateway({ category: "chat", tier: "fast" }, [
      { role: "system", content: NO_ADVICE_PREFIX + systemPrompt },
      { role: "user", content: userPrompt },
    ], embedToken);
  }
}

export async function searchWeb(
  query: string,
  embedToken: string,
): Promise<GatewayResponse> {
  return callGateway({ category: "search", tier: "standard" }, [
    { role: "user", content: query },
  ], embedToken);
}
