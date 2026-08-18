(() => {
  "use strict";

  function defaultScheduler(callback) {
    if (typeof globalThis.requestIdleCallback === "function") {
      globalThis.requestIdleCallback(callback, { timeout: 60 });
    } else {
      globalThis.setTimeout(callback, 0);
    }
  }

  function createDirtyRootQueue({ limit = 128, scheduler = defaultScheduler, processRoots }) {
    if (typeof processRoots !== "function") throw new TypeError("processRoots is required");
    const roots = new Set();
    let scheduled = false;
    let overflowed = false;

    function add(root) {
      if (!root || typeof root !== "object") return;
      for (const existing of [...roots]) {
        if (typeof existing.contains === "function" && existing.contains(root)) return;
        if (typeof root.contains === "function" && root.contains(existing)) roots.delete(existing);
      }
      if (roots.size >= limit) {
        overflowed = true;
      } else {
        roots.add(root);
      }
      if (!scheduled) {
        scheduled = true;
        scheduler(flush);
      }
    }

    function flush() {
      scheduled = false;
      const pending = [...roots];
      roots.clear();
      const didOverflow = overflowed;
      overflowed = false;
      processRoots(pending, didOverflow);
    }

    function clear() {
      roots.clear();
      overflowed = false;
    }

    return Object.freeze({ add, flush, clear, get size() { return roots.size; } });
  }

  globalThis.PRISMMutationQueue = Object.freeze({ createDirtyRootQueue, defaultScheduler });
})();

