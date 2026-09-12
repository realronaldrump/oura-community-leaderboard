/** Application document interface. Remote mode never silently falls back to Firestore. */
import * as firestore from "firebase/firestore";
export type {
  DocumentData,
  QuerySnapshot,
  FirestoreError,
} from "firebase/firestore";
const REMOTE = String(import.meta.env.VITE_OURA_API_URL || "").replace(
  /\/$/,
  "",
);
type Reference = {
  path: string;
  kind: "document" | "collection" | "query";
  constraints?: any[];
};
const pathOf = (base: any, segments: string[]) =>
  [base?.path, ...segments].filter(Boolean).join("/");
const cloudApi = {
  collection: (...args: any[]) => (firestore.collection as any)(...args),
  doc: (...args: any[]) => (firestore.doc as any)(...args),
  where: (...args: any[]) => (firestore.where as any)(...args),
  orderBy: (...args: any[]) => (firestore.orderBy as any)(...args),
  limit: (...args: any[]) => (firestore.limit as any)(...args),
  query: (...args: any[]) => (firestore.query as any)(...args),
  setDoc: (...args: any[]) => (firestore.setDoc as any)(...args),
  updateDoc: (...args: any[]) => (firestore.updateDoc as any)(...args),
  deleteDoc: (...args: any[]) => (firestore.deleteDoc as any)(...args),
};
const cloud = (name: keyof typeof cloudApi, args: any[]) =>
  (cloudApi[name] as any)(...args);
export const collection = (...args: any[]): any =>
  REMOTE
    ? {
        path: pathOf(args[0], args.slice(1)),
        kind: "collection",
        constraints: [],
      }
    : cloud("collection", args);
export const doc = (...args: any[]): any =>
  REMOTE
    ? {
        path: pathOf(
          args[0],
          args.length > 1 ? args.slice(1) : [crypto.randomUUID()],
        ),
        kind: "document",
      }
    : cloud("doc", args);
export const where = (...args: any[]): any =>
  REMOTE
    ? { type: "where", field: args[0], op: args[1], value: args[2] }
    : cloud("where", args);
export const orderBy = (...args: any[]): any =>
  REMOTE
    ? { type: "orderBy", field: args[0], direction: args[1] || "asc" }
    : cloud("orderBy", args);
export const limit = (...args: any[]): any =>
  REMOTE ? { type: "limit", value: args[0] } : cloud("limit", args);
export const query = (...args: any[]): any =>
  REMOTE
    ? {
        ...args[0],
        kind: "query",
        constraints: [...(args[0].constraints || []), ...args.slice(1)],
      }
    : cloud("query", args);
async function requestRpc(body: Record<string, unknown>) {
  const response = await fetch(`${REMOTE}/public/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(payload.message || payload.error || "Storage request failed."),
      { code: payload.error || "unavailable" },
    );
  return payload;
}
// Share only simultaneous reads. Writes and transaction attempts must stay distinct.
const pendingReads = new Map<string, Promise<any>>();
function rpc(body: Record<string, unknown>): Promise<any> {
  if (body.action !== "get" && body.action !== "query") return requestRpc(body);
  const key = JSON.stringify(body);
  const existing = pendingReads.get(key);
  if (existing) return existing;
  const result = requestRpc(body).finally(() => pendingReads.delete(key));
  pendingReads.set(key, result);
  return result;
}
const snapshot = (document: any) => ({
  id: document.path.split("/").at(-1),
  ref: { path: document.path, kind: "document" },
  version: document.version,
  exists: () => document.exists,
  data: () => (document.exists ? document.data : undefined),
});
export const getDoc = async (reference: any): Promise<any> =>
  REMOTE
    ? snapshot(await rpc({ action: "get", path: reference.path }))
    : firestore.getDoc(reference);
export async function getDocs(reference: any): Promise<any> {
  if (!REMOTE) return firestore.getDocs(reference);
  const documents: any[] = [];
  let cursor: number | undefined;
  let at: string | undefined;
  do {
    const result = await rpc({
      action: "query",
      path: reference.path,
      constraints: reference.constraints || [],
      cursor,
      at,
    });
    documents.push(...result.documents);
    cursor = result.nextCursor;
    at = result.at;
  } while (cursor != null);
  const docs = documents.map(snapshot);
  return {
    docs,
    size: docs.length,
    empty: !docs.length,
    forEach: (callback: any) => docs.forEach(callback),
  };
}
const commit = (operations: unknown[], versions?: Record<string, number>) =>
  rpc({ action: "commit", operations, versions: versions || {} });
export const setDoc = async (...args: any[]): Promise<any> =>
  REMOTE
    ? commit([
        {
          kind: "set",
          path: args[0].path,
          data: args[1],
          merge: args[2]?.merge === true,
        },
      ])
    : cloud("setDoc", args);
export const updateDoc = async (...args: any[]): Promise<any> =>
  REMOTE
    ? commit([{ kind: "update", path: args[0].path, data: args[1] }])
    : cloud("updateDoc", args);
export const deleteDoc = async (...args: any[]): Promise<any> => {
  if (REMOTE) throw new Error("Data removal is disabled. History is retained.");
  return cloud("deleteDoc", args);
};
export function writeBatch(database: any): any {
  if (!REMOTE) return firestore.writeBatch(database);
  const operations: any[] = [];
  const batch = {
    set: (ref: Reference, data: unknown, options?: any) => {
      operations.push({
        kind: "set",
        path: ref.path,
        data,
        merge: options?.merge === true,
      });
      return batch;
    },
    update: (ref: Reference, data: unknown) => {
      operations.push({ kind: "update", path: ref.path, data });
      return batch;
    },
    delete: () => {
      throw new Error("Data removal is disabled.");
    },
    commit: () => commit(operations),
  };
  return batch;
}
export async function runTransaction(
  database: any,
  callback: any,
): Promise<any> {
  if (!REMOTE) return firestore.runTransaction(database, callback);
  for (let attempt = 0; attempt < 6; attempt++) {
    const operations: any[] = [];
    const versions: Record<string, number> = {};
    let at: string | undefined;
    const tx = {
      get: async (ref: Reference) => {
        const value = await rpc({ action: "get", path: ref.path, at });
        at ??= value.at;
        versions[ref.path] = value.version;
        return snapshot(value);
      },
      set: (ref: Reference, data: unknown, options?: any) =>
        operations.push({
          kind: "set",
          path: ref.path,
          data,
          merge: options?.merge === true,
        }),
      update: (ref: Reference, data: unknown) =>
        operations.push({ kind: "update", path: ref.path, data }),
      delete: () => {
        throw new Error("Data removal is disabled.");
      },
    };
    const value = await callback(tx);
    try {
      await commit(operations, versions);
      return value;
    } catch (error: any) {
      if (error.code !== "aborted" || attempt === 5) throw error;
    }
  }
}
const listeners = new Set<{ path: string; refresh: () => void }>();
let stream: EventSource | null = null;
let streamRevision: number | null = null;
const isVisible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
function onVisibilityChange() {
  if (!isVisible()) {
    stream?.close();
    stream = null;
    return;
  }
  connectChanges();
  // Catch up after suspension even when the stream has not opened yet.
  for (const listener of listeners) listener.refresh();
}
function connectChanges() {
  if (stream || !listeners.size || !isVisible()) return;
  const resume = streamRevision == null ? "" : `?since=${streamRevision}`;
  stream = new EventSource(`${REMOTE}/public/changes${resume}`);
  const connection = stream;
  stream.onmessage = (event) => {
    if (stream !== connection || !isVisible()) return;
    const update = JSON.parse(event.data);
    // The server sends its durable revision on every connection. An unchanged
    // handshake is not a data change (the relay reconnects every 45 seconds).
    const unchangedHandshake = !update.collections &&
      typeof update.revision === "number" && update.revision === streamRevision;
    if (typeof update.revision === "number") streamRevision = update.revision;
    if (unchangedHandshake) return;
    for (const listener of listeners)
      if (
        !update.collections ||
        update.collections.some(
          (path: string) =>
            listener.path === path || listener.path.startsWith(`${path}/`),
        )
      )
        listener.refresh();
  };
}
export function onSnapshot(
  reference: any,
  callback: any,
  onError?: (error: any) => void,
): () => void {
  if (!REMOTE) return firestore.onSnapshot(reference, callback, onError);
  let stopped = false;
  let pending = false;
  let queued = false;
  let last: string | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  const refresh = async () => {
    if (stopped || !isVisible()) return;
    if (pending) {
      queued = true;
      return;
    }
    pending = true;
    try {
      const value =
        reference.kind === "document"
          ? await getDoc(reference)
          : await getDocs(reference);
      if (stopped) return;
      failures = 0;
      const signature =
        reference.kind === "document"
          ? String(value.version)
          : value.docs.map((d: any) => `${d.id}:${d.version}`).join("|");
      if (signature !== last) {
        last = signature;
        callback(value);
      }
    } catch (error) {
      if (!stopped) {
        onError?.(error);
        if (!retryTimer)
          retryTimer = setTimeout(
            () => {
              retryTimer = null;
              void refresh();
            },
            Math.min(30000, 1000 * 2 ** Math.min(failures++, 5)),
          );
      }
    } finally {
      pending = false;
      if (queued) {
        queued = false;
        void refresh();
      }
    }
  };
  const listener = {
    path: reference.path,
    refresh: () => {
      void refresh();
    },
  };
  if (!listeners.size && typeof document !== "undefined")
    document.addEventListener("visibilitychange", onVisibilityChange);
  listeners.add(listener);
  connectChanges();
  void refresh();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    listeners.delete(listener);
    if (!listeners.size) {
      stream?.close();
      stream = null;
      streamRevision = null;
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}
