const ROOTS = new Set([
  "profiles",
  "profileStats",
  "competitions",
  "competitionInvites",
]);
export function canRead(documentPath, collection = false) {
  if (typeof documentPath !== "string") return false;
  const parts = documentPath.split("/");
  if (parts.some((part) => !part || part === "." || part === ".."))
    return false;
  if (!ROOTS.has(parts[0])) return false;
  return parts[0] === "profileStats"
    ? parts.length <= (collection ? 3 : 4)
    : parts.length === (collection ? 1 : 2);
}
export function publicValue(documentPath, value) {
  if (documentPath.split("/")[0] !== "profiles" || !value) return value;
  const {
    token: _token,
    refreshToken: _refresh,
    tokenExpiresAt: _expiry,
    ...profile
  } = value;
  return profile;
}
export function authorizePublicCommit(operations, versions = {}) {
  if (!Array.isArray(operations) || operations.length > 450) return false;
  if (Object.keys(versions).some((path) => !canRead(path))) return false;
  return operations.every((op) => {
    if (
      Object.keys(op).some(
        (key) => !["kind", "path", "data", "merge"].includes(key),
      )
    )
      return false;
    if (
      !canRead(op.path) ||
      !["set", "update"].includes(op.kind) ||
      !op.data ||
      typeof op.data !== "object" ||
      Array.isArray(op.data)
    )
      return false;
    const root = op.path.split("/")[0];
    if (root === "competitions" || root === "competitionInvites") return true;
    if (root !== "profiles" || (op.kind === "set" && op.merge !== true))
      return false;
    const allowed = new Set([
      "firstName",
      "lastName",
      "dataExclusionRanges",
      "lastUpdated",
    ]);
    return Object.keys(op.data).every((key) => allowed.has(key));
  });
}
