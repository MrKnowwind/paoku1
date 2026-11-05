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

// Warn from the entry side before the school reaches the swimming corridor.
export function fishWarning(crossing: FishCrossing, time: number) {
  const entryTime = crossing.startTime + (CONFIG.fishHalfSpan - CONFIG.fishWarningEdge) / CONFIG.fishSpeed;
  const untilEntry = entryTime - time;
  const crossingTime = 2 * CONFIG.fishWarningEdge / CONFIG.fishSpeed;
  if (untilEntry > CONFIG.fishWarningLead || untilEntry < -crossingTime) return undefined;
  return {
    side: -crossing.direction,
    urgency: Math.min(1, 1 - untilEntry / CONFIG.fishWarningLead),
  };
}

// Keep each random escape height for four rows to allow a clear swimming response.
export function fishSafeLevel(row: number, seed = 0): number {
  return safeRoute(row, seed, 4, 113);
}
