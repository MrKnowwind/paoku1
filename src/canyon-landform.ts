import type { TrackPlan, TrackSection } from "./track.ts";

const joinHeight = 0.5;
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function canyonRidgeStrength(section: TrackSection, distance: number, plan: Pick<TrackPlan, "at">): number {
  if (section.biome === "canyon") {
    const entry = plan.at(section.start - 1).biome;
    const exit = plan.at(section.end).biome;
    const rise = entry === "snow-transition" || entry === "shore"
      ? joinHeight + (1 - joinHeight) * smooth((distance - section.start) / 60) : 1;
    const fall = exit === "snow-transition" || exit === "beach"
      ? joinHeight + (1 - joinHeight) * smooth((section.end - distance) / 60) : 1;
    return Math.min(rise, fall);
  }
  if ((section.biome === "snow-transition" || section.biome === "shore") && section.to === "canyon")
    return joinHeight * smooth(1 - (section.end - distance) / 30);
  if ((section.biome === "snow-transition" || section.biome === "beach") && section.from === "canyon")
    return joinHeight * smooth(1 - (distance - section.start) / 30);
  return 0;
}

const floorY = -18;
const wallRows = 24;
// The rock continues from the crest across the shoulder and down to the valley floor.
const shoulder = [[0.16, 0.02], [0.33, 0.11], [0.55, 0.21], [0.8, 0.58], [1, 1]] as const;

export function canyonRidgeGeometry(side: number, world: number, strengthAt: (distance: number) => number) {
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [], colors: number[] = [];
  const stride = wallRows + 1 + shoulder.length;
  for (let z = 0; z <= 10; z++) {
    const distance = world + z;
    const strength = strengthAt(distance);
    const offset = 7 * (1 - smooth(strength / joinHeight));
    const crest = 13 + Math.sin(distance * 0.037 + side) * 2.4 + Math.sin(distance * 0.11) * 0.6;
    const top = -8 + (crest + 8) * strength;
    const innerX = (y: number) => {
      // At the playable wall heights, retain the original collision alignment.
      const relief = 0.07 + smooth((y - 4.5) / 4) * 0.7 + smooth((-y - 1) / 8) * 0.6;
      const contour = Math.sin(distance * 0.13 + y * 0.58) * 0.6 + Math.cos(y * 2.2 + distance * 0.06) * 0.18;
      return 5.46 + offset + contour * relief + smooth((y - 7) / 6) * 2.4;
    };
    const vertex = (x: number, y: number, v: number) => {
      positions.push(side * x, y, z);
      uvs.push(distance / 5.5, v / 5.5);
      const shade = 0.69 + smooth((y + 12) / 22) * 0.31;
      const stratum = 0.95 + Math.sin(y * 2.2 + distance * 0.012) * 0.05;
      colors.push(shade * stratum, shade * stratum * 0.96, shade * 0.9, 1);
    };
    for (let row = 0; row <= wallRows; row++) {
      const y = floorY + (top - floorY) * row / wallRows;
      vertex(innerX(y), y, y);
    }
    const rim = innerX(top);
    const outer = 44 + 3 * Math.sin(distance * 0.052 + side);
    for (const [across, drop] of shoulder) {
      const x = rim + (outer - rim) * across;
      const y = top + (floorY - top) * drop;
      vertex(x, y, top + x - rim);
    }
    if (z === 10) continue;
    for (let row = 0; row < stride - 1; row++) {
      const a = z * stride + row, b = a + stride;
      if (side < 0) indices.push(a, b, a + 1, a + 1, b, b + 1);
      else indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return {positions, indices, uvs, colors};
}
