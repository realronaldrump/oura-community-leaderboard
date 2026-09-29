const RELOAD_KEY = "app:asset-reload-at";
const RELOAD_COOLDOWN_MS = 60_000;

/** Recover open tabs whose lazy page files were replaced by a deployment. */
export function installAssetRecovery({
  target = window,
  storage = () => window.sessionStorage,
  reload = () => window.location.reload(),
  now = Date.now,
}: {
  target?: EventTarget;
  storage?: () => Pick<Storage, "getItem" | "setItem">;
  reload?: () => void;
  now?: () => number;
} = {}) {
  let reloading = false;
  const recover = (event: Event) => {
    if (reloading) return;
    try {
      const session = storage();
      const previous = Number(session.getItem(RELOAD_KEY));
      const time = now();
      if (previous && time - previous < RELOAD_COOLDOWN_MS) return;
      // Persist before reloading so a network outage cannot cause a reload loop.
      session.setItem(RELOAD_KEY, String(time));
    } catch {
      // Without a persistent guard, leave recovery to the visible reload button.
      return;
    }
    reloading = true;
    event.preventDefault();
    reload();
  };
  target.addEventListener("vite:preloadError", recover);
  return () => target.removeEventListener("vite:preloadError", recover);
}
