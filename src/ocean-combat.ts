import { CONFIG } from "./config.ts";
import type { RunnerGame } from "./game.ts";
import type { RegionalEnemy } from "./regional-combat.ts";
import { fishPosition } from "./fish.ts";
import { touchesCoral } from "./coral.ts";

const rules = CONFIG.squid;
export interface SquidAttack {
  id: number; enemy: number; kind: "ink" | "grab";
  start: number; releaseAt: number; impactAt: number;
  x: number; y: number; worldZ: number;
  fromX: number; fromY: number; fromZ: number;
  spent: boolean; launched?: boolean;
}
export interface OceanHunt {
  enemies: RegionalEnemy[]; attacks: SquidAttack[];
  section: number; pack: number; sequence: number; nextPack: number;
}
export interface Struggle {
  enemy: number; elapsed: number; progress: number; cursor: number; safe: number;
  waiting: boolean; phase: "playing" | "released" | "failed"; ending: number;
}

export class OceanCombat {
  state: OceanHunt = {enemies: [], attacks: [], section: -1, pack: 0, sequence: 0, nextPack: 0};
  struggle?: Struggle;
  inkSerial = 0;
  inkCovered = false;
  inkAt = -Infinity;
  clearInkSerial = 0;
  get struggling() { return !!this.struggle && this.struggle.phase !== "failed"; }
  clearInk() { this.inkCovered = false; this.clearInkSerial++; }
  clearInteraction() { this.struggle = undefined; this.clearInk(); }
  clear() { this.state.enemies = []; this.state.attacks = []; this.clearInteraction(); }
  cancel(id: number) { this.state.attacks = this.state.attacks.filter(a => a.enemy !== id); }
  snapshot(): OceanHunt {
    return {...this.state, enemies: this.state.enemies.map(e => ({...e})), attacks: this.state.attacks.map(a => ({...a}))};
  }
  restore(state: OceanHunt | undefined, health: (e: RegionalEnemy) => number, time: number, reviving: boolean) {
    this.clearInteraction();
    if (!state) { this.clear(); return; }
    this.state = {...state, enemies: state.enemies.filter(e => health(e) > 0).map(e => ({...e,
      readyAt: reviving ? Math.max(e.readyAt, time + 3) : e.readyAt})),
      attacks: state.attacks.filter(a => (!reviving || a.kind !== "grab") &&
        state.enemies.some(e => e.id === a.enemy && health(e) > 0)).map(a => ({...a}))};
  }
  position(enemy: RegionalEnemy, game: RunnerGame) {
    const t = game.worldTime, entry = Math.max(0, 1 - (t - enemy.enteredAt) / 1.8);
    const held = this.struggle?.enemy === enemy.id ? this.struggle : undefined;
    const release = held?.phase === "released" ? Math.min(1, held.ending / 0.7) : 0;
    const animationTime = held ? held.elapsed + held.ending : t;
    return {x: held ? game.x + Math.sign(enemy.homeX) * (1.05 + release * 3) : enemy.homeX + Math.sign(enemy.homeX) * entry * 6,
      y: held ? game.visualWaterY + 1 : enemy.homeY + Math.sin(t * 1.6 + enemy.id) * 0.22,
      z: held ? 0.6 + release * 3 : enemy.homeZ + Math.sin(t + enemy.id) * 0.5,
      yaw: held ? -Math.sign(enemy.homeX) * Math.PI / 2 : Math.atan2(game.x - enemy.homeX, -enemy.homeZ),
      crouch: 0, leap: 0, bite: held ? 1 - release : 0, animationTime};
  }
  tap(side: number) {
    const q = this.struggle;
    if (!q || q.waiting || q.phase !== "playing") return false;
    q.cursor = Math.max(0, Math.min(1, q.cursor + Math.sign(side) * rules.tapStep));
    return true;
  }
  updateStruggle(game: RunnerGame, dt: number) {
    const q = this.struggle;
    if (!q || q.waiting || q.phase === "failed") return;
    if (q.phase === "released") {
      q.ending += dt;
      if (q.ending >= 0.7) {
        this.struggle = undefined;
        game.protectionTime = Math.max(game.protectionTime, 2);
        for (const e of this.state.enemies) e.readyAt = Math.max(e.readyAt, game.worldTime + 3);
      }
      return;
    }
    // Integrate up to the deadline; progress achieved before it wins a tie.
    const step = Math.min(dt, rules.escapeSeconds - q.elapsed);
    q.elapsed += step;
    q.safe = 0.5 + Math.sin(q.elapsed * 1.45) * 0.25;
    q.progress = Math.max(0, Math.min(100, q.progress + step *
      (Math.abs(q.cursor - q.safe) <= rules.safeWidth / 2 ? rules.escapeGain : -rules.escapeLoss)));
    if (q.progress >= 100) { q.phase = "released"; q.ending = 0; }
    else if (q.elapsed >= rules.escapeSeconds) {
      q.phase = "failed";
      game.health = 0; game.damageSerial++; game.damagedAt = game.worldTime;
      game.lastHit = "squid"; game.mode = "over";
    }
  }
  private safeWindow(game: RunnerGame, duration: number) {
    if (game.transitioning || game.boosting || game.protectionTime > 0) return false;
    const end = game.distance + game.speed * (duration + 0.6);
    if (game.distance < game.terrain.start + CONFIG.waterSafety || end > game.terrain.end - CONFIG.waterSafety) return false;
    // At least one directly reachable adjacent cell stays clear through the dodge.
    const landing = game.distance + game.speed * duration;
    const time = game.worldTime + duration;
    for (const [lane, level] of [[game.lane-1,game.waterLevel], [game.lane+1,game.waterLevel],
      [game.lane,game.waterLevel-1], [game.lane,game.waterLevel+1]]) {
      if (Math.abs(lane)>1 || level<0 || level>2) continue;
      const x=lane*2.5,y=CONFIG.waterHeights[level]+0.95;
      const blocked=game.items.some(i=>{
        if (!["fish","coral","volcano","bubble"].includes(i.type) || Math.abs(i.worldZ-landing)>7) return false;
        if (i.coral) return touchesCoral(i.coral,x,y,0,0.7);
        // Vents are conservatively treated as occupying the whole water column.
        if (i.type==="volcano") return Math.abs(x-i.lane*2.5)<1.2;
        const fish=i.fish?fishPosition(i.fish,time):undefined;
        return (fish?.active ?? true) && Math.abs(x-(fish?.x ?? i.lane*2.5))<1.5 && Math.abs(y-i.y)<1.3;
      });
      if(!blocked)return true;
    }
    return false;
  }
  update(game: RunnerGame, random: (key: number, salt: number) => number, health: (e: RegionalEnemy) => number) {
    const s = this.state, t = game.worldTime;
    if (!game.swimming || game.transitioning) {
      if (s.enemies.length || s.attacks.length || this.inkCovered || this.struggle) this.clear();
      return;
    }
    if (s.section !== game.terrain.start) { this.clear(); s.section = game.terrain.start; s.nextPack = t; }
    s.enemies = s.enemies.filter(e => health(e) > 0 || t - e.hitAt < 0.5);
    const spawnEnd = game.terrain.combatExit ?? game.terrain.end;
    if (game.phase === "night" && !game.boosting && !s.enemies.length && t >= s.nextPack &&
      game.distance > game.terrain.start + CONFIG.waterSafety && spawnEnd - game.distance > CONFIG.nightCombat.forestExtensionLead) {
      const pack = ++s.pack, size = 1 + Math.floor(random(pack, 401) * 2);
      for (let i = 0; i < size; i++) {
        const id = 2000000000 + pack * 10 + i;
        const e: RegionalEnemy = {id, kind: "squid", homeX: (i === 0 ? -1 : 1) * (4.5 + random(id, 402)),
          homeY: CONFIG.waterHeights[Math.floor(random(id, 403) * 3)] + 1.3,
          homeZ: 7 + random(id, 404) * 5, enteredAt: t, readyAt: t + 3 + i, hitAt: -Infinity};
        if (health(e) > 0) s.enemies.push(e);
      }
      s.nextPack = t + rules.packInterval;
    }
    if (game.boosting || game.terrain.end - game.distance < CONFIG.waterSafety) { s.attacks = []; return; }
    s.attacks = s.attacks.filter(a => t <= a.impactAt + 0.35 && s.enemies.some(e => e.id === a.enemy && health(e) > 0));
    for (const a of s.attacks) {
      if (a.kind === "ink" && !a.launched && t >= a.releaseAt) {
        const e = s.enemies.find(e => e.id === a.enemy)!;
        const p = this.position(e, game);
        a.fromX = p.x; a.fromY = p.y - 0.6; a.fromZ = game.distance + p.z;
        a.launched = true;
      }
      if (a.spent || t < a.impactAt) continue;
      a.spent = true;
      if (Math.abs(game.x - a.x) > rules.halfWidth ||
        Math.abs(game.visualWaterY + 0.95 - a.y) > rules.halfHeight ||
        Math.abs(game.distance - a.worldZ) > rules.halfDepth) continue;
      if (a.kind === "ink") {
        this.inkCovered = true; this.inkSerial++; this.inkAt = t;
      } else if (game.protectionTime <= 0) {
        if (game.shield) {
          game.shield = false; game.shieldBreakSerial++; game.protectionTime = CONFIG.shieldProtection;
        } else {
          this.struggle = {enemy: a.enemy, elapsed: 0, progress: 0, cursor: 0.5, safe: 0.5,
            waiting: game.struggleNeedsGuide, phase: "playing", ending: 0};
          s.attacks = [];
          game.nightCombat.clearShots();
          return;
        }
      }
    }
    for (const e of s.enemies) {
      if (health(e) <= 0 || t < e.readyAt || s.attacks.some(a => a.enemy === e.id)) continue;
      const key = ++s.sequence, kind = random(key, 405) < 0.5 ? "ink" : "grab";
      e.readyAt = t + 3 + random(key, 406) * 2;
      if (kind === "grab" && (this.inkCovered || t - this.inkAt < 2 || s.attacks.some(a => !a.spent))) continue;
      if (kind === "ink" && s.attacks.some(a => a.kind === "grab" && !a.spent)) continue;
      const warning = kind === "grab" ? rules.grabWarning : rules.inkWarning;
      const duration = warning + (kind === "ink" ? rules.inkFlight : 0);
      if (!this.safeWindow(game, duration)) { e.readyAt = t + 0.4; continue; }
      const p = this.position(e, game);
      s.attacks.push({id: key, enemy: e.id, kind, start: t, releaseAt: t + warning, impactAt: t + duration,
        x: game.lane * 2.5, y: CONFIG.waterHeights[game.waterLevel] + 0.95,
        worldZ: game.distance + game.speed * duration, fromX: p.x, fromY: p.y, fromZ: game.distance + p.z, spent: false});
    }
  }
}
