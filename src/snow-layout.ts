import { defaultTrack, snowBlend } from "./track.ts";

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

// Keep the running surface level. Only the verges build into drifts and ridges.
export function winterGroundHeight(x: number, distance: number, snow: number, roadEdge: number) {
  const verge = Math.max(0, Math.abs(x) - roadEdge);
  const bank = smooth(verge / 11) * (0.5 + 0.28 * Math.sin(distance * 0.08 + x * 0.27));
  const ridge = smooth((Math.abs(x) - 22) / 30) * (7 + 3 * Math.sin(distance * 0.034 + Math.sign(x) * 1.8) + 2.4 * Math.sin(x * 0.18 - distance * 0.061));
  return 0.06 - (1 - snow) * 0.06 * smooth(verge / 0.8) + snow * (bank + ridge);
}

export function winterShoulder(x: number, distance: number, plan = defaultTrack) {
  const snow = snowBlend(distance, plan);
  const verge = smooth((Math.abs(x) - 3.3) / 6);
  return snow + snow * (1 - snow) * 0.78 * verge;
}
