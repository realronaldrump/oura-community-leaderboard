import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
}));
vi.mock("firebase/firestore", () => native);
class FakeEvents {
  static instances: FakeEvents[] = [];
  onmessage: any;
  onopen: any;
  close = vi.fn();
  constructor(public url: string) {
    FakeEvents.instances.push(this);
  }
}
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_OURA_API_URL", "https://storage.example");
  vi.stubGlobal("EventSource", FakeEvents);
  vi.clearAllMocks();
  FakeEvents.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
describe("remote document transport", () => {
  it("uses a same-origin relay without connecting the browser to a tailnet address", async () => {
    vi.stubEnv("VITE_OURA_API_URL", "/storage");
    const fetch = vi.fn().mockResolvedValue(response({ documents: [], at: "signed", nextCursor: null }));
    vi.stubGlobal("fetch", fetch);
    const client = await import("./documentClient");
    const callback = vi.fn();
    const unsubscribe = client.onSnapshot(client.collection({}, "profiles"), callback);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
    expect(fetch.mock.calls[0][0]).toBe("/storage/public/rpc");
    expect(FakeEvents.instances[0].url).toBe("/storage/public/changes");
    expect(native.getDocs).not.toHaveBeenCalled();
    unsubscribe();
  });
  it("collects every byte-bounded page at the same signed snapshot", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          documents: [
            {
              path: "profiles/a",
              exists: true,
              version: 1,
              data: { name: "A" },
            },
          ],
          at: "signed-snapshot",
          nextCursor: 1,
        }),
      )
      .mockResolvedValueOnce(
        response({
          documents: [
            {
              path: "profiles/b",
              exists: true,
              version: 2,
              data: { name: "B" },
            },
          ],
          at: "signed-snapshot",
          nextCursor: null,
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const client = await import("./documentClient");
    const result = await client.getDocs(client.collection({}, "profiles"));
    expect(result.docs.map((d: any) => d.data().name)).toEqual(["A", "B"]);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
      cursor: 1,
      at: "signed-snapshot",
    });
    expect(native.getDocs).not.toHaveBeenCalled();
  });
  it("delivers an initially empty subscription and releases the shared event stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response({ documents: [], at: "signed", nextCursor: null }),
        ),
    );
    const client = await import("./documentClient");
    const callback = vi.fn();
    const unsubscribe = client.onSnapshot(
      client.collection({}, "competitions"),
      callback,
    );
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
    expect(callback.mock.calls[0][0].empty).toBe(true);
    unsubscribe();
    expect(FakeEvents.instances[0].close).toHaveBeenCalledOnce();
  });
  it("retries conflicting transactions and never falls back to a second database", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          path: "profiles/me",
          exists: true,
          version: 1,
          data: { firstName: "Before" },
          at: "one",
        }),
      )
      .mockResolvedValueOnce(response({ error: "aborted" }, 409))
      .mockResolvedValueOnce(
        response({
          path: "profiles/me",
          exists: true,
          version: 2,
          data: { firstName: "Concurrent" },
          at: "two",
        }),
      )
      .mockResolvedValueOnce(response({ revision: 3 }));
    vi.stubGlobal("fetch", fetch);
    const client = await import("./documentClient");
    let calls = 0;
    await client.runTransaction({}, async (tx: any) => {
      const ref = client.doc({}, "profiles", "me");
      const value = await tx.get(ref);
      calls++;
      tx.update(ref, { firstName: value.data().firstName + "!" });
    });
    expect(calls).toBe(2);
    expect(JSON.parse(fetch.mock.calls[3][1].body)).toMatchObject({
      versions: { "profiles/me": 2 },
      operations: [{ data: { firstName: "Concurrent!" } }],
    });
    expect(native.getDoc).not.toHaveBeenCalled();
  });
  it("surfaces an unavailable mini PC instead of reading stale Firestore data", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response({ error: "mini_pc_unavailable" }, 503)),
    );
    const client = await import("./documentClient");
    await expect(
      client.getDoc(client.doc({}, "profiles", "me")),
    ).rejects.toMatchObject({ code: "mini_pc_unavailable" });
    expect(native.getDoc).not.toHaveBeenCalled();
  });
});


describe("subscription request budget", () => {
  const settle = async () => { await vi.advanceTimersByTimeAsync(0); };
  it("shares reads and does not reread unchanged snapshots across an hour of relay reconnects", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const fetch = vi.fn().mockImplementation(async () => response({ documents: [], at: "signed", nextCursor: null }));
    vi.stubGlobal("fetch", fetch);
    const client = await import("./documentClient");
    const callbacks = Array.from({ length: 10 }, () => vi.fn());
    const stops = callbacks.map(cb => client.onSnapshot(client.collection({}, "profiles"), cb));
    try {
      await settle();
      expect(fetch).toHaveBeenCalledTimes(1);
      const events = FakeEvents.instances[0];
      events.onopen?.();
      events.onmessage({ data: JSON.stringify({ revision: 100 }) });
      await settle();
      const initialReads = fetch.mock.calls.length;
      for (let i = 0; i < 80; i++) {
        events.onopen?.();
        events.onmessage({ data: JSON.stringify({ revision: 100 }) });
        await settle();
      }
      expect(fetch).toHaveBeenCalledTimes(initialReads);
      expect(callbacks.every(cb => cb.mock.calls.length === 1)).toBe(true);
      events.onmessage({ data: JSON.stringify({ revision: 101 }) });
      await settle();
      expect(fetch).toHaveBeenCalledTimes(initialReads + 1);
      events.onmessage({ data: JSON.stringify({ revision: 102, collections: ["competitions"] }) });
      await settle();
      expect(fetch).toHaveBeenCalledTimes(initialReads + 1);
      events.onmessage({ data: JSON.stringify({ revision: 103, collections: ["profiles"] }) });
      await settle();
      expect(fetch).toHaveBeenCalledTimes(initialReads + 2);
    } finally { stops.forEach(stop => stop()); }
  });
  it("closes hidden streams and catches up when visible without background retries", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const fetch = vi.fn().mockImplementation(async () => response({ error: "unavailable" }, 503));
    vi.stubGlobal("fetch", fetch);
    const client = await import("./documentClient");
    const callback = vi.fn();
    const stop = client.onSnapshot(client.collection({}, "profiles"), callback, vi.fn());
    try {
      await settle();
      visibility.mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      expect(FakeEvents.instances[0].close).toHaveBeenCalledOnce();
      const before = fetch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetch).toHaveBeenCalledTimes(before);
      fetch.mockImplementation(async () => response({ documents: [], at: "signed", nextCursor: null }));
      visibility.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      await settle();
      expect(callback).toHaveBeenCalledOnce();
      expect(FakeEvents.instances).toHaveLength(2);
    } finally { stop(); }
  });
});
