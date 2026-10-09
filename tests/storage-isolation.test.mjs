import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocalStore } from "../lib/shared/storage.js";

test("concurrent users cannot read or delete each other's browser runs", async () => {
  const alice = createLocalStore("alice"), bob = createLocalStore("bob");
  await Promise.all([alice.putRun({ id: "same-id", name: "Alice" }), bob.putRun({ id: "same-id", name: "Bob" })]);
  assert.equal((await alice.runs())[0].name, "Alice");
  assert.equal((await bob.runs())[0].name, "Bob");
  await alice.clearRuns();
  assert.deepEqual(await alice.runs(), []);
  assert.equal((await bob.runs())[0].name, "Bob");
  assert.equal((await createLocalStore("bob").runs())[0].name, "Bob");
});

test("workspace names cannot contain arbitrary paths or empty identities", () => {
  assert.throws(() => createLocalStore(""));
  assert.throws(() => createLocalStore("../../alice"));
});
