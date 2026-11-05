import { CONFIG } from "./config.ts";

// The scene advances elapsed only after prepared obstacle meshes are ready.
export function openingFog(elapsed: number): number {
  const t = Math.max(0, Math.min(1, (elapsed - CONFIG.openingFogHold) / CONFIG.openingFogFade));
  return 1 - t * t * (3 - 2 * t);
}
