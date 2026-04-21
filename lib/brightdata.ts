// lib/brightdata.ts
// Bright Data SERP API wrapper for supplementary market data.
// Endpoint and zone name verified against Bright Data dashboard.

const BD_URL = "https://api.brightdata.com/request";

interface SerpResult {
  title?: string;
  snippet?: string;
}

interface SerpJsonResponse {
  organic?: SerpResult[];
  organic_results?: SerpResult[];
}

async function serpSearch(query: string): Promise<string> {
  const apiKey = process.env.BRIGHT_DATA_API_KEY ?? "x4f50d3c4-c165-44b7-9615-aa7da71e58ff";
  const zone = process.env.BRIGHT_DATA_ZONE ?? "serp_api1";

  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&gl=in&hl=en`;

  const res = await fetch(BD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ zone, url: googleUrl, format: "json" }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bright Data SERP error ${res.status}: ${err}`);
  }

  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const data = (await res.json()) as SerpJsonResponse;
    const results = data.organic ?? data.organic_results ?? [];
    if (results.length === 0) return `No SERP results for: ${query}`;
    return results
      .map((r) => `${r.title ?? ""}: ${r.snippet ?? ""}`)
      .join("\n");
  }

  // Fallback: response is raw HTML — strip tags, pass text to AI
  const html = await res.text();
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
}

/** News and analyst notes for a batch of NSE tickers.
 *  Sends up to 10 tickers per SERP query to reduce API usage. */
export async function getStocksNews(tickers: string[]): Promise<string> {
  if (tickers.length === 0) return "";
  const batches: string[][] = [];
  for (let i = 0; i < tickers.length; i += 10) {
    batches.push(tickers.slice(i, i + 10));
  }
  const results = await Promise.all(
    batches.map((batch) =>
      serpSearch(
        `NSE India stocks news today ${batch.join(" ")} price movement analysis`
      )
    )
  );
  return results.join("\n---\n");
}

/** NSE stocks with unusual volume or strong momentum today. */
export async function getVolumeLeaders(): Promise<string> {
  return serpSearch(
    "NSE India stocks unusual volume momentum today top movers"
  );
}

/** NSE/BSE quarterly earnings results and upcoming schedule this week. */
export async function getEarningsCalendar(): Promise<string> {
  return serpSearch(
    "NSE BSE India Q4 FY2026 upcoming earnings results schedule next week"
  );
}

/** Key Indian macro indicators: FX, commodities, FII/DII flows. */
export async function getMacroData(): Promise<string> {
  return serpSearch(
    "India market INR USD rate Brent crude MCX gold price FII DII net flows today"
  );
}
