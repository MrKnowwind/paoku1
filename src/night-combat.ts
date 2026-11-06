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
  launchWorldZ?: number;
  spent: boolean;
}

export interface Hunt {
  wolves: Wolf[];
  enteredAt: number;
  attacks: Attack[];
  nextAttack: number;
  nextPack: number;
  pack: number;
  strikes: number;
  nextRefillAt: number;
}

interface Stone {
  wolf: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

export class NightCombat {
  ammo: number = rules.ammo;
  cooldown = 0;
  refillFlash = 0;
  refillGain = 0;
  playerHitAt = -Infinity;
  shotAt = -Infinity;
  aim?: {wolf: number; x: number; z: number};
  stones: Stone[] = [];
  hunt: Hunt = {
    wolves: [], attacks: [], enteredAt: 0, nextAttack: 0, nextPack: 0, pack: 0, strikes: 0, nextRefillAt: 0,
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
      attacks: hunt.attacks.map(attack => ({...attack}))};
  }

  restore(hunt: Hunt, time: number, reviving: boolean) {
    this.clearShots();
    const wolves = hunt.wolves.filter(wolf => this.health(wolf) > 0).map(wolf => ({...wolf}));
    this.hunt = {
      ...hunt,
      wolves,
      attacks: hunt.attacks.filter(attack => wolves.some(wolf => wolf.id === attack.wolf) &&
        (!reviving || time < attack.start + lead - rules.lunge)).map(attack => ({...attack})),
    };
  }

  clearShots() {
    this.stones.length = 0;
    this.aim = undefined;
  }

  refill() {
    this.refillGain = Math.min(rules.ammo - this.ammo, Math.ceil(rules.ammo * rules.refillFraction));
    this.ammo += this.refillGain;
    this.refillFlash = 0.65;
  }

  fire(id: number, game: RunnerGame) {
    const wolf = this.hunt.wolves.find(wolf => wolf.id === id);
    if (game.mode !== "running" || game.terrain.biome !== "forest" || game.boosting || game.icy ||
      this.cooldown > 0 || this.ammo === 0 || !wolf || this.health(wolf) <= 0) return;
    const {x, z} = this.position(wolf, game);
    this.ammo--;
    this.cooldown = rules.cooldown;
    this.shotAt = game.worldTime;
    this.aim = {wolf: id, x, z};
    const stone = {wolf: id, x: game.x - 0.22, y: game.y + (game.sliding ? 0.65 : 1.43), z: 0.45};
    const dx = x - stone.x, dy = 0.76 - stone.y, dz = z - stone.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    this.stones.push({...stone, dx: dx / length, dy: dy / length, dz: dz / length});
    return true;
  }

  position(wolf: Wolf, game: RunnerGame) {
    const {enteredAt} = this.hunt;
    const attack = this.hunt.attacks.find(attack => attack.wolf === wolf.id);
    const time = game.worldTime;
    let x = wolf.homeX + Math.sign(wolf.homeX) * 1.1 * (1 - smooth((time - enteredAt) / rules.entrance));
    let z = wolf.homeZ;
    let yaw = -Math.sign(x) * 0.12;
    let crouch = 0, leap = 0, bite = 0;
    if (attack) {
      const elapsed = time - attack.start;
      const charge = clamp((elapsed - lead + rules.lunge) / rules.lunge);
      const back = smooth((elapsed - lead - rules.bite) / rules.recovery);
      const progress = smooth(charge);
      const originZ = attack.launchWorldZ === undefined ? z : attack.launchWorldZ - game.distance;
      const targetZ = attack.worldZ - game.distance;
      x = lerp(lerp(x, attack.x, progress), wolf.homeX, back);
      z = lerp(lerp(originZ, targetZ, progress), wolf.homeZ, back);
      const heading = Math.atan2(attack.x - wolf.homeX, targetZ - originZ);
      yaw = lerp(yaw, heading, smooth(elapsed / rules.windup));
      yaw = lerp(yaw, Math.sign(wolf.homeX) * -1.8, back);
      crouch = smooth(elapsed / rules.windup) * (1 - charge);
      leap = Math.sin(charge * Math.PI) * 0.65;
      bite = charge * (1 - back);
    }
    return {x, z, yaw, crouch, leap, bite};
  }

  warnings(game: RunnerGame) {
    return this.hunt.attacks.flatMap(attack => {
      const elapsed = game.worldTime - attack.start - rules.windup;
      if (elapsed < 0 || elapsed >= rules.warning + rules.lunge + rules.bite) return [];
      const wolf = this.hunt.wolves.find(wolf => wolf.id === attack.wolf)!;
      return [{wolf: wolf.id, start: attack.start, fromX: wolf.homeX,
        fromZ: attack.launchWorldZ === undefined ? wolf.homeZ : attack.launchWorldZ - game.distance,
        toX: attack.x, toZ: attack.worldZ - game.distance,
        progress: clamp(elapsed / rules.warning), striking: attack.launchWorldZ !== undefined}];
    });
  }

  update(game: RunnerGame, dt: number, random: (key: number, salt: number) => number,
    hitPlayer: () => boolean) {
    const time = game.worldTime;
    const hunt = this.hunt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.refillFlash = Math.max(0, this.refillFlash - dt);
    if (this.cooldown < rules.cooldown - 0.27) this.aim = undefined;
    const terrain = game.terrain;
    if (terrain.biome !== "forest") {
      hunt.wolves.length = 0;
      hunt.attacks.length = 0;
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
        if (this.health(wolf) <= 0) hunt.attacks = hunt.attacks.filter(attack => attack.wolf !== wolf.id);
        return false;
      }
      stone.dx = dx / length;
      stone.dy = dy / length;
      stone.dz = dz / length;
      stone.x += stone.dx * travel;
      stone.y += stone.dy * travel;
      stone.z += stone.dz * travel;
      return true;
    });

    if (game.boosting) {
      hunt.attacks.length = 0;
      return;
    }
    if (hunt.attacks.length) hunt.attacks = hunt.attacks.filter(attack => time - attack.start < attackDuration);
    for (const attack of hunt.attacks) {
      const elapsed = time - attack.start;
      if (elapsed < lead - rules.lunge || elapsed > lead + rules.bite || attack.spent) continue;
      const wolf = hunt.wolves.find(wolf => wolf.id === attack.wolf)!;
      attack.launchWorldZ ??= game.distance + wolf.homeZ;
      const dx = attack.x - wolf.homeX, dz = attack.worldZ - attack.launchWorldZ;
      const length = Math.hypot(dx, dz);
      const px = game.x - wolf.homeX, pz = game.distance - attack.launchWorldZ;
      const along = (px * dx + pz * dz) / length;
      const across = (px * dz - pz * dx) / length;
      const pose = this.position(wolf, game);
      const wolfAlong = ((pose.x - wolf.homeX) * dx + (pose.z + game.distance - attack.launchWorldZ) * dz) / length;
      if (along >= 0 && along <= length && Math.abs(across) < rules.biteHalfWidth &&
        Math.abs(along - wolfAlong) < rules.biteHalfLength && game.y < rules.jumpClearance) {
        attack.spent = true;
        if (hitPlayer()) this.playerHitAt = time;
      }
    }
    if (game.mode === "running") this.schedule(game, random);
  }

  private schedule(game: RunnerGame, random: (key: number, salt: number) => number) {
    const {hunt} = this;
    const time = game.worldTime;
    const slots = rules.maxAttackers - hunt.attacks.length;
    if (time < hunt.nextAttack || slots <= 0 || game.protectionTime > 0 || !hunt.wolves.length) return;
    const ready = hunt.wolves.filter(wolf => this.health(wolf) > 0 && !hunt.attacks.some(attack => attack.wolf === wolf.id));
    if (!ready.length) return;
    const sequence = ++hunt.strikes;
    const stagger = lerp(rules.partnerDelayMin, rules.partnerDelayMax, random(sequence, 98));
    const landing = game.distance + game.speed * (lead + rules.bite * 0.5);
    const count = slots > 1 && ready.length > 1 && random(sequence, 96) < rules.packAttackChance ? 2 : 1;
    const neighbors = [game.lane - 1, game.lane + 1].filter(lane => Math.abs(lane) <= 1);
    for (let index = 0; index < count; index++) {
      const [wolf] = ready.splice(Math.floor(random(sequence, 97 + index * 4) * ready.length), 1);
      const key = sequence * 4099 + wolf.id;
      const lane = random(key, 95) < 0.5 ? neighbors[Math.floor(random(key, 100) * neighbors.length)] : game.lane;
      hunt.attacks.push({wolf: wolf.id, x: lane * 2.5, start: time + stagger * index,
        worldZ: landing + game.speed * stagger * index, spent: false});
    }
    hunt.nextAttack = time + lerp(rules.attackMinDelay, rules.attackMaxDelay, random(sequence, 99));
  }
}
