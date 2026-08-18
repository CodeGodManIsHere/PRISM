import test from "node:test";
import assert from "node:assert/strict";

await import("../../DarkModeEngine/Mutation/mutation-queue.js");

function node(name, descendants = []) {
  return { name, contains(candidate) { return candidate === this || descendants.includes(candidate); } };
}

test("deduplicates overlapping dirty roots", () => {
  let scheduled;
  let processed;
  const child = node("child");
  const parent = node("parent", [child]);
  const queue = globalThis.PRISMMutationQueue.createDirtyRootQueue({
    scheduler: (callback) => { scheduled = callback; },
    processRoots: (roots) => { processed = roots; }
  });
  queue.add(child);
  queue.add(parent);
  scheduled();
  assert.deepEqual(processed, [parent]);
});

test("signals bounded overflow instead of growing forever", () => {
  let scheduled;
  let overflowed = false;
  const queue = globalThis.PRISMMutationQueue.createDirtyRootQueue({
    limit: 2,
    scheduler: (callback) => { scheduled = callback; },
    processRoots: (_roots, overflow) => { overflowed = overflow; }
  });
  queue.add(node("one"));
  queue.add(node("two"));
  queue.add(node("three"));
  scheduled();
  assert.equal(overflowed, true);
});

