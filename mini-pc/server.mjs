import { readRequestBytes, enqueueWebhook } from "./webhook-inbox.mjs";
import { maintainWebhooks } from "./webhooks.mjs";
import { syncAllOuraProfiles } from "../api/_lib/ouraBackgroundSync.ts";
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { getLocalDocumentStore, StoreConflict } from "./document-store.mjs";
import {
  canRead,
  publicValue,
  authorizePublicCommit,
} from "./public-policy.mjs";
import { copyFirestore } from "./migrate-firestore.mjs";
import oauth from "../api/oauth/token.ts";
import connect from "../api/profiles/connect.ts";
import webhook from "../api/webhook/oura.ts";
import setup from "../api/webhook/setup.ts";
import ouraSync from "../api/cron/oura-sync.ts";
import insights from "../api/cron/insights.ts";

const configuration = JSON.parse(
  fs.readFileSync(process.env.OURA_CONFIG_FILE, "utf8"),
);
if (
  typeof configuration.OURA_MINI_PC_TOKEN !== "string" ||
  configuration.OURA_MINI_PC_TOKEN.length < 32
)
  throw new Error("private_transport_key_required");
for (const [key, value] of Object.entries(configuration))
  if (typeof value === "string") process.env[key] = value;
const store = getLocalDocumentStore();
const buildHash = crypto
  .createHash("sha256")
  .update(fs.readFileSync(process.argv[1]))
  .digest("hex")
  .slice(0, 16);
const streams = new Set();
let busy = false;
const constantEqual = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};
const privateRequest = (req) =>
  constantEqual(
    String(req.headers.authorization || ""),
    `Bearer ${configuration.OURA_MINI_PC_TOKEN}`,
  );
const json = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
};
const readBody = async (req) => (await readRequestBytes(req)).toString("utf8");
const snapshotWire = (snapshot) => ({
  path: snapshot.ref.path,
  exists: snapshot.exists,
  version: snapshot.version,
  data: snapshot.exists
    ? publicValue(snapshot.ref.path, snapshot.data())
    : null,
});
store.onChange = (paths, revision) => {
  const collections = [
    ...new Set(
      paths
        .filter((p) => canRead(p))
        .map((p) => p.split("/").slice(0, -1).join("/")),
    ),
  ];
  if (!collections.length) return;
  for (const stream of streams)
    stream.write(`data: ${JSON.stringify({ collections, revision })}\n\n`);
};
const signCursor = (revision) => {
  const payload = Buffer.from(
    JSON.stringify({ revision, expires: Date.now() + 300000 }),
  ).toString("base64url");
  return (
    payload +
    "." +
    crypto
      .createHmac("sha256", configuration.OURA_MINI_PC_TOKEN)
      .update(payload)
      .digest("hex")
  );
};
const readCursor = (token) => {
  if (token == null)
    return { at: store.sequence, token: signCursor(store.sequence) };
  if (typeof token !== "string") throw new Error("invalid_snapshot_cursor");
  const [payload, signature] = token.split(".");
  const expected = crypto
    .createHmac("sha256", configuration.OURA_MINI_PC_TOKEN)
    .update(payload)
    .digest("hex");
  if (!constantEqual(expected, signature))
    throw new Error("invalid_snapshot_cursor");
  const value = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (!Number.isSafeInteger(value.revision) || value.expires < Date.now())
    throw new Error("snapshot_cursor_expired");
  return { at: value.revision, token };
};
let observedRevision = store.sequence;
setInterval(() => {
  const next = store.sequence;
  if (next === observedRevision) return;
  const collections = store.database
    .prepare(
      "SELECT DISTINCT collection_path FROM revisions WHERE seq>? AND seq<=?",
    )
    .all(observedRevision, next)
    .map((r) => r.collection_path)
    .filter((p) => canRead(p, true));
  observedRevision = next;
  if (collections.length)
    for (const stream of streams)
      stream.write(
        `data: ${JSON.stringify({ collections, revision: next })}\n\n`,
      );
}, 2000).unref();
const legacy = {
  "/api/oauth/token": oauth,
  "/api/profiles/connect": connect,
  "/api/webhook/oura": webhook,
  "/api/webhook/setup": setup,
  "/api/cron/oura-sync": ouraSync,
  "/api/cron/insights": insights,
};
function wrapResponse(res) {
  res.status = (status) => {
    res.statusCode = status;
    return res;
  };
  res.send = (body) => {
    res.end(
      typeof body === "string" || Buffer.isBuffer(body)
        ? body
        : JSON.stringify(body),
    );
    return res;
  };
  res.json = (body) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}
const server = http.createServer(
  { requestTimeout: 60000, headersTimeout: 15000 },
  async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const origin = req.headers.origin;
      const allowedOrigins = configuration.OURA_ALLOWED_ORIGINS || [
        "https://oura-community-leaderboard.vercel.app",
      ];
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
      if (origin && !allowedOrigins.includes(origin))
        return json(res, 403, { error: "origin_not_allowed" });
      if (req.method === "OPTIONS") {
        if (!origin || !allowedOrigins.includes(origin))
          return json(res, 403, { error: "origin_not_allowed" });
        res.writeHead(204, {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        return res.end();
      }
      if (url.pathname === "/health")
        return json(res, 200, {
          ok: true,
          storage: "sqlite",
          ready: Boolean(store.getControl("activeMigration")),
          revision: store.sequence,
          build: buildHash,
        });
      if (url.pathname.startsWith("/private/")) {
        if (!privateRequest(req))
          return json(res, 401, { error: "unauthorized" });
        if (url.pathname === "/private/status") {
          const migration = store.latestMigration();
          return json(res, 200, {
            active: store.getControl("activeMigration"),
            mode: store.getControl("storageActivation")?.mode || "firestore-copy",
            build: buildHash,
            migration: migration
              ? {
                  id: migration.id,
                  state: migration.state,
                  documents: migration.progress.documents,
                  pages: migration.progress.pages,
                  lastError: migration.progress.lastError,
                  manifest: migration.progress.manifest,
                }
              : null,
            inventory: store.inventory(),
            revision: store.sequence,
          });
        }
        if (url.pathname === "/private/copy" && req.method === "POST") {
          if (busy) return json(res, 409, { error: "worker_busy" });
          busy = true;
          try {
            const body = JSON.parse((await readBody(req)) || "{}");
            return json(
              res,
              200,
              await copyFirestore(store, configuration, {
                budgetMs: 45000,
                newSnapshot: body.newSnapshot === true,
              }),
            );
          } finally {
            busy = false;
          }
        }
        if (url.pathname === "/private/backup" && req.method === "POST")
          return json(
            res,
            200,
            await store.backup(
              path.join(
                configuration.OURA_BACKUP_DIR,
                `oura-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
              ),
            ),
          );
        const pathname = url.pathname.slice("/private".length);
        if (pathname === "/api/profiles/remove")
          return json(res, 409, {
            error: "removal_disabled_history_is_retained",
          });
        if (pathname === "/api/webhook/oura" && req.method === "POST") {
          const bytes = await readRequestBytes(req);
          try {
            return json(
              res,
              200,
              enqueueWebhook(store, configuration, req.headers, bytes),
            );
          } catch (error) {
            return json(res, error.status || 400, { error: error.message });
          }
        }
        if (!legacy[pathname]) return json(res, 404, { error: "not_found" });
        if (
          !store.getControl("activeMigration") &&
          pathname !== "/api/webhook/oura"
        )
          return json(res, 503, { error: "migration_not_active" });
        if (pathname === "/api/cron/oura-sync") {
          const results = await syncAllOuraProfiles({ db: store });
          const maintained = await maintainWebhooks(configuration).catch(
            () => null,
          );
          return json(res, 200, {
            ok: true,
            results,
            webhooksMaintained: Boolean(maintained?.configured),
          });
        }
        req.query = Object.fromEntries(url.searchParams);
        req.headers.authorization = `Bearer ${configuration.CRON_SECRET}`;
        if (req.method !== "GET" && pathname !== "/api/webhook/oura")
          req.body = JSON.parse((await readBody(req)) || "{}");
        return await legacy[pathname](req, wrapResponse(res));
      }
      if (url.pathname === "/public/changes" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        streams.add(res);
        res.write(`data: ${JSON.stringify({ revision: store.sequence })}\n\n`);
        const heartbeat = setInterval(
          () => res.write(": keepalive\n\n"),
          20000,
        );
        req.on("close", () => {
          streams.delete(res);
          clearInterval(heartbeat);
        });
        return;
      }
      if (url.pathname !== "/public/rpc" || req.method !== "POST")
        return json(res, 404, { error: "not_found" });
      if (!store.getControl("activeMigration"))
        return json(res, 503, {
          error: "migration_not_active",
          message:
            "Your complete history is being copied and verified. The app has not switched storage yet.",
        });
      const body = JSON.parse(await readBody(req));
      if (body.action === "get") {
        if (!canRead(body.path))
          return json(res, 403, { error: "permission-denied" });
        const cursor = readCursor(body.at);
        return json(res, 200, {
          ...snapshotWire(store._snapshot(body.path, cursor.at)),
          at: cursor.token,
        });
      }
      if (body.action === "query") {
        if (!canRead(body.path, true) || !Array.isArray(body.constraints))
          return json(res, 403, { error: "permission-denied" });
        const cursor = readCursor(body.at);
        const snapshot = store.querySnapshot(
          body.path,
          body.constraints,
          cursor.at,
        );
        const offset =
          Number.isSafeInteger(body.cursor) && body.cursor >= 0
            ? body.cursor
            : 0;
        const documents = [];
        let bytes = 0;
        let index = offset;
        for (; index < snapshot.docs.length; index++) {
          const wire = snapshotWire(snapshot.docs[index]);
          const size = Buffer.byteLength(JSON.stringify(wire));
          if (documents.length && bytes + size > 900000) break;
          documents.push(wire);
          bytes += size;
        }
        return json(res, 200, {
          documents,
          at: cursor.token,
          nextCursor: index < snapshot.docs.length ? index : null,
        });
      }
      if (body.action === "commit") {
        if (!authorizePublicCommit(body.operations, body.versions))
          return json(res, 403, { error: "permission-denied" });
        if (
          body.operations.some(
            (op) =>
              op.path.startsWith("profiles/") &&
              !store._snapshot(op.path).exists,
          )
        )
          return json(res, 403, { error: "permission-denied" });
        return json(
          res,
          200,
          store.commit(body.operations, body.versions, "public_app"),
        );
      }
      return json(res, 400, { error: "invalid_action" });
    } catch (error) {
      if (!res.headersSent)
        json(res, error instanceof StoreConflict ? 409 : 500, {
          error: error instanceof StoreConflict ? "aborted" : "storage_error",
          message:
            error instanceof StoreConflict
              ? "The record changed; retrying safely."
              : "The storage request could not finish.",
        });
      else res.end();
      console.error(
        JSON.stringify({
          event: "request_failed",
          code: error.code || error.name,
          message: error.message,
        }),
      );
    }
  },
);
server.maxConnections = 128;
server.listen(Number(configuration.OURA_PORT || 8740), "127.0.0.1", () =>
  console.log(
    JSON.stringify({
      event: "listening",
      port: configuration.OURA_PORT || 8740,
      storage: "sqlite",
      ready: Boolean(store.getControl("activeMigration")),
    }),
  ),
);
