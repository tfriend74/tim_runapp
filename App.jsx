import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";

// Static fallback data (shown until first live sync)
import {
  YTD_MILES, LAST_UPDATED,
  recentRuns   as STATIC_RUNS,
  last7Days    as STATIC_7DAYS,
  speedData    as STATIC_SPEED,
  weeklyData   as STATIC_WEEKLY,
  monthlyData  as STATIC_MONTHLY,
  prs          as STATIC_PRS,
  hrMonthly    as STATIC_HR_MONTHLY,
  hrDaily      as STATIC_HR_DAILY,
} from "./data.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function formatPace(minPerMile) {
  const mins = Math.floor(minPerMile);
  const secs = Math.round((minPerMile - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
function distanceToMiles(meters) {
  return (meters / 1609.34).toFixed(2);
}
function paceFromRun(distance, duration) {
  const mps = distance / duration;
  return parseFloat((1609.34 / mps / 60).toFixed(2));
}
function fmtTimestamp(iso) {
  if (!iso) return LAST_UPDATED;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit"
  });
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
const Card = ({ children, style = {} }) => (
  <div style={{
    background: "#141414", border: "1px solid #2a2a2a",
    borderRadius: 6, padding: "20px 24px", ...style
  }}>
    {children}
  </div>
);

const SectionLabel = ({ children }) => (
  <div style={{
    fontSize: 12, color: "#aaa", letterSpacing: "0.2em",
    marginBottom: 14, textTransform: "uppercase"
  }}>
    {children}
  </div>
);

const TT = ({ active, payload, label, formatter }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1a1a1a", border: "1px solid #333", padding: "8px 12px", borderRadius: 4 }}>
      <p style={{ color: "#aaa", fontSize: 11, margin: 0 }}>{label}</p>
      <p style={{ color: "#f97316", fontSize: 14, margin: "3px 0 0", fontFamily: "monospace" }}>
        {formatter ? formatter(payload[0].value) : payload[0].value}
      </p>
    </div>
  );
};

const HrTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1a1a1a", border: "1px solid #333", padding: "8px 12px", borderRadius: 4 }}>
      <p style={{ color: "#aaa", fontSize: 11, margin: 0 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, fontSize: 13, margin: "3px 0 0", fontFamily: "monospace" }}>
          {p.name}: {Math.round(p.value)} bpm
        </p>
      ))}
    </div>
  );
};

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [selectedRun, setSelectedRun] = useState(0);
  const [activeTab, setActiveTab]     = useState("overview");
  const [updating, setUpdating]       = useState(false);
  const [updateMsg, setUpdateMsg]     = useState("");
  const [isLive, setIsLive]           = useState(false);

  // Live data state — starts with static fallback, replaced on first update
  const [ytdMiles,    setYtdMiles]    = useState(YTD_MILES);
  const [lastUpdated, setLastUpdated] = useState(LAST_UPDATED);
  const [recentRuns,  setRecentRuns]  = useState(STATIC_RUNS);
  const [last7Days,   setLast7Days]   = useState(STATIC_7DAYS);
  const [speedData,   setSpeedData]   = useState(STATIC_SPEED);
  const [monthlyData, setMonthlyData] = useState(STATIC_MONTHLY);
  const [prs,         setPrs]         = useState(STATIC_PRS);
  const [hrMonthly,   setHrMonthly]   = useState(STATIC_HR_MONTHLY);
  const [hrDaily,     setHrDaily]     = useState(STATIC_HR_DAILY);
  const [hrSummary,   setHrSummary]   = useState({
    avgHR: 91, avgResting: 74, lowestResting: 71, peakHR: 138
  });

  // PWA install prompt
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall,    setShowInstall]    = useState(false);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); setShowInstall(true); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShowInstall(false);
    setDeferredPrompt(null);
  };

  // ── Live update from API ──────────────────────────────────────────────────
  const handleUpdate = useCallback(async () => {
    setUpdating(true);
    setUpdateMsg("");
    try {
      const res  = await fetch("/api/dashboard-data");
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch data");
      }
      const data = await res.json();

      // Hydrate all state from live data
      if (data.ytdMiles    !== undefined) setYtdMiles(data.ytdMiles);
      if (data.recentRuns  ?.length)      setRecentRuns(data.recentRuns.map(r => ({
        ...r, date: r.dateLabel, dayFull: r.dayFull
      })));
      if (data.last7Days   ?.length)      setLast7Days(data.last7Days);
      if (data.speedData   ?.length)      setSpeedData(data.speedData);
      if (data.monthlyData ?.length)      setMonthlyData(data.monthlyData);
      if (data.prs         ?.length)      setPrs(data.prs);
      if (data.hrMonthly   ?.length)      setHrMonthly(data.hrMonthly);
      if (data.hrDaily     ?.length)      setHrDaily(data.hrDaily);
      if (data.hrSummary)                 setHrSummary(data.hrSummary);
      if (data.lastUpdated)               setLastUpdated(fmtTimestamp(data.lastUpdated));

      setIsLive(true);
      setSelectedRun(0);
      setUpdateMsg("Live data loaded ✓");
    } catch (err) {
      setUpdateMsg("⚠ " + err.message);
    } finally {
      setUpdating(false);
      setTimeout(() => setUpdateMsg(""), 5000);
    }
  }, []);

  // Auto-fetch on first load
  useEffect(() => { handleUpdate(); }, []);

  const run  = recentRuns[selectedRun] || recentRuns[0];
  const tabs = [
    { id: "overview", label: "Overview"   },
    { id: "pr",       label: "PRs"        },
    { id: "monthly",  label: "Monthly"    },
    { id: "hr",       label: "Heart Rate" },
  ];

  return (
    <div style={{
      minHeight: "100vh", background: "#080808",
      color: "#e8e8e8", fontFamily: "'Courier New', monospace",
      padding: "20px 20px 48px"
    }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 2 }}>
            RUNNING LOG {isLive && <span style={{ color: "#22c55e", fontSize: 9 }}>● LIVE</span>}
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, fontFamily: "Georgia, serif", color: "#fff" }}>
            Tim's Run Data
          </h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.1em" }}>YTD MILES</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#f97316", fontFamily: "monospace" }}>
            {ytdMiles} <span style={{ fontSize: 14, color: "#ccc" }}>mi</span>
          </div>
        </div>
      </div>

      {/* ── Update bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        marginBottom: 16, padding: "10px 14px",
        background: "#111", border: "1px solid #222", borderRadius: 6
      }}>
        <button
          onClick={handleUpdate}
          disabled={updating}
          style={{
            background: updating ? "#333" : "#f97316",
            color: updating ? "#888" : "#000",
            border: "none", borderRadius: 4,
            padding: "7px 16px", fontSize: 12,
            fontFamily: "monospace", letterSpacing: "0.05em",
            cursor: updating ? "not-allowed" : "pointer",
            fontWeight: 700, transition: "all 0.2s", whiteSpace: "nowrap",
          }}
        >
          {updating ? "Syncing…" : "⟳ Update"}
        </button>
        <div style={{ fontSize: 11, color: "#555", minWidth: 0 }}>
          Last sync: <span style={{ color: "#888" }}>{lastUpdated}</span>
        </div>
        {updateMsg && (
          <div style={{
            fontSize: 11, marginLeft: "auto",
            color: updateMsg.startsWith("⚠") ? "#f87171" : "#22c55e"
          }}>
            {updateMsg}
          </div>
        )}
        {showInstall && (
          <button
            onClick={handleInstall}
            style={{
              marginLeft: "auto", background: "none", border: "1px solid #444",
              color: "#ccc", borderRadius: 4, padding: "6px 12px",
              fontSize: 11, cursor: "pointer", fontFamily: "monospace", whiteSpace: "nowrap"
            }}
          >
            + Add to Home Screen
          </button>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #222" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontFamily: "monospace", fontSize: 12, letterSpacing: "0.04em",
            padding: "8px 14px",
            color: activeTab === t.id ? "#f97316" : "#777",
            borderBottom: activeTab === t.id ? "2px solid #f97316" : "2px solid transparent",
            marginBottom: -1, transition: "color 0.15s",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {activeTab === "overview" && run && (
        <>
          <div style={{ marginBottom: 14 }}>
            <SectionLabel>Most Recent 7 Runs</SectionLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {recentRuns.map((r, i) => (
                <button key={i} onClick={() => setSelectedRun(i)} style={{
                  background: selectedRun === i ? "#f97316" : "#1c1c1c",
                  border: selectedRun === i ? "1px solid #f97316" : "1px solid #333",
                  color: selectedRun === i ? "#000" : "#ddd",
                  padding: "7px 13px", borderRadius: 3, fontSize: 12,
                  cursor: "pointer", fontFamily: "monospace",
                  letterSpacing: "0.04em", transition: "all 0.15s",
                }}>
                  {r.date}
                </button>
              ))}
            </div>
          </div>

          <Card style={{ marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {[
              { label: "DISTANCE", value: distanceToMiles(run.distance) + " mi", sub: (run.distance/1000).toFixed(2) + " km" },
              { label: "DURATION", value: formatDuration(run.duration), sub: Math.round(run.duration/60) + " min" },
              { label: "AVG PACE", value: formatPace(paceFromRun(run.distance, run.duration)) + " /mi", sub: "per mile" },
              { label: "CALORIES", value: run.calories, sub: "kcal burned" },
            ].map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.2em", marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>{s.sub}</div>
              </div>
            ))}
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <SectionLabel>Last 7 Days — Daily Distance</SectionLabel>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Orange = run day</div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={last7Days} barSize={26}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252525" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<TT formatter={v => v.toFixed(2) + " mi"} />} />
                <Bar dataKey="miles" radius={[3, 3, 0, 0]}>
                  {last7Days.map((entry, index) => (
                    <Cell key={index} fill={entry.hasRun ? "#f97316" : "#333"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card style={{ marginBottom: 14 }}>
            <SectionLabel>Last 7 Days — Heart Rate</SectionLabel>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={last7Days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252525" />
                <XAxis dataKey="date" tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[60, 130]} tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} unit=" bpm" />
                <Tooltip content={<TT formatter={v => Math.round(v) + " bpm"} />} />
                <Line type="monotone" dataKey="hr" stroke="#ef4444" strokeWidth={2}
                  dot={{ fill: "#ef4444", r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: "#fff" }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <SectionLabel>Most Recent 7 Runs</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 55px 55px 65px 45px", alignItems: "center", gap: "0 4px" }}>
              {["DATE","DIST","TIME","PACE","CAL"].map(h => (
                <div key={h} style={{ fontSize: 10, color: "#aaa", letterSpacing: "0.1em", paddingBottom: 8, borderBottom: "1px solid #282828" }}>{h}</div>
              ))}
              {recentRuns.map((r, i) => (
                <>
                  <div key={`d${i}`}  style={{ fontSize: 11, color: "#ccc",    padding: "9px 0", borderBottom: "1px solid #1e1e1e" }}>{r.dayFull}</div>
                  <div key={`di${i}`} style={{ fontSize: 11, color: "#fff",    padding: "9px 0", borderBottom: "1px solid #1e1e1e" }}>{distanceToMiles(r.distance)}</div>
                  <div key={`du${i}`} style={{ fontSize: 11, color: "#fff",    padding: "9px 0", borderBottom: "1px solid #1e1e1e" }}>{formatDuration(r.duration)}</div>
                  <div key={`p${i}`}  style={{ fontSize: 11, color: "#f97316", padding: "9px 0", borderBottom: "1px solid #1e1e1e" }}>{formatPace(paceFromRun(r.distance, r.duration))}</div>
                  <div key={`c${i}`}  style={{ fontSize: 11, color: "#fff",    padding: "9px 0", borderBottom: "1px solid #1e1e1e" }}>{r.calories}</div>
                </>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* ══ PRs ══ */}
      {activeTab === "pr" && (
        <>
          <SectionLabel>2026 Personal Records</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
            {prs.map((pr, i) => (
              <Card key={i} style={{ position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 3, background: "#f97316" }} />
                <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.15em", marginBottom: 8, marginTop: 6 }}>{pr.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#f97316", letterSpacing: "-0.02em", marginBottom: 6 }}>{pr.value}</div>
                <div style={{ fontSize: 11, color: "#888" }}>Set {pr.date}</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{pr.note}</div>
              </Card>
            ))}
          </div>

          <Card>
            <SectionLabel>Pace Progression — 2026</SectionLabel>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Lower = faster</div>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={speedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252525" />
                <XAxis dataKey="date" tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[7, 14]} tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={formatPace} />
                <Tooltip content={<TT formatter={formatPace} />} />
                <ReferenceLine y={8.11} stroke="#f97316" strokeDasharray="5 4"
                  label={{ value: "PR", position: "insideTopRight", fill: "#f97316", fontSize: 10 }} />
                <Line type="monotone" dataKey="pace" stroke="#f97316" strokeWidth={2.5}
                  dot={{ fill: "#f97316", r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: "#fff" }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      {/* ══ MONTHLY ══ */}
      {activeTab === "monthly" && (
        <>
          <SectionLabel>Monthly Run Totals</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 14 }}>
            {monthlyData.map((m, i) => (
              <Card key={i}>
                <div style={{ fontSize: 12, color: "#aaa", letterSpacing: "0.15em", marginBottom: 8 }}>{m.month.toUpperCase()}</div>
                <div style={{ fontSize: 30, fontWeight: 700, color: m.miles > 0 ? "#f97316" : "#444", letterSpacing: "-0.02em" }}>
                  {m.miles > 0 ? m.miles.toFixed(1) : "—"}
                </div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                  {m.miles > 0 ? `${m.runs} run${m.runs !== 1 ? "s" : ""} tracked` : "No run data"}
                </div>
              </Card>
            ))}
          </div>

          <Card style={{ marginBottom: 14 }}>
            <SectionLabel>Miles Per Month (Runs Only)</SectionLabel>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={monthlyData} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252525" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#ccc", fontSize: 13 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<TT formatter={v => v.toFixed(1) + " mi"} />} />
                <Bar dataKey="miles" fill="#f97316" radius={[4, 4, 0, 0]} opacity={0.9} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      {/* ══ HEART RATE ══ */}
      {activeTab === "hr" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 14 }}>
            {[
              { label: "YTD AVG HR",      value: hrSummary.avgHR      ? hrSummary.avgHR      + " bpm" : "—", sub: "All-day average",     accent: "#f97316" },
              { label: "AVG RESTING HR",  value: hrSummary.avgResting  ? hrSummary.avgResting + " bpm" : "—", sub: "Jan – Apr 2026",      accent: "#f97316" },
              { label: "LOWEST RESTING",  value: hrSummary.lowestResting ? hrSummary.lowestResting + " bpm" : "—", sub: "Best so far", accent: "#22c55e" },
              { label: "PEAK RECORDED",   value: hrSummary.peakHR     ? hrSummary.peakHR     + " bpm" : "—", sub: "Highest recorded",    accent: "#ef4444" },
            ].map((s, i) => (
              <Card key={i}>
                <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.2em", marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: s.accent }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{s.sub}</div>
              </Card>
            ))}
          </div>

          <Card style={{ marginBottom: 14 }}>
            <SectionLabel>Daily Heart Rate Trend</SectionLabel>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Spikes correlate with run days</div>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={hrDaily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252525" />
                <XAxis dataKey="date" tick={{ fill: "#999", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis domain={[60, 150]} tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} unit=" bpm" />
                <Tooltip content={<TT formatter={v => Math.round(v) + " bpm"} />} />
                <ReferenceLine y={hrSummary.avgHR || 91} stroke="#f97316" strokeDasharray="4 4"
                  label={{ value: "avg", position: "insideTopRight", fill: "#f97316", fontSize: 9 }} />
                <Line type="monotone" dataKey="hr" stroke="#ef4444" strokeWidth={2}
                  dot={{ fill: "#ef4444", r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: "#fff" }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <SectionLabel>Monthly Avg HR vs Resting HR</SectionLabel>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
              <span style={{ color: "#ef4444" }}>■</span> Avg HR &nbsp;·&nbsp;
              <span style={{ color: "#f97316" }}>■</span> Resting HR
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={hrMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252525" />
                <XAxis dataKey="month" tick={{ fill: "#ccc", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis domain={[60, 110]} tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} unit=" bpm" />
                <Tooltip content={<HrTooltip />} />
                <Line type="monotone" dataKey="avg"     name="Avg HR"     stroke="#ef4444" strokeWidth={2.5} dot={{ fill: "#ef4444", r: 4, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="resting" name="Resting HR" stroke="#f97316" strokeWidth={2.5} dot={{ fill: "#f97316", r: 4, strokeWidth: 0 }} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      <div style={{ marginTop: 24, fontSize: 10, color: "#333", textAlign: "center", letterSpacing: "0.1em" }}>
        {isLive ? "● LIVE · APPLE HEALTHKIT" : "STATIC DATA · TAP UPDATE TO SYNC"}
      </div>
    </div>
  );
}
