import type { RegionalAttack } from "./regional-combat.ts";
import { CONFIG } from "./config.ts";

export type Point3 = [number, number, number];
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export const ease = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const mix = (a: Point3, b: Point3, t: number): Point3 => a.map((v, i) => v + (b[i] - v) * t) as Point3;

export function releaseTime(attack: RegionalAttack) {
  return attack.releaseAt ?? (attack.kind === "small" ? attack.start + CONFIG.regionalCombat.smallWarning : attack.lockAt + 0.24);
}

// Root-local targets drive both the hands and the held projectile.
export function yetiMotion(time: number, attack?: RegionalAttack) {
  let squat = 0, lean = -0.05, twist = 0, action = 0, grip = 0, sprint = 0;
  let right: Point3 | undefined, left: Point3 | undefined, ball: Point3 | undefined;
  let radius = 0;
  if (attack) {
    const age = time - attack.start;
    const recover = 1 - ease((time - attack.impactAt - 0.04) / 0.55);
    action = ease(age / 0.2) * recover;
    if (attack.kind === "small") {
      const cock = ease(age / 0.52), launch = ease((time - releaseTime(attack) + 0.2) / 0.2);
      right = mix([0.76, 1.35, 0.25], [0.88, 2.44, -0.35], cock);
      right = mix(right, [0.3, 1.95, 1.12], launch);
      left = [ -0.68, 1.48, 0.45 ];
      squat = 0.08 * (1 - launch); twist = -0.24 * cock + launch * 0.4;
      lean = -0.12 * launch; grip = 1 - launch * 0.8;
      if (time < releaseTime(attack)) { ball = [right[0], right[1] + 0.09, right[2] + 0.13]; radius = 0.15; }
    } else if (attack.kind === "snowball") {
      const roll = ease(age / (CONFIG.regionalCombat.snowballRoll * 0.72));
      const lift = ease((age - CONFIG.regionalCombat.snowballRoll * 0.72) / (CONFIG.regionalCombat.snowballRoll * 0.28));
      const throwWeight = ease((time - attack.lockAt) / 0.24);
      radius = 0.13 + roll * (CONFIG.regionalCombat.targetRadius - 0.13);
      ball = mix([0, radius + 0.04, 1.02], [0, 3.9, 0.08], lift);
      ball = mix(ball, [0, 2.1, 1.16], throwWeight);
      squat = (1 - lift) * 0.56; lean = -(1 - lift) * 0.28 + throwWeight * -0.2;
      const contact = radius * 0.73;
      right = [contact, ball[1] + radius * (0.08 - 0.63 * lift), ball[2] - 0.09];
      left = [-contact, right[1], right[2]]; grip = 0.85;
      if (time >= releaseTime(attack)) { ball = undefined; grip = 0.15; }
    } else if (attack.kind === "charge") {
      const prepare = ease(age / 0.65);
      sprint = ease((time - attack.impactAt + 0.28) / 0.12) * recover;
      squat = 0.23 * prepare * (1 - sprint * 0.55); lean = -0.24 * prepare - sprint * 0.24;
      right = [0.79, 1.06, 0.52]; left = [-0.79, 1.06, 0.52]; grip = 1;
    }
    squat *= recover; lean *= recover; twist *= recover;
  }
  return {squat, lean, twist, action, grip, sprint, right, left, ball, radius};
}
