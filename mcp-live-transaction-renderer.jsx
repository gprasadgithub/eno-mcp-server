import { useState, useEffect, useMemo, useRef } from "react";

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * MCP TOOL RESPONSE → PRETTY UI
 *
 * This component demonstrates the full pipeline:
 *
 *   1. User says: "Show my recent transactions"
 *   2. Claude calls Mercury:listTransactions MCP tool
 *   3. The raw JSON tool response is passed into this component
 *   4. Instead of dumping JSON text, the host renders THIS rich UI inline
 *
 * In the MCP Apps spec, this is wired via:
 *   - Server:  _meta.ui.resourceUri → "ui://mercury/transactions"
 *   - Host:    <AppRenderer toolResult={mercuryResponse} ... />
 *   - Widget:  app.ontoolresult → receives the JSON, renders beautifully
 *
 * This artifact simulates that entire flow with a "Replay Pipeline" button.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Exact shape returned by Mercury:listTransactions MCP tool ──────────────
const MERCURY_TOOL_RESPONSE = {
  transactions: [
    { id: "af325572-05b8-11f1-9818-1934d335121a", amount: -75, postedAt: "2026-02-10T01:51:16.550511Z", status: "sent", bankDescription: "INTUIT *QBooks Online", counterpartyName: "QuickBooks", kind: "debitCardTransaction", mercuryCategory: "Software", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
    { id: "82c32ce0-0320-11f1-80ce-fdd058ff634d", amount: -83, postedAt: "2026-02-06T13:12:05.683761Z", status: "sent", bankDescription: "WWW.TRAJECTDATA.COM", counterpartyName: "Traject Data", kind: "debitCardTransaction", mercuryCategory: "Software", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
    { id: "547419e8-0196-11f1-ac78-7d60c2f63cdf", amount: -7.22, postedAt: "2026-02-04T13:16:12.79239Z", status: "sent", bankDescription: "OPENAI", counterpartyName: "OpenAI", kind: "debitCardTransaction", mercuryCategory: "Software", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
    { id: "584f2052-ff99-11f0-9faf-5dd99c137c99", amount: -135.87, postedAt: "2026-02-02T02:09:38.492148Z", status: "sent", bankDescription: "Google CLOUD D3vzX4", counterpartyName: "Google Cloud", kind: "debitCardTransaction", mercuryCategory: "Software", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
    { id: "0c7453ea-ff72-11f0-b660-e179d673c792", amount: -117.6, postedAt: "2026-02-02T04:20:06.087316Z", status: "sent", bankDescription: "GOOGLE*WORKSPACE ALLOF", counterpartyName: "Google Workspace", kind: "debitCardTransaction", mercuryCategory: "Software", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
    { id: "313352f2-f64a-11f0-8966-c33f5448c57a", amount: -35, postedAt: "2026-01-21T10:53:11.1955Z", status: "sent", bankDescription: "FIRSTBASE.IO, INC.", counterpartyName: "Firstbase", kind: "debitCardTransaction", mercuryCategory: "Software", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
    { id: "2b463c14-f44d-11f0-a7f7-0bd5c5997fcf", amount: -75, postedAt: "2026-01-18T13:04:08.35414Z", status: "sent", bankDescription: "INTUIT *QBooks Online", counterpartyName: "QuickBooks", kind: "debitCardTransaction", mercuryCategory: "Software", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
    { id: "4fe86bf4-f084-11f0-91da-5775ad0c091b", amount: 1000, postedAt: "2026-01-13T13:32:31.516551Z", status: "sent", bankDescription: "JPMorgan Chase; Ext Trnsfr; GANESH PRASAD", counterpartyName: "JPMorgan Chase", kind: "other", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
    { id: "f1654708-dded-11f0-97c1-9ff209edd018", amount: -35, postedAt: "2025-12-21T04:22:09.897038Z", status: "sent", bankDescription: "FIRSTBASE.IO, INC.", counterpartyName: "Firstbase", kind: "debitCardTransaction", mercuryCategory: "Software", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
    { id: "45f9d11c-d56a-11f0-b27c-430263cd4338", amount: -20, postedAt: "2025-12-10T07:56:08.162018Z", status: "sent", bankDescription: "OPENAI *CHATGPT SUBSCR", counterpartyName: "Open Ai / ChatGPT", kind: "debitCardTransaction", mercuryCategory: "Software", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
    { id: "1fea7b52-d4fc-11f0-94d7-490379151dc4", amount: -75, postedAt: "2025-12-10T01:54:19.456688Z", status: "sent", bankDescription: "INTUIT *QBooks Online", counterpartyName: "QuickBooks", kind: "debitCardTransaction", mercuryCategory: "Software", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
    { id: "f2e334be-d267-11f0-8779-5f1522eea21f", amount: -83, postedAt: "2025-12-07T01:43:11.918202Z", status: "sent", bankDescription: "WWW.TRAJECTDATA.COM", counterpartyName: "Traject Data", kind: "debitCardTransaction", mercuryCategory: "Software", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
    { id: "62204064-cff3-11f0-ba2d-654629a92998", amount: -5.44, postedAt: "2025-12-03T10:19:22.617636Z", status: "sent", bankDescription: "OPENAI", counterpartyName: "OpenAI", kind: "debitCardTransaction", mercuryCategory: "Software", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
    { id: "f44a2990-cee6-11f0-b013-738fe5bb04da", amount: -64.51, postedAt: "2025-12-02T01:39:06.962932Z", status: "sent", bankDescription: "GOOGLE *CLOUD 7QXww6", counterpartyName: "Google Cloud", kind: "debitCardTransaction", mercuryCategory: "Software", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
    { id: "bcbffc4c-cea6-11f0-9e15-530e83d6a8d5", amount: -58.8, postedAt: "2025-12-02T02:19:33.320251Z", status: "sent", bankDescription: "GOOGLE *Workspace_allo", counterpartyName: "Google", kind: "debitCardTransaction", mercuryCategory: "ProfessionalServices", accountId: "e02da962-1077-11ee-83e8-0b31f5a830e2" },
  ],
  page: {},
};

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bg: "#060911",
  surface: "rgba(255,255,255,0.024)",
  surfaceHover: "rgba(255,255,255,0.045)",
  border: "rgba(255,255,255,0.055)",
  borderSubtle: "rgba(255,255,255,0.03)",
  text: "#e8ecf4",
  textMuted: "#7a8599",
  textDim: "#3d4759",
  accent: "#7c6aef",
  accentGlow: "rgba(124,106,239,0.15)",
  green: "#3ddfa0",
  red: "#ef6a7a",
};

const VENDOR_META = {
  "QuickBooks": { icon: "📗", color: "#2CA01C" },
  "Traject Data": { icon: "📊", color: "#0ea5e9" },
  "OpenAI": { icon: "✦", color: "#10a37f" },
  "Open Ai / ChatGPT": { icon: "✦", color: "#10a37f" },
  "Google Cloud": { icon: "☁", color: "#4285f4" },
  "Google Workspace": { icon: "✉", color: "#ea4335" },
  "Google": { icon: "✉", color: "#ea4335" },
  "Firstbase": { icon: "◆", color: "#6366f1" },
  "JPMorgan Chase": { icon: "◈", color: "#005eb8" },
};

const fmt = (n) => {
  const a = Math.abs(n);
  const s = a >= 1000 ? a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : a.toFixed(2);
  return `${n < 0 ? "−" : "+"}$${s}`;
};

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const monthKey = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });

const groupBy = (txs) => {
  const g = {};
  txs.forEach(t => { const k = monthKey(t.postedAt); (g[k] = g[k] || []).push(t); });
  return g;
};

// ── Components ─────────────────────────────────────────────────────────────

function VendorAvatar({ name }) {
  const m = VENDOR_META[name] || { icon: "→", color: "#7c6aef" };
  return (
    <div style={{
      width: 38, height: 38, borderRadius: 10,
      background: `${m.color}14`, border: `1px solid ${m.color}22`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 16, color: m.color, flexShrink: 0, fontWeight: 700,
    }}>{m.icon}</div>
  );
}

function TxRow({ tx, index, isOpen, onToggle }) {
  const isCredit = tx.amount > 0;
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onToggle} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: "grid", gridTemplateColumns: "38px 1fr auto auto 16px",
        alignItems: "center", gap: 14, padding: "13px 20px", cursor: "pointer",
        background: isOpen ? C.accentGlow : h ? C.surfaceHover : "transparent",
        borderBottom: `1px solid ${C.borderSubtle}`, transition: "background 0.12s",
        animation: `rowIn 0.3s cubic-bezier(0.22,1,0.36,1) both`, animationDelay: `${index * 25}ms`,
      }}
    >
      <VendorAvatar name={tx.counterpartyName} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "var(--f-sans)" }}>
          {tx.counterpartyName}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1, fontFamily: "var(--f-mono)" }}>
          {fmtDate(tx.postedAt)}
          <span style={{ margin: "0 5px", color: C.textDim }}>·</span>
          <span style={{ color: tx.mercuryCategory === "Software" ? "#7c6aef" : "#0ea5e9", fontWeight: 500 }}>
            {tx.mercuryCategory || tx.kind}
          </span>
        </div>
      </div>
      <div style={{
        fontFamily: "var(--f-mono)", fontSize: 10.5, color: C.textDim,
        display: "flex", alignItems: "center", gap: 4,
        opacity: h ? 1 : 0, transition: "opacity 0.15s",
      }}>
        {tx.kind === "debitCardTransaction" ? "💳 Card" : "↔ Transfer"}
      </div>
      <div style={{
        fontFamily: "var(--f-mono)", fontWeight: 600, fontSize: 14,
        color: isCredit ? C.green : C.text, textAlign: "right", minWidth: 90, letterSpacing: "-0.01em",
      }}>
        {fmt(tx.amount)}
      </div>
      <svg width="12" height="12" viewBox="0 0 12 12" style={{
        color: C.textDim, flexShrink: 0, transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s ease",
      }}>
        <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
}

function ActionBtn({ label, primary }) {
  const [h, setH] = useState(false);
  return (
    <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      padding: "6px 14px", borderRadius: 8, fontSize: 11.5, fontWeight: 600,
      fontFamily: "var(--f-sans)", cursor: "pointer", transition: "all 0.12s",
      border: primary ? `1px solid rgba(124,106,239,${h ? 0.5 : 0.3})` : `1px solid ${C.border}`,
      background: primary ? `rgba(124,106,239,${h ? 0.18 : 0.08})` : h ? C.surfaceHover : "transparent",
      color: primary ? "#a89df5" : C.textMuted,
    }}>{label}</button>
  );
}

function TxDetail({ tx }) {
  return (
    <div style={{
      padding: "14px 20px 18px 72px", background: "rgba(124,106,239,0.03)",
      borderBottom: `1px solid ${C.borderSubtle}`, animation: "detailIn 0.2s ease both",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 28px", fontFamily: "var(--f-mono)", fontSize: 11.5 }}>
        {[
          ["Bank Description", tx.bankDescription],
          ["Type", tx.kind === "debitCardTransaction" ? "Debit Card" : "Wire Transfer"],
          ["Transaction ID", tx.id.slice(0, 18) + "…"],
          ["Status", "Sent"],
        ].map(([l, v]) => (
          <div key={l}>
            <div style={{ color: C.textDim, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{l}</div>
            <div style={{ color: C.textMuted }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <ActionBtn label="📎 Attach Receipt" primary />
        <ActionBtn label="🏷 Re-categorize" />
        <ActionBtn label="↗ Open in Mercury" />
      </div>
      <div style={{
        marginTop: 12, padding: "8px 12px", borderRadius: 8,
        background: "rgba(124,106,239,0.06)", border: "1px dashed rgba(124,106,239,0.15)",
        fontFamily: "var(--f-mono)", fontSize: 10.5, color: C.textDim,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span>⚡</span> MCP Action — clicking sends <code style={{ color: C.accent, fontWeight: 500 }}>app.sendMessage()</code> back to conversation
      </div>
    </div>
  );
}

function SummaryStats({ txs }) {
  const debits = txs.filter(t => t.amount < 0);
  const credits = txs.filter(t => t.amount > 0);
  const totalSpend = debits.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalIncome = credits.reduce((s, t) => s + t.amount, 0);
  const byVendor = {};
  debits.forEach(t => { byVendor[t.counterpartyName] = (byVendor[t.counterpartyName] || 0) + Math.abs(t.amount); });
  const sorted = Object.entries(byVendor).sort((a, b) => b[1] - a[1]);
  const vc = ["#7c6aef", "#a78bfa", "#0ea5e9", "#38bdf8", "#3ddfa0", "#f59e0b", "#ef6a7a"];

  return (
    <div style={{ padding: "18px 20px", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
        {[
          { label: "Total Spend", value: `−$${totalSpend.toFixed(2)}`, color: C.text },
          { label: "Income", value: `+$${totalIncome.toFixed(2)}`, color: C.green },
          { label: "Net", value: fmt(totalIncome - totalSpend), color: (totalIncome - totalSpend) >= 0 ? C.green : C.red },
          { label: "Count", value: txs.length, color: C.accent },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 17, fontWeight: 700, color, letterSpacing: "-0.02em" }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
        {sorted.map(([v, amt], i) => (
          <div key={v} title={`${v}: $${amt.toFixed(2)}`} style={{
            width: `${(amt / totalSpend) * 100}%`, background: vc[i % vc.length],
            transition: "width 0.6s cubic-bezier(0.22,1,0.36,1)",
          }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 10 }}>
        {sorted.map(([v, amt], i) => (
          <div key={v} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--f-mono)", fontSize: 10.5, color: C.textMuted }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: vc[i % vc.length] }} />
            {v} <span style={{ color: C.textDim }}>${amt.toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineStep({ number, label, sub, active, done }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: done || active ? 1 : 0.3, transition: "opacity 0.4s", flex: 1 }}>
      <div style={{
        width: 26, height: 26, borderRadius: "50%",
        background: done ? C.green : active ? C.accent : "transparent",
        border: `2px solid ${done ? C.green : active ? C.accent : C.textDim}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--f-mono)", fontSize: 10.5, fontWeight: 700,
        color: done || active ? "#fff" : C.textDim, transition: "all 0.3s",
        flexShrink: 0,
      }}>
        {done ? "✓" : number}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: "var(--f-sans)", fontSize: 12, fontWeight: 600, color: done || active ? C.text : C.textDim }}>{label}</div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 9.5, color: C.textDim, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function MCPTransactionRenderer() {
  const [phase, setPhase] = useState("idle");
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const refs = useRef([]);

  const run = () => {
    refs.current.forEach(clearTimeout);
    refs.current = [];
    setPhase("idle"); setOpenId(null);
    refs.current.push(setTimeout(() => setPhase("calling"), 200));
    refs.current.push(setTimeout(() => setPhase("rendering"), 1400));
    refs.current.push(setTimeout(() => setPhase("done"), 1800));
  };

  useEffect(() => { run(); return () => refs.current.forEach(clearTimeout); }, []);

  const txs = MERCURY_TOOL_RESPONSE.transactions;
  const filtered = useMemo(() => {
    let l = txs;
    if (filter === "debits") l = l.filter(t => t.amount < 0);
    if (filter === "credits") l = l.filter(t => t.amount > 0);
    if (search) { const q = search.toLowerCase(); l = l.filter(t => t.counterpartyName.toLowerCase().includes(q) || t.bankDescription.toLowerCase().includes(q) || (t.mercuryCategory || "").toLowerCase().includes(q)); }
    return l;
  }, [txs, filter, search]);

  const grouped = groupBy(filtered);
  const showUI = phase === "rendering" || phase === "done";
  let ri = 0;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "28px 16px", display: "flex", justifyContent: "center" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        :root { --f-sans: 'Outfit', sans-serif; --f-mono: 'JetBrains Mono', monospace; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes rowIn { from { opacity:0; transform:translateX(-8px); } to { opacity:1; transform:translateX(0); } }
        @keyframes detailIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform:rotate(360deg); } }
        input::placeholder { color: ${C.textDim}; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 3px; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 720 }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: phase === "done" ? C.green : C.accent, boxShadow: `0 0 12px ${phase === "done" ? C.green : C.accent}44`, transition: "all 0.5s" }} />
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, fontWeight: 600, color: C.accent, textTransform: "uppercase", letterSpacing: "0.12em" }}>MCP Apps · Mercury Tool Response</span>
            </div>
            <button onClick={run} style={{
              padding: "5px 14px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent",
              color: C.textMuted, fontFamily: "var(--f-mono)", fontSize: 10.5, fontWeight: 600, cursor: "pointer",
            }}>▶ Replay</button>
          </div>
          <h1 style={{ fontFamily: "var(--f-sans)", fontWeight: 800, fontSize: 26, color: C.text, letterSpacing: "-0.03em" }}>AllofUs AI Inc.</h1>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: C.textDim, marginTop: 2 }}>Checking ••4337 · $473.97</div>
        </div>

        {/* Pipeline */}
        <div style={{ display: "flex", gap: 16, marginBottom: 24, padding: "14px 18px", background: C.surface, borderRadius: 14, border: `1px solid ${C.border}` }}>
          <PipelineStep number={1} label="User Request" sub='"Show my transactions"' active={phase === "idle"} done={phase !== "idle"} />
          <div style={{ width: 1, background: C.border, margin: "2px 0" }} />
          <PipelineStep number={2} label="MCP Tool Call" sub="Mercury:listTransactions" active={phase === "calling"} done={phase === "rendering" || phase === "done"} />
          <div style={{ width: 1, background: C.border, margin: "2px 0" }} />
          <PipelineStep number={3} label="Render UI" sub="ui://mercury/transactions" active={phase === "rendering"} done={phase === "done"} />
        </div>

        {/* Loading */}
        {phase === "calling" && (
          <div style={{ padding: "40px 20px", textAlign: "center", background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, animation: "slideUp 0.3s ease both" }}>
            <div style={{ width: 32, height: 32, border: `2.5px solid ${C.border}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }} />
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: C.textMuted }}>Calling <span style={{ color: C.accent, fontWeight: 600 }}>Mercury:listTransactions</span></div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: C.textDim, marginTop: 4 }}>accountId: e02da962-…-0b31f5a830e2</div>
          </div>
        )}

        {/* Rendered UI */}
        {showUI && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", animation: "slideUp 0.4s cubic-bezier(0.22,1,0.36,1) both" }}>

            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ position: "relative", flex: 1 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textDim} strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input type="text" placeholder="Search transactions…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ width: "100%", padding: "8px 14px 8px 34px", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)", color: C.text, fontFamily: "var(--f-sans)", fontSize: 13, outline: "none" }}
                  onFocus={e => e.target.style.borderColor = `${C.accent}55`} onBlur={e => e.target.style.borderColor = C.border}
                />
              </div>
              {["all", "debits", "credits"].map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, fontFamily: "var(--f-sans)",
                  cursor: "pointer", textTransform: "capitalize", transition: "all 0.12s", whiteSpace: "nowrap",
                  border: filter === f ? `1px solid ${C.accent}55` : `1px solid ${C.border}`,
                  background: filter === f ? C.accentGlow : "transparent", color: filter === f ? "#a89df5" : C.textMuted,
                }}>{f}</button>
              ))}
            </div>

            <SummaryStats txs={filtered} />

            {Object.entries(grouped).map(([month, list]) => (
              <div key={month}>
                <div style={{ padding: "10px 20px 6px", fontFamily: "var(--f-mono)", fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em", background: "rgba(255,255,255,0.008)", borderBottom: `1px solid ${C.borderSubtle}` }}>
                  {month}
                </div>
                {list.map(tx => {
                  const idx = ri++;
                  return (
                    <div key={tx.id}>
                      <TxRow tx={tx} index={idx} isOpen={openId === tx.id} onToggle={() => setOpenId(openId === tx.id ? null : tx.id)} />
                      {openId === tx.id && <TxDetail tx={tx} />}
                    </div>
                  );
                })}
              </div>
            ))}

            {filtered.length === 0 && (
              <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--f-mono)", fontSize: 12, color: C.textDim }}>No transactions match.</div>
            )}

            <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: C.textDim, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: C.accent, fontSize: 12 }}>⚡</span> Rendered via <code style={{ color: C.accent, fontWeight: 600 }}>AppRenderer</code> · <code>ui://mercury/transactions</code>
              </div>
              <div style={{ padding: "2px 10px", borderRadius: 5, background: C.accentGlow, fontFamily: "var(--f-mono)", fontSize: 9.5, fontWeight: 700, color: C.accent, letterSpacing: "0.06em" }}>MCP-UI</div>
            </div>
          </div>
        )}

        {/* How it works */}
        {phase === "done" && (
          <div style={{ marginTop: 20, padding: "16px 20px", borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, animation: "slideUp 0.4s ease 0.3s both" }}>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>How This Works</div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: C.textMuted, lineHeight: 1.7 }}>
              <span style={{ color: C.accent }}>1.</span> Tool registered with <code style={{ color: "#a89df5" }}>_meta.ui.resourceUri: "ui://mercury/transactions"</code><br />
              <span style={{ color: C.accent }}>2.</span> Host calls <code style={{ color: "#a89df5" }}>Mercury:listTransactions</code> → gets JSON<br />
              <span style={{ color: C.accent }}>3.</span> <code style={{ color: "#a89df5" }}>&lt;AppRenderer toolResult=&#123;json&#125; /&gt;</code> renders the linked UI resource<br />
              <span style={{ color: C.accent }}>4.</span> Widget receives data via <code style={{ color: "#a89df5" }}>app.ontoolresult</code> → renders this interactive UI<br />
              <span style={{ color: C.accent }}>5.</span> User clicks → <code style={{ color: "#a89df5" }}>app.sendMessage()</code> sends follow-up back to conversation
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
