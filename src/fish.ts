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

// Rotate the escape height gradually; no swimming layer stays permanently safe.
export function fishSafeLevel(row: number): number {
  return [2, 1, 0, 1][Math.floor(row / 4) % 4];
}
