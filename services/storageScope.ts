/** Retain old caches without displaying data from a different storage backend. */
export const storageKey = (key: string): string => {
  const origin = String(import.meta.env.VITE_OURA_API_URL || "").replace(/\/$/, "");
  return origin ? `${key}:storage:${origin}` : key;
};
