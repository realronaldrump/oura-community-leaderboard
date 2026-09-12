/** Same-origin public relay. Node DNS avoids intermittent edge rewrite resolution failures. */
import { miniPcFetch } from "./_lib/miniPcTransport.js";
export const maxDuration = 60;
const allowed = new Set(["rpc", "record-rankings", "changes"]);
export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store");
  const operation = String(req.query?.operation || "");
  if (!allowed.has(operation)) return res.status(404).json({ error: "not_found" });
  if (req.method !== (operation === "changes" ? "GET" : "POST"))
    return res.status(405).json({ error: "method_not_allowed" });
  const origin = process.env.OURA_MINI_PC_URL;
  if (!origin) return res.status(503).json({ error: "storage_not_configured" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), operation === "changes" ? 45000 : 25000);
  const abort = () => controller.abort();
  res.once?.("close", abort);
  try {
    const url = new URL(`/public/${operation}`, origin);
    if (operation === "changes") {
      // EventSource sends Last-Event-ID on automatic reconnect; a newly opened
      // stream uses since after returning from a hidden tab.
      const since = req.headers?.["last-event-id"] || req.query?.since;
      if (typeof since === "string" && /^\d+$/.test(since)) url.searchParams.set("since", since);
    }
    if (url.protocol !== "https:") throw new Error("https_required");
    const body = operation === "changes" ? undefined : typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    if (body && Buffer.byteLength(body) > 3_000_000) return res.status(413).json({ error: "request_too_large" });
    const response = await miniPcFetch(url, { method: req.method, headers: { "Content-Type": "application/json" }, body, signal: controller.signal });
    res.status(response.status).setHeader("Content-Type", response.headers.get("content-type") || "application/json");
    if (operation !== "changes" || !response.ok) return res.send(await response.text());
    res.flushHeaders?.();
    if (response.body) for await (const chunk of response.body as any) res.write(chunk);
    res.end();
  } catch (error: any) {
    if (!controller.signal.aborted) console.error(JSON.stringify({ event: "public_storage_relay_failed", code: error?.cause?.code || error?.code || error?.name, message: error?.message }));
    if (res.headersSent) res.end();
    else res.status(503).json({ error: "storage_unavailable" });
  } finally {
    clearTimeout(timeout);
    res.removeListener?.("close", abort);
  }
}
