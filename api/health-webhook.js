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
        const d   = new Date();
        d.setDate(d.getDate() - i);
        const key   = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const run   = runDateMap[key];
        // Preserve existing HR data if we have it
        const existDay = (existing.last7Days || []).find(x => x.date === label);
        last7Days.push({
          date:   label,
          miles:  run ? parseFloat((run.distance / 1609.34).toFixed(2)) : 0,
          hr:     existDay?.hr || null,
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

      const merged = {
        ...existing,
        lastUpdated: new Date().toISOString(),
        ytdMiles, recentRuns, last7Days, speedData, monthlyData, prs,
      };
      await redis.set("dashboard", JSON.stringify(merged));
      return res.status(200).json({ ok: true, type: "workouts", runs: runs.length, ytdMiles });
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

      const hrSummary = {
        avgHR:         hrVals.length   ? Math.round(hrVals.reduce((a, b) => a + b) / hrVals.length)   : existing.hrSummary?.avgHR,
        avgResting:    restVals.length ? Math.round(restVals.reduce((a, b) => a + b) / restVals.length): existing.hrSummary?.avgResting,
        lowestResting: restVals.length ? Math.round(Math.min(...restVals))                             : existing.hrSummary?.lowestResting,
        peakHR:        hrVals.length   ? Math.round(Math.max(...hrVals))                               : existing.hrSummary?.peakHR,
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

      // Monthly HR
      const hrMonthMap = {};
      hrData.forEach(h => {
        const m = (h.date || "").slice(0, 7);
        const v = parseFloat(h.qty || 0);
        if (m && v >= 40 && v <= 220) { if (!hrMonthMap[m]) hrMonthMap[m] = { avg: [], rest: [] }; hrMonthMap[m].avg.push(v); }
      });
      restData.forEach(h => {
        const m = (h.date || "").slice(0, 7);
        const v = parseFloat(h.qty || 0);
        if (m && v >= 40 && v <= 120) { if (!hrMonthMap[m]) hrMonthMap[m] = { avg: [], rest: [] }; hrMonthMap[m].rest.push(v); }
      });
      const hrMonthly = Object.entries(hrMonthMap).sort().map(([k, v]) => ({
        month:   new Date(k + "-01").toLocaleDateString("en-US", { month: "short" }),
        avg:     v.avg.length   ? Math.round(v.avg.reduce((a, b) => a + b) / v.avg.length)   : null,
        resting: v.rest.length  ? Math.round(v.rest.reduce((a, b) => a + b) / v.rest.length)  : null,
      }));

      // Only include physiologically valid HR readings for the chart
      const hrDaily = hrData
        .filter(h => parseFloat(h.qty || 0) >= 40)
        .slice(-30)
        .map(h => ({
          date: new Date(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          hr:   Math.round(parseFloat(h.qty || 0)),
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
