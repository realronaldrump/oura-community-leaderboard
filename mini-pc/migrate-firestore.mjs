import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { canonicalJson, localDocumentPath } from "./document-store.mjs";
const require = createRequire(path.join(process.cwd(), "package.json"));
const sourceRoot = (project) =>
  `projects/${project}/databases/(default)/documents`;
export function decodeFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]),
  );
}
export function decodeValue(value) {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) {
    const n = Number(value.integerValue);
    return Number.isSafeInteger(n)
      ? n
      : { __firestoreType: "integer", value: String(value.integerValue) };
  }
  if ("doubleValue" in value) {
    const n = Number(value.doubleValue);
    return Number.isFinite(n)
      ? n
      : { __firestoreType: "double", value: String(value.doubleValue) };
  }
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  if ("arrayValue" in value)
    return (value.arrayValue.values || []).map(decodeValue);
  for (const type of ["timestamp", "bytes", "reference", "geoPoint"])
    if (`${type}Value` in value)
      return { __firestoreType: type, value: value[`${type}Value`] };
  // Keep future Firestore types intact rather than silently discarding them.
  return { __firestoreType: "unknown", value };
}
export async function copyFirestore(store, config, options = {}) {
  const lease = store.claimControlLease("migrationCopyLease");
  if (!lease) return { status: "copy_already_running" };
  try {
    return await copyFirestoreUnlocked(store, config, options);
  } finally {
    store.releaseControlLease("migrationCopyLease", lease);
  }
}
async function copyFirestoreUnlocked(store, config, options = {}) {
  if (store.getControl("activeMigration"))
    throw new Error("source_copy_disabled_after_activation");
  const { GoogleAuth } = require("google-auth-library");
  const credential =
    typeof config.FIREBASE_SERVICE_ACCOUNT_JSON === "string"
      ? JSON.parse(config.FIREBASE_SERVICE_ACCOUNT_JSON)
      : config.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (credential?.project_id !== "oura-friends")
    throw new Error("unexpected_source_project");
  const auth = new GoogleAuth({
    credentials: credential,
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
  const root = sourceRoot(credential.project_id);
  const deadline = Date.now() + (options.budgetMs || 45000);
  let run = store.latestMigration();
  if (run?.state === "verified" && !options.newSnapshot)
    return {
      status: "verified",
      runId: run.id,
      manifest: run.progress.manifest || store.migrationManifest(run.id),
    };
  if (
    run?.state === "paused" &&
    run.progress.lastError === "source_quota_exhausted" &&
    !run.progress.nextRetryAt &&
    !options.newSnapshot
  ) {
    run.progress.nextRetryAt = new Date(Date.now() + 30 * 60000).toISOString();
    store.migrationRun(run);
  }
  if (
    !options.newSnapshot &&
    run?.progress.nextRetryAt &&
    Date.parse(run.progress.nextRetryAt) > Date.now()
  )
    return {
      status: run.progress.lastError || "paused",
      retryAt: run.progress.nextRetryAt,
      documents: run.progress.documents,
    };
  if (
    options.newSnapshot ||
    !run ||
    run.state === "abandoned" ||
    Date.now() - Date.parse(run.readTime) > 50 * 60_000
  ) {
    if (run && run.state !== "verified")
      store.migrationRun({ ...run, state: "abandoned" });
    run = {
      id: crypto.randomUUID(),
      state: "copying",
      projectId: credential.project_id,
      readTime: new Date(Date.now() - 5000).toISOString(),
      createdAt: new Date().toISOString(),
      progress: {
        tasks: [{ kind: "collections", parent: root }],
        seen: [],
        pages: 0,
        documents: 0,
      },
    };
    store.migrationRun(run);
  }
  if (run.state === "verified")
    return {
      status: "verified",
      runId: run.id,
      manifest: store.migrationManifest(run.id),
    };
  const pageDirectory = path.join(config.OURA_ARCHIVE_DIR, run.id);
  fs.mkdirSync(pageDirectory, { recursive: true, mode: 0o700 });
  const accessToken = options.getAccessToken
    ? await options.getAccessToken()
    : await auth.getAccessToken();
  const fetchTask = async (task) => {
    const isCollections = task.kind === "collections";
    const url = new URL(
      `https://firestore.googleapis.com/v1/${task.parent.split("/").map(encodeURIComponent).join("/")}${isCollections ? ":listCollectionIds" : `/${encodeURIComponent(task.collection)}`}`,
    );
    const body = isCollections
      ? {
          pageSize: 100,
          readTime: run.readTime,
          ...(task.pageToken ? { pageToken: task.pageToken } : {}),
        }
      : undefined;
    if (!isCollections) {
      url.searchParams.set("pageSize", "25");
      url.searchParams.set("showMissing", "true");
      url.searchParams.set("readTime", run.readTime);
      if (task.pageToken) url.searchParams.set("pageToken", task.pageToken);
    }
    const response = await (options.fetchImpl || fetch)(url, {
      method: isCollections ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  };
  while (run.progress.tasks.length && Date.now() < deadline - 12000) {
    const first = run.progress.tasks[0];
    // At most one potentially large document page; discover small child-collection lists in parallel.
    const batch = [
      first,
      ...run.progress.tasks
        .slice(1)
        .filter((t) => t.kind === "collections")
        .slice(0, 5),
    ];
    const results = await Promise.allSettled(batch.map(fetchTask));
    let failure = null;
    for (let i = 0; i < batch.length; i++) {
      const task = batch[i];
      const result = results[i];
      if (result.status === "rejected" || !result.value.ok) {
        failure =
          result.status === "fulfilled" && result.value.status === 429
            ? "source_quota_exhausted"
            : result.status === "fulfilled"
              ? `source_http_${result.value.status}`
              : "source_request_failed";
        continue;
      }
      const text = result.value.text;
      const payload = JSON.parse(text);
      const pageHash = crypto.createHash("sha256").update(text).digest("hex");
      const pageName = `${String(run.progress.pages).padStart(7, "0")}-${pageHash}.json`;
      const pagePath = path.join(pageDirectory, pageName);
      if (!fs.existsSync(pagePath))
        fs.writeFileSync(pagePath, text, { flag: "wx", mode: 0o600 });
      if (task.kind === "collections") {
        for (const collection of payload.collectionIds || [])
          run.progress.tasks.push({
            kind: "documents",
            parent: task.parent,
            collection,
          });
      } else
        for (const document of payload.documents || []) {
          const missing =
            !document.createTime && !document.updateTime && !document.fields;
          store.saveMigrationDocument(run.id, document, missing);
          if (!run.progress.seen.includes(document.name)) {
            run.progress.tasks.push({
              kind: "collections",
              parent: document.name,
            });
            run.progress.seen.push(document.name);
            if (!missing) run.progress.documents++;
          }
        }
      const index = run.progress.tasks.findIndex(
        (t) => canonicalJson(t) === canonicalJson(task),
      );
      if (index < 0) throw new Error("migration_cursor_conflict");
      run.progress.tasks.splice(index, 1);
      if (payload.nextPageToken)
        run.progress.tasks.unshift({
          ...task,
          pageToken: payload.nextPageToken,
        });
      run.progress.pages++;
      run.progress.lastError = null;
      run.progress.nextRetryAt = null;
      run.state = "copying";
      store.migrationRun(run);
    }
    if (failure) {
      run.state = "paused";
      run.progress.lastError = failure;
      run.progress.nextRetryAt = new Date(
        Date.now() +
          (failure === "source_quota_exhausted" ? 30 * 60_000 : 60_000),
      ).toISOString();
      store.migrationRun(run);
      return {
        status: failure,
        runId: run.id,
        documents: run.progress.documents,
        pages: run.progress.pages,
        retryAt: run.progress.nextRetryAt,
      };
    }
  }
  if (!run.progress.tasks.length) {
    const manifest = store.migrationManifest(run.id);
    if (!manifest.documents) throw new Error("empty_source_requires_review");
    if (manifest.documents !== run.progress.documents)
      throw new Error("migration_count_mismatch");
    // Compare separately computed source-page and SQLite document maps.
    const sourceDocuments = new Map();
    for (const name of fs.readdirSync(pageDirectory)) {
      const raw = fs.readFileSync(path.join(pageDirectory, name), "utf8");
      if (
        !name.endsWith(
          `-${crypto.createHash("sha256").update(raw).digest("hex")}.json`,
        )
      )
        throw new Error("source_page_checksum_mismatch");
      for (const document of JSON.parse(raw).documents || [])
        sourceDocuments.set(
          localDocumentPath(document.name),
          crypto
            .createHash("sha256")
            .update(canonicalJson(document))
            .digest("hex"),
        );
    }
    const hash = crypto.createHash("sha256");
    for (const [name, value] of [...sourceDocuments].sort(([a], [b]) =>
      Buffer.compare(Buffer.from(a), Buffer.from(b)),
    ))
      hash.update(`${name}\0${value}\n`);
    if (hash.digest("hex") !== manifest.sha256)
      throw new Error("source_destination_hash_mismatch");
    run.state = "copied";
    run.progress.manifest = manifest;
    store.migrationRun(run);
    const backupName = `migration-${run.id}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const backup = await store.backup(
      path.join(config.OURA_BACKUP_DIR, `${backupName}.sqlite`),
    );
    fs.cpSync(
      pageDirectory,
      path.join(config.OURA_BACKUP_DIR, `${backupName}-raw`),
      { recursive: true, errorOnExist: true, force: false },
    );
    fs.writeFileSync(
      path.join(config.OURA_BACKUP_DIR, `${backupName}.manifest.json`),
      JSON.stringify(
        {
          ...manifest,
          backup,
          sourceProject: run.projectId,
          readTime: run.readTime,
          runId: run.id,
        },
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
    run.state = "verified";
    run.progress.backup = backup;
    store.migrationRun(run);
    return { status: "verified", runId: run.id, manifest, backup };
  }
  return {
    status: "copying",
    runId: run.id,
    documents: run.progress.documents,
    pages: run.progress.pages,
    remainingTasks: run.progress.tasks.length,
  };
}
