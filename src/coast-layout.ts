import { CONFIG } from "./config.ts";
import { defaultTrack, sectionAt } from "./track.ts";

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

export function coastFloor(distance: number, plan = defaultTrack): number {
  const s = sectionAt(distance, plan);
  if (s.biome === "beach") return 0.06 + (CONFIG.seabedHeight - 0.06) * smooth((distance - s.end + 24) / 24);
  if (s.biome === "shore") return CONFIG.seabedHeight + (0.06 - CONFIG.seabedHeight) * smooth((distance - s.start) / 60);
  return s.biome === "water" ? CONFIG.seabedHeight : 0.06;
}

// One full-width surface blends textures, rather than collapsing UVs into a wedge.
export function coastWeights(distance: number, plan = defaultTrack): [number, number, number, number] {
  const s = sectionAt(distance, plan);
  const weights = (biome: string | undefined): [number, number, number, number] =>
    biome === "forest" ? [1, 0, 0, 0] : biome === "canyon" ? [0, 1, 0, 0] : biome === "snow" ? [0, 0, 0, 1] : [0, 0, 1, 0];
  const mix = (a: number[], b: number[], t: number): [number, number, number, number] => a.map((v, i) => v * (1 - t) + b[i] * t) as [number, number, number, number];
  if (s.biome === "snow-transition") return mix(weights(s.from), weights(s.to), smooth((distance - s.start) / (s.end - s.start)));
  if (s.biome === "beach") return mix(weights(s.from), weights("beach"), smooth((distance - s.start) / 24));
  if (s.biome === "shore") return mix(weights("beach"), weights(s.to), smooth((distance - s.start - 60) / 20));
  return weights(s.biome);
}

// Accumulated slope length keeps sand grains square on both sloping shorelines.
function slopeExtra(length: number) {
  const samples = [0];
  let previousY = 0;
  for (let i = 1; i <= 64; i++) {
    const y = (0.06 - CONFIG.seabedHeight) * smooth(i / 64);
    samples.push(samples[i - 1] + Math.hypot(length / 64, y - previousY) - length / 64);
    previousY = y;
  }
  return samples;
}
const entry = slopeExtra(24), exit = slopeExtra(60);
const partial = (samples: number[], t: number) => {
  const index = Math.max(0, Math.min(64, t * 64)), i = Math.floor(index);
  return samples[i] + ((samples[Math.min(64, i + 1)] - samples[i]) * (index - i));
};

export function coastSandUV(x: number, distance: number, plan = defaultTrack): [number, number] {
  plan.at(distance);
  let length = distance;
  for (const s of plan.sections) {
    if (s.start > distance) break;
    if (s.biome === "beach") length += partial(entry, (distance - s.end + 24) / 24);
    if (s.biome === "shore") length += partial(exit, (distance - s.start) / 60);
  }
  return [x / 3, length / 3];
}
