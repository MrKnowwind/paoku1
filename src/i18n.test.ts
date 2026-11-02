import { test } from "node:test";
import assert from "node:assert/strict";
import { messages, resolveLanguage } from "./i18n.ts";

test("defaults to Chinese and all four languages provide every screen label", () => {
  assert.equal(resolveLanguage(null), "zh");
  assert.equal(resolveLanguage("unknown"), "zh");
  for (const language of ["zh", "en", "ja", "ko"] as const) {
    assert.equal(resolveLanguage(language), language);
    assert.deepEqual(
      Object.keys(messages[language]).sort(),
      Object.keys(messages.zh).sort(),
    );
    assert.ok(
      Object.values(messages[language]).every((value) => value.length > 0),
    );
  }
});
