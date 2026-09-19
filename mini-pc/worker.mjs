import { replayInbox } from "./webhook-inbox.mjs";
import { refetchHistory } from "./refetch.mjs";
import { maintainWebhooks } from "./webhooks.mjs";
import fs from "node:fs";
import path from "node:path";
import { getLocalDocumentStore } from "./document-store.mjs";
import { pruneDerivedRecords } from "./derived-records.mjs";
import { copyFirestore } from "./migrate-firestore.mjs";
import { reconcileInsights } from "../api/_lib/insightsProjection.ts";
import {
  syncAllOuraProfiles,
  syncOuraUser,
  syncOuraProfile,
  reconcileProfileHistory,
} from "../api/_lib/ouraBackgroundSync.ts";
const config = JSON.parse(
  fs.readFileSync(process.env.OURA_CONFIG_FILE, "utf8"),
);
for (const [key, value] of Object.entries(config))
  if (typeof value === "string") process.env[key] = value;
const store = getLocalDocumentStore();
const mode = process.argv[2] || "records";
try {
  let result;
  if (mode === "copy" && store.getControl("activeMigration"))
    result = { status: "already_active" };
  else if (mode === "copy")
    result = await copyFirestore(store, config, { budgetMs: 45000 });
  else if (!store.getControl("activeMigration"))
    result = { status: "waiting_for_verified_migration" };
  else if (mode === "webhooks") result = await maintainWebhooks(config);
  else if (mode === "inbox") result = await replayInbox(store, syncOuraUser);
  else if (mode === "history") result = await refetchHistory(store, {
    syncProfile: syncOuraProfile, reconcileHistory: reconcileProfileHistory,
  });
  else if (mode === "sync") {
    result = await syncAllOuraProfiles({ db: store });
  } else if (mode === "backup")
    result = await store.backup(
      path.join(
        config.OURA_BACKUP_DIR,
        `oura-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
      ),
    );
  else {
    const cleanup = pruneDerivedRecords(store);
    result = { cleanup, profiles: await reconcileInsights({
      db: store,
      budgetMs: 45000,
      archiveDays: 30,
    }) };
  }
  console.log(JSON.stringify({ ok: true, mode, result }));
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      mode,
      code: error.code || error.name,
      message: error.message,
    }),
  );
  process.exitCode = 1;
} finally {
  store.close();
}
