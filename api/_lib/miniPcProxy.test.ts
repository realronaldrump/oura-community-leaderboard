// @vitest-environment node
import { Readable } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { proxyToMiniPc } from "./miniPcProxy";

const result = () => {
  const res: any = {};
  for (const method of ["status", "json", "setHeader", "send"])
    res[method] = vi.fn().mockReturnValue(res);
  return res;
};
beforeEach(() => {
  vi.stubEnv("OURA_DB_PATH", "");
  vi.stubEnv("OURA_MINI_PC_URL", "https://storage.example:8443");
  vi.stubEnv("OURA_MINI_PC_TOKEN", "private-transport-key");
  vi.stubEnv("CRON_SECRET", "original-cron-key");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("keeps the existing backend when the cutover flag is absent", async () => {
  vi.stubEnv("OURA_MINI_PC_URL", "");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(await proxyToMiniPc({}, result(), "/api/oauth/token")).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});

it("preserves signed webhook bytes and uses a separate server transport key", async () => {
  const body = Buffer.from('{"note":"café 🧡"}');
  const split = body.indexOf(Buffer.from("🧡")) + 1;
  const req = Object.assign(Readable.from([body.subarray(0, split), body.subarray(split)]), {
    method: "POST", url: "/api/webhook/oura?x=1",
    headers: { "x-oura-signature": "signed", "x-oura-timestamp": "123", authorization: "untrusted" },
  });
  const fetch = vi.fn().mockResolvedValue(new Response('{"queued":true}'));
  vi.stubGlobal("fetch", fetch);
  expect(await proxyToMiniPc(req, result(), "/api/webhook/oura")).toBe(true);
  const [url, options] = fetch.mock.calls[0];
  expect(String(url)).toBe("https://storage.example:8443/private/api/webhook/oura?x=1");
  expect(options.body).toEqual(body);
  expect(options.headers.Authorization).toBe("Bearer private-transport-key");
  expect(options.headers["x-oura-signature"]).toBe("signed");
});

it("rejects unauthenticated cron calls before contacting private storage", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const res = result();
  expect(await proxyToMiniPc({ method: "GET", headers: {} }, res, "/api/cron/oura-sync")).toBe(true);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(fetch).not.toHaveBeenCalled();
});

it("never falls through to a second writer after a transport failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("unreachable")));
  const res = result();
  expect(await proxyToMiniPc({ method: "POST", body: {}, headers: {} }, res, "/api/profiles/connect")).toBe(true);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({ error: "mini_pc_unavailable" });
});
