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
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
describe("remote document transport", () => {
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
