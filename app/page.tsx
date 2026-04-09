"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useEmbedToken } from "@/hooks/use-embed-token";

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
  { id: "nifty_movers", name: "Nifty/Sensex Movers", description: "Top gainers and losers today" },
  { id: "stocks_to_watch", name: "Stocks to Watch", description: "Trending by volume and news" },
  { id: "sectoral_pulse", name: "Sectoral Pulse", description: "Nifty sectoral index performance" },
  { id: "earnings_radar", name: "Earnings Radar", description: "Upcoming results and surprises" },
  { id: "macro_dashboard", name: "Macro Dashboard", description: "Key Indian macro indicators" },
];

const HOURS = [6, 7, 8, 9, 10];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ah(token: string) { return { Authorization: "Bearer " + token, "Content-Type": "application/json" }; }
function fmtHour(h: number) { return h + " AM"; }
function fmtDays(days: number[]) { return days.map((d) => DAY_LABELS[d]).join(", "); }
function presetName(id: PresetType) { return PRESETS.find((p) => p.id === id)?.name ?? id; }

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
          {selected.includes(p.id) && <div className="preset-check">✓</div>}
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
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Time (IST)</p>
      <div className="time-selector" style={{ marginBottom: 16 }}>
        {HOURS.map((h) => <div key={h} className={`time-option${h === hour ? " selected" : ""}`} onClick={() => onHour(h)}>{fmtHour(h)}</div>)}
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Days</p>
      <div className="day-selector">
        {[1,2,3,4,5,6].map((d) => <button key={d} className={`day-btn${days.includes(d) ? " selected" : ""}`} onClick={() => onDay(d)}>{DAY_LABELS[d]}</button>)}
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {companies.map((c) => <span key={c} className="chip">{c}<button className="chip-remove" onClick={() => onRemove(c)}>x</button></span>)}
      </div>
      <input style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-primary)", fontSize: 14 }}
        placeholder={companies.length >= 3 ? "Max 3 companies" : "Search NSE company (e.g. RELIANCE)"}
        value={query} disabled={companies.length >= 3}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => results.length > 0 && setOpen(true)} />
      {open && results.length > 0 && (
        <div className="autocomplete-dropdown">
          {results.map((r) => <div key={r} className="autocomplete-option" onMouseDown={() => pick(r)}>{r}</div>)}
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

  const g = (content: React.ReactNode) => <div className="wizard-container"><div className="wizard-card">
    <div className="wizard-steps">{[0,1,2,3,4].map((i) => <div key={i} className={`wizard-dot${i===step?" active":i<step?" completed":""}`} />)}</div>
    {content}
  </div></div>;

  if (step === 0) return g(<>
    <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12, color: "var(--text-primary)" }}>Daily Market Signal</h1>
    <p style={{ color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.6 }}>Your personalized Indian market brief, delivered every morning.</p>
    <div className="wizard-actions"><button className="btn btn-primary btn-full" onClick={() => setStep(1)}>Get Started</button></div>
  </>);

  if (step === 1) return g(<>
    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}>Choose your market sections</h2>
    <p style={{ color: "var(--text-secondary)", marginBottom: 20, fontSize: 14 }}>Select up to 2 presets for your daily brief</p>
    <PresetGrid selected={presets} onToggle={togglePreset} />
    <div className="wizard-actions" style={{ marginTop: 20 }}>
      <button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
      <button className="btn btn-primary" onClick={() => setStep(2)} disabled={presets.length === 0}>Continue</button>
    </div>
  </>);

  if (step === 2) return g(<>
    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: "var(--text-primary)" }}>Track specific companies</h2>
    <p style={{ color: "var(--text-secondary)", marginBottom: 20, fontSize: 14 }}>Add up to 3 NSE-listed companies (optional)</p>
    <TickerInput companies={companies} onAdd={(c) => setCompanies((p) => [...p, c])} onRemove={(c) => setCompanies((p) => p.filter((x) => x !== c))} token={token} />
    <div className="wizard-actions" style={{ marginTop: 20 }}>
      <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
      <button className="btn btn-ghost" onClick={() => setStep(3)}>Skip</button>
      <button className="btn btn-primary" onClick={() => setStep(3)}>Continue</button>
    </div>
  </>);

  if (step === 3) return g(<>
    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" }}>Choose delivery time</h2>
    <TimeDay hour={hour} days={days} onHour={setHour} onDay={toggleDay} />
    <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}>Briefs are sent on NSE market days only</p>
    <div className="wizard-actions" style={{ marginTop: 20 }}>
      <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
      <button className="btn btn-primary" onClick={() => setStep(4)} disabled={days.length === 0}>Continue</button>
    </div>
  </>);

  return g(<>
    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, color: "var(--text-primary)" }}>You&apos;re all set!</h2>
    <div className="card" style={{ marginBottom: 20, padding: 16 }}>
      {[["Sections", presets.map(presetName).join(", ")], ["Companies", companies.join(", ") || "None"], ["Delivery", fmtHour(hour) + " IST"], ["Days", fmtDays(days)]].map(([k, v]) => (
        <div key={k} className="settings-row"><span className="settings-label">{k}</span><span className="settings-value">{v}</span></div>
      ))}
    </div>
    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--text-secondary)", marginBottom: 20, cursor: "pointer" }}>
      <input type="checkbox" checked={sendPreview} onChange={(e) => setSendPreview(e.target.checked)} /> Send a preview email now
    </label>
    <div className="wizard-actions">
      <button className="btn btn-ghost" onClick={() => setStep(3)}>Back</button>
      <button className="btn btn-primary" onClick={activate} disabled={saving}>{saving ? <span className="spinner" /> : null}Activate</button>
    </div>
  </>);
}

function Dashboard({ prefs: init, token, show }: { prefs: Prefs; token: string; show: (m: string, t?: "success" | "error") => void }) {
  const [prefs, setPrefs] = useState<Prefs>(init);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Prefs>(init);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    <div className="app-container">
      <div className="dash-header">
        <div className="dash-title">Daily Market Signal</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className={`status-pill${prefs.is_active ? " active" : " paused"}`} onClick={toggleActive} disabled={toggling} style={{ cursor: "pointer", border: "none" }}>
            {prefs.is_active ? "Active" : "Paused"}
          </button>
          {!editing && <button className="btn btn-secondary" onClick={() => { setDraft(prefs); setEditing(true); }}>Edit</button>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontWeight: 600, marginBottom: 16, color: "var(--text-primary)" }}>Settings</p>
        {!editing ? (
          [["Sections", prefs.presets.map(presetName).join(", ") || "None"], ["Companies", prefs.companies.join(", ") || "None"], ["Delivery", fmtHour(prefs.delivery_hour) + " IST"], ["Days", fmtDays(prefs.schedule_days)]].map(([k, v]) => (
            <div key={k} className="settings-row"><span className="settings-label">{k}</span><span className="settings-value">{v}</span></div>
          ))
        ) : (
          <>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>Sections (up to 2)</p>
            <div style={{ marginBottom: 20 }}><PresetGrid selected={draft.presets} onToggle={toggleDraftPreset} /></div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>Companies (up to 3)</p>
            <div style={{ marginBottom: 20 }}>
              <TickerInput companies={draft.companies} onAdd={(c) => setDraft((p) => ({ ...p, companies: [...p.companies, c] }))} onRemove={(c) => setDraft((p) => ({ ...p, companies: p.companies.filter((x) => x !== c) }))} token={token} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <TimeDay hour={draft.delivery_hour} days={draft.schedule_days} onHour={(h) => setDraft((p) => ({ ...p, delivery_hour: h }))} onDay={toggleDraftDay} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" onClick={saveEdits} disabled={saving || draft.presets.length === 0}>{saving ? <span className="spinner" /> : null}Save</button>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <p style={{ fontWeight: 600, marginBottom: 16, color: "var(--text-primary)" }}>Previous Briefs</p>
        {briefs.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No briefs sent yet.</p>}
        {briefs.map((b) => (
          <div key={b.id} className="brief-item" onClick={() => expandBrief(b)} style={{ cursor: "pointer" }}>
            <div className="brief-date">{new Date(b.data.sent_at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
            <div className="brief-meta">
              {(b.data.presets ?? []).map(presetName).join(", ")}
              {b.data.companies?.length > 0 ? " · " + b.data.companies.join(", ") : ""}
            </div>
            {expandedId === b.id && (
              <div className="brief-content" onClick={(e) => e.stopPropagation()} dangerouslySetInnerHTML={{ __html: expandedHtml[b.id] ?? "<p>Loading...</p>" }} />
            )}
          </div>
        ))}
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
          setPrefs({ id: data.id, presets: data.presets ?? [], companies: data.companies ?? [], delivery_hour: data.delivery_hour ?? 8, schedule_days: data.schedule_days ?? [1,2,3,4,5], is_active: data.is_active ?? false, setup_complete: true });
        } else { setPrefs(null); }
      })
      .catch(() => setPrefs(null));
  }, [token]);

  if (!token || prefs === "loading") return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}><span className="spinner" /></div>
  );

  return (
    <>
      {prefs === null ? <SetupWizard token={token} onComplete={(p) => setPrefs(p)} show={show} /> : <Dashboard prefs={prefs} token={token} show={show} />}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </>
  );
}
