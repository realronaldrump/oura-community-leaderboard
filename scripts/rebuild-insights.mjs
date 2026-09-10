#!/usr/bin/env node
// Bounded operator repair using the same worker as the protected cron endpoint.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { loadEnv } from "vite";
const env = loadEnv("production", ".vercel", "");
// dotenv expands PEM newlines inside a JSON-valued environment variable. Restore
// JSON escapes inside strings only, preserving the actual credential contents.
if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  let quoted = false,
    escaped = false,
    repaired = "";
  for (const character of env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    if (character === '\"' && !escaped) quoted = !quoted;
    repaired +=
      quoted && character === "\n"
        ? "\\n"
        : quoted && character === "\r"
          ? "\\r"
          : character;
    escaped = character === "\\" && !escaped;
  }
  env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(JSON.parse(repaired));
}
for (const [key, value] of Object.entries(env)) {
  if (
    value &&
    (key === "FIREBASE_SERVICE_ACCOUNT_JSON" ||
      key.startsWith("FIREBASE_ADMIN_"))
  )
    process.env[key] = value;
}
const output = path.resolve(".vercel/records-operator.mjs");
await build({
  entryPoints: ["api/_lib/insightsProjection.ts"],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  logLevel: "silent",
});
try {
  const worker = await import(pathToFileURL(output).href);
  const profileArgument = process.argv.indexOf("--profile");
  const results = await worker.reconcileInsights({
    profileId:
      profileArgument >= 0 ? process.argv[profileArgument + 1] : undefined,
    budgetMs: 45000,
    archiveDays: 20,
  });
  process.stdout.write(JSON.stringify({ ok: true, results }) + "\n");
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      ok: false,
      code: error?.code || error?.name || "unknown",
      message: error?.message || "Records rebuild failed",
    }) + "\n",
  );
  process.exitCode = 1;
}
