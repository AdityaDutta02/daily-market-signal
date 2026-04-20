// lib/macro-fetch.ts
// Fetches live FX and commodity data from Yahoo Finance public API.
// No API key required. Timeout: 5s per symbol.

export interface MacroIndicator {
  label: string;
  value: string;
  change: string;
  changePct: number;
  source: string;
}

async function fetchYahoo(symbol: string): Promise<{ price: number; change: number; changePct: number } | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketBrief/1.0)" },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; chartPreviousClose?: number } }> };
    };
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const prev  = meta.chartPreviousClose ?? price;
    const change    = price - prev;
    const changePct = prev !== 0 ? (change / prev) * 100 : 0;
    return { price, change, changePct };
  } catch {
    return null;
  }
}

function fmtChange(change: number, changePct: number, prefix = ""): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${prefix}${Math.abs(change).toFixed(2)} (${sign}${changePct.toFixed(2)}%)`;
}

export async function fetchMacroIndicators(): Promise<MacroIndicator[]> {
  const [inrUsd, brent, gold, silver] = await Promise.allSettled([
    fetchYahoo("USDINR=X"),
    fetchYahoo("BZ=F"),
    fetchYahoo("GC=F"),
    fetchYahoo("SI=F"),
  ]);

  const indicators: MacroIndicator[] = [];

  const usd = inrUsd.status === "fulfilled" ? inrUsd.value : null;
  if (usd) {
    indicators.push({
      label: "INR / USD",
      value: `₹${usd.price.toFixed(2)}`,
      change: fmtChange(usd.change, usd.changePct, "₹"),
      changePct: usd.changePct,
      source: "Yahoo Finance",
    });
  }

  const br = brent.status === "fulfilled" ? brent.value : null;
  if (br) {
    indicators.push({
      label: "Brent Crude",
      value: `$${br.price.toFixed(2)}/bbl`,
      change: fmtChange(br.change, br.changePct, "$"),
      changePct: br.changePct,
      source: "Yahoo Finance",
    });
  }

  const gd = gold.status === "fulfilled" ? gold.value : null;
  if (gd) {
    indicators.push({
      label: "COMEX Gold",
      value: `$${gd.price.toFixed(0)}/oz`,
      change: fmtChange(gd.change, gd.changePct, "$"),
      changePct: gd.changePct,
      source: "Yahoo Finance",
    });
  }

  const sv = silver.status === "fulfilled" ? silver.value : null;
  if (sv) {
    indicators.push({
      label: "COMEX Silver",
      value: `$${sv.price.toFixed(2)}/oz`,
      change: fmtChange(sv.change, sv.changePct, "$"),
      changePct: sv.changePct,
      source: "Yahoo Finance",
    });
  }

  return indicators;
}
