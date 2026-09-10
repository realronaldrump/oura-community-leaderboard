import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { decodeFields } from "./migrate-firestore.mjs";
const require = createRequire(path.join(process.cwd(), "package.json"));
const releaseName = "projects/oura-friends/releases/cloud.firestore";
export function readonlyRules(source) {
  return {
    files: source.files.map((file) => ({
      ...file,
      content: file.content.replace(
        /allow\s+([a-z,\s]+):\s*([\s\S]*?);/g,
        (match, permissions, condition) => {
          const all = permissions.split(",").map((permission) => permission.trim());
          const writes = all.filter((permission) => /^(write|create|update|delete)$/.test(permission));
          if (!writes.length) return match;
          const reads = all.filter((permission) => !writes.includes(permission));
          return [
            ...(reads.length ? [`allow ${reads.join(", ")}: ${condition};`] : []),
            `allow ${writes.join(", ")}: if false;`,
          ].join("\n");
        },
      ),
    })),
  };
}
async function rulesApi(config, resource, method = "GET", body) {
  const { GoogleAuth } = require("google-auth-library");
  const credential =
    typeof config.FIREBASE_SERVICE_ACCOUNT_JSON === "string"
      ? JSON.parse(config.FIREBASE_SERVICE_ACCOUNT_JSON)
      : config.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (credential.project_id !== "oura-friends")
    throw new Error("unexpected_source_project");
  const auth = new GoogleAuth({
    credentials: credential,
    scopes: ["https://www.googleapis.com/auth/firebase"],
  });
  const token = await auth.getAccessToken();
  const response = await fetch(
    `https://firebaserules.googleapis.com/v1/${resource}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(`source_rules_http_${response.status}`);
  return result;
}
async function assertProxy() {
  const response = await fetch(
    "https://oura-community-leaderboard.vercel.app/api/storage-status",
    { signal: AbortSignal.timeout(15000) },
  );
  const status = await response.json();
  if (!response.ok || status.backend !== "mini-pc" || !status.build)
    throw new Error("vercel_proxy_not_verified");
  return status;
}
export async function freezeSource(store, config) {
  const migration = store.latestMigration();
  if (migration?.state !== "verified" || !migration.progress.backup)
    throw new Error("verified_initial_copy_and_backup_required");
  const proxy = await assertProxy();
  const previous = await rulesApi(config, releaseName);
  const previousRules = await rulesApi(config, previous.rulesetName);
  const createdAt = new Date().toISOString();
  const backupPath = path.join(
    config.OURA_BACKUP_DIR,
    `source-rules-${createdAt.replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ release: previous, ruleset: previousRules }, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  const source = readonlyRules(previousRules.source);
  const ruleset = await rulesApi(
    config,
    "projects/oura-friends/rulesets",
    "POST",
    { source },
  );
  await rulesApi(config, releaseName, "PATCH", {
    release: { name: releaseName, rulesetName: ruleset.name },
    updateMask: "rulesetName",
  });
  const checked = await rulesApi(config, releaseName);
  if (checked.rulesetName !== ruleset.name)
    throw new Error("source_freeze_not_confirmed");
  const receipt = {
    rulesetName: ruleset.name,
    frozenAt: new Date().toISOString(),
    backupPath,
    proxyBuild: proxy.build,
    rulesHash: crypto
      .createHash("sha256")
      .update(JSON.stringify(source))
      .digest("hex"),
  };
  store.setControl("sourceFreeze", receipt);
  return {
    ...receipt,
    next: "Wait at least 90 seconds for old server invocations to finish, then request a new snapshot copy. Do not activate the earlier copy.",
  };
}
export async function activateVerifiedCopy(store, config) {
  const freeze = store.getControl("sourceFreeze");
  const run = store.latestMigration();
  if (
    !freeze ||
    run?.state !== "verified" ||
    !run.progress.backup ||
    Date.parse(run.readTime) < Date.parse(freeze.frozenAt) + 90000
  )
    throw new Error("fresh_post_freeze_verified_copy_required");
  await assertProxy();
  if ((await rulesApi(config, releaseName)).rulesetName !== freeze.rulesetName)
    throw new Error("source_writes_not_frozen");
  const manifest = store.migrationManifest(run.id);
  if (manifest.sha256 !== run.progress.manifest.sha256)
    throw new Error("migration_checksum_mismatch");
  if (!manifest.collections.profiles)
    throw new Error("source_profiles_missing");
  store.setControl("verifiedSourceFreeze", { ...freeze, runId: run.id });
  return store.activateMigration(run.id, decodeFields);
}
