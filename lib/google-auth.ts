// lib/google-auth.ts
// Google OAuth2 JWT flow using Web Crypto (no external packages)

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function b64url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64urlBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function getGoogleAccessToken(): Promise<string> {
  const saRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saRaw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");

  const sa = JSON.parse(saRaw) as ServiceAccount;
  const privateKey = sa.private_key.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const signingInput = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${b64urlBuffer(signatureBuf)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const data = (await tokenRes.json()) as { access_token: string };
  return data.access_token;
}

/** Write values to a Google Sheet range via REST API */
export async function sheetsWrite(
  sheetId: string,
  range: string,
  values: string[][],
  accessToken: string
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheets write failed for ${range}: ${err}`);
  }
}

/** Add a new sheet tab (silently ignores "already exists" error) */
export async function sheetsAddTab(
  sheetId: string,
  tabName: string,
  accessToken: string
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: tabName } } }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (!body.includes("already exists")) {
      throw new Error(`Failed to add tab ${tabName}: ${body}`);
    }
  }
}
