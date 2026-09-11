import https from "node:https";
import { Readable } from "node:stream";
import { isIP } from "node:net";

type Options = Omit<RequestInit, "body"> & { body?: string | Buffer };
const addresses = new Map<string, { expires: number; values: string[] }>();
const pending = new Map<string, Promise<string[]>>();
const publicIPv4 = (value: string) => {
  if (isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return a !== 0 && a !== 10 && a !== 127 && a < 224 &&
    !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && b === 168) && !(a === 100 && b >= 64 && b <= 127);
};
async function resolvePublicHost(host: string): Promise<string[]> {
  const cached = addresses.get(host);
  if (cached && cached.expires > Date.now()) return cached.values;
  if (pending.has(host)) return pending.get(host)!;
  const work = (async () => {
    for (const resolver of ["https://cloudflare-dns.com/dns-query", "https://dns.google/resolve"]) {
      try {
        const response = await fetch(`${resolver}?name=${encodeURIComponent(host)}&type=A`, {
          headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(3500),
        });
        if (!response.ok) continue;
        const data = await response.json();
        const answer = (data.Answer || []).filter((row: any) => row.type === 1 && typeof row.data === "string");
        if (data.Status !== 0 || !answer.length || answer.some((row: any) => !publicIPv4(row.data))) continue;
        const values = answer.map((row: any) => row.data) as string[];
        addresses.set(host, { values, expires: Date.now() + Math.max(1, Math.min(60, ...answer.map((row: any) => Number(row.TTL) || 1))) * 1000 });
        return values;
      } catch { /* An independent resolver can still have a valid public answer. */ }
    }
    // Operator-verified ingress addresses are only a last resort, and only for this configured host.
    const configured = process.env.OURA_MINI_PC_URL;
    const fallback = (process.env.OURA_MINI_PC_PUBLIC_IPS || "").split(",").map(value => value.trim()).filter(Boolean);
    if (configured && new URL(configured).hostname === host && fallback.length && fallback.every(publicIPv4)) {
      addresses.set(host, { values: fallback, expires: Date.now() + 15000 });
      return fallback;
    }
    throw new Error("public_dns_invalid_answer");
  })();
  pending.set(host, work);
  try { return await work; } finally { pending.delete(host); }
}

/** Retry only DNS failures, before a request could be sent. Keep the original TLS hostname. */
export async function miniPcFetch(input: string | URL, options: Options = {}): Promise<Response> {
  try { return await fetch(input, options as RequestInit); }
  catch (error: any) {
    const url = new URL(input);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".ts.net") ||
        !["ENOTFOUND", "EAI_AGAIN"].includes(error?.cause?.code) || options.signal?.aborted) throw error;
    const ips = await resolvePublicHost(url.hostname);
    return new Promise<Response>((resolve, reject) => {
      const request = https.request(url, {
        method: options.method || "GET", headers: Object.fromEntries(new Headers(options.headers)),
        signal: options.signal || undefined, servername: url.hostname, rejectUnauthorized: true,
        lookup: ((_host: string, settings: any, callback: any) => settings?.all
          ? callback(null, ips.map(address => ({ address, family: 4 })))
          : callback(null, ips[0], 4)) as https.RequestOptions["lookup"],
      }, incoming => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers))
          if (value != null) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        const status = incoming.statusCode || 502;
        const body = [204, 205, 304].includes(status) ? null : Readable.toWeb(incoming) as ReadableStream;
        resolve(new Response(body, { status, headers }));
      });
      request.on("error", reject);
      request.end(options.body);
    });
  }
}
