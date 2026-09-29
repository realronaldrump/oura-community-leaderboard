import { afterEach, describe, expect, it, vi } from "vitest";
import { installAssetRecovery } from "./assetRecovery";

afterEach(() => sessionStorage.clear());
const fail = (target: EventTarget) => {
  const event = new Event("vite:preloadError", { cancelable: true });
  target.dispatchEvent(event);
  return event;
};

describe("deployment asset recovery", () => {
  it("reloads an open tab when its old page file can no longer be imported", () => {
    const target = new EventTarget();
    const reload = vi.fn();
    const stop = installAssetRecovery({ target, reload, now: () => 1_000_000 });
    expect(fail(target).defaultPrevented).toBe(true);
    fail(target);
    expect(reload).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not loop if the newly loaded document still cannot load a page", () => {
    const target = new EventTarget();
    const reload = vi.fn();
    const firstPage = installAssetRecovery({ target, reload, now: () => 1_000_000 });
    fail(target);
    firstPage();
    const secondPage = installAssetRecovery({ target, reload, now: () => 1_000_100 });
    expect(fail(target).defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    secondPage();
  });

  it("leaves manual recovery available when session storage is blocked", () => {
    const target = new EventTarget();
    const reload = vi.fn();
    const stop = installAssetRecovery({ target, reload, storage: () => { throw new Error("blocked"); } });
    expect(fail(target).defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it("allows a later deployment to recover without leaving duplicate listeners", () => {
    const target = new EventTarget();
    const reload = vi.fn();
    const firstPage = installAssetRecovery({ target, reload, now: () => 1_000_000 });
    fail(target);
    firstPage();
    const secondPage = installAssetRecovery({ target, reload, now: () => 1_060_001 });
    expect(fail(target).defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
    secondPage();
    fail(target);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
