const GATEWAY = process.env.TERMINAL_AI_GATEWAY_URL!;

interface SendEmailOptions {
  // Cron fan-out: deliver to a specific user instead of the token holder.
  // Only honoured by the gateway when the token is a task execution token —
  // interactive embed tokens get 403.
  recipientUserId?: string;
}

export async function sendEmail(
  subject: string,
  html: string,
  token: string,
  options?: SendEmailOptions,
): Promise<{ sent: boolean; messageId: string }> {
  const body: Record<string, unknown> = { subject, html };
  if (options?.recipientUserId) body.recipientUserId = options.recipientUserId;

  const res = await fetch(`${GATEWAY}/email/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Email send failed (${res.status}): ${(err as Record<string, string>).error ?? res.statusText}`);
  }
  return res.json();
}
