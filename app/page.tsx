"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useEmbedToken } from "@/hooks/use-embed-token";
function IcoCheck() {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="currentColor" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="8.5" />
      <path d="M5.5 8.5l2.2 2.2 3.8-3.8" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IcoX() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="2" y1="2" x2="9" y2="9" />
      <line x1="9" y1="2" x2="2" y2="9" />
    </svg>
  );
}
function IcoRefresh() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 7.5a5.5 5.5 0 11-1.5-3.8" />
      <path d="M13 2v3.5h-3.5" />
    </svg>
  );
}
function IcoPlay() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" aria-hidden="true">
      <path d="M2.5 1.5v8l7-4z" />
    </svg>
  );
}
function IcoPause() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" aria-hidden="true">
      <rect x="2" y="1.5" width="2.5" height="8" rx="0.5" />
      <rect x="6.5" y="1.5" width="2.5" height="8" rx="0.5" />
    </svg>
  );
}
function IcoClose() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="3" x2="10" y2="10" />
      <line x1="10" y1="3" x2="3" y2="10" />
    </svg>
  );
}
function IcoPencil() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.5 2.5l2 2-8 8H2.5v-2l8-8z" />
    </svg>
  );
}
function IcoChart() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 11l3.5-4 2.5 2.5 5-6.5" />
    </svg>
  );
}
function IcoCaret({ open }: { open?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 200ms cubic-bezier(0.16,1,0.3,1)" }}>
      <path d="M5 3.5l3.5 3-3.5 3" />
    </svg>
  );
}

type PresetType = "nifty_movers" | "stocks_to_watch" | "sectoral_pulse" | "earnings_radar" | "macro_dashboard";

interface Prefs {
  id?: string;
  presets: PresetType[];
  is_active: boolean;
  setup_complete: boolean;
}

interface Brief {
  id: string;
  presets: PresetType[];
  brief_html: string;
  sent_at: string;
}

const PRESETS: { id: PresetType; name: string; description: string }[] = [
  { id: "nifty_movers",     name: "Nifty/Sensex Movers",   description: "Top gainers and losers today" },
  { id: "stocks_to_watch",  name: "Stocks to Watch",        description: "Trending by volume and news" },
  { id: "sectoral_pulse",   name: "Sectoral Pulse",         description: "Nifty sectoral index performance" },
  { id: "earnings_radar",   name: "Earnings Radar",         description: "Upcoming results and surprises" },
  { id: "macro_dashboard",  name: "Macro Dashboard",        description: "Key Indian macro indicators" },
];

function ah(token: string) { return { Authorization: "Bearer " + token, "Content-Type": "application/json" }; }
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
              <IcoCheck />
            </div>
          )}
          <div className="preset-name">{p.name}</div>
          <div className="preset-desc">{p.description}</div>
        </div>
      ))}
    </div>
  );
}

function SetupWizard({ token, onComplete, show }: { token: string; onComplete: (p: Prefs) => void; show: (m: string, t?: "success" | "error") => void }) {
  const [step, setStep] = useState(0);
  const [presets, setPresets] = useState<PresetType[]>([]);
  const [sendPreview, setSendPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  function togglePreset(id: PresetType) {
    setPresets((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? prev : [...prev, id]);
  }

  async function activate() {
    setSaving(true);
    try {
      const body = { presets, is_active: true, setup_complete: true };
      const prefRes = await fetch("/api/preferences", { method: "POST", headers: ah(token), body: JSON.stringify(body) });
      if (!prefRes.ok) {
        const err = await prefRes.json().catch(() => ({ error: "Save failed" }));
        show(err.error ?? "Failed to save preferences", "error");
        return;
      }
      await fetch("/api/schedule", { method: "POST", headers: ah(token), body: JSON.stringify({}) });
      if (sendPreview) {
        const previewRes = await fetch("/api/preview-brief", { method: "POST", headers: ah(token), body: JSON.stringify({ presets }) });
        if (!previewRes.ok) {
          const err = await previewRes.json().catch(() => ({ error: "Preview failed" }));
          show(err.error ?? "Failed to send preview email", "error");
        } else {
          show("Preview sent to your email!");
        }
      } else {
        show("Setup complete! Your brief is scheduled.");
      }
      onComplete({ presets, is_active: true, setup_complete: true });
    } catch { show("Setup failed. Please try again.", "error"); }
    finally { setSaving(false); }
  }

  const wrap = (content: React.ReactNode) => (
    <div className="wizard-container">
      <div className="wizard-card">
        {step > 0 && (
          <div className="wizard-progress">
            {[1, 2].map((i) => (
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
        <IcoChart />
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.15, marginBottom: 12, color: "var(--text-1)" }}>
        Daily Market Signal
      </h1>
      <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.65, maxWidth: "40ch", marginBottom: 32 }}>
        AI-powered Indian market brief, delivered to your inbox each morning before the bell.
      </p>
      <button className="btn btn-primary btn-full" onClick={() => setStep(1)}>
        Get Started <IcoCaret />
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

  return wrap(
    <>
      <div style={{ width: 48, height: 48, background: "var(--accent-subtle)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, color: "var(--accent)" }}>
        <svg width="26" height="26" viewBox="0 0 26 26" fill="currentColor" aria-hidden="true">
          <circle cx="13" cy="13" r="13" />
          <path d="M8 13l3.5 3.5 6.5-7" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 18, color: "var(--text-1)" }}>
        Review and activate
      </h2>
      <div className="surface-block" style={{ marginBottom: 18 }}>
        {([
          ["Sections",  presets.map(presetName).join(", ") || "None"],
          ["Delivery",  "8 AM IST, every market day"],
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
        <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
        <button className="btn btn-accent" onClick={activate} disabled={saving}>
          {saving && <span className="spinner" />}
          Activate
        </button>
      </div>
    </>
  );
}

const PAGE_SIZE = 8;

function Dashboard({ prefs: init, token, show }: { prefs: Prefs; token: string; show: (m: string, t?: "success" | "error") => void }) {
  const [prefs, setPrefs] = useState<Prefs>(init);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Prefs>(init);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Sanitized via DOMPurify before storage in state.
  const [selectedHtml, setSelectedHtml] = useState<string>("");
  const [page, setPage] = useState(1);
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
      setPrefs(updated); show(updated.is_active ? "Reports activated." : "Reports paused.");
    } catch { show("Failed to update status.", "error"); } finally { setToggling(false); }
  }

  async function selectBrief(b: Brief) {
    setSelectedId(b.id);
    setSelectedHtml("");
    const clean = await sanitizeHtml(b.brief_html ?? "");
    setSelectedHtml(clean);
  }

  function toggleDraftPreset(id: PresetType) {
    setDraft((prev) => ({ ...prev, presets: prev.presets.includes(id) ? prev.presets.filter((x) => x !== id) : prev.presets.length >= 2 ? prev.presets : [...prev.presets, id] }));
  }

  const totalPages = Math.max(1, Math.ceil(briefs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageBriefs = briefs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selected = briefs.find((b) => b.id === selectedId) ?? null;

  return (
    <div className={`app-container${selected ? " split" : ""} stagger`}>

      {/* Header */}
      <div className="dash-header">
        <div className="wordmark">
          <div className="wordmark-icon">
            <IcoChart />
          </div>
          <span className="dash-title">Daily Market Signal</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <button
            className={`pause-btn${prefs.is_active ? " active" : " paused"}`}
            onClick={toggleActive}
            disabled={toggling}
            title={prefs.is_active ? "Pause daily reports" : "Resume daily reports"}
          >
            {toggling ? <span className="spinner spinner-dark" /> : prefs.is_active ? <IcoPause /> : <IcoPlay />}
            {prefs.is_active ? "Pause" : "Activate"}
          </button>
          {!editing && (
            <>
              <button className="btn-icon" onClick={refreshData} disabled={saving} title="Refresh market data">
                <IcoRefresh />
              </button>
              <button className="btn-icon" onClick={() => { setDraft(prefs); setEditing(true); }} title="Edit settings">
                <IcoPencil />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-left">
          <div style={{ marginBottom: 20 }}>
            <p className="section-label">Schedule</p>
            <div className="surface-block">
              {!editing ? (
                ([
                  ["Sections",  prefs.presets.map(presetName).join(", ") || "None"],
                  ["Delivery",  "8 AM IST, every market day"],
                  ["Status",    prefs.is_active ? "Active" : "Paused"],
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

          <div>
            <p className="section-label">History</p>
            <div className="surface-block">
              {briefs.length === 0 ? (
                <div className="empty-state">
                  <p>No briefs sent yet.</p>
                  <p style={{ marginTop: 4, fontSize: 12 }}>Your first brief arrives on the next scheduled morning.</p>
                </div>
              ) : (
                pageBriefs.map((b) => (
                  <div
                    key={b.id}
                    className={`brief-item${selectedId === b.id ? " selected" : ""}`}
                    onClick={() => selectBrief(b)}
                  >
                    <div className="brief-row">
                      <div>
                        <div className="brief-date">
                          {new Date(b.sent_at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                        </div>
                        <div className="brief-meta">
                          {(b.presets ?? []).map(presetName).join(", ")}
                        </div>
                      </div>
                      <div className="brief-caret">
                        <IcoCaret open={selectedId === b.id} />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {briefs.length > PAGE_SIZE && (
              <div className="pagination">
                <button
                  className="btn-ghost-sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  Prev
                </button>
                <span className="page-info">Page {safePage} of {totalPages}</span>
                <button
                  className="btn-ghost-sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>

        {selected && (
          <div className="dash-right">
            <div className="viewer-panel">
              <div className="viewer-header">
                <div>
                  <div className="viewer-date">
                    {new Date(selected.sent_at).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </div>
                  <div className="viewer-meta">{(selected.presets ?? []).map(presetName).join(", ")}</div>
                </div>
                <button className="btn-icon" onClick={() => setSelectedId(null)} title="Close report">
                  <IcoClose />
                </button>
              </div>
              {/* selectedHtml is sanitized via DOMPurify (sanitizeHtml) before being stored in state */}
              <div
                className="brief-content viewer-content"
                dangerouslySetInnerHTML={{ __html: selectedHtml || "<p style='color:var(--text-3);font-size:13px'>Loading…</p>" }}
              />
            </div>
          </div>
        )}
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
