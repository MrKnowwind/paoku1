import { CONFIG } from "./config.ts";
import { DAY_LENGTH, dayTime } from "./daylight.ts";
import type { RunnerGame } from "./game.ts";

const rules = CONFIG.nightCombat;
const lead = rules.windup + rules.warning + rules.lunge;
const attackDuration = lead + rules.bite + rules.recovery;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (t: number) => Math.max(0, Math.min(1, t));
const smooth = (t: number) => clamp(t) ** 2 * (3 - 2 * clamp(t));

interface Wolf {
  id: number;
  homeX: number;
  homeZ: number;
  hitAt: number;
}

interface Attack {
  wolf: number;
  start: number;
  x: number;
  worldZ: number;
  spent: boolean;
}

export interface Hunt {
  wolves: Wolf[];
  enteredAt: number;
  attack?: Attack;
  nextAttack: number;
  nextPack: number;
  pack: number;
  strikes: number;
  nextRefillSlot: number;
}

interface Stone {
  wolf: number;
  x: number;
  y: number;
  z: number;
}

export class NightCombat {
  ammo: number = rules.ammo;
  cooldown = 0;
  refillFlash = 0;
  aim?: {wolf: number; x: number; z: number};
  stones: Stone[] = [];
  hunt: Hunt = {
    wolves: [], enteredAt: 0, nextAttack: 0, nextPack: 0, pack: 0, strikes: 0, nextRefillSlot: 0,
  };
  private damage = new Map<number, number>();

  health(wolf: Wolf) {
    return rules.wolfHealth - (this.damage.get(wolf.id) ?? 0);
  }
  get remaining() {
    let count = 0;
    for (const wolf of this.hunt.wolves)
      if (this.health(wolf) > 0) count++;
    return count;
  }

  snapshot(): Hunt {
    const hunt = this.hunt;
    return {...hunt, wolves: hunt.wolves.map(wolf => ({...wolf})),
      attack: hunt.attack && {...hunt.attack}};
  }

  restore(hunt: Hunt, time: number, reviving: boolean) {
    this.clearShots();
    this.hunt = {
      ...hunt,
      wolves: hunt.wolves.filter(wolf => this.health(wolf) > 0).map(wolf => ({...wolf})),
      attack: hunt.attack && {...hunt.attack},
    };
    const attack = this.hunt.attack;
    if (attack && (!this.hunt.wolves.some(wolf => wolf.id === attack.wolf) ||
      (reviving && time >= attack.start + rules.windup + rules.warning))) this.hunt.attack = undefined;
  }

  clearShots() {
    this.stones.length = 0;
    this.aim = undefined;
  }

  refill() {
    this.ammo = Math.min(rules.ammo, this.ammo + Math.ceil(rules.ammo * rules.refillFraction));
    this.refillFlash = 0.65;
  }

  fire(id: number, game: RunnerGame) {
    const wolf = this.hunt.wolves.find(wolf => wolf.id === id);
    if (game.mode !== "running" || game.terrain.biome !== "forest" || game.boosting || game.icy ||
      this.cooldown > 0 || this.ammo === 0 || !wolf || this.health(wolf) <= 0) return;
    const {x, z} = this.position(wolf, game);
    this.ammo--;
    this.cooldown = rules.cooldown;
    this.aim = {wolf: id, x, z};
    this.stones.push({wolf: id, x: game.x - 0.22, y: game.y + (game.sliding ? 0.65 : 1.43), z: 0.45});
  }

  position(wolf: Wolf, game: RunnerGame) {
    const {attack, enteredAt} = this.hunt;
    const time = game.worldTime;
    let x = wolf.homeX + Math.sign(wolf.homeX) * 1.1 * (1 - smooth((time - enteredAt) / rules.entrance));
    let z = wolf.homeZ;
    let yaw = -Math.sign(x) * 0.12;
    let crouch = 0, leap = 0, bite = 0;
    if (attack?.wolf === wolf.id) {
      const elapsed = time - attack.start;
      const charge = clamp((elapsed - lead + rules.lunge) / rules.lunge);
      const back = smooth((elapsed - lead - rules.bite) / rules.recovery);
      const progress = smooth(charge) * (1 - back);
      const targetZ = attack.worldZ - game.distance;
      // Reach into the near edge of the same strip used for the damage check.
      const biteZ = Math.max(targetZ - rules.biteHalfLength, Math.min(0, targetZ + rules.biteHalfLength));
      x = lerp(x, attack.x, progress);
      z = lerp(z, biteZ, progress);
      const heading = Math.atan2(attack.x - wolf.homeX, biteZ - wolf.homeZ);
      yaw = lerp(yaw, heading, smooth(elapsed / rules.windup));
      yaw = lerp(yaw, Math.sign(wolf.homeX) * -1.8, back);
      crouch = smooth(elapsed / rules.windup) * (1 - charge);
      leap = Math.sin(charge * Math.PI) * 0.65;
      bite = charge * (1 - back);
    }
    return {x, z, yaw, crouch, leap, bite};
  }

  warning(time: number) {
    const attack = this.hunt.attack;
    if (!attack) return;
    const elapsed = time - attack.start - rules.windup;
    if (elapsed >= 0 && elapsed < rules.warning + rules.lunge + rules.bite)
      return {x: attack.x, worldZ: attack.worldZ, progress: clamp(elapsed / (rules.warning + rules.lunge))};
  }

  update(game: RunnerGame, dt: number, random: (key: number, salt: number) => number,
    openLanes: (reach: number, landing: number) => number[], hitPlayer: () => void) {
    const time = game.worldTime;
    const hunt = this.hunt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.refillFlash = Math.max(0, this.refillFlash - dt);
    if (this.cooldown < rules.cooldown - 0.27) this.aim = undefined;
    const terrain = game.terrain;
    if (terrain.biome !== "forest") {
      hunt.wolves.length = 0;
      hunt.attack = undefined;
      this.clearShots();
      return;
    }

    if (hunt.wolves.length)
      hunt.wolves = hunt.wolves.filter(wolf => this.health(wolf) > 0 || time - wolf.hitAt < 0.33);
    if (game.phase === "night" && !hunt.wolves.length && time >= hunt.nextPack && !game.boosting &&
      DAY_LENGTH - dayTime(time) > attackDuration + 2 &&
      terrain.end - game.distance > rules.forestExtensionLead &&
      terrain.end - terrain.start === CONFIG.forestLength &&
      game.distance > terrain.start + CONFIG.exitSafety) {
      const pack = ++hunt.pack;
      const size = rules.packMin + Math.floor(random(pack, 91) * (rules.packMax - rules.packMin + 1));
      hunt.wolves = Array.from({length: size}, (_, i) => {
        const id = pack * rules.packMax + i;
        return {id, homeX: (random(id, 92) < 0.5 ? -1 : 1) * (4.25 + random(id, 93) * 0.45),
          homeZ: 6.5 + i * 4.25 + random(id, 94) * 0.85, hitAt: -Infinity};
      }).filter(wolf => this.health(wolf) > 0);
      hunt.enteredAt = time;
      hunt.nextPack = time + rules.packInterval;
      hunt.nextAttack = time + rules.entrance + rules.firstAttackDelay;
    }

    if (this.stones.length) this.stones = this.stones.filter(stone => {
      const wolf = hunt.wolves.find(wolf => wolf.id === stone.wolf);
      if (!wolf || this.health(wolf) <= 0) return false;
      const p = this.position(wolf, game);
      const dx = p.x - stone.x, dy = 0.76 + p.leap - p.crouch * 0.2 - stone.y, dz = p.z - stone.z;
      const length = Math.hypot(dx, dy, dz);
      if (this.aim?.wolf === wolf.id) Object.assign(this.aim, {x: p.x, z: p.z});
      const travel = rules.stoneSpeed * dt;
      if (travel >= length) {
        wolf.hitAt = time;
        this.damage.set(wolf.id, (this.damage.get(wolf.id) ?? 0) + rules.damage);
        if (this.health(wolf) <= 0 && hunt.attack?.wolf === wolf.id) hunt.attack = undefined;
        return false;
      }
      stone.x += dx * travel / length;
      stone.y += dy * travel / length;
      stone.z += dz * travel / length;
      return true;
    });

    if (game.boosting) hunt.attack = undefined;
    if (hunt.attack) {
      const attack = hunt.attack;
      const elapsed = time - attack.start;
      if (elapsed >= attackDuration) hunt.attack = undefined;
      else if (!attack.spent && elapsed >= lead && elapsed <= lead + rules.bite &&
        Math.abs(attack.x - game.x) < rules.biteHalfWidth &&
        Math.abs(attack.worldZ - game.distance) < rules.biteHalfLength && game.y < rules.jumpClearance) {
        attack.spent = true;
        hitPlayer();
      }
      return;
    }
    if (time < hunt.nextAttack || !hunt.wolves.length || game.boosting || game.protectionTime > 0) return;
    // The warning is locked to the ground before the wolf commits.
    const landing = game.distance + game.speed * (lead + rules.bite / 2);
    const safe = openLanes(game.distance + game.speed * rules.laneChangeTime, landing);
    hunt.nextAttack = time + rules.attackRetry;
    const strike = hunt.strikes + 1;
    const otherLanes = safe.filter(lane => lane !== game.lane);
    const blockEscape = random(strike, 95) < 0.5;
    const candidates = blockEscape ? otherLanes.filter(lane => Math.abs(lane - game.lane) === 1) : [game.lane];
    const targets = candidates.filter(lane => safe.some(escape => escape !== lane));
    if (!targets.length) return;
    const lane = targets[Math.floor(random(strike, 96) * targets.length)];
    const available = hunt.wolves.filter(wolf => this.health(wolf) > 0);
    if (!available.length) return;
    const wolf = available[Math.floor(random(strike, 97) * available.length)];
    hunt.strikes = strike;
    hunt.nextAttack = time + rules.attackInterval;
    hunt.attack = {wolf: wolf.id, start: time, x: lane * 2.5, worldZ: landing, spent: false};
  }
}
