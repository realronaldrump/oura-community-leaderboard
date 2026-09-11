// @vitest-environment node
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { miniPcFetch } from "../api/_lib/miniPcTransport";
const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:https", () => ({ default: { request: mock.request } }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("recovers failed DNS with public addresses, retaining TLS verification and private headers only at the destination", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(Object.assign(new Error("fetch failed"), { cause: { code: "ENOTFOUND" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: "208.111.34.11", TTL: 60 }] })));
  vi.stubGlobal("fetch", fetch);
  mock.request.mockImplementation((_url, options, callback) => {
    expect(options.servername).toBe("test.tailnet.ts.net");
    expect(options.rejectUnauthorized).toBe(true);
    expect(options.headers.authorization).toBe("Bearer private-value");
    const lookup = vi.fn(); options.lookup("test.tailnet.ts.net", { all: true }, lookup);
    expect(lookup).toHaveBeenCalledWith(null, [{ address: "208.111.34.11", family: 4 }]);
    const request: any = new EventEmitter();
    request.end = () => callback(Object.assign(Readable.from([Buffer.from('{"ok":true}')]), { statusCode: 200, headers: { "content-type": "application/json" } }));
    return request;
  });
  const response = await miniPcFetch("https://test.tailnet.ts.net:8443/public/rpc", { headers: { Authorization: "Bearer private-value" } });
  expect(await response.json()).toEqual({ ok: true });
  expect(fetch.mock.calls[1][1].headers).toEqual({ Accept: "application/dns-json" });
});
it("does not replay an uncertain request or accept private DNS answers", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("reset"), { cause: { code: "ECONNRESET" } })));
  await expect(miniPcFetch("https://test.tailnet.ts.net:8443/private/api/oauth/token", { method: "POST", body: "single-use" })).rejects.toThrow("reset");
  expect(mock.request).not.toHaveBeenCalled();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(Object.assign(new Error("DNS"), { cause: { code: "ENOTFOUND" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ Status: 0, Answer: [{ type: 1, data: "127.0.0.1", TTL: 60 }] }))));
  await expect(miniPcFetch("https://private-answer.ts.net:8443/public/rpc")).rejects.toThrow("public_dns_invalid_answer");
  expect(mock.request).not.toHaveBeenCalled();
});
it("uses verified ingress addresses only for the configured hostname after resolver failures", async () => {
  vi.stubEnv("OURA_MINI_PC_URL", "https://configured.ts.net:8443");
  vi.stubEnv("OURA_MINI_PC_PUBLIC_IPS", "208.111.34.11,208.111.35.209");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("DNS"), { cause: { code: "ENOTFOUND" } })));
  mock.request.mockImplementation((_url, options, callback) => {
    expect(options.servername).toBe("configured.ts.net");
    expect(options.rejectUnauthorized).toBe(true);
    const request: any = new EventEmitter();
    request.end = () => callback(Object.assign(Readable.from([Buffer.from("ok")]), { statusCode: 200, headers: {} }));
    return request;
  });
  expect(await (await miniPcFetch("https://configured.ts.net:8443/public/rpc")).text()).toBe("ok");
  await expect(miniPcFetch("https://different.ts.net:8443/public/rpc")).rejects.toThrow("public_dns_invalid_answer");
  expect(mock.request).toHaveBeenCalledTimes(1);
});
