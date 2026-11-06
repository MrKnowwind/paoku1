import { test } from "node:test";
import assert from "node:assert/strict";
import { startupCopy } from "./startup-copy.ts";

test("startup recovery and progress labels cover all four languages", () => {
  for (const copy of Object.values(startupCopy)) {
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(startupCopy.zh).sort());
    assert.ok(Object.values(copy).every(text => text.length > 0));
  }
});
