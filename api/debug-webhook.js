// api/debug-webhook.js — saves raw payload to Redis for inspection

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const raw = req.body;

  // Save a trimmed debug snapshot to Redis
  const debug = {
    topLevelKeys: typeof raw === "object" && !Array.isArray(raw) ? Object.keys(raw) : "array",
    isArray: Array.isArray(raw),
    // If it has a 'data' key, show keys inside that too
    dataKeys: raw?.data ? (Array.isArray(raw.data) ? `array[${raw.data.length}]` : Object.keys(raw.data)) : "no data key",
    // First item of data array if it exists
    firstDataItem: Array.isArray(raw?.data) ? raw.data[0] : null,
    // If data is object, show first metric
    firstMetric: !Array.isArray(raw?.data) && raw?.data ? Object.entries(raw.data)[0] : null,
    // Sample of full body (first 2000 chars)
    rawSample: JSON.stringify(raw).slice(0, 2000),
  };

  await redis.set("debug_payload", JSON.stringify(debug));

  return res.status(200).json({ ok: true, saved: true, topLevelKeys: debug.topLevelKeys });
}
