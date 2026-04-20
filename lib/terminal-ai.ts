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
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], embedToken);
}

export async function searchWeb(
  query: string,
  embedToken: string,
): Promise<GatewayResponse> {
  return callGateway({ category: "search", tier: "standard" }, [
    { role: "user", content: query },
  ], embedToken);
}
