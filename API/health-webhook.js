// api/health-webhook.js
// Receives POST from Health Auto Export, transforms data, saves to Upstash Redis.

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = req.headers["x-webhook-secret"] || req.headers["authorization"];
  if (secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const raw     = req.body;
    const metrics = Array.isArray(raw) ? raw : raw.data || raw.metrics || [];

    const find = (name) =>
      metrics.find((m) => m.name?.toLowerCase().includes(name.toLowerCase()));

    const workoutsMetric  = find("workout");
    const heartRateMetric = find("heart rate");
    const restingHRMetric = find("resting heart rate");

    // ── Runs ──────────────────────────────────────────────────────────────────
    const allWorkouts = workoutsMetric?.data || [];
    const runs = allWorkouts
      .filter((w) => w.workoutActivityType?.toLowerCase().includes("running") ||
                     w.workoutActivityType === "HKWorkoutActivityTypeRunning")
      .map((w) => ({
        date:     w.startDate || w.date,
        distance: Math.round((parseFloat(w.totalDistance) || 0) * 1000),
        duration: Math.round(parseFloat(w.duration) || 0),
        calories: Math.round(parseFloat(w.totalEnergyBurned) || 0),
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const recentRuns = runs.slice(0, 7).map((r) => {
      const d   = new Date(r.date);
      const fmt = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
      const short = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return { ...r, dayFull: fmt, dateLabel: short };
    });

    const ytdMeters = runs
      .filter((r) => r.date?.startsWith("2026"))
      .reduce((sum, r) => sum + r.distance, 0);
    const ytdMiles = parseFloat((ytdMeters / 1609.34).toFixed(1));

    // ── Last 7 days ───────────────────────────────────────────────────────────
    const hrByDay  = {};
    (heartRateMetric?.data || []).forEach((h) => {
      const day = h.date?.slice(0, 10);
      if (day) hrByDay[day] = Math.round(parseFloat(h.qty) || 0);
    });

    const runDates = new Set(runs.map((r) => r.date?.slice(0, 10)));
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d   = new Date();
      d.setDate(d.getDate() - i);
      const key   = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const run   = runs.find((r) => r.date?.startsWith(key));
      last7Days.push({
        date:   label,
        miles:  run ? parseFloat((run.distance / 1609.34).toFixed(2)) : 0,
        hr:     hrByDay[key] || null,
        hasRun: runDates.has(key),
      });
    }

    // ── PRs (2026 only) ───────────────────────────────────────────────────────
    const runs2026   = runs.filter((r) => r.date?.startsWith("2026"));
    const fmtDate    = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const fmtPace    = (sec, meters) => { const mpm = (sec/60)/(meters/1609.34); const m = Math.floor(mpm); const s = Math.round((mpm-m)*60); return `${m}:${s.toString().padStart(2,"0")} /mi`; };
    const fmtMiles   = (m) => (m / 1609.34).toFixed(2) + " mi";

    const longestRun = runs2026.reduce((b, r) => r.distance > (b?.distance||0) ? r : b, null);
    const fastestRun = runs2026.reduce((b, r) => { const p=r.duration/(r.distance/1609.34); const bp=b?b.duration/(b.distance/1609.34):Infinity; return p<bp?r:b; }, null);
    const mostCalRun = runs2026.reduce((b, r) => r.calories > (b?.calories||0) ? r : b, null);

    const prs = [
      longestRun  && { label: "Longest Run",    value: fmtMiles(longestRun.distance),                    date: fmtDate(longestRun.date),  note: `${longestRun.distance} m` },
      fastestRun  && { label: "Fastest Pace",   value: fmtPace(fastestRun.duration, fastestRun.distance), date: fmtDate(fastestRun.date),  note: fmtMiles(fastestRun.distance) },
      mostCalRun  && { label: "Most Calories",  value: mostCalRun.calories + " kcal",                    date: fmtDate(mostCalRun.date),  note: fmtMiles(mostCalRun.distance) },
    ].filter(Boolean);

    // Resting HR best
    const restingByMonth = {};
    (restingHRMetric?.data || []).forEach((h) => {
      const month = h.date?.slice(0,7); const val = parseFloat(h.qty)||0;
      if (month && (!restingByMonth[month] || val < restingByMonth[month])) restingByMonth[month] = val;
    });
    const bestResting = Object.entries(restingByMonth).filter(([m])=>m.startsWith("2026")).sort((a,b)=>a[1]-b[1])[0];
    if (bestResting) {
      const [mk, bpm] = bestResting;
      prs.push({ label: "Best Resting HR", value: Math.round(bpm)+" bpm", date: new Date(mk+"-01").toLocaleDateString("en-US",{month:"long",year:"numeric"}), note: "Monthly avg resting HR" });
    }

    // ── Pace history ──────────────────────────────────────────────────────────
    const speedData = runs2026.slice().reverse().map((r) => {
      const mpm = (r.duration/60)/(r.distance/1609.34);
      return { date: new Date(r.date).toLocaleDateString("en-US",{month:"short",day:"numeric"}), pace: parseFloat(mpm.toFixed(2)) };
    });

    // ── Monthly totals ────────────────────────────────────────────────────────
    const monthMap = {};
    runs2026.forEach((r) => {
      const m = new Date(r.date).toLocaleDateString("en-US",{month:"short"});
      if (!monthMap[m]) monthMap[m] = { miles:0, runs:0 };
      monthMap[m].miles += r.distance/1609.34;
      monthMap[m].runs  += 1;
    });
    const monthlyData = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
      .filter((m) => monthMap[m])
      .map((m) => ({ month: m, miles: parseFloat(monthMap[m].miles.toFixed(2)), runs: monthMap[m].runs }));

    // ── HR summaries ──────────────────────────────────────────────────────────
    const hrVals      = (heartRateMetric?.data||[]).map((h)=>parseFloat(h.qty)).filter(Boolean);
    const restVals    = (restingHRMetric?.data||[]).map((h)=>parseFloat(h.qty)).filter(Boolean);
    const hrSummary   = {
      avgHR:          hrVals.length   ? Math.round(hrVals.reduce((a,b)=>a+b,0)/hrVals.length)     : null,
      avgResting:     restVals.length ? Math.round(restVals.reduce((a,b)=>a+b,0)/restVals.length)  : null,
      lowestResting:  restVals.length ? Math.round(Math.min(...restVals))                          : null,
      peakHR:         hrVals.length   ? Math.round(Math.max(...hrVals))                            : null,
    };

    // Monthly HR
    const hrMonthMap = {};
    (heartRateMetric?.data||[]).forEach((h)=>{ const m=h.date?.slice(0,7); if(m){if(!hrMonthMap[m])hrMonthMap[m]={avg:[],rest:[]};hrMonthMap[m].avg.push(parseFloat(h.qty));} });
    (restingHRMetric?.data||[]).forEach((h)=>{ const m=h.date?.slice(0,7); if(m){if(!hrMonthMap[m])hrMonthMap[m]={avg:[],rest:[]};hrMonthMap[m].rest.push(parseFloat(h.qty));} });
    const hrMonthly = Object.entries(hrMonthMap).sort().map(([k,v])=>({
      month:   new Date(k+"-01").toLocaleDateString("en-US",{month:"short"}),
      avg:     v.avg.length  ? Math.round(v.avg.reduce((a,b)=>a+b,0)/v.avg.length)   : null,
      resting: v.rest.length ? Math.round(v.rest.reduce((a,b)=>a+b,0)/v.rest.length) : null,
    }));

    // Daily HR (last 30 days)
    const hrDaily = (heartRateMetric?.data||[]).slice(-30).map((h)=>({
      date: new Date(h.date).toLocaleDateString("en-US",{month:"short",day:"numeric"}),
      hr:   Math.round(parseFloat(h.qty)||0),
    }));

    // ── Save to Upstash Redis ─────────────────────────────────────────────────
    const dashboardData = {
      lastUpdated: new Date().toISOString(),
      ytdMiles, recentRuns, last7Days, speedData,
      monthlyData, prs, hrSummary, hrMonthly, hrDaily,
    };

    await redis.set("dashboard", JSON.stringify(dashboardData));

    return res.status(200).json({ ok: true, runs: runs.length, ytdMiles });

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message });
  }
}
