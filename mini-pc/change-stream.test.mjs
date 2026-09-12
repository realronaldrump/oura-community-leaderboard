import test from "node:test";
import assert from "node:assert/strict";
import { DocumentStore } from "./document-store.mjs";
import { changesSince, eventFrame } from "./change-stream.mjs";

test("reconnecting replays only changed public collections, including writes by other workers", async () => {
  const store = new DocumentStore(":memory:");
  try {
    await store.doc("profiles/me").set({ firstName: "Example" });
    const before = store.sequence;
    assert.deepEqual(changesSince(store, String(before)), { revision: before, collections: [] });
    await store.doc("ouraCredentials/me").set({ token: "test-only" });
    assert.deepEqual(changesSince(store, String(before)).collections, []);
    await store.doc("profileStats/me/days/2026-09-11").set({ score: 80 });
    const after = changesSince(store, String(before));
    assert.deepEqual(after.collections, ["profileStats/me/days"]);
    assert.equal(after.revision, store.sequence);
    assert.equal(eventFrame(after), `id: ${after.revision}\ndata: ${JSON.stringify(after)}\n\n`);
    // Invalid/future cursors require a full resnapshot rather than losing updates.
    for (const cursor of [undefined, "bad", "-1", "99999999999999999999", String(store.sequence + 1)])
      assert.deepEqual(changesSince(store, cursor), { revision: store.sequence });
  } finally { store.close(); }
});
