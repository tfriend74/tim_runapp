// api/debug-webhook.js
// Temporary debug endpoint — logs raw payload and returns it so we can 
// see exactly what Health Auto Export is sending. Delete after debugging.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const raw = req.body;
    
    // Return the full raw payload so we can inspect it
    return res.status(200).json({
      ok: true,
      method: req.method,
      headers: {
        "content-type": req.headers["content-type"],
        "x-webhook-secret": req.headers["x-webhook-secret"] ? "present" : "missing",
      },
      bodyType: typeof raw,
      isArray: Array.isArray(raw),
      topLevelKeys: typeof raw === "object" ? Object.keys(raw) : "not an object",
      // Show first item if array, or full body if small object
      sample: Array.isArray(raw) 
        ? { firstItem: raw[0], length: raw.length }
        : raw,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
