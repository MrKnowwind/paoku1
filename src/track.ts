import { CONFIG } from "./config.ts";

export type CoreBiome = "forest" | "canyon" | "water" | "snow";
export type Biome = CoreBiome | "tunnel" | "beach" | "shore" | "snow-transition";
export interface TrackSection {
  biome: Biome;
  start: number;
  end: number;
  // Unique core segment ordinal, also used for stable encounter IDs.
  cycle: number;
  from?: CoreBiome;
  to?: CoreBiome;
}
export interface TrackGap { id: number; start: number; end: number; tutorial: boolean; }
export const coreBiomes: CoreBiome[] = ["forest", "canyon", "water", "snow"];
const lengths = { forest: CONFIG.forestLength, canyon: CONFIG.canyonLength, water: CONFIG.waterLength, snow: CONFIG.snowLength };

export function terrainChoices(current: CoreBiome, distance: number): CoreBiome[] {
  const pool = coreBiomes.filter(b => CONFIG.terrainUnlock[b] <= distance && b !== current);
  return pool.length ? pool : ["forest"];
}
export function connection(from: CoreBiome, to: CoreBiome): {biome: Biome; length: number}[] {
  if (from === to) return [];
  if (from === "water") return [{biome: "shore", length: CONFIG.beachLength}];
  if (to === "water") return [{biome: "beach", length: CONFIG.beachLength}];
  if (from === "snow" || to === "snow") return [{biome: "snow-transition", length: CONFIG.snowTransition}];
  return [{biome: "tunnel", length: CONFIG.tunnelLength}];
}
// Queries only append. Rewinds never discard committed future choices.
export class TrackPlan {
  readonly sections: TrackSection[] = [{biome: "forest", start: 0, end: CONFIG.forestLength, cycle: 0}];
  readonly seed: number;
  readonly forced: CoreBiome | null;
  constructor(seed = 1, forced: CoreBiome | null = null) { this.seed = seed; this.forced = forced; }
  at(distance: number): TrackSection {
    const d = Math.max(0, distance);
    while (d >= this.sections[this.sections.length - 1].end) {
      const previous = this.sections[this.sections.length - 1];
      const current = previous.biome as CoreBiome;
      const ordinal = previous.cycle + 1;
      let n = Math.imul(this.seed ^ Math.imul(ordinal, 374761393), 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      const random = ((n ^ (n >>> 16)) >>> 0) / 4294967296;
      const pool = terrainChoices(current, previous.end);
      const next = current === "forest" && this.forced ? this.forced : pool[Math.floor(random * pool.length)];
      let start = previous.end;
      for (const bridge of connection(current, next)) {
        this.sections.push({biome: bridge.biome, start, end: start + bridge.length, cycle: ordinal, from: current, to: next});
        start += bridge.length;
      }
      this.sections.push({biome: next, start, end: start + lengths[next], cycle: ordinal, from: current, to: next});
    }
    return this.sections.find(s => d >= s.start && d < s.end)!;
  }
}
export const defaultTrack = new TrackPlan();
export function sectionAt(distance: number, plan = defaultTrack): TrackSection { return plan.at(distance); }
export function snowBlend(distance: number, plan = defaultTrack): number {
  const s = plan.at(distance);
  const t = Math.max(0, Math.min(1, (distance - s.start) / (s.end - s.start)));
  const smooth = t * t * (3 - 2 * t);
  if (s.biome === "snow") return 1;
  if (s.biome === "snow-transition") return s.to === "snow" ? smooth : 1 - smooth;
  if (s.biome === "shore" && s.to === "snow") {
    const shore = Math.max(0, Math.min(1, (distance - s.start - 60) / 20));
    return shore * shore * (3 - 2 * shore);
  }
  if (s.biome === "beach" && s.from === "snow") {
    const beach = Math.max(0, Math.min(1, (distance - s.start) / 24));
    return 1 - beach * beach * (3 - 2 * beach);
  }
  return 0;
}

export function gapsNear(distance: number, seed = 0, plan = defaultTrack): TrackGap[] {
  plan.at(distance + CONFIG.trackLookahead);
  const gaps: TrackGap[] = [];
  const canyons = plan.sections.filter(s => s.biome === "canyon");
  for (let c = 0; c < canyons.length; c++) {
    const canyon = canyons[c].start;
    if (canyon > distance + CONFIG.trackLookahead || canyon + CONFIG.canyonLength < distance - 60) continue;
    const random = (salt: number) => {
      let n = Math.imul(seed ^ Math.imul(c + 1, 374761393) ^ salt, 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    CONFIG.gapOffsets.forEach((fixedOffset, i) => {
      // Keep enough solid ground between gaps to finish the first wall tutorial
      // before the next section enters the generation horizon.
      const previousEnd = i === 0 ? 0 : gaps[gaps.length - 1].end - canyon;
      const offset = seed === 0 ? fixedOffset : i === 0
        ? 110 + Math.floor(random(1) * 130)
        : Math.max(previousEnd + 190, 430 + Math.floor(random(3) * 120));
      const length = seed === 0 ? CONFIG.gapLengths[i] : (i === 0 ? 50 : 60) + Math.floor(random(i * 2 + 2) * (i === 0 ? 50 : 60));
      gaps.push({
        id: c * 2 + i,
        start: canyon + offset,
        end: canyon + offset + length,
        tutorial: c === 0 && i === 0,
      });
    });
  }
  return gaps;
}
export function gapAt(distance: number, seed = 0, plan = defaultTrack): TrackGap | undefined {
  return gapsNear(distance, seed, plan).find(
    (gap) => distance >= gap.start && distance < gap.end,
  );
}
export function entryAt(distance: number, seed = 0, plan = defaultTrack): TrackGap | undefined {
  return gapsNear(distance, seed, plan).find(
    (gap) => distance >= gap.start - CONFIG.wallEntry && distance < gap.end,
  );
}
export function nextGap(distance: number, seed = 0, plan = defaultTrack): TrackGap | undefined {
  return gapsNear(distance, seed, plan).find((gap) => gap.end > distance);
}
export function roadSpans(
  start: number,
  end: number,
  seed = 0,
  plan = defaultTrack,
): { start: number; end: number }[] {
  let spans = [{ start, end }];
  for (const gap of gapsNear(start, seed, plan))
    spans = spans.flatMap((span) => {
      if (gap.start >= span.end || gap.end <= span.start) return [span];
      return [
        ...(span.start < gap.start
          ? [{ start: span.start, end: gap.start }]
          : []),
        ...(span.end > gap.end ? [{ start: gap.end, end: span.end }] : []),
      ];
    });
  return spans;
}
export function obstacleAllowed(distance: number, seed = 0, plan = defaultTrack): boolean {
  const section = sectionAt(distance, plan);
  return (
    (section.biome === "forest" || section.biome === "canyon" || section.biome === "water" || section.biome === "snow") &&
    (section.biome !== "water" || distance >= section.start + CONFIG.waterSafety && distance < section.end - CONFIG.waterSafety) &&
    distance >= section.start + CONFIG.exitSafety &&
    distance < section.end - CONFIG.exitSafety &&
    !gapsNear(distance, seed, plan).some(
      (gap) => distance >= gap.start - 24 && distance <= gap.end + 20,
    )
  );
}
export function tunnelDarkness(distance: number, plan = defaultTrack): number {
  const section = sectionAt(distance, plan);
  if (section.biome !== "tunnel") return 0;
  const t = Math.max(
    0,
    Math.min(1, (distance - section.start) / 12, (section.end - distance) / 12),
  );
  return t * t * (3 - 2 * t);
}

// The surface is above the nine swimming cells. Entry and exit share a continuous trajectory.
export function waterBlend(distance: number, plan = defaultTrack): number {
  const s = sectionAt(distance, plan);
  if (s.biome === "water") return 1;
  if (s.biome === "beach") {
    const t = Math.max(0, Math.min(1, (distance - s.end + 24) / 24));
    return t * t * (3 - 2 * t);
  }
  if (s.biome === "shore") {
    const t = Math.max(0, Math.min(1, (distance - s.start) / 60));
    return 1 - t * t * (3 - 2 * t);
  }
  return 0;
}
export function waterTransition(distance: number, plan = defaultTrack): boolean {
  const s = sectionAt(distance, plan);
  return s.biome === "beach" && distance > s.end - 24 ||
    s.biome === "water" && distance < s.start + 20 ||
    s.biome === "water" && distance > s.end - 40 ||
    s.biome === "shore" && distance < s.start + 60;
}
