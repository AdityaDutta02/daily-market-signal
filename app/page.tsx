"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useEmbedToken } from "@/hooks/use-embed-token";
import {
  CheckCircle,
  X,
  ArrowClockwise,
  EnvelopeSimple,
  PencilSimple,
  ChartLineUp,
  CaretRight,
} from "@phosphor-icons/react";

type PresetType = "nifty_movers" | "stocks_to_watch" | "sectoral_pulse" | "earnings_radar" | "macro_dashboard";

interface Prefs {
  id?: string;
  presets: PresetType[];
  companies: string[];
  delivery_hour: number;
  schedule_days: number[];
  is_active: boolean;
  setup_complete: boolean;
}

interface Brief {
  id: string;
  data: { presets: PresetType[]; companies: string[]; brief_html: string; sent_at: string };
}

const PRESETS: { id: PresetType; name: string; description: string }[] = [
  { id: "nifty_movers",     name: "Nifty/Sensex Movers",   description: "Top gainers and losers today" },
  { id: "stocks_to_watch",  name: "Stocks to Watch",        description: "Trending by volume and news" },
  { id: "sectoral_pulse",   name: "Sectoral Pulse",         description: "Nifty sectoral index performance" },
  { id: "earnings_radar",   name: "Earnings Radar",         description: "Upcoming results and surprises" },
  { id: "macro_dashboard",  name: "Macro Dashboard",        description: "Key Indian macro indicators" },
];

const HOURS = [6, 7, 8, 9, 10];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ah(token: string) { return { Authorization: "Bearer " + token, "Content-Type": "application/json" }; }
function fmtHour(h: number) { return h + " AM"; }
function fmtDays(days: number[]) { return days.map((d) => DAY_LABELS[d]).join(", "); }
function presetName(id: PresetType) { return PRESETS.find((p) => p.id === id)?.name ?? id; }

// All HTML rendered via this function is sanitized with DOMPurify before storage in state.
async function sanitizeHtml(html: string): Promise<string> {
  if (typeof window === "undefined") return "";
  const DOMPurify = (await import("dompurify")).default;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["h1","h2","h3","h4","h5","h6","p","br","hr","span","div","table","thead","tbody","tr","th","td","ul","ol","li","strong","em","b","i","a","img"],
    ALLOWED_ATTR: ["style","href","src","alt","class","colspan","rowspan","width"],
  });
}

function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const show = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  return { toast, show };
}

function PresetGrid({ selected, onToggle }: { selected: PresetType[]; onToggle: (id: PresetType) => void }) {
  return (
    <div className="preset-grid">
      {PRESETS.map((p) => (
        <div key={p.id} className={`preset-card${selected.includes(p.id) ? " selected" : ""}`} onClick={() => onToggle(p.id)}>
          {selected.includes(p.id) && (
            <div className="preset-check">
              <CheckCircle weight="fill" size={17} />
            </div>
          )}
          <div className="preset-name">{p.name}</div>
          <div className="preset-desc">{p.description}</div>
        </div>
      ))}
    </div>
  );
}

function TimeDay({ hour, days, onHour, onDay }: { hour: number; days: number[]; onHour: (h: number) => void; onDay: (d: number) => void }) {
  return (
    <>
      <p className="section-label">Time (IST)</p>
      <div className="time-selector" style={{ marginBottom: 18 }}>
        {HOURS.map((h) => (
          <div key={h} className={`time-option${h === hour ? " selected" : ""}`} onClick={() => onHour(h)}>{fmtHour(h)}</div>
        ))}
      </div>
      <p className="section-label">Days</p>
      <div className="day-selector">
        {[1,2,3,4,5,6].map((d) => (
          <button key={d} className={`day-btn${days.includes(d) ? " selected" : ""}`} onClick={() => onDay(d)}>{DAY_LABELS[d]}</button>
        ))}
      </div>
    </>
  );
}

function TickerInput({ companies, onAdd, onRemove, token }: { companies: string[]; onAdd: (c: string) => void; onRemove: (c: string) => void; token: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    debRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tickers/search?q=${encodeURIComponent(query)}`, { headers: ah(token) });
        const data = await res.json();
        setResults(data.results ?? []); setOpen(true);
      } catch { setResults([]); }
    }, 200);
  }, [query, token]);

  function pick(c: string) { if (!companies.includes(c)) onAdd(c); setQuery(""); setResults([]); setOpen(false); }

  return (
    <div className="autocomplete-wrapper">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: companies.length > 0 ? 8 : 0 }}>
        {companies.map((c) => (
          <span key={c} className="chip">
            {c}
            <button className="chip-remove" onClick={() => onRemove(c)}>
              <X size={11} weight="bold" />
            </button>
          </span>
        ))}
      </div>
      <input
        placeholder={companies.length >= 3 ? "Max 3 companies" : "Search NSE company — e.g. RELIANCE"}
        value={query}
        disabled={companies.length >= 3}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="autocomplete-dropdown">
          {results.map((r) => (
            <div key={r} className="autocomplete-option" onMouseDown={() => pick(r)}>{r}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function SetupWizard({ token, onComplete, show }: { token: string; onComplete: (p: Prefs) => void; show: (m: string, t?: "success" | "error") => void }) {
  const [step, setStep] = useState(0);
  const [presets, setPresets] = useState<PresetType[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [hour, setHour] = useState(8);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [sendPreview, setSendPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  function togglePreset(id: PresetType) {
    setPresets((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? prev : [...prev, id]);
  }
  function toggleDay(d: number) {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b));
  }

  async function activate() {
    setSaving(true);
    try {
      const body = { presets, companies, delivery_hour: hour, schedule_days: days, is_active: true, setup_complete: true };
      const prefRes = await fetch("/api/preferences", { method: "POST", headers: ah(token), body: JSON.stringify(body) });
      if (!prefRes.ok) {
        const err = await prefRes.json().catch(() => ({ error: "Save failed" }));
        show(err.error ?? "Failed to save preferences", "error");
        return;
      }
      await fetch("/api/schedule", { method: "POST", headers: ah(token), body: JSON.stringify({}) });
      if (sendPreview) {
        const previewRes = await fetch("/api/preview-brief", { method: "POST", headers: ah(token), body: JSON.stringify({ presets, companies }) });
        if (!previewRes.ok) {
          const err = await previewRes.json().catch(() => ({ error: "Preview failed" }));
          show(err.error ?? "Failed to send preview email", "error");
        } else {
          show("Preview sent to your email!");
        }
      } else {
        show("Setup complete! Your brief is scheduled.");
      }
      onComplete({ presets, companies, delivery_hour: hour, schedule_days: days, is_active: true, setup_complete: true });
    } catch { show("Setup failed. Please try again.", "error"); }
    finally { setSaving(false); }
  }

  const wrap = (content: React.ReactNode) => (
    <div className="wizard-container">
      <div className="wizard-card">
        {step > 0 && (
          <div className="wizard-progress">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`wizard-progress-seg${step >= i ? " done" : ""}`} />
            ))}
          </div>
        )}
        {content}
      </div>
    </div>
  );

  if (step === 0) return wrap(
    <>
      <div style={{ width: 42, height: 42, background: "var(--text-1)", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 22 }}>
        <ChartLineUp size={20} weight="bold" color="white" />
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.15, marginBottom: 12, color: "var(--text-1)" }}>
        Daily Market Signal
      </h1>
      <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.65, maxWidth: "40ch", marginBottom: 32 }}>
        AI-powered Indian market brief, delivered to your inbox each morning before the bell.
      </p>
      <button className="btn btn-primary btn-full" onClick={() => setStep(1)}>
        Get Started <CaretRight size={13} weight="bold" />
      </button>
    </>
  );

  if (step === 1) return wrap(
    <>
      <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 5, color: "var(--text-1)" }}>
        Choose your sections
      </h2>
      <p style={{ color: "var(--text-3)", marginBottom: 18, fontSize: 13 }}>Select up to 2 presets for your daily brief</p>
      <PresetGrid selected={presets} onToggle={togglePreset} />
      <div className="wizard-actions">
        <button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
        <button className="btn btn-primary" onClick={() => setStep(2)} disabled={presets.length === 0}>Continue</button>
      </div>
    </>
  );

  if (step === 2) return wrap(
    <>
      <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 5, color: "var(--text-1)" }}>
        Track companies
      </h2>
      <p style={{ color: "var(--text-3)", marginBottom: 18, fontSize: 13 }}>Add up to 3 NSE-listed companies — optional</p>
      <TickerInput companies={companies} onAdd={(c) => setCompanies((p) => [...p, c])} onRemove={(c) => setCompanies((p) => p.filter((x) => x !== c))} token={token} />
      <div className="wizard-actions">
        <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
        <button className="btn btn-ghost" onClick={() => setStep(3)}>Skip</button>
        <button className="btn btn-primary" onClick={() => setStep(3)}>Continue</button>
      </div>
    </>
  );

  if (step === 3) return wrap(
    <>
      <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 20, color: "var(--text-1)" }}>
        Delivery schedule
      </h2>
      <TimeDay hour={hour} days={days} onHour={setHour} onDay={toggleDay} />
      <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 10 }}>Sent on NSE market days only</p>
      <div className="wizard-actions">
        <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
        <button className="btn btn-primary" onClick={() => setStep(4)} disabled={days.length === 0}>Continue</button>
      </div>
    </>
  );

  return wrap(
    <>
      <div style={{ width: 48, height: 48, background: "var(--accent-subtle)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, color: "var(--accent)" }}>
        <CheckCircle size={26} weight="fill" />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 18, color: "var(--text-1)" }}>
        Review and activate
      </h2>
      <div className="surface-block" style={{ marginBottom: 18 }}>
        {([
          ["Sections",  presets.map(presetName).join(", ") || "None"],
          ["Companies", companies.join(", ") || "None"],
          ["Delivery",  fmtHour(hour) + " IST"],
          ["Days",      fmtDays(days)],
        ] as [string, string][]).map(([k, v]) => (
          <div key={k} className="settings-row">
            <span className="settings-label">{k}</span>
            <span className="settings-value">{v}</span>
          </div>
        ))}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-2)", marginBottom: 4, cursor: "pointer", userSelect: "none" }}>
        <input type="checkbox" checked={sendPreview} onChange={(e) => setSendPreview(e.target.checked)} />
        Send a preview email now
      </label>
      <div className="wizard-actions">
        <button className="btn btn-ghost" onClick={() => setStep(3)}>Back</button>
        <button className="btn btn-accent" onClick={activate} disabled={saving}>
          {saving && <span className="spinner" />}
          Activate
        </button>
      </div>
    </>
  );
}

function Dashboard({ prefs: init, token, show }: { prefs: Prefs; token: string; show: (m: string, t?: "success" | "error") => void }) {
  const [prefs, setPrefs] = useState<Prefs>(init);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Prefs>(init);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Values in expandedHtml are always sanitized via DOMPurify before insertion (see sanitizeHtml).
  const [expandedHtml, setExpandedHtml] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    fetch("/api/briefs", { headers: ah(token) })
      .then((r) => r.json())
      .then((data: Brief[]) => setBriefs(Array.isArray(data) ? data.slice().reverse() : []))
      .catch(() => {});
  }, [token]);

  async function saveEdits() {
    setSaving(true);
    try {
      await fetch("/api/preferences", { method: "POST", headers: ah(token), body: JSON.stringify({ ...draft, setup_complete: true }) });
      await fetch("/api/schedule", { method: "POST", headers: ah(token), body: JSON.stringify({}) });
      setPrefs(draft); setEditing(false); show("Settings saved.");
    } catch { show("Failed to save.", "error"); } finally { setSaving(false); }
  }

  async function sendPreview() {
    setSaving(true);
    try {
      const res = await fetch("/api/preview-brief", { method: "POST", headers: ah(token), body: JSON.stringify({ presets: prefs.presets, companies: prefs.companies }) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Preview failed" }));
        show(err.error ?? "Failed to send preview email", "error");
      } else {
        show("Preview sent to your email!");
      }
    } catch { show("Failed to send preview.", "error"); } finally { setSaving(false); }
  }

  async function refreshData() {
    setSaving(true);
    try {
      const res = await fetch("/api/cron/refresh-snapshot", { method: "POST", headers: ah(token) });
      const data = await res.json();
      if (!res.ok) show(data.error ?? "Refresh failed", "error");
      else show(`Market data refreshed — ${data.stocks ?? 0} stocks, ${data.indices ?? 0} indices`);
    } catch { show("Failed to refresh data.", "error"); } finally { setSaving(false); }
  }

  async function toggleActive() {
    setToggling(true);
    try {
      const updated = { ...prefs, is_active: !prefs.is_active };
      await fetch("/api/preferences", { method: "POST", headers: ah(token), body: JSON.stringify({ ...updated, setup_complete: true }) });
      setPrefs(updated); show(updated.is_active ? "Brief activated." : "Brief paused.");
    } catch { show("Failed to update status.", "error"); } finally { setToggling(false); }
  }

  async function expandBrief(b: Brief) {
    if (expandedId === b.id) { setExpandedId(null); return; }
    setExpandedId(b.id);
    if (!expandedHtml[b.id]) {
      const clean = await sanitizeHtml(b.data.brief_html ?? "");
      setExpandedHtml((prev) => ({ ...prev, [b.id]: clean }));
    }
  }

  function toggleDraftPreset(id: PresetType) {
    setDraft((prev) => ({ ...prev, presets: prev.presets.includes(id) ? prev.presets.filter((x) => x !== id) : prev.presets.length >= 2 ? prev.presets : [...prev.presets, id] }));
  }
  function toggleDraftDay(d: number) {
    setDraft((prev) => ({ ...prev, schedule_days: prev.schedule_days.includes(d) ? prev.schedule_days.filter((x) => x !== d) : [...prev.schedule_days, d].sort((a, b) => a - b) }));
  }

  return (
    <div className="app-container stagger">

      {/* Header */}
      <div className="dash-header">
        <div className="wordmark">
          <div className="wordmark-icon">
            <ChartLineUp size={15} weight="bold" color="white" />
          </div>
          <span className="dash-title">Market Signal</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <button
            className={`status-pill${prefs.is_active ? " active" : " paused"}`}
            onClick={toggleActive}
            disabled={toggling}
          >
            <span className="status-dot" />
            {prefs.is_active ? "Active" : "Paused"}
          </button>
          {!editing && (
            <>
              <button className="btn-icon" onClick={refreshData} disabled={saving} title="Refresh market data">
                <ArrowClockwise size={15} weight="bold" />
              </button>
              <button className="btn-icon" onClick={sendPreview} disabled={saving} title="Send preview email">
                <EnvelopeSimple size={15} />
              </button>
              <button className="btn-icon" onClick={() => { setDraft(prefs); setEditing(true); }} title="Edit settings">
                <PencilSimple size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Schedule section */}
      <div style={{ marginBottom: 20 }}>
        <p className="section-label">Schedule</p>
        <div className="surface-block">
          {!editing ? (
            ([
              ["Sections",  prefs.presets.map(presetName).join(", ") || "None"],
              ["Companies", prefs.companies.join(", ") || "None"],
              ["Delivery",  fmtHour(prefs.delivery_hour) + " IST"],
              ["Days",      fmtDays(prefs.schedule_days)],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="settings-row">
                <span className="settings-label">{k}</span>
                <span className="settings-value">{v}</span>
              </div>
            ))
          ) : (
            <div className="edit-form">
              <p className="section-label" style={{ marginBottom: 10 }}>Sections (up to 2)</p>
              <div style={{ marginBottom: 20 }}>
                <PresetGrid selected={draft.presets} onToggle={toggleDraftPreset} />
              </div>
              <p className="section-label" style={{ marginBottom: 10 }}>Companies (up to 3)</p>
              <div style={{ marginBottom: 20 }}>
                <TickerInput
                  companies={draft.companies}
                  onAdd={(c) => setDraft((p) => ({ ...p, companies: [...p.companies, c] }))}
                  onRemove={(c) => setDraft((p) => ({ ...p, companies: p.companies.filter((x) => x !== c) }))}
                  token={token}
                />
              </div>
              <p className="section-label" style={{ marginBottom: 10 }}>Delivery</p>
              <div style={{ marginBottom: 22 }}>
                <TimeDay
                  hour={draft.delivery_hour}
                  days={draft.schedule_days}
                  onHour={(h) => setDraft((p) => ({ ...p, delivery_hour: h }))}
                  onDay={toggleDraftDay}
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-accent" onClick={saveEdits} disabled={saving || draft.presets.length === 0}>
                  {saving && <span className="spinner" />}
                  Save changes
                </button>
                <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History section */}
      <div>
        <p className="section-label">History</p>
        <div className="surface-block">
          {briefs.length === 0 ? (
            <div className="empty-state">
              <p>No briefs sent yet.</p>
              <p style={{ marginTop: 4, fontSize: 12 }}>Your first brief arrives on the next scheduled morning.</p>
            </div>
          ) : (
            briefs.map((b) => (
              <div key={b.id} className="brief-item" onClick={() => expandBrief(b)}>
                <div className="brief-row">
                  <div>
                    <div className="brief-date">
                      {new Date(b.data.sent_at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                    </div>
                    <div className="brief-meta">
                      {(b.data.presets ?? []).map(presetName).join(", ")}
                      {b.data.companies?.length > 0 ? " · " + b.data.companies.join(", ") : ""}
                    </div>
                  </div>
                  <div className={`brief-caret${expandedId === b.id ? " open" : ""}`}>
                    <CaretRight size={13} />
                  </div>
                </div>
                {expandedId === b.id && (
                  /* Content sanitized via DOMPurify before being stored in expandedHtml state */
                  <div
                    className="brief-content"
                    onClick={(e) => e.stopPropagation()}
                    dangerouslySetInnerHTML={{ __html: expandedHtml[b.id] ?? "<p>Loading...</p>" }}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}

export default function Home() {
  const token = useEmbedToken();
  const [prefs, setPrefs] = useState<Prefs | null | "loading">("loading");
  const { toast, show } = useToast();

  useEffect(() => {
    if (!token) return;
    fetch("/api/preferences", { headers: ah(token) })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.setup_complete) {
          setPrefs({
            id: data.id,
            presets: data.presets ?? [],
            companies: data.companies ?? [],
            delivery_hour: data.delivery_hour ?? 8,
            schedule_days: data.schedule_days ?? [1,2,3,4,5],
            is_active: data.is_active ?? false,
            setup_complete: true,
          });
        } else { setPrefs(null); }
      })
      .catch(() => setPrefs(null));
  }, [token]);

  if (!token || prefs === "loading") return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh" }}>
      <div style={{ width: 18, height: 18, border: "2px solid var(--border)", borderTopColor: "var(--text-2)", borderRadius: "50%", animation: "spin 600ms linear infinite" }} />
    </div>
  );

  return (
    <>
      {prefs === null
        ? <SetupWizard token={token} onComplete={(p) => setPrefs(p)} show={show} />
        : <Dashboard prefs={prefs} token={token} show={show} />
      }
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </>
  );
}
