import crypto from "node:crypto";
export async function readRequestBytes(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 3_000_000) throw new Error("request_too_large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
export function enqueueWebhook(store, configuration, headers, bytes) {
  const timestamp = String(headers["x-oura-timestamp"] || "");
  const expected = crypto
    .createHmac("sha256", configuration.OURA_CLIENT_SECRET)
    .update(timestamp)
    .update(bytes)
    .digest("hex")
    .toUpperCase();
  const signature = String(headers["x-oura-signature"] || "");
  if (
    !timestamp ||
    Buffer.byteLength(expected) !== Buffer.byteLength(signature) ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  )
    throw Object.assign(new Error("invalid_signature"), { status: 401 });
  const clientId = String(headers["x-client-id"] || "").trim();
  if (clientId && clientId !== configuration.OURA_CLIENT_ID)
    throw Object.assign(new Error("invalid_client_id"), { status: 401 });
  const body = bytes.toString("utf8");
  store.database
    .prepare(
      "INSERT INTO webhook_inbox(body,raw_body,headers,received_at) VALUES(?,?,?,?)",
    )
    .run(
      body,
      bytes,
      JSON.stringify({ timestamp, signature }),
      new Date().toISOString(),
    );
  return { ok: true, queued: true };
}
export async function replayInbox(store, syncUser, budgetMs = 45000) {
  const token = store.claimControlLease("inboxLease", 150000);
  if (!token) return { status: "busy" };
  const deadline = Date.now() + budgetMs;
  let processed = 0;
  try {
    const pending = store.database
      .prepare(
        "SELECT * FROM webhook_inbox WHERE processed_at IS NULL AND (next_retry_at IS NULL OR next_retry_at<=?) ORDER BY id LIMIT 20",
      )
      .all(new Date().toISOString());
    for (const row of pending) {
      if (Date.now() > deadline - 15000) break;
      try {
        const event = JSON.parse(row.body);
        if (event.user_id == null) throw new Error("missing_user_id");
        const results = await syncUser(String(event.user_id), {
          db: store,
          reason: "replay",
          webhookRecord: {
            eventType: event.event_type,
            dataType: event.data_type,
            objectId: event.object_id,
          },
        });
        if (!results.length || !results.every((r) => r.status === "synced"))
          throw new Error(
            results.some((r) => r.status === "skipped")
              ? "sync_busy"
              : "sync_pending",
          );
        store.database
          .prepare(
            "UPDATE webhook_inbox SET processed_at=?,last_error=NULL,attempts=attempts+1 WHERE id=?",
          )
          .run(new Date().toISOString(), row.id);
        processed++;
      } catch (error) {
        store.database
          .prepare(
            "UPDATE webhook_inbox SET last_error=?,next_retry_at=?,attempts=attempts+1 WHERE id=?",
          )
          .run(
            error.message,
            new Date(
              Date.now() + (error.message === "sync_busy" ? 20000 : 30 * 60000),
            ).toISOString(),
            row.id,
          );
      }
    }
    return {
      processed,
      pending: Number(
        store.database
          .prepare(
            "SELECT COUNT(*) AS count FROM webhook_inbox WHERE processed_at IS NULL",
          )
          .get().count,
      ),
    };
  } finally {
    store.releaseControlLease("inboxLease", token);
  }
}
