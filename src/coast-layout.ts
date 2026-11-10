import { CONFIG } from "./config.ts";
import { defaultTrack, sectionAt, snowBlend } from "./track.ts";
import { winterGroundHeight } from "./snow-layout.ts";

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

// Preserve both sides of the road/verge step in the mesh, rather than interpolating over 4m.
export const COAST_COLUMNS = [...new Set([
  ...Array.from({length:41},(_,i)=>(i-20)*4),-74.3,-5.7,-4.3,-4.298,4.298,4.3,5.7,74.3,
])].sort((a,b)=>a-b);

export function coastalSkyBlend(distance: number, plan = defaultTrack) {
  const s=plan.at(distance);
  if(s.biome==="beach")return s.from==="canyon"?1:smooth((distance-s.start)/40);
  if(s.biome==="water")return 1;
  if(s.biome==="shore")return 1-smooth((distance-s.start-50)/30);
  if(s.biome==="canyon"&&plan.at(s.end).biome==="beach")return smooth((distance-s.end+80)/80);
  return 0;
}

export function coastFloor(distance: number, plan = defaultTrack): number {
  const s = sectionAt(distance, plan);
  if (s.biome === "beach") return 0.06 + (CONFIG.seabedHeight - 0.06) * smooth((distance - s.end + 24) / 24);
  if (s.biome === "shore") return CONFIG.seabedHeight + (0.06 - CONFIG.seabedHeight) * smooth((distance - s.start) / 60);
  return s.biome === "water" ? CONFIG.seabedHeight : 0.06;
}

// The same height profile drives coastal meshes, water depth and scenery placement.
export function coastHeight(x: number, distance: number, plan = defaultTrack): number {
  const s = sectionAt(distance, plan), ax = Math.abs(x);
  const edge = s.biome === "beach" ? smooth((distance - s.start) / 24)
    : s.biome === "shore" ? 1 - smooth((distance - s.start - 50) / 30) : s.biome === "water" ? 1 : 0;
  const submerged = s.biome === "beach" ? smooth((distance - s.end + 24) / 24)
    : s.biome === "shore" ? 1 - smooth((distance - s.start) / 60) : s.biome === "water" ? 1 : 0;
  const dunes = (Math.exp(-Math.pow((ax - 11) / 5, 2)) * 1.2 - smooth((ax - 18) / 18) * 5) * edge;
  const seabed = (Math.sin(x * 0.27 + distance * 0.07) * 0.65 + Math.cos(x * 0.5 - distance * 0.04) * 0.3) * smooth((ax - 4) / 7);
  const forest = s.biome === "beach" && s.from === "forest" ? 1 - smooth((distance - s.start) / 24)
    : s.biome === "shore" && s.to === "forest" ? smooth((distance - s.start - 60) / 20) : s.biome === "forest" ? 1 : 0;
  const canyon = s.biome === "beach" && s.from === "canyon" ? 1 - smooth((distance - s.start) / 30)
    : s.biome === "shore" && s.to === "canyon" ? smooth((distance - s.end + 30) / 30) : s.biome === "canyon" ? 1 : 0;
  const snow = snowBlend(distance, plan);
  const verge = -0.06 * forest * (ax >= 4.3 ? 1 : 0);
  const valley = (-18 - 0.06) * canyon * smooth((ax - 5.7) / 7);
  return coastFloor(distance, plan) + ((1 - submerged) * dunes + submerged * seabed + verge + valley) * (1 - snow)
    + snow * (winterGroundHeight(x, distance, 1, 4.3) - 0.06);
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
