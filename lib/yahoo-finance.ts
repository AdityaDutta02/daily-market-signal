// lib/yahoo-finance.ts
// Yahoo Finance v8/chart per-symbol fetch — proven reliable for server-side use.
// Used by both sheet-data (live fallback) and market-snapshot (scheduled refresh).

export interface QuoteData {
  close: number;
  changePct: number;
}

export async function fetchYahooV8(symbol: string): Promise<QuoteData | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketBrief/1.0)" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            chartPreviousClose?: number;
            regularMarketChangePercent?: number;
          };
        }>;
      };
    };
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const close = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? close;
    const changePct =
      meta.regularMarketChangePercent ??
      (prev !== 0 ? ((close - prev) / prev) * 100 : 0);
    return { close, changePct };
  } catch {
    return null;
  }
}

export const NIFTY50_MAP: Array<{ yahoo: string; nse: string }> = [
  { yahoo: "ADANIENT.NS",  nse: "ADANIENT"  },
  { yahoo: "ADANIPORTS.NS", nse: "ADANIPORTS" },
  { yahoo: "APOLLOHOSP.NS", nse: "APOLLOHOSP" },
  { yahoo: "ASIANPAINT.NS", nse: "ASIANPAINT" },
  { yahoo: "AXISBANK.NS",  nse: "AXISBANK"   },
  { yahoo: "BAJAJ-AUTO.NS", nse: "BAJAJ-AUTO" },
  { yahoo: "BAJFINANCE.NS", nse: "BAJFINANCE" },
  { yahoo: "BAJAJFINSV.NS", nse: "BAJAJFINSV" },
  { yahoo: "BPCL.NS",      nse: "BPCL"       },
  { yahoo: "BHARTIARTL.NS", nse: "BHARTIARTL" },
  { yahoo: "BRITANNIA.NS",  nse: "BRITANNIA"  },
  { yahoo: "CIPLA.NS",     nse: "CIPLA"      },
  { yahoo: "COALINDIA.NS",  nse: "COALINDIA"  },
  { yahoo: "DIVISLAB.NS",   nse: "DIVISLAB"   },
  { yahoo: "DRREDDY.NS",    nse: "DRREDDY"    },
  { yahoo: "EICHERMOT.NS",  nse: "EICHERMOT"  },
  { yahoo: "GRASIM.NS",    nse: "GRASIM"     },
  { yahoo: "HCLTECH.NS",   nse: "HCLTECH"    },
  { yahoo: "HDFCBANK.NS",  nse: "HDFCBANK"   },
  { yahoo: "HDFCLIFE.NS",  nse: "HDFCLIFE"   },
  { yahoo: "HEROMOTOCO.NS", nse: "HEROMOTOCO" },
  { yahoo: "HINDALCO.NS",  nse: "HINDALCO"   },
  { yahoo: "HINDUNILVR.NS", nse: "HINDUNILVR" },
  { yahoo: "ICICIBANK.NS",  nse: "ICICIBANK"  },
  { yahoo: "INDUSINDBK.NS", nse: "INDUSINDBK" },
  { yahoo: "INFY.NS",      nse: "INFY"       },
  { yahoo: "ITC.NS",       nse: "ITC"        },
  { yahoo: "JSWSTEEL.NS",  nse: "JSWSTEEL"   },
  { yahoo: "KOTAKBANK.NS",  nse: "KOTAKBANK"  },
  { yahoo: "LT.NS",        nse: "LT"         },
  { yahoo: "LTIM.NS",      nse: "LTIM"       },
  { yahoo: "M%26M.NS",     nse: "M&M"        },
  { yahoo: "MARUTI.NS",    nse: "MARUTI"     },
  { yahoo: "NESTLEIND.NS",  nse: "NESTLEIND"  },
  { yahoo: "NTPC.NS",      nse: "NTPC"       },
  { yahoo: "ONGC.NS",      nse: "ONGC"       },
  { yahoo: "POWERGRID.NS",  nse: "POWERGRID"  },
  { yahoo: "RELIANCE.NS",  nse: "RELIANCE"   },
  { yahoo: "SBILIFE.NS",   nse: "SBILIFE"    },
  { yahoo: "SBIN.NS",      nse: "SBIN"       },
  { yahoo: "SUNPHARMA.NS",  nse: "SUNPHARMA"  },
  { yahoo: "TATACONSUM.NS", nse: "TATACONSUM" },
  { yahoo: "TATAMOTORS.NS", nse: "TATAMOTORS" },
  { yahoo: "TATASTEEL.NS",  nse: "TATASTEEL"  },
  { yahoo: "TCS.NS",       nse: "TCS"        },
  { yahoo: "TECHM.NS",     nse: "TECHM"      },
  { yahoo: "TITAN.NS",     nse: "TITAN"      },
  { yahoo: "TRENT.NS",     nse: "TRENT"      },
  { yahoo: "ULTRACEMCO.NS", nse: "ULTRACEMCO" },
  { yahoo: "WIPRO.NS",     nse: "WIPRO"      },
];

export const INDEX_MAP: Array<{ yahoo: string; name: string }> = [
  { yahoo: "^NSEI",       name: "Nifty 50"     },
  { yahoo: "^BSESN",      name: "Sensex"       },
  { yahoo: "^NSEBANK",    name: "Bank Nifty"   },
  { yahoo: "^CNXIT",      name: "Nifty IT"     },
  { yahoo: "^CNXPHARMA",  name: "Nifty Pharma" },
  { yahoo: "^CNXAUTO",    name: "Nifty Auto"   },
  { yahoo: "^CNXMETAL",   name: "Nifty Metal"  },
  { yahoo: "^CNXENERGY",  name: "Nifty Energy" },
  { yahoo: "^CNXFMCG",    name: "Nifty FMCG"  },
  { yahoo: "^CNXREALTY",  name: "Nifty Realty" },
];

export async function fetchAllNiftyStocks(): Promise<Map<string, QuoteData>> {
  const results = await Promise.allSettled(
    NIFTY50_MAP.map(async ({ yahoo, nse }) => ({ nse, data: await fetchYahooV8(yahoo) }))
  );
  const map = new Map<string, QuoteData>();
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.data) {
      map.set(r.value.nse, r.value.data);
    }
  }
  return map;
}

export async function fetchAllIndices(): Promise<Map<string, QuoteData>> {
  const results = await Promise.allSettled(
    INDEX_MAP.map(async ({ yahoo, name }) => ({ name, data: await fetchYahooV8(yahoo) }))
  );
  const map = new Map<string, QuoteData>();
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.data) {
      map.set(r.value.name, r.value.data);
    }
  }
  return map;
}
