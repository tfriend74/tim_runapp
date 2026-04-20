// api/health-webhook.js
// Handles Health Auto Export v2 — both Workouts and Health Metrics formats

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
    const raw = req.body;

    // Load existing dashboard so we can merge workout + metrics data
    const existingRaw = await redis.get("dashboard");
    const existing = existingRaw
      ? (typeof existingRaw === "string" ? JSON.parse(existingRaw) : existingRaw)
      : {};

    // ── WORKOUTS format: { data: { workouts: [...] } } ────────────────────────
    if (raw?.data?.workouts) {
      const allWorkouts = raw.data.workouts;

      const runs = allWorkouts
        .filter(w => (w.name || "").toLowerCase().includes("run"))
        .map(w => ({
          date:     w.start,
          // distance.qty is in km — convert to meters
          distance: Math.round((w.distance?.qty || 0) * 1000),
          duration: Math.round(w.duration || 0),
          calories: Math.round(w.activeEnergyBurned?.qty || 0),
          name:     w.name,
          avgHR:    Math.round(w.heartRate?.avg?.qty || w.avgHeartRate?.qty || 0),
          maxHR:    Math.round(w.heartRate?.max?.qty || w.maxHeartRate?.qty || 0),
        }))
        .filter(r => r.date && r.distance > 0)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      const fmtLabel = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      };
      const fmtFull = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
      };
      const fmtDate = (dateStr) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      };
      const fmtPace = (sec, meters) => {
        const mpm = (sec / 60) / (meters / 1609.34);
        const m = Math.floor(mpm);
        const s = Math.round((mpm - m) * 60);
        return `${m}:${s.toString().padStart(2, "0")} /mi`;
      };
      const fmtMiles = (m) => (m / 1609.34).toFixed(2) + " mi";

      const recentRuns = runs.slice(0, 7).map(r => ({
        ...r,
        dateLabel: fmtLabel(r.date),
        date:      fmtLabel(r.date),
        dayFull:   fmtFull(r.date),
      }));

      const runs2026 = runs.filter(r => r.date?.startsWith("2026"));
      const ytdMeters = runs2026.reduce((s, r) => s + r.distance, 0);
      const ytdMiles  = parseFloat((ytdMeters / 1609.34).toFixed(1));

      // Last 7 calendar days
      const runDateMap = {};
      runs.forEach(r => {
        const key = new Date(r.date).toISOString().slice(0, 10);
        if (!runDateMap[key]) runDateMap[key] = r;
      });

      const last7Days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        // Use local date parts to avoid UTC timezone shift
        const year  = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day   = String(d.getDate()).padStart(2, "0");
        const key   = `${year}-${month}-${day}`;
        const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const run   = runDateMap[key];
        const existDay = (existing.last7Days || []).find(x => x.date === label);
        // Use workout avgHR if available — much more accurate than raw metric samples
        const workoutHR = run?.avgHR > 40 ? run.avgHR : null;
        last7Days.push({
          date:   label,
          miles:  run ? parseFloat((run.distance / 1609.34).toFixed(2)) : 0,
          hr:     workoutHR || existDay?.hr || null,
          hasRun: !!run,
        });
      }

      // PRs 2026
      const longestRun = runs2026.reduce((b, r) => r.distance > (b?.distance || 0) ? r : b, null);
      const fastestRun = runs2026.reduce((b, r) => {
        const p  = r.duration / (r.distance / 1609.34);
        const bp = b ? b.duration / (b.distance / 1609.34) : Infinity;
        return p < bp ? r : b;
      }, null);
      const mostCalRun = runs2026.reduce((b, r) => r.calories > (b?.calories || 0) ? r : b, null);

      const prs = [
        longestRun  && { label: "Longest Run",    value: fmtMiles(longestRun.distance),                       date: fmtDate(longestRun.date),  note: longestRun.name },
        fastestRun  && { label: "Fastest Pace",   value: fmtPace(fastestRun.duration, fastestRun.distance),   date: fmtDate(fastestRun.date),  note: fmtMiles(fastestRun.distance) },
        mostCalRun  && { label: "Most Calories",  value: mostCalRun.calories + " kcal",                       date: fmtDate(mostCalRun.date),  note: fmtMiles(mostCalRun.distance) },
      ].filter(Boolean);

      // Pace history
      const speedData = runs2026.slice().reverse().map(r => ({
        date: fmtLabel(r.date),
        pace: parseFloat(((r.duration / 60) / (r.distance / 1609.34)).toFixed(2)),
      }));

      // Monthly totals
      const monthMap = {};
      runs2026.forEach(r => {
        const m = new Date(r.date).toLocaleDateString("en-US", { month: "short" });
        if (!monthMap[m]) monthMap[m] = { miles: 0, runs: 0 };
        monthMap[m].miles += r.distance / 1609.34;
        monthMap[m].runs  += 1;
      });
      const monthlyData = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        .filter(m => monthMap[m])
        .map(m => ({ month: m, miles: parseFloat(monthMap[m].miles.toFixed(2)), runs: monthMap[m].runs }));

      // Calculate accurate HR stats from workout data
      const runHRs    = runs.filter(r => r.avgHR > 40).map(r => r.avgHR);
      const runMaxHRs = runs.filter(r => r.maxHR > 40).map(r => r.maxHR);
      const avgRunHR  = runHRs.length    ? Math.round(runHRs.reduce((a,b)=>a+b,0)/runHRs.length) : null;
      const peakHR    = runMaxHRs.length ? Math.round(Math.max(...runMaxHRs)) : null;

      // Build monthly avg HR from workouts
      const wktMonthHR = {};
      runs2026.filter(r => r.avgHR > 40).forEach(r => {
        const m = new Date(r.date).toLocaleDateString("en-US", { month: "short" });
        if (!wktMonthHR[m]) wktMonthHR[m] = [];
        wktMonthHR[m].push(r.avgHR);
      });

      // Merge workout avg run HR into existing weekly hrMonthly buckets
      const existingHrMonthly = existing.hrMonthly || [];
      // Build week->avgRunHR map from runs
      const weekRunHR = {};
      runs2026.filter(r => r.avgHR > 40).forEach(r => {
        const d = new Date(r.date);
        if (isNaN(d)) return;
        const day = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
        const key = monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        if (!weekRunHR[key]) weekRunHR[key] = [];
        weekRunHR[key].push(r.avgHR);
      });

      // Update existing hrMonthly with avg run HR per week
      const hrMonthlyFromWorkouts = existingHrMonthly.map(w => ({
        ...w,
        avg: weekRunHR[w.month]
          ? Math.round(weekRunHR[w.month].reduce((a,b)=>a+b,0)/weekRunHR[w.month].length)
          : w.avg,
      }));
      // Add weeks that have run data but no resting HR entry yet
      Object.entries(weekRunHR).forEach(([weekLabel, hrs]) => {
        if (!hrMonthlyFromWorkouts.find(w => w.month === weekLabel)) {
          hrMonthlyFromWorkouts.push({
            month: weekLabel,
            avg: Math.round(hrs.reduce((a,b)=>a+b,0)/hrs.length),
            resting: null,
          });
        }
      });
      hrMonthlyFromWorkouts.sort((a, b) => new Date(a.month) - new Date(b.month));

      // Merge hrSummary — preserve resting values from metrics, update peak/avg from workouts
      const hrSummary = {
        ...(existing.hrSummary || {}),
        avgRunHR,
        peakHR,
        avgHR: avgRunHR || existing.hrSummary?.avgHR,
      };

      const merged = {
        ...existing,
        lastUpdated: new Date().toISOString(),
        ytdMiles, recentRuns, last7Days, speedData, monthlyData, prs,
        hrSummary,
        hrMonthly: hrMonthlyFromWorkouts.length ? hrMonthlyFromWorkouts : existing.hrMonthly,
      };
      await redis.set("dashboard", JSON.stringify(merged));
      return res.status(200).json({ ok: true, type: "workouts", runs: runs.length, ytdMiles, peakHR, avgRunHR });
    }

    // ── HEALTH METRICS format: { data: { metrics: [...] } } ─────────────────
    const metricsArray = Array.isArray(raw?.data?.metrics) ? raw.data.metrics
                       : Array.isArray(raw?.metrics)       ? raw.metrics
                       : Array.isArray(raw?.data)          ? raw.data
                       : null;
    if (metricsArray) {
      const metrics = metricsArray;
      // Match both "heart rate" and "heart_rate" style names
      const find = (name) => metrics.find(m => {
        const n = (m.name || "").toLowerCase().replace(/_/g, " ");
        return n.includes(name.toLowerCase());
      });

      const hrMetric   = find("heart rate");
      const restMetric = find("resting heart");

      // Debug: log all metric names
      console.log("Metric names:", metrics.map(m => m.name).join(", "));

      const hrData   = hrMetric?.data   || [];
      const restData = restMetric?.data || [];

      // Filter out physiologically impossible values (HR must be 40-220)
      const hrVals   = hrData.map(h => parseFloat(h.qty || 0)).filter(v => v >= 40 && v <= 220);
      const restVals = restData.map(h => parseFloat(h.qty || 0)).filter(v => v >= 40 && v <= 120);

      // Use resting HR metric for resting values (accurate)
      // Use existing workout peak/avg HR for activity values (far more accurate than raw samples)
      const existingPeak    = existing.hrSummary?.peakHR    || null;
      const existingAvgRun  = existing.hrSummary?.avgRunHR  || null;

      const hrSummary = {
        avgHR:         hrVals.length   ? Math.round(hrVals.reduce((a, b) => a + b) / hrVals.length)    : existing.hrSummary?.avgHR,
        avgResting:    restVals.length ? Math.round(restVals.reduce((a, b) => a + b) / restVals.length) : existing.hrSummary?.avgResting,
        lowestResting: restVals.length ? Math.round(Math.min(...restVals))                              : existing.hrSummary?.lowestResting,
        peakHR:        existingPeak,  // preserved from workout data, not raw HR metric
      };

      // Daily HR lookup for last7Days merge
      // Build daily HR map using only valid readings (>=40 bpm)
      const hrByDay = {};
      hrData.forEach(h => {
        const val = parseFloat(h.qty || 0);
        if (val < 40) return; // skip impossible values
        const day = (h.date || "").slice(0, 10);
        if (!day) return;
        // Keep the highest valid reading per day (most likely a real active reading)
        if (!hrByDay[day] || val > hrByDay[day]) hrByDay[day] = Math.round(val);
      });

      const last7Days = (existing.last7Days || []).map(d => {
        const matchKey = Object.keys(hrByDay).find(k =>
          new Date(k).toLocaleDateString("en-US", { month: "short", day: "numeric" }) === d.date
        );
        return { ...d, hr: matchKey ? hrByDay[matchKey] : d.hr };
      });

      // Weekly resting HR averages — group restData into 7-day buckets
      const weekBuckets = {};
      restData.forEach(h => {
        const v = parseFloat(h.qty || 0);
        if (v < 40 || v > 120) return;
        const d = new Date(h.date || "");
        if (isNaN(d)) return;
        // Get Monday of the week as bucket key
        const day = d.getDay(); // 0=Sun
        const monday = new Date(d);
        monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
        const key = monday.toISOString().slice(0, 10);
        if (!weekBuckets[key]) weekBuckets[key] = [];
        weekBuckets[key].push(v);
      });

      // Build hrMonthly as weekly resting HR averages
      const hrMonthMap = {};
      Object.entries(weekBuckets).sort().forEach(([weekStart, vals]) => {
        const d     = new Date(weekStart);
        const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        hrMonthMap[weekStart] = {
          label,
          resting: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
          avg:     null, // filled in from workout data below
        };
      });
      // Convert week buckets to array for chart
      const hrMonthly = Object.values(hrMonthMap).map(w => ({
        month:   w.label,
        resting: w.resting,
        avg:     w.avg,
      }));

      // Use RESTING HR for the daily chart — one clean reading per day, no duplicates
      const restingByDate = {};
      restData.forEach(h => {
        const val = parseFloat(h.qty || 0);
        if (val < 40 || val > 120) return;
        const day = (h.date || "").slice(0, 10);
        if (!day) return;
        if (!restingByDate[day] || val < restingByDate[day]) restingByDate[day] = val;
      });
      const hrDaily = Object.entries(restingByDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([dateStr, val]) => ({
          date: new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          hr:   Math.round(val),
        }));

      const merged = {
        ...existing,
        lastUpdated: new Date().toISOString(),
        hrSummary, hrMonthly, hrDaily, last7Days,
      };
      await redis.set("dashboard", JSON.stringify(merged));
      return res.status(200).json({ ok: true, type: "metrics", hrPoints: hrVals.length, restPoints: restVals.length, metricNames: metrics.map(m => m.name) });
    }

    // Unknown format
    return res.status(200).json({ ok: true, type: "unknown", keys: Object.keys(raw?.data || raw || {}) });

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: err.message });
  }
}
