import fs from "node:fs";
import { getLocalDocumentStore } from "./document-store.mjs";
import { copyFirestore } from "./migrate-firestore.mjs";
import { freezeSource, activateVerifiedCopy } from "./cutover.mjs";
import { activateRefetchStorage } from "./refetch.mjs";
import { pruneDerivedRecords } from "./derived-records.mjs";
import { compactRecords } from "./compact-records.mjs";
const config = JSON.parse(
  fs.readFileSync(process.env.OURA_CONFIG_FILE, "utf8"),
);
for (const [key, value] of Object.entries(config))
  if (typeof value === "string") process.env[key] = value;
const store = getLocalDocumentStore();
try {
  const action = process.argv[2];
  const result =
    action === "compact-records"
      ? compactRecords(store, { destination: process.argv[3], quiescedAt: process.argv[4],
          onProgress: progress => console.log(JSON.stringify({ progress })) })
      : action === "prune-derived"
      ? pruneDerivedRecords(store)
      : action === "activate-refetch"
      ? await activateRefetchStorage(store, config)
      : action === "freeze"
      ? await freezeSource(store, config)
      : action === "activate"
        ? await activateVerifiedCopy(store, config)
        : action === "new-copy"
          ? await copyFirestore(store, config, { newSnapshot: true })
          : action === "copy"
            ? await copyFirestore(store, config)
            : {
                migration: store.latestMigration()?.state,
                active: store.getControl("activeMigration"),
                mode: store.getControl("storageActivation")?.mode || "firestore-copy",
                inventory: store.inventory(),
              };
  console.log(JSON.stringify({ ok: true, result }));
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      code: error.code || error.name,
      message: error.message,
    }),
  );
  process.exitCode = 1;
} finally {
  store.close();
}
