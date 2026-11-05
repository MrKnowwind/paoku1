import { CONFIG } from "./config.ts";

function ease(progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  return t * t * (3 - 2 * t);
}

export function sipPose(remaining: number) {
  const progress = 1 - remaining / CONFIG.drinkDuration;
  const lift = ease(progress / 0.34) * (1 - ease((progress - 0.63) / 0.37));
  const swallow = ease((progress - 0.29) / 0.15) * (1 - ease((progress - 0.59) / 0.17));
  return {lift, swallow};
}

export const ICE_IMPACT_METRES = 5.9;

export function iceFallPose(remaining: number, recovery: number) {
  if (remaining <= 0) {
    const weight = ease(recovery / CONFIG.iceRecovery);
    return {brace: weight, fall: weight, rise: 4 * weight * (1 - weight)};
  }
  const distance = CONFIG.iceDistance - remaining;
  return {brace: ease(distance / 2.7), fall: ease((distance - 1.1) / (ICE_IMPACT_METRES - 1.1)), rise: 0};
}
