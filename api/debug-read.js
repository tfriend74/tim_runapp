// api/debug-read.js — reads the saved debug payload from Redis

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const raw  = await redis.get("debug_payload");
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  return res.status(200).json(data || { error: "No debug data yet" });
}
