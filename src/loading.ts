export type LoadingPhase = "files" | "scene" | "textures" | "ready" | "error";
export interface LoadingUpdate { phase: LoadingPhase; percent: number; loaded?: number; total?: number; reason?: "network" | "graphics" }
export function reportLoading(update: LoadingUpdate) {
  window.dispatchEvent(new CustomEvent<LoadingUpdate>("wild-dash:loading", {detail: update}));
}

export interface StartupAsset { file: string; bytes: number }

// Stream bytes without retaining a second copy of the engine in memory. The HTTP cache is reused by import().
export async function downloadStartupAssets(
  assets: StartupAsset[], base: string,
  progress: (loaded: number, total: number) => void,
  fetcher: typeof fetch = fetch,
  stallMs = 30000,
) {
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  const amounts = assets.map(() => 0);
  const controllers = new Set<AbortController>();
  let next = 0;
  const update = () => progress(amounts.reduce((sum, amount) => sum + amount, 0), total);
  const worker = async () => {
    while (next < assets.length) {
      const index = next++, asset = assets[index], controller = new AbortController();
      controllers.add(controller);
      let timeout: ReturnType<typeof setTimeout>;
      let overall: ReturnType<typeof setTimeout>;
      const aborted = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("startup-download-aborted")), {once: true});
      });
      const touch = () => { clearTimeout(timeout); timeout = setTimeout(() => controller.abort(), stallMs); };
      touch(); overall = setTimeout(() => controller.abort(), 180000);
      try {
        const response = await Promise.race([fetcher(new URL(asset.file, base), {signal: controller.signal}), aborted]);
        if (!response.ok) throw new Error(`startup-http-${response.status}`);
        if (response.body) {
          const reader = response.body.getReader();
          try {
            while (true) {
              const part = await Promise.race([reader.read(), aborted]);
              if (part.done) break;
              amounts[index] += part.value.byteLength; touch(); update();
            }
          } catch (error) {
            await reader.cancel().catch(() => {});
            throw error;
          } finally { reader.releaseLock(); }
        } else {
          const data = await Promise.race([response.arrayBuffer(), aborted]);
          amounts[index] = data.byteLength; update();
        }
        // Cached responses can have different transport encodings; manifest sizes are decoded bytes.
        amounts[index] = asset.bytes; update();
      } finally {
        clearTimeout(timeout!); clearTimeout(overall!); controllers.delete(controller);
      }
    }
  };
  try { await Promise.all(Array.from({length: Math.min(3, assets.length)}, worker)); }
  catch (error) { controllers.forEach(controller => controller.abort()); throw error; }
}
