import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadStartupAssets } from "./loading.ts";
import { startupCopy } from "./startup-copy.ts";

test("startup reports actual streamed bytes and finishes only after every asset", async () => {
  const progress: number[] = [];
  const fetcher: typeof fetch = async input => {
    const size = String(input).endsWith("engine.js") ? 6 : 2;
    return new Response(new ReadableStream<Uint8Array>({start(controller) {
      controller.enqueue(new Uint8Array(size / 2));
      controller.enqueue(new Uint8Array(size / 2)); controller.close();
    }}));
  };
  await downloadStartupAssets([{file: "engine.js", bytes: 6}, {file: "app.js", bytes: 2}], "https://example.test/paoku1/",
    (loaded, total) => { assert.equal(total, 8); progress.push(loaded); }, fetcher);
  assert.ok(progress.some(bytes => bytes > 0 && bytes < 8));
  assert.equal(progress.at(-1), 8);
  assert.ok(progress.every((bytes, i) => i === 0 || bytes >= progress[i - 1]));
});

test("HTTP startup errors reject instead of leaving the loader pending", async () => {
  await assert.rejects(downloadStartupAssets([{file: "engine.js", bytes: 6}], "https://example.test/",
    () => {}, async () => new Response("Missing", {status: 404})), /startup-http-404/);
});

test("a stalled fetch is aborted and releases startup even when fetch never resolves", async () => {
  let signal: AbortSignal | null | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    signal = init?.signal;
    return await new Promise<Response>(() => {});
  };
  await assert.rejects(downloadStartupAssets([{file: "engine.js", bytes: 6}], "https://example.test/",
    () => {}, fetcher, 15), /startup-download-aborted/);
  assert.equal((signal as AbortSignal | undefined)?.aborted, true);
});

test("a stalled response body is cancelled rather than hanging after headers", async () => {
  let cancelled = false;
  const fetcher: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(1)); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(downloadStartupAssets([{file: "engine.js", bytes: 6}], "https://example.test/",
    () => {}, fetcher, 15), /startup-download-aborted/);
  assert.equal(cancelled, true);
});

test("startup recovery and progress labels cover all four languages", () => {
  for (const copy of Object.values(startupCopy)) {
    assert.deepEqual(Object.keys(copy).sort(), Object.keys(startupCopy.zh).sort());
    assert.ok(Object.values(copy).every(text => text.length > 0));
  }
});
