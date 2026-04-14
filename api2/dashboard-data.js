// api/dashboard-data.js
// GET endpoint called by the PWA Update button — reads from Upstash Redis.

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const raw  = await redis.get("dashboard");

    if (!raw) {
      return res.status(404).json({
        error: "No data yet — open Health Auto Export on your iPhone and tap Export Now."
      });
    }

    // Upstash auto-parses JSON, but handle both string and object just in case
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;

    return res.status(200).json(data);

  } catch (err) {
    console.error("Dashboard data fetch error:", err);
    return res.status(500).json({ error: err.message });
  }
}
