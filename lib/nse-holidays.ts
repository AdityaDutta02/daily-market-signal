// Source: https://www.nseindia.com/resources/exchange-communication-holidays
// (Trading Holidays table). Verified 2026-05-29. Refresh annually.
const NSE_HOLIDAYS_2026: string[] = [
  "2026-01-15", // Municipal Corporation Election - Maharashtra
  "2026-01-26", // Republic Day
  "2026-03-03", // Holi
  "2026-03-26", // Shri Ram Navami
  "2026-03-31", // Shri Mahavir Jayanti
  "2026-04-03", // Good Friday
  "2026-04-14", // Dr. Baba Saheb Ambedkar Jayanti
  "2026-05-01", // Maharashtra Day
  "2026-05-28", // Bakri Id
  "2026-06-26", // Muharram
  "2026-09-14", // Ganesh Chaturthi
  "2026-10-02", // Mahatma Gandhi Jayanti
  "2026-10-20", // Dussehra
  "2026-11-10", // Diwali-Balipratipada
  "2026-11-24", // Prakash Gurpurb Sri Guru Nanak Dev
  "2026-12-25", // Christmas
];

const HOLIDAYS_BY_YEAR: Record<number, string[]> = {
  2026: NSE_HOLIDAYS_2026,
};

export function isMarketDay(date?: Date): boolean {
  const d = date ?? new Date();
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const iso = d.toISOString().split("T")[0];
  const year = d.getFullYear();
  const holidays = HOLIDAYS_BY_YEAR[year] ?? [];
  return !holidays.includes(iso);
}

export function getISTDate(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

export function getISTHour(): number {
  return getISTDate().getHours();
}

export function getTodayISO(): string {
  return getISTDate().toISOString().split("T")[0];
}
