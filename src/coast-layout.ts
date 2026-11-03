import { CONFIG } from "./config.ts";
import { CYCLE_LENGTH, sectionAt } from "./track.ts";

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const waterStart = CONFIG.forestLength + CONFIG.tunnelLength + CONFIG.canyonLength + CONFIG.beachLength;
const waterEnd = waterStart + CONFIG.waterLength;

export function coastFloor(distance: number): number {
  const s = sectionAt(distance);
  if (s.biome === "beach") return 0.06 + (CONFIG.seabedHeight - 0.06) * smooth((distance - s.end + 24) / 24);
  if (s.biome === "shore") return CONFIG.seabedHeight + (0.06 - CONFIG.seabedHeight) * smooth((distance - s.start) / 60);
  return s.biome === "water" ? CONFIG.seabedHeight : 0.06;
}

// One full-width surface blends textures, rather than collapsing UVs into a wedge.
export function coastWeights(distance: number): [number, number, number, number] {
  const s = sectionAt(distance);
  if (s.biome === "canyon") {
    const sand = smooth((distance - s.end + 60) / 60);
    return [0, 1 - sand, sand, 1];
  }
  if (s.biome === "shore" || s.biome === "forest") {
    const forest = smooth((distance - (s.biome === "shore" ? s.end : s.start) + 20) / 40);
    return [forest, 0, 1 - forest, 1];
  }
  return [0, 0, 1, 1];
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

export function coastSandUV(x: number, distance: number): [number, number] {
  const cycle = Math.floor(distance / CYCLE_LENGTH), local = distance - cycle * CYCLE_LENGTH;
  const length = distance + cycle * (entry[64] + exit[64])
    + partial(entry, (local - waterStart + 24) / 24) + partial(exit, (local - waterEnd) / 60);
  return [x / 3, length / 3];
}
