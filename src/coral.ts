import { safeRoute } from "./safe-route.ts";
import { CONFIG } from "./config.ts";

export interface CoralPoint { x: number; y: number; z: number }
export interface CoralBranch {
  from: CoralPoint;
  to: CoralPoint;
  radius: number;
  tipRadius: number;
}
export interface CoralPlan {
  rootX: number;
  rootY: number;
  branches: CoralBranch[];
}

// Renderer and collision use the same rooted, tapered branch skeleton.
export function makeCoral(lane: number, tiers: number, neighbour?: number, fromSide = 0): CoralPlan {
  const rootX = fromSide ? fromSide * 5.7 : lane * 2.5;
  const plan: CoralPlan = {rootX, rootY: CONFIG.seabedHeight - 0.06, branches: []};
  const tier = Math.max(0, Math.min(2, tiers - 1));
  const top = CONFIG.waterHeights[tier] + (tier === 2 ? 0.65 : 1.2);
  const base = CONFIG.waterHeights[0];
  const point = (x: number, y: number, z = 0): CoralPoint => ({x: x - rootX, y: y - plan.rootY, z});
  const branch = (from: CoralPoint, to: CoralPoint, radius: number, tipRadius: number) =>
    plan.branches.push({from, to, radius, tipRadius});
  const root = point(rootX, plan.rootY);
  const fork = point(lane * 2.5, base + 0.8, 0.06);
  branch(root, fork, 0.43, 0.32);
  for (const column of neighbour === undefined ? [lane] : [lane, neighbour]) {
    const trunkBase = column === lane ? fork : point(column * 2.5, base + 1.15, -0.08);
    if (column !== lane) branch(fork, trunkBase, 0.29, 0.25);
    const middle = point(column * 2.5 + 0.07, (base + 1.15 + top) / 2, -0.06);
    branch(trunkBase, middle, 0.3, 0.24);
    branch(middle, point(column * 2.5 - 0.08, top, 0), 0.24, 0.09);
    for (let i = 0; i < 6; i++) {
      const t = 0.22 + i * 0.115;
      const y = base + 0.95 + (top - base - 0.95) * t;
      const side = i % 2 ? -1 : 1;
      const start = point(column * 2.5 + 0.03, y, 0);
      const elbow = point(column * 2.5 + side * 0.43, y + 0.18, Math.sin(i * 2.4) * 0.25);
      const tip = point(column * 2.5 + side * 0.58, Math.min(top, y + 0.5), Math.sin(i * 2.4) * 0.4);
      branch(start, elbow, 0.17, 0.13);
      branch(elbow, tip, 0.13, 0.055);
    }
  }
  return plan;
}

// Rounded, gently bending branches: the same sampled centreline drives contact and mesh creation.
export function coralPath(branch: CoralBranch): CoralPoint[] {
  return Array.from({length: 9}, (_, i) => {
    const t = i / 8, bend = Math.sin(t * Math.PI);
    return {
      x: branch.from.x + (branch.to.x - branch.from.x) * t + bend * 0.045,
      y: branch.from.y + (branch.to.y - branch.from.y) * t,
      z: branch.from.z + (branch.to.z - branch.from.z) * t + bend * 0.065,
    };
  });
}

export function touchesCoral(plan: CoralPlan, x: number, y: number, z: number, padding = 0.38): boolean {
  const px = x - plan.rootX, py = y - plan.rootY;
  return plan.branches.some(b => {
    const path = coralPath(b);
    return path.slice(0, -1).some((from, i) => {
    const to = path[i + 1];
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const length2 = dx * dx + dy * dy + dz * dz;
    const t = Math.max(0, Math.min(1, ((px - from.x) * dx + (py - from.y) * dy + (z - from.z) * dz) / length2));
    const radius = b.radius + (b.tipRadius - b.radius) * (i + t) / 8 + padding;
    return Math.hypot(px - from.x - dx * t, py - from.y - dy * t, z - from.z - dz * t) < radius;
    });
  });
}

// At most one column change between rows, with >1 second between rows at max speed.
export function waterSafeLane(row: number, seed = 0): number {
  return safeRoute(row, seed, 2, 227) - 1;
}
