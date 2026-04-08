"use client";

import { useState, useCallback, useEffect } from "react";
import { useEmbedToken } from "@/hooks/use-embed-token";

type PresetType = "top_movers" | "stocks_to_watch" | "sector_pulse" | "earnings_radar" | "macro_dashboard";

interface TokenUsage {
  searchTokens: number;
  analysisTokens: number;
  totalCredits: number;
}

interface BriefResult {
  brief: string;
  htmlEmail: string;
  tokenUsage: TokenUsage;
}

const PRESETS: { id: PresetType; icon: string; name: string; desc: string }[] = [
  { id: "top_movers", icon: "\u{1F4C8}", name: "Top Movers", desc: "Biggest gainers & losers" },
  { id: "stocks_to_watch", icon: "\u{1F440}", name: "Stocks to Watch", desc: "Trending by volume & news" },
  { id: "sector_pulse", icon: "\u{1F3ED}", name: "Sector Pulse", desc: "11 GICS sectors at a glance" },
  { id: "earnings_radar", icon: "\u{1F4CA}", name: "Earnings Radar", desc: "Upcoming & recent surprises" },
  { id: "macro_dashboard", icon: "\u{1F30D}", name: "Macro Dashboard", desc: "Yields, VIX, DXY, commodities" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Australia/Sydney",
];

const POPULAR_TICKERS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "SPY", "QQQ", "BTC-USD"];

// Lazy-load DOMPurify to avoid SSR issues (it requires window/document)
async function sanitizeHtml(html: string): Promise<string> {
  if (typeof window === "undefined") return "";
  const DOMPurify = (await import("dompurify")).default;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "span", "div",
      "table", "thead", "tbody", "tr", "th", "td",
      "ul", "ol", "li", "strong", "em", "b", "i", "a", "img",
    ],
    ALLOWED_ATTR: ["style", "href", "src", "alt", "class", "colspan", "rowspan", "width"],
  });
}

export default function Home() {
  const embedToken = useEmbedToken();

  const [tickers, setTickers] = useState<string[]>([]);
  const [tickerInput, setTickerInput] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<PresetType[]>([]);
  const [scheduleDays, setScheduleDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [scheduleTime, setScheduleTime] = useState("08:00");
  const [timezone, setTimezone] = useState("America/New_York");
  const [isActive, setIsActive] = useState(false);

  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<BriefResult | null>(null);
  const [sanitizedPreview, setSanitizedPreview] = useState<string>("");
  const [showPreview, setShowPreview] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (!embedToken) return;
    fetch("/api/preferences", {
      headers: { Authorization: `Bearer ${embedToken}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.id) {
          setTickers(data.tickers ?? []);
          setSelectedPresets(data.presets ?? []);
          setScheduleDays(data.schedule_days ?? [1, 2, 3, 4, 5]);
          setScheduleTime(data.schedule_time ?? "08:00");
          setTimezone(data.timezone ?? "America/New_York");
          setIsActive(data.is_active ?? false);
        }
      })
      .catch(() => {});
  }, [embedToken]);

  const addTicker = useCallback(() => {
    const t = tickerInput.trim().toUpperCase();
    if (t && !tickers.includes(t)) {
      setTickers((prev) => [...prev, t]);
      setTickerInput("");
    }
  }, [tickerInput, tickers]);

  const removeTicker = useCallback((t: string) => {
    setTickers((prev) => prev.filter((x) => x !== t));
  }, []);

  const togglePreset = useCallback((id: PresetType) => {
    setSelectedPresets((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const toggleDay = useCallback((day: number) => {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }, []);

  const savePreferences = useCallback(async () => {
    if (!embedToken) return;
    setSaving(true);
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${embedToken}`,
        },
        body: JSON.stringify({
          tickers,
          presets: selectedPresets,
          schedule_days: scheduleDays,
          schedule_time: scheduleTime,
          timezone,
          is_active: true,
        }),
      });

      await fetch("/api/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${embedToken}`,
        },
        body: JSON.stringify({ schedule_time: scheduleTime, timezone }),
      });

      setIsActive(true);
      showToast("Schedule saved! Your market brief is active.");
    } catch {
      showToast("Failed to save preferences", "error");
    } finally {
      setSaving(false);
    }
  }, [embedToken, tickers, selectedPresets, scheduleDays, scheduleTime, timezone, showToast]);

  const generatePreview = useCallback(async () => {
    if (!embedToken) return;
    if (tickers.length === 0 && selectedPresets.length === 0) {
      showToast("Select at least one ticker or preset", "error");
      return;
    }
    setPreviewing(true);
    setShowPreview(true);
    setPreviewResult(null);
    try {
      const res = await fetch("/api/preview-brief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${embedToken}`,
        },
        body: JSON.stringify({ tickers, presets: selectedPresets }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreviewResult(data);
      const clean = await sanitizeHtml(data.htmlEmail);
      setSanitizedPreview(clean);
    } catch (err) {
      showToast(`Preview failed: ${err}`, "error");
      setShowPreview(false);
    } finally {
      setPreviewing(false);
    }
  }, [embedToken, tickers, selectedPresets, showToast]);

  const hasSelections = tickers.length > 0 || selectedPresets.length > 0;
  const searchCalls = (tickers.length > 0 ? 1 : 0) + selectedPresets.length;
  const totalCreditsPerRun = searchCalls * 2 + 1;

  return (
    <div className="app-container">
      {/* Navigation */}
      <nav className="nav animate-in">
        <div className="nav-brand">
          <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="28" height="28" rx="8" fill="#1a1a2e"/>
            <path d="M7 18L11 10L15 14L21 7" stroke="#48bb78" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M7 21H21" stroke="#48bb78" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
          </svg>
          Daily Market Signal
        </div>
        <div className="nav-links">
          <button className="nav-link active">Dashboard</button>
          <button
            className="nav-link"
            onClick={() => { if (hasSelections) generatePreview(); }}
          >
            Preview Brief
          </button>
          <span className="nav-link" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className={`status-dot ${isActive ? "status-active" : "status-inactive"}`} />
            {isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </nav>

      {/* Hero */}
      <div className="hero">
        <div className="greeting-card animate-in delay-1">
          <h1>Your Market Brief</h1>
          <p className="subtitle">
            AI-powered morning market intelligence, delivered to your inbox.
          </p>
          <div className="stat-highlight">
            {tickers.length + selectedPresets.length}
          </div>
          <p className="stat-label">signals configured</p>

          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <div style={{ padding: "12px 16px", background: "var(--accent-yellow-light)", borderRadius: "var(--radius-sm)", flex: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{tickers.length}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Tickers</div>
            </div>
            <div style={{ padding: "12px 16px", background: "var(--accent-green-light)", borderRadius: "var(--radius-sm)", flex: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{selectedPresets.length}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Presets</div>
            </div>
            <div style={{ padding: "12px 16px", background: "var(--accent-blue-light)", borderRadius: "var(--radius-sm)", flex: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{scheduleDays.length}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Days/week</div>
            </div>
          </div>
        </div>

        <div className="quick-panel animate-in delay-2">
          <div className="card-header">
            <span className="card-title">Quick Setup</span>
            <span className="card-badge badge-green">Presets</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
            Click to add popular tickers instantly
          </p>
          <div className="ticker-chips">
            {POPULAR_TICKERS.map((t) => (
              <button
                key={t}
                className="ticker-chip"
                style={{
                  cursor: "pointer",
                  background: tickers.includes(t) ? "var(--accent-green-light)" : undefined,
                  borderColor: tickers.includes(t) ? "var(--accent-green)" : undefined,
                }}
                onClick={() => {
                  if (tickers.includes(t)) removeTicker(t);
                  else setTickers((prev) => [...prev, t]);
                }}
              >
                {tickers.includes(t) ? "\u2713 " : "+"} {t}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="quick-panel-item" onClick={() => {
              setSelectedPresets(["top_movers", "macro_dashboard"]);
              setTickers(["SPY", "QQQ"]);
              showToast("Quick setup: Index tracker applied");
            }}>
              <span>&#9889;</span> Index Tracker — SPY, QQQ + Top Movers & Macro
            </div>
            <div className="quick-panel-item" onClick={() => {
              setSelectedPresets(["top_movers", "stocks_to_watch", "earnings_radar"]);
              showToast("Quick setup: Active Trader applied");
            }}>
              <span>&#128200;</span> Active Trader — Movers, Watch List & Earnings
            </div>
            <div className="quick-panel-item" onClick={() => {
              setSelectedPresets(PRESETS.map((p) => p.id));
              showToast("Quick setup: Full Brief applied");
            }}>
              <span>&#127775;</span> Full Brief — All 5 presets
            </div>
          </div>
        </div>
      </div>

      {/* Custom Tickers */}
      <div className="card animate-in delay-2" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="section-title">Custom Watchlist</span>
          {tickers.length > 0 && (
            <span className="card-badge badge-blue">{tickers.length} tickers</span>
          )}
        </div>
        <p className="section-subtitle">Add specific stocks, ETFs, or crypto tickers to track</p>
        <div className="ticker-chips">
          {tickers.map((t) => (
            <span key={t} className="ticker-chip">
              {t}
              <span className="remove" onClick={() => removeTicker(t)}>&times;</span>
            </span>
          ))}
        </div>
        <div className="ticker-input-wrapper">
          <input
            className="ticker-input"
            placeholder="Enter ticker symbol (e.g. AAPL, BTC-USD)"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTicker(); }}
          />
          <button className="btn btn-primary btn-sm" onClick={addTicker}>Add</button>
        </div>
      </div>

      {/* Presets */}
      <div className="card animate-in delay-3" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="section-title">Market Presets</span>
          {selectedPresets.length > 0 && (
            <span className="card-badge badge-green">{selectedPresets.length} selected</span>
          )}
        </div>
        <p className="section-subtitle">Choose AI-curated market intelligence sections</p>
        <div className="presets-grid">
          {PRESETS.map((p) => (
            <div
              key={p.id}
              className={`preset-card ${selectedPresets.includes(p.id) ? "selected" : ""}`}
              onClick={() => togglePreset(p.id)}
            >
              <div className="preset-icon">{p.icon}</div>
              <div className="preset-name">{p.name}</div>
              <div className="preset-desc">{p.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Schedule */}
      <div className="card animate-in delay-4" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="section-title">Delivery Schedule</span>
          <span className="card-badge badge-yellow">
            {scheduleTime} {timezone.split("/").pop()?.replace(/_/g, " ")}
          </span>
        </div>
        <p className="section-subtitle">Set when you want your market brief delivered</p>
        <div className="schedule-grid">
          <div>
            <label style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>Days of the week</label>
            <div className="schedule-days">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  className={`day-btn ${scheduleDays.includes(i) ? "selected" : ""}`}
                  onClick={() => toggleDay(i)}
                >
                  {d.charAt(0)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>Delivery time</label>
            <input type="time" className="time-input" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
            <select className="timezone-select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Credit estimate */}
      <div className="card animate-in delay-5" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="section-title">Estimated Cost Per Run</span>
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ padding: "16px 20px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Search calls (gpt-4o-search)</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{searchCalls} calls</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>x 2 credits = {searchCalls * 2} credits</div>
          </div>
          <div style={{ padding: "16px 20px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Analysis (deepseek-v3.2)</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>1 call</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>x 1 credit = 1 credit</div>
          </div>
          <div style={{ padding: "16px 20px", background: "var(--accent-green-light)", borderRadius: "var(--radius-sm)", flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 12, color: "#276749", marginBottom: 4 }}>Total per delivery</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#276749" }}>{totalCreditsPerRun} credits</div>
            <div style={{ fontSize: 12, color: "#276749" }}>
              {scheduleDays.length}x/week = {totalCreditsPerRun * scheduleDays.length} credits/week
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="actions-bar animate-in delay-5">
        <button className="btn btn-primary" onClick={generatePreview} disabled={!hasSelections || previewing}>
          {previewing ? <span className="spinner" /> : null}
          Preview Brief
        </button>
        <button className="btn btn-green" onClick={savePreferences} disabled={!hasSelections || saving}>
          {saving ? <span className="spinner" /> : null}
          {isActive ? "Update Schedule" : "Activate Schedule"}
        </button>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="preview-overlay" onClick={() => setShowPreview(false)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <h2>Email Preview</h2>
              <button className="preview-close" onClick={() => setShowPreview(false)}>&times;</button>
            </div>
            <div className="preview-body">
              {previewing ? (
                <div style={{ textAlign: "center", padding: 60 }}>
                  <div className="spinner spinner-dark" style={{ width: 40, height: 40 }} />
                  <p style={{ marginTop: 16, color: "var(--text-muted)" }}>Fetching live market data & generating brief...</p>
                  <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>Using gpt-4o-search for data, deepseek-v3.2 for analysis</p>
                </div>
              ) : previewResult ? (
                <div
                  className="email-preview-content"
                  dangerouslySetInnerHTML={{ __html: sanitizedPreview }}
                />
              ) : null}
            </div>
            {previewResult && !previewing && (
              <div className="preview-stats">
                <div className="preview-stat"><strong>Search tokens:</strong> {previewResult.tokenUsage.searchTokens.toLocaleString()}</div>
                <div className="preview-stat"><strong>Analysis tokens:</strong> {previewResult.tokenUsage.analysisTokens.toLocaleString()}</div>
                <div className="preview-stat"><strong>Total credits:</strong> {previewResult.tokenUsage.totalCredits}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
