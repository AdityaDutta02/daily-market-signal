const GATEWAY = process.env.TERMINAL_AI_GATEWAY_URL!;

/** Send an email to the authenticated user. The gateway resolves the recipient
 *  email from the embed token — apps never see the user's email address. */
export async function sendEmail(
  subject: string,
  html: string,
  embedToken: string,
): Promise<{ sent: boolean; messageId: string }> {
  const res = await fetch(`${GATEWAY}/email/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${embedToken}`,
    },
    body: JSON.stringify({ subject, html }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Email send failed (${res.status}): ${(err as Record<string, string>).error ?? res.statusText}`);
  }
  return res.json();
}
