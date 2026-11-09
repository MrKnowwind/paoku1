import { test } from "node:test";
import assert from "node:assert/strict";
import { messages, resolveLanguage } from "./i18n.ts";
import { startupCopy } from "./startup-copy.ts";

test("defaults to Chinese and all four languages provide every screen label", () => {
  assert.equal(resolveLanguage(null), "zh");
  assert.equal(resolveLanguage("unknown"), "zh");
  for (const language of ["zh", "en", "ja", "ko"] as const) {
    assert.equal(resolveLanguage(language), language);
    for (const copy of [messages, startupCopy]) {
      assert.deepEqual(Object.keys(copy[language]).sort(), Object.keys(copy.zh).sort());
      assert.ok(Object.values(copy[language]).every(value => value.length > 0));
    }
  }
});
