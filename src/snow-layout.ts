import { defaultTrack, snowBlend } from "./track.ts";

export const WINTER_ROAD_Y = 0.06;
export const WINTER_HAZARD_HALF_WIDTH = 1.05;
export const POOL_WATER_Y = -0.46;

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

// Keep the running surface level. Only the verges build into drifts and ridges.
export function winterGroundHeight(x: number, distance: number, snow: number, roadEdge: number) {
  const verge = Math.max(0, Math.abs(x) - roadEdge);
  const bank = smooth(verge / 10) * (0.56 + 0.28 * Math.sin(distance * 0.08 + x * 0.27) + 0.12 * Math.cos(distance * 0.32 - x * 0.6));
  const ridge = smooth((Math.abs(x) - 16) / 19) * (3.6 + 2.3 * Math.sin(distance * 0.037 + Math.sign(x) * 1.8))
    + smooth((Math.abs(x) - 35) / 32) * (7.5 + 3.2 * Math.sin(x * 0.15 - distance * 0.055));
  return WINTER_ROAD_Y * (1 - (1 - snow) * smooth(verge / 0.8)) + snow * (bank + ridge);
}

export function winterShoulder(x: number, distance: number, plan = defaultTrack) {
  const snow = snowBlend(distance, plan);
  const verge = smooth((Math.abs(x) - 3.3) / 6);
  return snow + snow * (1 - snow) * 0.78 * verge;
}
