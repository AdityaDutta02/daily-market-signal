import { searchWeb, analyzeWithDeepseek } from "./terminal-ai";

export type PresetType = "top_movers" | "stocks_to_watch" | "sector_pulse" | "earnings_radar" | "macro_dashboard";

export interface MarketBriefRequest {
  tickers: string[];
  presets: PresetType[];
  embedToken: string;
}

export interface MarketBriefResult {
  brief: string;
  htmlEmail: string;
  tokenUsage: {
    searchTokens: number;
    analysisTokens: number;
    totalCredits: number;
  };
}

const PRESET_QUERIES: Record<PresetType, string> = {
  top_movers: "What are today's top 10 stock market gainers and losers by percentage? Include ticker, price, and % change.",
  stocks_to_watch: "What stocks are trending today based on unusual volume, momentum, and breaking news? List top 10 with reasons.",
  sector_pulse: "How are the 11 GICS sectors performing today? List each sector with % change and key drivers.",
  earnings_radar: "What major companies report earnings this week? Include any recent earnings surprises and their stock impact.",
  macro_dashboard: "What are today's key macro indicators? Include: S&P 500, Nasdaq, Dow levels/changes, 10-year Treasury yield, VIX, DXY dollar index, WTI oil price, Gold price, and any Fed commentary.",
};

export async function generateMarketBrief(req: MarketBriefRequest): Promise<MarketBriefResult> {
  const { tickers, presets, embedToken } = req;
  let totalSearchTokens = 0;
  let totalAnalysisTokens = 0;
  const searchResults: string[] = [];

  // Fetch data for custom tickers
  if (tickers.length > 0) {
    const tickerQuery = `Current stock prices, daily change %, and latest news for: ${tickers.join(", ")}. Include pre-market/after-hours if applicable.`;
    const tickerResult = await searchWeb(tickerQuery, embedToken);
    searchResults.push(`## Custom Watchlist\n${tickerResult.choices[0].message.content}`);
    totalSearchTokens += tickerResult.usage?.total_tokens ?? 0;
  }

  // Fetch data for each preset
  for (const preset of presets) {
    const query = PRESET_QUERIES[preset];
    const result = await searchWeb(query, embedToken);
    const label = preset.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    searchResults.push(`## ${label}\n${result.choices[0].message.content}`);
    totalSearchTokens += result.usage?.total_tokens ?? 0;
  }

  const rawData = searchResults.join("\n\n---\n\n");

  // Analyze and format with DeepSeek
  const analysisResult = await analyzeWithDeepseek(
    `You are an expert financial analyst writing a morning market brief email.
Format the data into a clean, professional email brief with:
- Executive summary (2-3 sentences)
- Each section with clear headers, tables where appropriate
- Key takeaways at the end
- Use bullet points for readability
- Include specific numbers, prices, percentages
- Add brief actionable insights
Return ONLY the email body content in clean HTML format suitable for email clients.
Use inline styles. Use a clean, modern design with:
- Font: system-ui, -apple-system, sans-serif
- Colors: #1a1a2e for text, #16213e for headers, #0f3460 for accents
- Light gray (#f5f5f5) backgrounds for data sections
- Clean tables with borders
Keep it professional but scannable.`,
    `Here is today's market data to analyze and format:\n\n${rawData}`,
    embedToken,
  );

  totalAnalysisTokens += analysisResult.usage?.total_tokens ?? 0;

  const htmlEmail = analysisResult.choices[0].message.content;

  // Credit calculation:
  // gpt-4o-search-preview: 2 credits per request
  // deepseek-v3.2: 1 credit per request
  const searchCalls = (tickers.length > 0 ? 1 : 0) + presets.length;
  const totalCredits = (searchCalls * 2) + 1; // search calls + 1 analysis call

  return {
    brief: rawData,
    htmlEmail,
    tokenUsage: {
      searchTokens: totalSearchTokens,
      analysisTokens: totalAnalysisTokens,
      totalCredits,
    },
  };
}
