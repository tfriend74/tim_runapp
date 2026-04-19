// api/debug-webhook.js

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Manually parse body if needed
  let raw = req.body;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch(e) { raw = { parseError: e.message }; }
  }

  const topKeys = Object.keys(raw || {});
  const metrics = raw?.metrics || raw?.data;

  return res.status(200).json({
    ok: true,
    bodyType:       typeof req.body,
    topKeys,
    metricsType:    typeof metrics,
    metricsIsArray: Array.isArray(metrics),
    firstKey:       topKeys[0],
    firstKeyType:   typeof raw[topKeys[0]],
    firstKeyIsArray: Array.isArray(raw[topKeys[0]]),
    sample:         JSON.stringify(raw).slice(0, 300),
  });
}
