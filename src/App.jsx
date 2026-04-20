import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";

import {
  YTD_MILES, LAST_UPDATED,
  recentRuns  as STATIC_RUNS,
  speedData   as STATIC_SPEED,
  monthlyData as STATIC_MONTHLY,
  prs         as STATIC_PRS,
  hrMonthly   as STATIC_HR_MONTHLY,
} from "./data.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function formatPace(minPerMile) {
  if (!minPerMile || isNaN(minPerMile)) return "--:--";
  const mins = Math.floor(minPerMile);
  const secs = Math.round((minPerMile - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
function distanceToMiles(meters) {
  return (meters / 1609.34).toFixed(2);
}
function paceFromRun(distance, duration) {
  if (!distance || !duration) return 0;
  return parseFloat((1609.34 / (distance / duration) / 60).toFixed(2));
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
  <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 6, padding: "20px 24px", ...style }}>
    {children}
  </div>
);
const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 12, color: "#aaa", letterSpacing: "0.2em", marginBottom: 14, textTransform: "uppercase" }}>
    {children}
  </div>
);
const Stat = ({ label, value, sub, accent = "#fff" }) => (
  <div>
    <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.2em", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: accent }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>{sub}</div>}
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
const HrTT = ({ active, payload, label }) => {
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
  const [activeTab, setActiveTab] = useState("overview");
  const [updating, setUpdating]   = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");
  const [isLive, setIsLive]       = useState(false);
  const [lastUpdated, setLastUpdated] = useState(LAST_UPDATED);

  // Data state
  const [ytdMiles,    setYtdMiles]    = useState(YTD_MILES);
  const [recentRuns,  setRecentRuns]  = useState(STATIC_RUNS);
  const [speedData,   setSpeedData]   = useState(STATIC_SPEED);
  const [monthlyData, setMonthlyData] = useState(STATIC_MONTHLY);
  const [prs,         setPrs]         = useState(STATIC_PRS);
  const [hrMonthly,   setHrMonthly]   = useState(STATIC_HR_MONTHLY);
  const [hrSummary,   setHrSummary]   = useState({ avgHR: null, avgResting: 70, lowestResting: 68, peakHR: null });
  const [restingDaily, setRestingDaily] = useState([]);

  // PWA install
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  useEffect(() => {
    const h = e => { e.preventDefault(); setDeferredPrompt(e); setShowInstall(true); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShowInstall(false);
    setDeferredPrompt(null);
  };

  // Live update
  const handleUpdate = useCallback(async () => {
    setUpdating(true);
    setUpdateMsg("");
    try {
      const res  = await fetch("/api/dashboard-data");
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      const data = await res.json();

      if (data.ytdMiles    !== undefined) setYtdMiles(data.ytdMiles);
      if (data.recentRuns  ?.length)      setRecentRuns(data.recentRuns);
      if (data.speedData   ?.length)      setSpeedData(data.speedData);
      if (data.monthlyData ?.length)      setMonthlyData(data.monthlyData);
      if (data.prs         ?.length)      setPrs(data.prs);
      if (data.hrMonthly   ?.length)      setHrMonthly(data.hrMonthly);
      if (data.hrSummary)                 setHrSummary(data.hrSummary);
      if (data.lastUpdated)               setLastUpdated(fmtTimestamp(data.lastUpdated));

      // Build clean resting HR daily from hrDaily (filter to one per day, valid values only)
      if (data.hrDaily?.length) {
        const seen = new Set();
        const clean = data.hrDaily
          .filter(h => h.hr >= 40 && h.hr <= 120)
          .filter(h => { if (seen.has(h.date)) return false; seen.add(h.date); return true; })
          .slice(-30);
        setRestingDaily(clean);
      }

      setIsLive(true);
      setUpdateMsg("Live data loaded ✓");
    } catch (err) {
      setUpdateMsg("⚠ " + err.message);
    } finally {
      setUpdating(false);
      setTimeout(() => setUpdateMsg(""), 5000);
    }
  }, []);

  useEffect(() => { handleUpdate(); }, []);

  // Derived YTD stats from all runs
  const allDist     = recentRuns.reduce((s, r) => s + (r.distance || 0), 0);
  const allDur      = recentRuns.reduce((s, r) => s + (r.duration || 0), 0);
  const allCals     = recentRuns.reduce((s, r) => s + (r.calories || 0), 0);
  const avgPaceYTD  = allDist && allDur ? paceFromRun(allDist, allDur) : 0;
  const avgCalRun   = recentRuns.length ? Math.round(allCals / recentRuns.length) : 0;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "runs",     label: "Last 7 Runs" },
    { id: "monthly",  label: "Monthly" },
    { id: "hr",       label: "Heart Rate" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#080808", color: "#e8e8e8", fontFamily: "'Courier New', monospace", padding: "20px 20px 48px" }}>

      {/* Header */}
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

      {/* Update bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16, padding: "10px 14px", background: "#111", border: "1px solid #222", borderRadius: 6 }}>
        <button onClick={handleUpdate} disabled={updating} style={{
          background: updating ? "#333" : "#f97316", color: updating ? "#888" : "#000",
          border: "none", borderRadius: 4, padding: "7px 16px", fontSize: 12,
          fontFamily: "monospace", letterSpacing: "0.05em", cursor: updating ? "not-allowed" : "pointer",
          fontWeight: 700, transition: "all 0.2s", whiteSpace: "nowrap",
        }}>
          {updating ? "Syncing…" : "⟳ Update"}
        </button>
        <div style={{ fontSize: 11, color: "#555" }}>
          Last sync: <span style={{ color: "#888" }}>{lastUpdated}</span>
        </div>
        {updateMsg && <div style={{ fontSize: 11, marginLeft: "auto", color: updateMsg.startsWith("⚠") ? "#f87171" : "#22c55e" }}>{updateMsg}</div>}
        {showInstall && (
          <button onClick={handleInstall} style={{ marginLeft: "auto", background: "none", border: "1px solid #444", color: "#ccc", borderRadius: 4, padding: "6px 12px", fontSize: 11, cursor: "pointer", fontFamily: "monospace", whiteSpace: "nowrap" }}>
            + Add to Home Screen
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #222" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: "none", border: "none", cursor: "pointer", fontFamily: "monospace",
            fontSize: 12, letterSpacing: "0.04em", padding: "8px 14px",
            color: activeTab === t.id ? "#f97316" : "#777",
            borderBottom: activeTab === t.id ? "2px solid #f97316" : "2px solid transparent",
            marginBottom: -1, transition: "color 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {activeTab === "overview" && (
        <>
          {/* YTD summary stats */}
          <Card style={{ marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            <Stat label="YTD DISTANCE" value={ytdMiles + " mi"} sub="2026 runs" accent="#f97316" />
            <Stat label="YTD DURATION" value={allDur ? Math.round(allDur / 3600) + " hrs" : "--"} sub={allDur ? Math.round(allDur / 60) + " min total" : ""} />
            <Stat label="AVG PACE"     value={avgPaceYTD ? formatPace(avgPaceYTD) + " /mi" : "--"} sub="per mile avg" />
            <Stat label="AVG CALORIES" value={avgCalRun || "--"} sub="per run" />
          </Card>

          {/* Monthly distance bar chart */}
          <Card style={{ marginBottom: 14 }}>
            <SectionLabel>Monthly Distance (Miles)</SectionLabel>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={monthlyData} barSize={44}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252525" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#ccc", fontSize: 13 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<TT formatter={v => v.toFixed(1) + " mi"} />} />
                <Bar dataKey="miles" fill="#f97316" radius={[4, 4, 0, 0]} opacity={0.9} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Recent runs table */}
          <Card>
            <SectionLabel>Most Recent 7 Runs</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 55px 55px 65px 45px", alignItems: "center", gap: "0 4px" }}>
              {["DATE","DIST","TIME","PACE","CAL"].map(h => (
                <div key={h} style={{ fontSize: 10, color: "#aaa", letterSpacing: "0.1em", paddingBottom: 8, borderBottom: "1px solid #282828" }}>{h}</div>
              ))}
              {recentRuns.map((r, i) => (
                <>
                  <div key={`d${i}`}  style={{ fontSize: 11, color: "#ccc",    padding: "9px 0", borderBottom: "1px solid #1e1e1e" }}>{r.dayFull || r.date}</div>
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

      {/* ══ LAST 7 RUNS ══ */}
      {activeTab === "runs" && (
        <>
          <SectionLabel>Last 7 Runs — Full Detail</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {recentRuns.map((r, i) => (
              <Card key={i} style={{ position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 3, background: i === 0 ? "#f97316" : "#2a2a2a" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, marginTop: 6 }}>
                  <div>
                    <div style={{ fontSize: 14, color: "#fff", fontWeight: 700 }}>{r.dayFull || r.date}</div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{r.name || "Outdoor Run"}</div>
                  </div>
                  {i === 0 && <div style={{ fontSize: 10, color: "#f97316", letterSpacing: "0.15em" }}>MOST RECENT</div>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                  <Stat label="DISTANCE" value={distanceToMiles(r.distance) + " mi"} sub={(r.distance / 1000).toFixed(2) + " km"} />
                  <Stat label="DURATION" value={formatDuration(r.duration)} sub={Math.round(r.duration / 60) + " min"} />
                  <Stat label="AVG PACE" value={formatPace(paceFromRun(r.distance, r.duration)) + " /mi"} accent="#f97316" />
                  <Stat label="CALORIES" value={r.calories} sub="kcal" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 16, paddingTop: 16, borderTop: "1px solid #222" }}>
                  <Stat label="AVG HR"   value={r.avgHR > 0 ? r.avgHR + " bpm" : "--"} accent="#ef4444" />
                  <Stat label="MAX HR"   value={r.maxHR > 0 ? r.maxHR + " bpm" : "--"} accent="#ef4444" />
                  <Stat label="EFFORT"   value={r.avgHR > 160 ? "Hard" : r.avgHR > 140 ? "Moderate" : r.avgHR > 0 ? "Easy" : "--"} accent={r.avgHR > 160 ? "#ef4444" : r.avgHR > 140 ? "#f97316" : "#22c55e"} />
                </div>
              </Card>
            ))}
          </div>
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
            <SectionLabel>Miles Per Month</SectionLabel>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlyData} barSize={44}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252525" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#ccc", fontSize: 13 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<TT formatter={v => v.toFixed(1) + " mi"} />} />
                <Bar dataKey="miles" fill="#f97316" radius={[4, 4, 0, 0]} opacity={0.9} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <SectionLabel>Pace Progression — 2026</SectionLabel>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Lower = faster</div>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={speedData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252525" />
                <XAxis dataKey="date" tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[7, 16]} tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={formatPace} />
                <Tooltip content={<TT formatter={formatPace} />} />
                <Line type="monotone" dataKey="pace" stroke="#f97316" strokeWidth={2.5}
                  dot={{ fill: "#f97316", r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: "#fff" }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      {/* ══ HEART RATE ══ */}
      {activeTab === "hr" && (
        <>
          {/* Summary cards — resting HR only */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 14 }}>
            <Card>
              <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.2em", marginBottom: 6 }}>AVG RESTING HR</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#f97316" }}>{hrSummary.avgResting ? hrSummary.avgResting + " bpm" : "--"}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Jan – Apr 2026</div>
            </Card>
            <Card>
              <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.2em", marginBottom: 6 }}>LOWEST RESTING</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>{hrSummary.lowestResting ? hrSummary.lowestResting + " bpm" : "--"}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Best so far</div>
            </Card>
            <Card>
              <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.2em", marginBottom: 6 }}>AVG RUN HR</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#f97316" }}>{hrSummary.avgRunHR ? hrSummary.avgRunHR + " bpm" : "--"}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Avg during runs</div>
            </Card>
            <Card>
              <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.2em", marginBottom: 6 }}>PEAK RECORDED</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#ef4444" }}>{hrSummary.peakHR ? hrSummary.peakHR + " bpm" : "--"}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Highest in a run</div>
            </Card>
          </div>

          {/* Resting HR trend — one clean reading per day */}
          <Card style={{ marginBottom: 14 }}>
            <SectionLabel>Resting Heart Rate Trend</SectionLabel>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
              Daily resting HR from Apple Watch · lower is better
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={restingDaily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#252525" />
                <XAxis dataKey="date" tick={{ fill: "#999", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis domain={[50, 100]} tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} unit=" bpm" />
                <Tooltip content={<TT formatter={v => Math.round(v) + " bpm"} />} />
                {hrSummary.avgResting && (
                  <ReferenceLine y={hrSummary.avgResting} stroke="#f97316" strokeDasharray="4 4"
                    label={{ value: "avg", position: "insideTopRight", fill: "#f97316", fontSize: 9 }} />
                )}
                <Line type="monotone" dataKey="hr" stroke="#f97316" strokeWidth={2}
                  dot={{ fill: "#f97316", r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: "#fff" }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Monthly resting HR */}
          {hrMonthly.filter(m => m.resting).length > 0 && (
            <Card>
              <SectionLabel>Monthly Resting HR</SectionLabel>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>Monthly average resting heart rate</div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={hrMonthly.filter(m => m.resting)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#252525" />
                  <XAxis dataKey="month" tick={{ fill: "#ccc", fontSize: 13 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[55, 85]} tick={{ fill: "#999", fontSize: 10 }} axisLine={false} tickLine={false} unit=" bpm" />
                  <Tooltip content={<TT formatter={v => Math.round(v) + " bpm"} />} />
                  <Line type="monotone" dataKey="resting" name="Resting HR" stroke="#f97316" strokeWidth={2.5}
                    dot={{ fill: "#f97316", r: 5, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}
        </>
      )}

      <div style={{ marginTop: 24, fontSize: 10, color: "#333", textAlign: "center", letterSpacing: "0.1em" }}>
        {isLive ? "● LIVE · APPLE HEALTHKIT" : "STATIC DATA · TAP UPDATE TO SYNC"}
      </div>
    </div>
  );
}
