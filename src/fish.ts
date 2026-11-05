import { safeRoute } from "./safe-route.ts";
import { CONFIG } from "./config.ts";

export interface FishCrossing { direction: number; startTime: number }
export function fishPosition(crossing: FishCrossing, time: number) {
  const duration = CONFIG.fishHalfSpan * 2 / CONFIG.fishSpeed;
  const age = time - crossing.startTime;
  return {
    x: crossing.direction * (-CONFIG.fishHalfSpan + Math.max(0, Math.min(duration, age)) * CONFIG.fishSpeed),
    active: age >= 0 && age <= duration,
    direction: crossing.direction,
  };
}

// Keep each random escape height for four rows to allow a clear swimming response.
export function fishSafeLevel(row: number, seed = 0): number {
  return safeRoute(row, seed, 4, 113);
}
