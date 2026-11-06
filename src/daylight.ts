import { CONFIG } from "./config.ts";

export const NIGHT_START = CONFIG.daylight + CONFIG.dusk;
export const DAY_LENGTH = NIGHT_START + CONFIG.night;

const clock = (time: number) => Math.round(time * 1e8) / 1e8;

export function dayTime(time: number) {
  return clock(time) % DAY_LENGTH;
}

export function dayNumber(time: number) {
  return Math.floor(clock(time) / DAY_LENGTH) + 1;
}

export function dayPhase(time: number) {
  const seconds = dayTime(time);
  return seconds < CONFIG.daylight ? "day" : seconds < NIGHT_START ? "dusk" : "night";
}

function smooth(from: number, to: number, time: number) {
  const t = Math.max(0, Math.min(1, (time - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

export function daylightBlend(time: number) {
  const seconds = dayTime(time);
  return {
    dusk: smooth(CONFIG.daylight - 4, CONFIG.daylight + 12, seconds) *
      (1 - smooth(CONFIG.daylight + 12, NIGHT_START + 5, seconds)),
    night: smooth(CONFIG.daylight + 12, NIGHT_START + 5, seconds) *
      (1 - smooth(DAY_LENGTH - 18, DAY_LENGTH, seconds)),
    dawn: smooth(DAY_LENGTH - 18, DAY_LENGTH - 8, seconds) *
      (1 - smooth(DAY_LENGTH - 8, DAY_LENGTH, seconds)),
  };
}
