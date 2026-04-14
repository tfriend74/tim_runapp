// api/dashboard-data.js
// ─────────────────────────────────────────────────────────────────────────────
// GET endpoint called by the PWA when the user taps "Update".
// Returns the latest dashboard data from Vercel KV.
// Falls back gracefully if no data has been pushed yet.
// ─────────────────────────────────────────────────────────────────────────────

import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Allow the PWA (same domain) to call this
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const data = await kv.get("dashboard");

    if (!data) {
      return res.status(404).json({
        error: "No data yet. Open Health Auto Export on your iPhone and trigger a sync."
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("Dashboard data fetch error:", err);
    return res.status(500).json({ error: err.message });
  }
}
