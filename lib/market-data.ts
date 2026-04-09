import { searchWeb, analyzeWithDeepseek } from "./terminal-ai";
import {
  getCachedPreset,
  setCachedPreset,
  getCachedCompany,
  setCachedCompany,
} from "./cache";

export type PresetType =
  | "nifty_movers"
  | "stocks_to_watch"
  | "sectoral_pulse"
  | "earnings_radar"
  | "macro_dashboard";

export interface PresetInfo {
  id: PresetType;
  name: string;
  description: string;
}

export const PRESETS: PresetInfo[] = [
  { id: "nifty_movers", name: "Nifty/Sensex Movers", description: "Top gainers and losers today" },
  { id: "stocks_to_watch", name: "Stocks to Watch", description: "Trending by volume and news" },
  { id: "sectoral_pulse", name: "Sectoral Pulse", description: "Nifty sectoral index performance" },
  { id: "earnings_radar", name: "Earnings Radar", description: "Upcoming results and surprises" },
  { id: "macro_dashboard", name: "Macro Dashboard", description: "Key Indian macro indicators" },
];

const PRESET_QUERIES: Record<PresetType, string> = {
  nifty_movers: "Today's top 10 NSE Nifty 50 and Sensex stock gainers and losers by percentage change. Include ticker, price in INR, and % change.",
  stocks_to_watch: "Which stocks are trending on NSE today by unusual volume, momentum, and breaking news? List top 10 with reasons.",
  sectoral_pulse: "How are Nifty sectoral indices performing today? Include Bank Nifty, Nifty IT, Pharma, Auto, Metal, Energy, FMCG, Realty with % change and key drivers.",
  earnings_radar: "What major Indian companies report quarterly earnings this week? Include any recent earnings surprises and their stock impact on NSE.",
  macro_dashboard: "Today's key Indian market indicators: Nifty 50, Sensex levels and change, Bank Nifty, INR/USD exchange rate, RBI policy stance, Brent crude in INR, MCX Gold price, FII/DII flows.",
};

const SECTION_FORMAT_PROMPT = `You are an expert financial analyst writing a section of a morning Indian market brief email.
Format the data into clean HTML suitable for email clients.
Use inline styles only. Font: system-ui, -apple-system, sans-serif.
Colors: #1A1A1A for text, #5B5BD6 for accents, #2E7D32 for positive, #C62828 for negative.
Use tables with borders for data, bullet points for insights.
Keep it concise and scannable. Return ONLY the HTML section content, no wrapping body/html tags.`;

export async function generatePresetSection(
  presetId: PresetType,
  embedToken: string
): Promise<string> {
  const cached = await getCachedPreset(presetId, embedToken);
  if (cached) return cached.html_section;

  const query = PRESET_QUERIES[presetId];
  const searchResult = await searchWeb(query, embedToken);
  const searchData = searchResult.choices[0].message.content;

  const label = PRESETS.find((p) => p.id === presetId)?.name ?? presetId;
  const analysisResult = await analyzeWithDeepseek(
    SECTION_FORMAT_PROMPT,
    `Format this "${label}" data into an HTML section with a heading:\n\n${searchData}`,
    embedToken
  );
  const htmlSection = analysisResult.choices[0].message.content;

  await setCachedPreset(presetId, htmlSection, searchData, embedToken);
  return htmlSection;
}

export async function generateCompanySection(
  ticker: string,
  embedToken: string
): Promise<string> {
  const cached = await getCachedCompany(ticker, embedToken);
  if (cached) return cached.html_section;

  const searchResult = await searchWeb(
    `Current NSE stock price, daily change percentage, recent news, and analyst outlook for ${ticker}. Include price in INR.`,
    embedToken
  );
  const searchData = searchResult.choices[0].message.content;

  const analysisResult = await analyzeWithDeepseek(
    SECTION_FORMAT_PROMPT,
    `Format this data for "${ticker}" into a compact HTML section:\n\n${searchData}`,
    embedToken
  );
  const htmlSection = analysisResult.choices[0].message.content;

  await setCachedCompany(ticker, htmlSection, searchData, embedToken);
  return htmlSection;
}
