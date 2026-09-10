import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DocumentStore } from "./document-store.mjs";
import { activateRefetchStorage, refetchHistory } from "./refetch.mjs";

test("fresh Oura mode retains the old copy state, backs up first, and cannot overwrite a live store", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "oura-refetch-test-"));
  const store = new DocumentStore(":memory:");
  store.setControl("old-copy-state", { documents: 0, paused: true });
  const result = await activateRefetchStorage(store, { OURA_BACKUP_DIR: directory });
  assert.equal(result.mode, "oura-refetch");
  assert.ok(fs.existsSync(result.backup.destination));
  assert.equal(store.getControl("activeMigration"), result.id);
  assert.deepEqual(store.getControl("old-copy-state"), { documents: 0, paused: true });
  await store.doc("profiles/me").set({ firstName: "Connected" });
  await assert.rejects(activateRefetchStorage(store, { OURA_BACKUP_DIR: directory }), /already_active/);
  assert.equal((await store.doc("profiles/me").get()).data().firstName, "Connected");
  store.close();
});

test("refetch activation refuses existing data and failed backups", async () => {
  const store = new DocumentStore(":memory:");
  await store.doc("profiles/existing").set({ retained: true });
  await assert.rejects(activateRefetchStorage(store, {}), /existing_local_data/);
  store.close();
  const empty = new DocumentStore(":memory:");
  empty.backup = async () => { throw new Error("disk_unavailable"); };
  await assert.rejects(activateRefetchStorage(empty, { OURA_BACKUP_DIR: "/unused" }), /disk_unavailable/);
  assert.equal(empty.getControl("activeMigration"), null);
  empty.close();
});

test("history refetch waits for connection and shares resumable work across profiles", async () => {
  const store = new DocumentStore(":memory:");
  const calls = [];
  const workers = {
    syncProfile: async (id, options) => { calls.push([id, options.reason]); return { status: "synced" }; },
    reconcileHistory: async (id) => { calls.push([id, "history"]); return { status: "failed" }; },
  };
  assert.equal((await refetchHistory(store, workers)).status, "waiting_for_oura_connection");
  await store.doc("profiles/a").set({ id: "a" });
  await store.doc("profiles/b").set({ id: "b" });
  await store.doc("profileStats/b").set({ sourceCoverage: {} });
  await refetchHistory(store, workers);
  await refetchHistory(store, workers);
  await refetchHistory(store, workers);
  assert.deepEqual(calls, [["a", "bootstrap"], ["b", "history"], ["a", "bootstrap"]]);
  store.close();
});
