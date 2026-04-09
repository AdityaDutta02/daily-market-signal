const NSE_HOLIDAYS_2026: string[] = [
  "2026-01-26", // Republic Day
  "2026-03-10", // Holi
  "2026-03-31", // Id-Ul-Fitr
  "2026-04-02", // Ram Navami
  "2026-04-14", // Dr. Ambedkar Jayanti
  "2026-04-18", // Good Friday
  "2026-05-01", // Maharashtra Day
  "2026-06-07", // Eid-Ul-Adha
  "2026-07-07", // Muharram
  "2026-08-15", // Independence Day
  "2026-08-26", // Janmashtami
  "2026-09-05", // Milad-Un-Nabi
  "2026-10-02", // Mahatma Gandhi Jayanti
  "2026-10-20", // Dussehra
  "2026-10-21", // Dussehra (additional)
  "2026-11-09", // Diwali (Laxmi Pujan)
  "2026-11-10", // Diwali Balipratipada
  "2026-11-27", // Gurunanak Jayanti
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
