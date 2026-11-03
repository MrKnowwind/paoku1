import { CONFIG } from "./config.ts";

export type Biome = "forest" | "canyon" | "tunnel" | "beach" | "water" | "shore";
export interface TrackSection {
  biome: Biome;
  start: number;
  end: number;
  cycle: number;
}
export interface TrackGap {
  id: number;
  start: number;
  end: number;
  tutorial: boolean;
}
export const CYCLE_LENGTH =
  CONFIG.forestLength + CONFIG.canyonLength + CONFIG.tunnelLength + CONFIG.beachLength * 2 + CONFIG.waterLength;

export function sectionAt(distance: number): TrackSection {
  const d = Math.max(0, distance);
  const cycle = Math.floor(d / CYCLE_LENGTH);
  const base = cycle * CYCLE_LENGTH;
  const offset = d - base;
  const canyon = CONFIG.forestLength + CONFIG.tunnelLength;
  if (offset < CONFIG.forestLength)
    return {
      biome: "forest",
      start: base,
      end: base + CONFIG.forestLength,
      cycle,
    };
  if (offset < canyon)
    return {
      biome: "tunnel",
      start: base + CONFIG.forestLength,
      end: base + canyon,
      cycle,
    };
  if (offset < canyon + CONFIG.canyonLength)
    return {
      biome: "canyon",
      start: base + canyon,
      end: base + canyon + CONFIG.canyonLength,
      cycle,
    };
  const coast = base + canyon + CONFIG.canyonLength;
  if (d < coast + CONFIG.beachLength)
    return { biome: "beach", start: coast, end: coast + CONFIG.beachLength, cycle };
  const water = coast + CONFIG.beachLength;
  if (d < water + CONFIG.waterLength)
    return { biome: "water", start: water, end: water + CONFIG.waterLength, cycle };
  return { biome: "shore", start: water + CONFIG.waterLength, end: base + CYCLE_LENGTH, cycle };
}

export function gapsNear(distance: number, seed = 0): TrackGap[] {
  const cycle = Math.max(0, Math.floor(distance / CYCLE_LENGTH));
  const gaps: TrackGap[] = [];
  for (let c = Math.max(0, cycle - 1); c <= cycle + 1; c++) {
    const canyon = c * CYCLE_LENGTH + CONFIG.forestLength + CONFIG.tunnelLength;
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
export function gapAt(distance: number, seed = 0): TrackGap | undefined {
  return gapsNear(distance, seed).find(
    (gap) => distance >= gap.start && distance < gap.end,
  );
}
export function entryAt(distance: number, seed = 0): TrackGap | undefined {
  return gapsNear(distance, seed).find(
    (gap) => distance >= gap.start - CONFIG.wallEntry && distance < gap.end,
  );
}
export function nextGap(distance: number, seed = 0): TrackGap | undefined {
  return gapsNear(distance, seed).find((gap) => gap.end > distance);
}
export function roadSpans(
  start: number,
  end: number,
  seed = 0,
): { start: number; end: number }[] {
  let spans = [{ start, end }];
  for (const gap of gapsNear(start, seed))
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
export function obstacleAllowed(distance: number, seed = 0): boolean {
  const section = sectionAt(distance);
  return (
    (section.biome === "forest" || section.biome === "canyon" || section.biome === "water") &&
    (section.biome !== "water" || distance >= section.start + CONFIG.waterSafety && distance < section.end - CONFIG.waterSafety) &&
    distance >= section.start + CONFIG.exitSafety &&
    distance < section.end - CONFIG.exitSafety &&
    !gapsNear(distance, seed).some(
      (gap) => distance >= gap.start - 24 && distance <= gap.end + 20,
    )
  );
}
export function tunnelDarkness(distance: number): number {
  const section = sectionAt(distance);
  if (section.biome !== "tunnel") return 0;
  const t = Math.max(
    0,
    Math.min(1, (distance - section.start) / 12, (section.end - distance) / 12),
  );
  return t * t * (3 - 2 * t);
}

// The surface is above the nine swimming cells. Entry and exit share a continuous trajectory.
export function waterBlend(distance: number): number {
  const s = sectionAt(distance);
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
export function waterTransition(distance: number): boolean {
  const s = sectionAt(distance);
  return s.biome === "beach" && distance > s.end - 24 ||
    s.biome === "water" && distance < s.start + 20 ||
    s.biome === "water" && distance > s.end - 40 ||
    s.biome === "shore" && distance < s.start + 60;
}
