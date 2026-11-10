import { CONFIG } from "./config.ts";
import { DAY_LENGTH, dayTime } from "./daylight.ts";
import type { RunnerGame } from "./game.ts";
import type { WeaponId } from "./economy.ts";
import { RegionalCombat } from "./regional-combat.ts";
import type { RegionalEnemy, RegionalState } from "./regional-combat.ts";
import { OceanCombat } from "./ocean-combat.ts";
import type { OceanHunt } from "./ocean-combat.ts";

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
  enteredAt?: number;
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
  ocean?: OceanHunt;
  region?: RegionalState;
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
  pistol: boolean;
  damage: number;
  wolf: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

export class NightCombat {
  readonly weapon: WeaponId;
  ammo: number;
  region = new RegionalCombat();
  ocean = new OceanCombat();
  shotSerial = 0;
  pistolShot = false;
  bombs: {id: number; start: number; x: number; y: number; relativeZ: number; fromX: number; fromY: number; fromZ: number; pulses: number}[] = [];
  bombCooldown = 0;
  private bombSerial = 0;
  cooldown = 0;
  refillFlash = 0;
  refillGain = 0;
  refillSerial = 0;
  playerHitAt = -Infinity;
  shotAt = -Infinity;
  damageEvents: {id: number; at: number; amount: number; x: number; y: number; worldZ: number}[] = [];
  private damageSequence = 0;
  private nextAutoCheck = 0;
  aim?: {wolf: number; x: number; z: number};
  stones: Stone[] = [];
  hunt: Hunt = {
    wolves: [], attacks: [], enteredAt: 0, nextAttack: 0, nextPack: 0, pack: 0, strikes: 0, nextRefillAt: 0,
  };
  private damage = new Map<number, number>();

  constructor(weapon: WeaponId = "slingshot") {
    this.weapon = weapon; this.ammo = this.weaponRules.ammo;
  }
  get weaponRules() { return CONFIG.weapons[this.weapon]; }
  get enemies(): (Wolf | RegionalEnemy)[] { return [...this.hunt.wolves, ...this.region.state.enemies, ...this.ocean.state.enemies]; }
  hurt(enemy: Wolf | RegionalEnemy, amount: number, time: number, game?: RunnerGame) {
    if (this.health(enemy) <= 0) return;
    if (game) {
      const p = this.position(enemy, game);
      this.damageEvents = this.damageEvents.filter(e => time - e.at < 1);
      this.damageEvents.push({id: ++this.damageSequence, at: time, amount: Math.min(amount, this.health(enemy)),
        x: p.x, y: p.y + 1, worldZ: game.distance + p.z});
    }
    enemy.hitAt = time;
    this.damage.set(enemy.id, (this.damage.get(enemy.id) ?? 0) + amount);
    if (this.health(enemy) <= 0) {
      if(game&&"kind" in enemy) {
        const p=this.position(enemy,game);
        enemy.fall={x:p.x,y:p.y,worldZ:game.distance+p.z,yaw:p.yaw};
      }
      this.hunt.attacks = this.hunt.attacks.filter(a => a.wolf !== enemy.id);
      this.region.cancel(enemy.id);
      this.ocean.cancel(enemy.id);
    }
  }

  health(wolf: Wolf | RegionalEnemy) {
    const maximum = "kind" in wolf ? wolf.kind === "squid" ? CONFIG.squid.health : wolf.kind === "bat" ? CONFIG.regionalCombat.batHealth : CONFIG.regionalCombat.yetiHealth : rules.wolfHealth;
    return Math.max(0, maximum - (this.damage.get(wolf.id) ?? 0));
  }
  get remaining() {
    let count = 0;
    for (const wolf of this.hunt.wolves)
      if (this.health(wolf) > 0) count++;
    for (const enemy of this.region.state.enemies) if (this.health(enemy) > 0) count++;
    for (const enemy of this.ocean.state.enemies) if (this.health(enemy) > 0) count++;
    return count;
  }

  snapshot(): Hunt {
    const hunt = this.hunt;
    return {...hunt, ocean: this.ocean.snapshot(), region: this.region.snapshot(), wolves: hunt.wolves.map(wolf => ({...wolf})),
      attacks: hunt.attacks.map(attack => ({...attack}))};
  }

  restore(hunt: Hunt, time: number, reviving: boolean) {
    this.clearShots();
    this.nextAutoCheck = time;
    this.region.restore(hunt.region, e => this.health(e));
    this.ocean.restore(hunt.ocean, e => this.health(e), time, reviving);
    const wolves = hunt.wolves.filter(wolf => this.health(wolf) > 0).map(wolf => ({...wolf}));
    this.hunt = {
      ...hunt,
      wolves,
      attacks: hunt.attacks.filter(attack => wolves.some(wolf => wolf.id === attack.wolf) &&
        (!reviving || time < attack.start + lead - rules.lunge)).map(attack => ({...attack})),
    };
  }

  clearShots() {
    this.damageEvents = [];
    this.stones.length = 0;
    this.bombs.length = 0;
    this.aim = undefined;
  }

  refill() {
    this.refillGain = Math.min(this.weaponRules.ammo - this.ammo, Math.ceil(this.weaponRules.ammo * rules.refillFraction));
    this.ammo += this.refillGain;
    this.refillFlash = 0.65;
    this.refillSerial++;
  }

  fire(id: number, game: RunnerGame) {
    const wolf = this.enemies.find(wolf => wolf.id === id);
    if (game.mode !== "running" || game.struggling || game.boosting || game.icy || game.transitioning ||
      this.cooldown > 0 || this.ammo === 0 || !wolf || this.health(wolf) <= 0) return;
    const {x, y, z} = this.position(wolf, game);
    this.ammo--;
    this.cooldown = this.weaponRules.cooldown;
    this.shotAt = game.worldTime;
    this.shotSerial++;
    this.pistolShot = game.character === "officer" && game.shotRandom(this.shotSerial) < CONFIG.officer.pistolChance;
    this.aim = {wolf: id, x, z};
    const stone = {wolf: id, pistol: this.pistolShot, damage: this.pistolShot ? CONFIG.officer.pistolDamage : this.weaponRules.damage,
      x: (game.wallSide ? game.wallSide * 5.4 : game.x) + (this.pistolShot ? 0.22 : -0.22),
      y: game.wallSide ? game.wallY + 1.43 : game.visualWaterY + game.y + (game.sliding ? 0.65 : 1.43), z: 0.45};
    const dx = x - stone.x, dy = y - stone.y, dz = z - stone.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    this.stones.push({...stone, dx: dx / length, dy: dy / length, dz: dz / length});
    return true;
  }

  position(wolf: Wolf | RegionalEnemy, game: RunnerGame) {
    if ("kind" in wolf && wolf.kind === "squid") return this.ocean.position(wolf, game);
    if ("kind" in wolf) return this.region.position(wolf, game);
    const enteredAt = wolf.enteredAt ?? this.hunt.enteredAt;
    const attack = this.hunt.attacks.find(attack => attack.wolf === wolf.id);
    const time = game.worldTime;
    const entry = smooth((time - enteredAt) / rules.entrance);
    const side = Math.sign(wolf.homeX);
    let x = lerp(side * 15, wolf.homeX, entry);
    let z = lerp(-14, wolf.homeZ, entry);
    let yaw = lerp(Math.atan2(wolf.homeX - side * 15, wolf.homeZ + 14), -side * 0.12, entry);
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
    return {x, y: 0.76 + leap - crouch * 0.2, z, yaw, crouch, leap, bite};
  }

  canBomb(game: RunnerGame) {
    const terrain = game.terrain;
    return game.mode === "running" && !game.struggling && !game.boosting && !game.icy && !game.transitioning &&
      this.bombCooldown === 0 && ["forest", "canyon", "snow", "water"].includes(terrain.biome) &&
      terrain.end - game.distance > CONFIG.exitSafety && this.enemies.some(e => this.health(e) > 0);
  }
  throwBomb(game: RunnerGame, consume: () => boolean) {
    if (!this.canBomb(game)) return false;
    const targets = this.enemies.filter(e => this.health(e) > 0).map(e => {
      const future = {worldTime: game.worldTime + CONFIG.bomb.flight, distance: game.distance + game.speed * CONFIG.bomb.flight};
      const p = this.position(e, {...game, ...future} as RunnerGame);
      return {id: e.id, x: p.x, y: p.y, z: p.z};
    });
    const density = (p: typeof targets[number]) => targets.filter(q => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) <= CONFIG.bomb.radius).length;
    targets.sort((a, b) => density(b) - density(a) ||
      Math.hypot(a.x - game.x, a.y - game.y, a.z) -
      Math.hypot(b.x - game.x, b.y - game.y, b.z) || a.id - b.id);
    if (!consume()) return false;
    const target = targets[0];
    this.bombs.push({id: ++this.bombSerial, start: game.worldTime, x: target.x, y: target.y, relativeZ: target.z,
      fromX: game.wallSide ? game.wallSide * 5.4 : game.x, fromY: game.wallSide ? game.wallY + 1.3 : game.visualWaterY + game.y + 1.3,
      fromZ: game.distance, pulses: 0});
    this.bombCooldown = CONFIG.bomb.cooldown;
    return true;
  }
  private updateProjectiles(game: RunnerGame, dt: number) {
    const time = game.worldTime;
    this.stones = this.stones.filter(stone => {
      const enemy = this.enemies.find(e => e.id === stone.wolf);
      if (!enemy || this.health(enemy) <= 0) return false;
      const p = this.position(enemy, game);
      const dx = p.x - stone.x, dy = p.y - stone.y, dz = p.z - stone.z;
      const length = Math.hypot(dx, dy, dz);
      if (this.aim?.wolf === enemy.id) Object.assign(this.aim, {x: p.x, z: p.z});
      const travel = rules.stoneSpeed * dt;
      if (travel >= length) { this.hurt(enemy, stone.damage, time, game); return false; }
      stone.dx = dx / length; stone.dy = dy / length; stone.dz = dz / length;
      stone.x += stone.dx * travel; stone.y += stone.dy * travel; stone.z += stone.dz * travel;
      return true;
    });
    for (const bomb of this.bombs) {
      // Keep the release-time offset along the moving runner, without retargeting enemies.
      while (bomb.pulses < CONFIG.bomb.pulses && time >= bomb.start + CONFIG.bomb.flight + bomb.pulses * CONFIG.bomb.interval) {
        bomb.pulses++;
        for (const e of this.enemies) {
          const p = this.position(e, game);
          if (Math.hypot(p.x - bomb.x, p.y - bomb.y, p.z - bomb.relativeZ) <= CONFIG.bomb.radius)
            this.hurt(e, 1, time, game);
        }
      }
    }
    this.bombs = this.bombs.filter(b => time < b.start + CONFIG.bomb.flight + CONFIG.bomb.pulses * CONFIG.bomb.interval);
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
    this.bombCooldown = Math.max(0, this.bombCooldown - dt);
    if (this.cooldown < this.weaponRules.cooldown - (this.pistolShot ? 0.5 : 0.27)) this.aim = undefined;
    const terrain = game.terrain;
    this.region.update(game, random, e => this.health(e));
    if (!["forest", "canyon", "snow", "water"].includes(terrain.biome) ||
      terrain.biome !== "forest" && terrain.end - game.distance <= CONFIG.exitSafety) this.clearShots();
    this.updateProjectiles(game, dt);
    this.ocean.update(game, random, e => this.health(e));
    if (game.character === "officer" && time >= this.nextAutoCheck && this.ammo > 0 && this.cooldown === 0 && !game.struggling &&
      !game.boosting && !game.icy && !game.transitioning) { this.nextAutoCheck=time+0.12; this.autoFire(game); }
    if (terrain.biome !== "forest") {
      hunt.wolves.length = 0;
      hunt.attacks.length = 0;
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
          homeZ: 6.5 + i * 4.25 + random(id, 94) * 0.85,
          enteredAt: time + i * rules.entryStagger, hitAt: -Infinity};
      }).filter(wolf => this.health(wolf) > 0);
      hunt.enteredAt = time;
      hunt.nextPack = time + rules.packInterval;
      hunt.nextAttack = time + rules.entrance + rules.firstAttackDelay;
    }

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

  private autoFire(game: RunnerGame) {
    let target: Wolf | RegionalEnemy | undefined, bestUrgency = Infinity, bestDistance = Infinity;
    // Scan only when a shot is due. At most one shot uses this shared cooldown.
    for (const e of this.enemies) {
      if (this.health(e) <= 0 || game.worldTime < (e.enteredAt ?? this.hunt.enteredAt)) continue;
      const p = this.position(e, game);
      if (p.z < -8 || p.z > 70) continue;
      const urgency = this.ocean.state.attacks.find(a => a.enemy === e.id && !a.spent)?.impactAt ??
        this.region.state.attacks.find(a => a.enemy === e.id && !a.spent)?.impactAt ??
        ((this.hunt.attacks.find(a => a.wolf === e.id && !a.spent)?.start ?? Infinity) + lead);
      const distance = Math.hypot(p.x - game.x, p.y - game.visualWaterY, p.z);
      if (urgency < bestUrgency || urgency === bestUrgency &&
        (distance < bestDistance || distance === bestDistance && e.id < (target?.id ?? Infinity))) {
        target = e; bestUrgency = urgency; bestDistance = distance;
      }
    }
    if (target) this.fire(target.id, game);
  }

  private schedule(game: RunnerGame, random: (key: number, salt: number) => number) {
    const {hunt} = this;
    const time = game.worldTime;
    const slots = rules.maxAttackers - hunt.attacks.length;
    if (time < hunt.nextAttack || slots <= 0 || game.protectionTime > 0 || !hunt.wolves.length) return;
    const ready = hunt.wolves.filter(wolf => this.health(wolf) > 0 &&
      time >= (wolf.enteredAt ?? hunt.enteredAt) + rules.entrance && !hunt.attacks.some(attack => attack.wolf === wolf.id));
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
