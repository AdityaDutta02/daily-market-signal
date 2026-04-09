export function getUserId(embedToken: string): string {
  try {
    const payload = JSON.parse(
      Buffer.from(embedToken.split(".")[1], "base64").toString()
    );
    return payload.userId ?? payload.user_id ?? "anonymous";
  } catch {
    return "anonymous";
  }
}
