export type LoadingPhase = "files" | "scene" | "textures" | "ready" | "error";
export interface LoadingUpdate { phase: LoadingPhase; percent: number; reason?: "network" | "graphics" }
export function reportLoading(update: LoadingUpdate) {
  window.dispatchEvent(new CustomEvent<LoadingUpdate>("wild-dash:loading", {detail: update}));
}
