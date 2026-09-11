// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import handler from "../api/storage";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const response = () => {
  const res: any = { statusCode: 200, headersSent: false };
  for (const name of ["status", "json", "send", "setHeader", "write", "end", "once", "removeListener", "flushHeaders"])
    res[name] = vi.fn().mockReturnValue(res);
  return res;
};
it("relays only public operations and preserves upstream errors without forwarding credentials", async () => {
  vi.stubEnv("OURA_MINI_PC_URL", "https://storage.example:8443");
  const fetch = vi.fn().mockResolvedValue(new Response('{"error":"rankings_preparing"}', { status: 409 }));
  vi.stubGlobal("fetch", fetch);
  const res = response();
  await handler({ method: "POST", query: { operation: "record-rankings" }, body: { eventId: "example" }, headers: { authorization: "private-key" } }, res);
  expect(String(fetch.mock.calls[0][0])).toBe("https://storage.example:8443/public/record-rankings");
  expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("authorization");
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.send).toHaveBeenCalledWith('{"error":"rankings_preparing"}');
  await handler({ method: "POST", query: { operation: "../private/status" } }, res);
  expect(res.status).toHaveBeenLastCalledWith(404);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("streams changes and reports transport failures as JSON without falling back to Firestore", async () => {
  vi.stubEnv("OURA_MINI_PC_URL", "https://storage.example:8443");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('data: {"revision":1}\n\n', { headers: { "Content-Type": "text/event-stream" } })));
  const res = response();
  await handler({ method: "GET", query: { operation: "changes" } }, res);
  expect(res.write).toHaveBeenCalled();
  expect(res.end).toHaveBeenCalled();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("DNS failed")));
  await handler({ method: "POST", query: { operation: "rpc" }, body: {} }, res);
  expect(res.status).toHaveBeenLastCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({ error: "storage_unavailable" });
});
