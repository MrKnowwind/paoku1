import { CONFIG } from "./config.ts";
import { DAY_LENGTH, dayTime } from "./daylight.ts";
import type { RunnerGame } from "./game.ts";

const rules = CONFIG.regionalCombat;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export type RegionalAttackKind = "dive" | "dropping" | "small" | "charge" | "snowball";
export interface RegionalEnemy {
  id: number;
  kind: "bat" | "yeti";
  homeX: number;
  homeZ: number;
  homeY: number;
  enteredAt: number;
  readyAt: number;
  hitAt: number;
}
export interface RegionalAttack {
  id: number;
  enemy: number;
  kind: RegionalAttackKind;
  start: number;
  lockAt: number;
  impactAt: number;
  x: number;
  y: number;
  worldZ: number;
  side: number;
  fromX: number;
  fromY: number;
  fromZ: number;
  spent: boolean;
  locked: boolean;
}
export interface Dropping {
  id: number;
  x: number;
  worldZ: number;
  expires: number;
}
export interface RegionalState {
  enemies: RegionalEnemy[];
  attacks: RegionalAttack[];
  droppings: Dropping[];
  nextPack: number;
  pack: number;
  sequence: number;
  section: number;
}

export class RegionalCombat {
  state: RegionalState = {enemies: [], attacks: [], droppings: [], nextPack: 0, pack: 0, sequence: 0, section: -1};

  snapshot(): RegionalState {
    return {...this.state, enemies: this.state.enemies.map(e => ({...e})),
      attacks: this.state.attacks.map(a => ({...a})), droppings: this.state.droppings.map(d => ({...d}))};
  }
  restore(state: RegionalState | undefined, health: (e: RegionalEnemy) => number) {
    this.clear();
    if (!state) return;
    this.state = {...state, enemies: state.enemies.filter(e => health(e) > 0).map(e => ({...e})),
      attacks: state.attacks.filter(a => state.enemies.some(e => e.id === a.enemy && health(e) > 0)).map(a => ({...a})),
      droppings: state.droppings.map(d => ({...d}))};
  }
  clear() {
    this.state.enemies = []; this.state.attacks = []; this.state.droppings = [];
  }
  cancel(id: number) { this.state.attacks = this.state.attacks.filter(a => a.enemy !== id); }

  position(enemy: RegionalEnemy, game: RunnerGame) {
    const time = game.worldTime;
    const enter = 1 - clamp((time - enemy.enteredAt) / rules.entrance);
    let x = enemy.homeX + Math.sign(enemy.homeX) * enter * 1.8;
    let z = enemy.homeZ, y = enemy.homeY;
    if (enemy.kind === "bat") {
      x += Math.sin(time * 1.3 + enemy.id) * 0.45;
      y += Math.sin(time * 2.1 + enemy.id) * 0.28;
      z += Math.cos(time + enemy.id) * 0.5;
    }
    const a = this.state.attacks.find(a => a.enemy === enemy.id);
    let crouch = 0, leap = 0, bite = 0;
    if (a) {
      const p = clamp((time - a.lockAt) / (a.impactAt - a.lockAt));
      crouch = a.kind === "snowball" ? clamp((time - a.start) / rules.snowballRoll) : 1 - p;
      if (a.kind === "dive" || a.kind === "charge") {
        const approach = clamp((p - 0.7) / 0.3);
        const back = clamp((time - a.impactAt) / 0.5);
        const weight = approach * (1 - back);
        x += (a.x - x) * weight; z += (a.worldZ - game.distance - z) * weight;
        if (a.kind === "dive") y += (a.y - y) * weight;
        bite = weight;
        if (a.kind === "charge") {
          const sweep = clamp((time - a.impactAt + 0.16) / 0.32);
          if (time >= a.impactAt - 0.16) {
            x = Math.sign(enemy.homeX) * (4.3 - sweep * 8.6);
            z = a.worldZ - game.distance;
          }
        }
      }
      if (a.kind === "small" || a.kind === "snowball") leap = Math.sin(p * Math.PI) * 0.1;
    }
    return {x, y, z, yaw: -Math.sign(x) * 0.15, crouch, leap, bite};
  }

  // A fresh warning only starts when the current route has time and space for its dodge.
  private safeWindow(game: RunnerGame, duration: number) {
    if (game.icy || game.boosting || game.transitioning || game.protectionTime > 0 ||
      game.wallBlend > 0.05 && game.wallBlend < 0.95) return false;
    const end = game.distance + game.speed * (duration + 0.6);
    if (end > game.terrain.end - CONFIG.exitSafety) return false;
    if (!game.wallSide && game.gapWarning && game.gapWarning.start - CONFIG.wallEntry < end) return false;
    return !game.items.some(item => !["coin", "ammo", "shield", "magnet", "liquor"].includes(item.type) &&
      item.worldZ >= (item.type === "ice" || item.type === "pool" ? game.distance - CONFIG.poolLength / 2 : end - game.speed * 0.6 - 7) &&
      item.worldZ <= end + (item.type === "pool" ? CONFIG.poolLength / 2 : 2));
  }

  update(game: RunnerGame, random: (key: number, salt: number) => number,
    health: (enemy: RegionalEnemy) => number) {
    const s = this.state, time = game.worldTime, terrain = game.terrain;
    if ((terrain.biome !== "canyon" && terrain.biome !== "snow") ||
      terrain.end - game.distance <= CONFIG.exitSafety) { this.clear(); return; }
    if (s.section !== terrain.start) {
      this.clear(); s.section = terrain.start; s.nextPack = time;
    }
    s.enemies = s.enemies.filter(e => health(e) > 0 || time - e.hitAt < 0.4);
    const bat = terrain.biome === "canyon";
    const living = s.enemies.filter(e => health(e) > 0).length;
    if (game.phase === "night" && !game.boosting && time >= s.nextPack &&
      game.distance > terrain.start + CONFIG.exitSafety && terrain.end - game.distance > game.speed * 5 &&
      DAY_LENGTH - dayTime(time) > 5 && (bat ? living < rules.batLimit : !s.enemies.length)) {
      const pack = ++s.pack;
      const min = bat ? rules.batMin : rules.yetiMin, max = bat ? rules.batMax : rules.yetiMax;
      const size = Math.min(bat ? rules.batLimit - living : max, min + Math.floor(random(pack, 201) * (max - min + 1)));
      for (let i = 0; i < size; i++) {
        const id = 1000000000 + pack * 10 + i;
        const e: RegionalEnemy = {id, kind: bat ? "bat" : "yeti",
          homeX: (random(id, 202) < 0.5 ? -1 : 1) * (bat ? 2.7 + random(id, 203) : 4.3),
          homeZ: 6 + i * 3.8 + random(id, 204) * 2,
          homeY: bat ? 3 + random(id, 205) * 2.2 : 1.25,
          enteredAt: time, readyAt: time + rules.entrance + 1 + i * 0.5, hitAt: -Infinity};
        if (health(e) > 0) s.enemies.push(e);
      }
      s.nextPack = time + (bat ? rules.batSpawnMin + random(pack, 206) * (rules.batSpawnMax - rules.batSpawnMin) : rules.yetiPackInterval);
    }
    if (game.boosting) { s.attacks = []; s.droppings = []; return; }
    s.attacks = s.attacks.filter(a => s.enemies.some(e => e.id === a.enemy && health(e) > 0) &&
      time < a.impactAt + 0.5 && (a.side ? game.wallSide === a.side : !game.wallSide));
    for (const a of s.attacks) {
      if (!a.locked && time >= a.lockAt) {
        a.locked = true; a.x = game.wallSide ? game.wallSide * 5.4 : game.x;
        a.y = game.wallSide ? game.wallY + 0.95 : 0.95;
        a.worldZ = game.distance + game.speed * (a.impactAt - time);
        const enemy = s.enemies.find(e => e.id === a.enemy)!;
        const p = this.position(enemy, game);
        a.fromX = p.x; a.fromY = p.y + (a.kind === "snowball" ? 1.5 : 0); a.fromZ = game.distance + p.z;
      }
      if (a.spent || time < a.impactAt - (a.kind === "charge" ? 0.16 : 0)) continue;
      if (a.kind === "charge") {
        const enemy = s.enemies.find(e => e.id === a.enemy)!;
        const pose = this.position(enemy, game);
        if (time <= a.impactAt + 0.16 && Math.abs(pose.x - game.x) < 0.95 &&
          Math.abs(a.worldZ - game.distance) < rules.impactDepth + 2 && game.y < CONFIG.nightCombat.jumpClearance) {
          a.spent = true;
          if (game.nightHit("yeti")) game.nightCombat.playerHitAt = time;
        }
        if (time > a.impactAt + 0.16) a.spent = true;
        continue;
      }
      a.spent = true;
      if (a.kind === "dropping") {
        s.droppings.push({id: a.id, x: a.x, worldZ: a.worldZ, expires: time + rules.droppingLife});
        continue;
      }
      const dz = game.distance - a.worldZ;
      const hit = a.side ? Math.hypot((game.wallY + 0.95 - a.y) / rules.wallRadius, dz / rules.targetRadius) < 1 :
        a.kind === "small" ? Math.abs(game.x - a.x) < rules.smallHalfWidth && Math.abs(dz) < rules.impactDepth && !game.sliding :
        Math.hypot(game.x - a.x, dz) < rules.targetRadius;
      if (hit && game.nightHit(a.kind === "small" ? "cold" : bat ? "bat" : "yeti"))
        game.nightCombat.playerHitAt = time;
    }
    s.droppings = s.droppings.filter(d => d.expires > time && d.worldZ > game.distance - 24);
    for (const d of s.droppings)
      if (!game.wallSide && game.y < 0.55 && Math.abs(game.x - d.x) < rules.targetRadius &&
        Math.abs(game.distance - d.worldZ) < 1.4) game.triggerSlip(d.id);
    if (game.mode !== "running" || s.attacks.length >= rules.maxWarnings) return;
    const enemy = s.enemies.find(e => health(e) > 0 && time >= e.readyAt && !s.attacks.some(a => a.enemy === e.id));
    if (!enemy) return;
    const sequence = s.sequence + 1;
    let kind: RegionalAttackKind = bat ? (random(sequence, 207) < 0.5 ? "dive" : "dropping") :
      (["small", "charge", "snowball"] as const)[Math.floor(random(sequence, 207) * 3)];
    if (bat && (game.wallSide || game.gapWarning)) kind = "dive";
    const duration = kind === "dive" ? rules.diveWarning : kind === "dropping" ? rules.droppingWarning :
      kind === "small" ? rules.smallWarning + rules.smallFlight : kind === "charge" ? rules.chargeWarning + 0.16 :
      rules.snowballRoll + rules.snowballWarning;
    // Keep paired warnings compatible, including the recovery of the first attack.
    if (!this.safeWindow(game, duration) || !bat && s.attacks.some(a => a.kind !== kind)) return;
    s.sequence = sequence;
    const p = this.position(enemy, game);
    const lockAt = time + (kind === "snowball" ? rules.snowballRoll : 0);
    s.attacks.push({id: 2000000000 + sequence, enemy: enemy.id, kind, start: time, lockAt,
      impactAt: time + duration, x: game.wallSide ? game.wallSide * 5.4 : game.x,
      y: game.wallSide ? game.wallY + 0.95 : 0.95, worldZ: game.distance + game.speed * duration,
      side: game.wallSide, fromX: p.x, fromY: p.y, fromZ: game.distance + p.z,
      spent: false, locked: kind !== "snowball"});
    enemy.readyAt = time + duration + rules.attackMin + random(sequence, 208) * (rules.attackMax - rules.attackMin);
  }
}
