import crypto from "node:crypto";
import path from "node:path";

/** Explicit owner-selected fresh start. Keeps every source archive and local revision. */
export async function activateRefetchStorage(store, config) {
  if (store.getControl("activeMigration")) throw new Error("storage_already_active");
  if (store.inventory().length) throw new Error("existing_local_data_requires_review");
  const startedAt = new Date().toISOString();
  const backup = await store.backup(path.join(config.OURA_BACKUP_DIR,
    `before-oura-refetch-${startedAt.replace(/[:.]/g, "-")}.sqlite`));
  const activation = { id: `oura-refetch-${crypto.randomUUID()}`, mode: "oura-refetch", startedAt, backup };
  store.database.exec("BEGIN IMMEDIATE");
  try {
    if (store.getControl("activeMigration")) throw new Error("storage_already_active");
    if (store.inventory().length) throw new Error("existing_local_data_requires_review");
    store.setControl("storageActivation", activation);
    // Preserve the existing readiness key for deployed workers and compatibility.
    store.setControl("activeMigration", activation.id);
    store.setControl("sourceCopyDisabled", true);
    store.database.exec("COMMIT");
  } catch (error) {
    store.database.exec("ROLLBACK");
    throw error;
  }
  return activation;
}

/** One profile per invocation; failed and incomplete windows remain retryable. */
export async function refetchHistory(store, { syncProfile, reconcileHistory }) {
  const profiles = (await store.collection("profiles").get()).docs;
  if (!profiles.length) return { status: "waiting_for_oura_connection" };
  const cursor = Number(store.getControl("historyRefetchCursor") || 0);
  const profile = profiles[cursor % profiles.length];
  store.setControl("historyRefetchCursor", (cursor + 1) % profiles.length);
  const metadata = (await store.doc(`profileStats/${profile.id}`).get()).data();
  const result = !metadata?.sourceCoverage
    ? await syncProfile(profile.id, { db: store, reason: "bootstrap", includeStatic: true })
    : await reconcileHistory(profile.id, { db: store });
  return { profileId: profile.id, result, status: result ? "progress" : "history_scanned" };
}
