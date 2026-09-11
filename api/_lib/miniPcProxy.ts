import crypto from "node:crypto";
import { miniPcFetch } from "./miniPcTransport.js";
/** Explicit cutover only. A failed mini-PC request never writes to Firestore. */
export async function proxyToMiniPc(
  req: any,
  res: any,
  pathname: string,
): Promise<boolean> {
  const origin = process.env.OURA_MINI_PC_URL?.trim();
  if (!origin || process.env.OURA_DB_PATH) return false;
  if (pathname.startsWith("/api/cron/") || pathname === "/api/webhook/setup") {
    const expected = process.env.CRON_SECRET?.trim();
    const received = String(req.headers?.authorization || "").trim();
    const required = expected ? `Bearer ${expected}` : "";
    if (
      !required ||
      Buffer.byteLength(received) !== Buffer.byteLength(required) ||
      !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(required))
    ) {
      res.status(401).json({ error: "unauthorized" });
      return true;
    }
  }
  const token = process.env.OURA_MINI_PC_TOKEN?.trim();
  if (!token) {
    res.status(503).json({ error: "mini_pc_not_configured" });
    return true;
  }
  try {
    const destination = new URL(`/private${pathname}`, origin);
    const incoming = new URL(req.url || pathname, "https://app.invalid");
    destination.search = incoming.search;
    if (destination.protocol !== "https:") throw new Error("https_required");
    let body: Buffer | undefined;
    if (!["GET", "HEAD"].includes(req.method)) {
      if (req.body != null)
        body = Buffer.isBuffer(req.body)
          ? req.body
          : Buffer.from(
              typeof req.body === "string"
                ? req.body
                : JSON.stringify(req.body),
            );
      else {
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const chunk of req) {
          const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          length += value.length;
          if (length > 3_000_000) throw new Error("request_too_large");
          chunks.push(value);
        }
        body = Buffer.concat(chunks);
      }
      if (body.length > 3_000_000) throw new Error("request_too_large");
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": String(
        req.headers?.["content-type"] || "application/json",
      ),
      "X-Forwarded-Host": String(
        req.headers?.["x-forwarded-host"] || req.headers?.host || "",
      ),
      "X-Forwarded-Proto": "https",
    };
    for (const name of ["x-client-id", "x-oura-signature", "x-oura-timestamp"])
      if (req.headers?.[name]) headers[name] = String(req.headers[name]);
    const response = await miniPcFetch(destination, {
      method: req.method,
      headers,
      body: body as any,
      signal: AbortSignal.timeout(50000),
    });
    res
      .status(response.status)
      .setHeader(
        "Content-Type",
        response.headers.get("content-type") || "application/json",
      )
      .setHeader("Cache-Control", "no-store")
      .send(await response.text());
  } catch {
    res.status(503).json({ error: "mini_pc_unavailable" });
  }
  return true;
}
