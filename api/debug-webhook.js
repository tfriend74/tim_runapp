// api/debug-webhook.js — saves raw payload analysis to Redis

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
  const metrics = raw?.metrics;

  const debug = {
    topLevelKeys:    Object.keys(raw || {}),
    metricsType:     typeof metrics,
    metricsIsArray:  Array.isArray(metrics),
    metricsKeys:     metrics && !Array.isArray(metrics) ? Object.keys(metrics) : null,
    firstMetricItem: Array.isArray(metrics) ? metrics[0] : metrics,
    rawSample:       JSON.stringify(raw).slice(0, 1000),
  };

  await redis.set("debug_payload", JSON.stringify(debug));
  return res.status(200).json({ ok: true, saved: true, metricsType: debug.metricsType, metricsIsArray: debug.metricsIsArray });
}
