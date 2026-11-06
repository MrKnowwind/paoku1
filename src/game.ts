import { fishPosition, fishSafeLevel } from "./fish.ts";
import type { FishCrossing } from "./fish.ts";
import { makeCoral, touchesCoral, waterSafeLane } from "./coral.ts";
import type { CoralPlan } from "./coral.ts";
import { CONFIG } from "./config.ts";
import { NIGHT_START, dayPhase } from "./daylight.ts";
import { NightCombat } from "./night-combat.ts";
import type { Hunt } from "./night-combat.ts";
import { WINTER_HAZARD_HALF_WIDTH } from "./snow-layout.ts";
import { underRockShelf } from "./rock-shelf.ts";
import type { RockShelf } from "./rock-shelf.ts";
import {
  entryAt,
  gapAt,
  gapsNear,
  nextGap,
  obstacleAllowed,
  sectionAt,
  waterBlend,
  waterTransition,
} from "./track.ts";
import { TrackPlan } from "./track.ts";
import type { CoreBiome } from "./track.ts";
import type { TrackGap } from "./track.ts";
export type GameMode =
  | "ready"
  | "intro"
  | "running"
  | "paused"
  | "over"
  | "rewinding";
export const INTRO_TIMING = { stand: 1.15, walk: 3, countdown: 3, go: 0.5 };
const INTRO_DURATION = Object.values(INTRO_TIMING).reduce(
  (sum, value) => sum + value,
  0,
);
const LAUNCH_DURATION = 0.9;
const SLIDE_DURATION = 0.75;
export type ItemType =
  | "coin"
  | "log"
  | "arch"
  | "rock"
  | "magnet"
  | "shield"
  | "ammo"
  | "wall-rock"
  | "ice" | "pool" | "snowdrift" | "snowman" | "fire" | "liquor" | "stump" | "snow-log"
  | "bubble" | "coral" | "volcano" | "fish";
export interface TrackItem {
  id: number;
  type: ItemType;
  lane: number;
  z: number;
  y: number;
  worldZ: number;
  route?: "ground" | "wall";
  side?: number;
  level?: number;
  attraction?: number;
  attractionFromZ?: number;
  shelf?: RockShelf;
  shape?: number;
  coral?: CoralPlan;
  fish?: FishCrossing;
}
interface Snapshot {
  hunt: Hunt;
  cold: number;
  iceRemaining: number;
  iceRecover: number;
  iceX: number;
  triggeredIce: number[];
  firePasses: number[];
  drinkTime: number;
  waterLevel: number;
  waterY: number;
  worldTime: number;
  time: number;
  distance: number;
  lane: number;
  x: number;
  y: number;
  velocity: number;
  horizontalVelocity: number;
  slideTime: number;
  fastFalling: boolean;
  launchTime: number;
  wallSide: number;
  wallVisualSide: number;
  wallLevel: number;
  wallY: number;
  wallBlend: number;
  wallGap?: TrackGap;
  items: TrackItem[];
}
function landGrid(distance: number) {
  if (distance >= 20000) return {origin: 20017, spacing: 20, jitter: 4};
  if (distance >= 10000) return {origin: 10017, spacing: 24, jitter: 6};
  return {origin: 65, spacing: CONFIG.rowSpacing, jitter: 12};
}
function landAnchor(distance: number): number {
  const {origin, spacing} = landGrid(distance);
  const anchor = origin + Math.max(0, Math.ceil((distance - origin) / spacing)) * spacing;
  if (distance < 10000 && anchor >= 10000) return landGrid(10000).origin;
  if (distance < 20000 && anchor >= 20000) return landGrid(20000).origin;
  return anchor;
}

export class RunnerGame {
  mode: GameMode = "ready";
  waterLevel = 1;
  waterY: number = CONFIG.waterHeights[1];
  worldTime = 0;
  nightCombat = new NightCombat();
  get phase() { return dayPhase(this.worldTime); }
  get nightGearActive() { return this.phase === "night" || this.nightCombat.remaining > 0; }
  get swimming() { return this.terrain.biome === "water"; }
  get waterBlend() { return waterBlend(this.distance, this.track); }
  get transitioning() { return waterTransition(this.distance, this.track); }
  get visualWaterY() { return this.waterY * this.waterBlend; }
  track = new TrackPlan();
  nextTerrain: CoreBiome | null = null;
  cold = 0;
  coldGrace = 0;
  coldDelta = 0;
  coldFeedback = 0;
  iceRemaining = 0;
  iceRecover = 0;
  iceX = 0;
  drinkTime = 0;
  snowHitSerial = 0;
  snowHitX = 0;
  private triggeredIce = new Set<number>();
  private firePasses = new Set<number>();
  private warmedFires = new Set<number>();
  private generatedSnow = new Set<number>();
  get icy() { return this.iceRemaining > 0 || this.iceRecover > 0; }
  get inSnow() { return this.terrain.biome === "snow"; }
  get blizzard() {
    const section = this.terrain;
    if (section.biome !== "snow") return 0;
    const start = section.start + 145 + this.hash(section.cycle, 82) * 140;
    const end = start + 135 + this.hash(section.cycle, 83) * 50;
    return Math.max(0, Math.min(1, (this.distance - start) / 24, (end - this.distance) / 24));
  }
  lane = 0;
  x = 0;
  y = 0;
  velocity = 0;
  slideTime = 0;
  fastFalling = false;
  distance = 0;
  introTime = 0;
  openingPrepared = false;
  coins = 0;
  lastHit: ItemType | "gap" | "cold" | "wolf" | null = null;
  items: TrackItem[] = [];
  magnetTime = 0;
  shieldTime = 0;
  protectionTime = 0;
  boostCooldown = 0;
  boostRemaining = 0;
  boostBlend = 0;
  wallSide = 0;
  wallVisualSide = 1;
  wallLevel = 1;
  wallY: number = CONFIG.wallHeights[1];
  wallBlend = 0;
  hourglassUsed = false;
  pickupSerial = 0;
  lastPickup: "magnet" | "shield" = "magnet";
  shieldBreakSerial = 0;
  clearSerial = 0;
  shattered: TrackItem[] = [];
  private runSerial = 0;
  private idBase = 0;
  private nextId = 800000000000;
  private horizontalVelocity = 0;
  private resumeMode: "running" | "intro" = "running";
  private nextRow = 65;
  private nextLandRow = 65;
  private seed = 1;
  private autoSpawn: boolean;
  private random: () => number;
  private onCoins: (count: number) => void;
  private launchTime = LAUNCH_DURATION;
  private boostActive = false;
  private wallGap?: TrackGap;
  private generatedWalls = new Set<number>();
  private fishCrossings = new Map<number, FishCrossing>();
  private tutorialGaps = new Set<number>();
  private completedWallTutorial = false;
  private collected = new Set<number>();
  private cleared = new Set<number>();
  private runClock = 0;
  private history: Snapshot[] = [];
  private lastSnapshot = -1;
  private rewindTarget?: Snapshot;
  private rewindElapsed = 0;
  private rewindFromTime = 0;
  constructor(
    options: {
      autoSpawn?: boolean;
      random?: () => number;
      onCoins?: (count: number) => void;
    } = {},
  ) {
    this.autoSpawn = options.autoSpawn ?? true;
    this.random = options.random ?? Math.random;
    this.onCoins = options.onCoins ?? (() => {});
    this.returnHome();
  }
  get launchProgress() {
    const t = Math.min(1, this.launchTime / LAUNCH_DURATION);
    return t * t * (3 - 2 * t);
  }
  get baseSpeed() {
    return Math.min(24, 12 + this.distance * 0.012);
  }
  get speed() {
    return (
      this.baseSpeed * (this.boosting ? CONFIG.boostSpeed : this.iceRemaining > 0 ? CONFIG.iceSpeed : this.launchProgress)
    );
  }
  get score() {
    return Math.floor(this.distance * 2) + this.coins * 50;
  }
  get lateralSpeed() {
    return this.horizontalVelocity;
  }
  get boosting() {
    return this.boostActive;
  }
  get shield() {
    return this.shieldTime > 0;
  }
  set shield(active: boolean) {
    this.shieldTime = active ? CONFIG.shieldDuration : 0;
  }
  get rewindRemaining() {
    return Math.max(0, CONFIG.rewindDuration - this.rewindElapsed);
  }
  get sliding() {
    return this.slideTime > 0;
  }
  get terrain() {
    return sectionAt(this.distance, this.track);
  }
  get gapWarning() {
    const gap = nextGap(this.distance, this.seed, this.track);
    if (gap && (!this.completedWallTutorial || this.tutorialGaps.has(gap.id)))
      gap.tutorial = true;
    return gap &&
      gap.start - this.distance <=
        this.baseSpeed *
          (gap.tutorial
            ? CONFIG.firstGapWarningSeconds
            : CONFIG.gapWarningSeconds) +
          CONFIG.wallEntry
      ? gap
      : undefined;
  }
  get introducing() {
    return (
      this.mode === "intro" ||
      (this.mode === "paused" && this.resumeMode === "intro")
    );
  }
  get countdown() {
    if (!this.introducing) return "";
    const elapsed = this.introTime - INTRO_TIMING.stand - INTRO_TIMING.walk;
    return elapsed < 0
      ? ""
      : elapsed < INTRO_TIMING.countdown
        ? String(INTRO_TIMING.countdown - Math.floor(elapsed))
        : "GO!";
  }
  begin(startAtNight = false) {
    this.start(startAtNight);
    this.mode = "intro";
    this.introTime = 0;
    this.launchTime = 0;
  }
  returnHome() {
    this.start();
    this.mode = "ready";
    this.introTime = 0;
  }
  start(startAtNight = false) {
    this.waterLevel = 1;
    this.waterY = CONFIG.waterHeights[1];
    this.worldTime = startAtNight ? NIGHT_START : 0;
    this.nightCombat = new NightCombat();
    this.idBase = ++this.runSerial * 1000000000000;
    this.nextId = 800000000000;
    this.mode = "running";
    this.lane = this.x = this.y = this.velocity = this.horizontalVelocity = 0;
    this.slideTime = 0;
    this.fastFalling = false;
    this.distance = 0;
    this.launchTime = LAUNCH_DURATION;
    this.introTime = INTRO_DURATION;
    this.resumeMode = "running";
    this.items = [];
    this.openingPrepared = false;
    this.coins = 0;
    this.lastHit = null;
    this.magnetTime = 0;
    this.shield = false;
    this.protectionTime = 0;
    this.boostActive = false;
    this.boostRemaining = this.boostCooldown = this.boostBlend = 0;
    this.wallSide = this.wallBlend = 0;
    this.wallLevel = 1;
    this.wallY = CONFIG.wallHeights[1];
    this.wallGap = undefined;
    this.hourglassUsed = false;
    this.collected.clear();
    this.cleared.clear();
    this.generatedWalls.clear();
    this.fishCrossings.clear();
    this.tutorialGaps.clear();
    this.completedWallTutorial = false;
    this.shattered = [];
    this.seed = 1 + Math.floor(this.random() * 2147483646);
    this.track = new TrackPlan(this.seed, this.nextTerrain);
    this.cold = this.coldGrace = this.coldFeedback = this.coldDelta = 0;
    this.iceRemaining = this.iceRecover = this.iceX = this.drinkTime = 0;
    this.triggeredIce.clear(); this.firePasses.clear(); this.warmedFires.clear(); this.generatedSnow.clear();
    this.nextRow = this.nextLandRow = 65;
    this.runClock = 0;
    this.lastSnapshot = -1;
    this.history = [];
    this.rewindTarget = undefined;
    this.capture();
  }
  move(direction: number) {
    if (this.mode !== "running" || this.icy || this.boosting || this.wallSide || this.transitioning) return false;
    const side = Math.sign(direction);
    const gap = entryAt(this.distance, this.seed, this.track);
    if (this.lane === side && gap && Math.abs(this.x - side * 2.5) < 0.8) {
      this.wallSide = this.wallVisualSide = side;
      this.wallGap = gap;
      this.wallLevel = 1;
      this.wallY = CONFIG.wallHeights[1];
      this.y = this.velocity = this.slideTime = 0;
      this.fastFalling = false;
      return true;
    }
    this.lane = Math.max(-1, Math.min(1, this.lane + side));
    return true;
  }
  addItem(type: ItemType, lane: number, z: number, y = 0.95): TrackItem {
    const localId = this.nextId++;
    const item: TrackItem = {
      id: this.idBase + localId,
      type,
      lane,
      z,
      y,
      worldZ: this.distance + z,
      shelf: this.shelfFor(type, lane, this.distance + z, localId),
      coral: type === "coral" ? makeCoral(lane, 2) : undefined,
      fish: type === "fish" ? {direction: Math.sign(lane) || 1, startTime: this.worldTime - CONFIG.fishHalfSpan / CONFIG.fishSpeed} : undefined,
    };
    this.items.push(item);
    return item;
  }
  private wallHeight(direction: number) {
    const level = Math.max(0, Math.min(2, this.wallLevel + direction));
    if (level === this.wallLevel) return false;
    this.wallLevel = level;
    return true;
  }
  jump() {
    if (this.mode !== "running" || this.icy || this.boosting) return false;
    if (this.transitioning) return false;
    if (this.swimming) { this.waterLevel = Math.min(2, this.waterLevel + 1); return true; }
    if (this.wallSide) return this.wallHeight(1);
    if (this.y > 0 || this.velocity > 0) return false;
    this.slideTime = 0;
    this.fastFalling = false;
    this.velocity = 10.6;
    return true;
  }
  slide() {
    if (this.mode !== "running" || this.icy || this.boosting) return false;
    if (this.transitioning) return false;
    if (this.swimming) { this.waterLevel = Math.max(0, this.waterLevel - 1); return true; }
    if (this.wallSide) return this.wallHeight(-1);
    if (this.y > 0 || this.velocity > 0) {
      if (this.fastFalling) return false;
      this.fastFalling = true;
      this.velocity = Math.min(this.velocity, -20);
      return true;
    }
    if (this.sliding || this.fastFalling) return false;
    this.slideTime = SLIDE_DURATION;
    return true;
  }
  pause() {
    if (this.mode === "running" || this.mode === "intro") {
      this.resumeMode = this.mode;
      this.mode = "paused";
    }
  }
  resume() {
    if (this.mode === "paused") this.mode = this.resumeMode;
  }
  activateBooster(available: boolean, consume: () => boolean = () => true) {
    if (
      !available ||
      this.mode !== "running" ||
      this.boosting || this.icy ||
      this.boostCooldown > 0 ||
      !consume()
    )
      return false;
    this.boostActive = true;
    this.boostRemaining = CONFIG.boostDistance;
    this.boostCooldown = CONFIG.boostCooldown;
    this.wallSide = 0;
    this.y = this.velocity = this.slideTime = 0;
    this.fastFalling = false;
    this.lane = 0;
    return true;
  }
  private hash(row: number, salt: number) {
    let n =
      (Math.imul(row + 1, 374761393) ^
        Math.imul(salt + this.seed, 668265263)) >>>
      0;
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  private shelfFor(
    type: ItemType,
    lane: number,
    worldZ: number,
    localId: number,
  ): RockShelf | undefined {
    if (type !== "arch" || sectionAt(worldZ, this.track).biome !== "canyon") return;
    const side =
      lane < 0 ? -1 : lane > 0 ? 1 : this.hash(localId, 5) < 0.5 ? -1 : 1;
    return { side, laneCount: lane === 0 ? 2 : 1 };
  }
  private emit(
    type: ItemType,
    lane: number,
    worldZ: number,
    y: number,
    localId: number,
    route: "ground" | "wall" = "ground",
    level = 1,
  ) {
    const id = this.idBase + localId;
    if (
      this.collected.has(id) ||
      this.cleared.has(id) ||
      worldZ < this.distance - 24
    )
      return;
    this.items.push({
      id,
      type,
      lane,
      worldZ,
      z: worldZ - this.distance,
      y,
      route,
      side: route === "wall" ? lane : 0,
      level,
      shelf: this.shelfFor(type, lane, worldZ, localId),
    });
  }
  get trackSeed() { return this.seed; }
  private fillTrack() {
    while (this.nextRow <= this.distance + CONFIG.trackLookahead) {
      const row = Math.round((this.nextRow - 65) / CONFIG.rowSpacing);
      const biome = sectionAt(this.nextRow, this.track).biome;
      if (biome === "snow" && obstacleAllowed(this.nextRow, this.seed, this.track))
        this.snowRow(this.nextRow);
      if (biome === "water" && obstacleAllowed(this.nextRow, this.seed, this.track))
        this.waterRow(this.nextRow, row, 1000 + row * 128);
      this.nextRow += CONFIG.rowSpacing;
    }
    while (this.nextLandRow <= this.distance + CONFIG.trackLookahead) {
      const anchor = this.nextLandRow;
      const { spacing, jitter, origin } = landGrid(anchor);
      const row = (anchor - origin) / spacing;
      const biome = this.track.at(anchor).biome;
      const shifted = anchor + (this.hash(anchor < 10000 ? row : anchor, 30) - 0.5) * jitter;
      const z = this.track.at(shifted).biome === biome ? shifted : anchor;
      if ((biome === "forest" || biome === "canyon") && obstacleAllowed(z, this.seed, this.track))
        this.landRow(z, anchor, anchor < 10000 ? row : anchor);
      this.nextLandRow = landAnchor(anchor + spacing);
    }
    for (const gap of gapsNear(this.distance, this.seed, this.track)) {
      if (
        gap.start > this.distance + CONFIG.trackLookahead ||
        gap.end < this.distance - 24 ||
        this.generatedWalls.has(gap.id)
      )
        continue;
      this.generatedWalls.add(gap.id);
      if (gap.tutorial || !this.completedWallTutorial)
        this.tutorialGaps.add(gap.id);
      for (const side of [-1, 1]) {
        const base = 100000000000 + gap.id * 1000 + (side > 0 ? 400 : 0);
        const columns: {offset: number; safe: number; blocked: number[]}[] = [];
        let safe = 1;
        // Each wall has its own random stream. Adjacent safe heights always remain reachable.
        for (let offset = 28 + this.hash(base, 32) * 8, column = 0;
          offset < gap.end - gap.start - 12; column++) {
          const choices = [0, 1, 2].filter(level => Math.abs(level - safe) <= 1);
          safe = choices[Math.floor(this.hash(base + column, 33) * choices.length)];
          const blocked = [0, 1, 2].filter(level => level !== safe);
          const distance = gap.start + offset;
          if (this.hash(base + column, 34) < (distance >= 15000 ? 0.1 : distance >= 5000 ? 0.25 : 0.45))
            blocked.splice(Math.floor(this.hash(base + column, 35) * blocked.length), 1);
          columns.push({offset, safe, blocked});
          offset += (distance >= 20000 ? 16 : distance >= 10000 ? 20 : 24) + this.hash(base + column, 36) * 8;
        }
        // Coin trails point to the safe height of the next obstacle column.
        for (let offset = 8, slot = 0; offset < gap.end - gap.start - 5; offset += 6, slot++) {
          const next = columns.find(column => column.offset >= offset) ?? columns.at(-1);
          const level = next?.safe ?? 1;
          this.emit("coin", side, gap.start + offset, CONFIG.wallHeights[level] + 0.95,
            base + slot, "wall", level);
        }
        columns.forEach((column, index) => {
          for (const level of column.blocked)
            this.emit("wall-rock", side, gap.start + column.offset,
              CONFIG.wallHeights[level] + 0.95, base + 100 + index * 3 + level, "wall", level);
        });
      }
    }
  }
  private landRow(z: number, anchor: number, row: number) {
    const base = anchor < 10000 ? 1000 + row * 128 : 1000000000 + anchor * 128;
    const lane = Math.floor(this.hash(row, 1) * 3) - 1;
    const lanes = [lane, lane === 1 ? 0 : lane + 1, lane === -1 ? 1 : -1];
    const types = ["log", "arch", "rock"] as const;
    const roll = this.hash(row, 9);
    const count = this.hash(row, 7) < 0.22 ? 0 :
      z >= 15000 && anchor !== landGrid(20000).origin && roll < 0.28 &&
      this.hash(anchor - landGrid(anchor).spacing, 9) >= 0.28 ? 3 :
      z >= 5000 && roll < 0.65 ? 2 : 1;
    const obstacles = new Map<number, ItemType>();
    let shelf: RockShelf | undefined;
    for (let index = 0; index < count; index++) {
      const l = lanes[index];
      let type: ItemType = types[Math.floor(this.hash(row, 2 + index * 10) * 3)];
      if (index === 2) type = "log"; // A full row always has a jumpable lane.
      if (count > 1 && l === 0 && type === "arch" && this.track.at(z).biome === "canyon") type = "log";
      this.emit(type, l, z, 0, base + index);
      obstacles.set(l, type);
      if (count === 1) shelf = this.shelfFor(type, l, z, base);
    }
    const available = lanes.filter(l => !obstacles.has(l) && (!shelf || !underRockShelf(shelf, l * 2.5)));
    const safe = available[0] ?? lanes[2];
    const coinRoll = this.hash(row, 8);
    const coinCount = coinRoll < CONFIG.coinSingleRatio ? 1 : coinRoll < CONFIG.coinSingleRatio + CONFIG.coinDoubleRatio ? 2 : 3;
    const actionLanes = lanes.filter(l => {
      const type = obstacles.get(l);
      return type === "log" || type === "arch" || !!shelf && underRockShelf(shelf, l * 2.5);
    });
    const routes = count === 3 ? [safe, ...actionLanes.filter(l => l !== safe)] :
      this.hash(row, 13) < 0.55 && actionLanes.length ? [safe, actionLanes[0], ...available.slice(1)] : available;
    for (const l of routes.slice(0, coinCount)) {
      const type = obstacles.get(l);
      this.groundCoins(l, z, base, type === "log" ? "jump" : "flat");
    }
    if (!available.length || this.hash(row, 3) >= CONFIG.pickupChance) return;
    for (let previous = landAnchor(anchor - CONFIG.pickupMinSpacing + 1); previous < anchor;
      previous = landAnchor(previous + landGrid(previous).spacing)) {
      const key = previous < 10000 ? (previous - 65) / CONFIG.rowSpacing : previous;
      if (this.hash(key, 3) < CONFIG.pickupChance) return;
    }
    this.emit(this.hash(row, 4) < 0.5 ? "magnet" : "shield", safe, z, 1, base + 8);
  }
  private groundCoins(lane: number, z: number, base: number, shape: "jump" | "flat") {
    for (let i = 0; i < 5; i++) {
      const offset = (i - 2) * (shape === "jump" ? 2.2 : 3.5);
      const y = shape === "jump" ? 0.95 + 2 * (1 - ((i - 2) / 3.2) ** 2) : 0.95;
      if (obstacleAllowed(z + offset, this.seed, this.track))
        this.emit("coin", lane, z + offset, y, base + 16 + (lane + 1) * 5 + i);
    }
  }
  // Each block has a bypass. An occasional full-width ice row is jumpable
  // and its bypass stays clear for players who skid instead.
  private snowRow(z: number) {
    const section = this.track.at(z);
    const block = Math.floor((z - section.start - 48) / CONFIG.snowWarmSpacing);
    if (block < 0) return;
    const key = section.cycle * 100 + block;
    if (this.generatedSnow.has(key)) return;
    this.generatedSnow.add(key);
    const start = section.start + 48 + block * CONFIG.snowWarmSpacing;
    if (start + 66 >= section.end - CONFIG.exitSafety) return;
    const base = 500000000000 + key * 100;
    const safe = Math.floor(this.hash(section.cycle, 70) * 3) - 1;
    const others = [-1, 0, 1].filter(l => l !== safe);
    const lane = others[block % 2];
    const other = others[1 - block % 2];
    const first = block === 0;
    const aftermath = ["snowdrift", "snowman", "stump", "fire", "pool"] as const;
    this.emit("liquor", safe, start + 46, 0.95, base + 1);
    const ice = first || this.hash(key, 71) < 0.78;
    if (ice) {
      for (const l of others) this.emit("ice", l, start, 0, base + 2 + l + 1);
      if (!first && this.hash(key, 76) < 0.22) this.emit("ice", safe, start, 0, base + 2 + safe + 1);
    }
    for (const l of others) {
      const type = first ? (l === lane ? "snowdrift" : "snowman") :
        aftermath[Math.floor(this.hash(key, 73 + l) * aftermath.length)];
      this.emit(type, l, start + 18, 0, base + 6 + l + 1);
    }
    this.groundCoins(safe, start + 46, base, "flat");
    if (!first && this.hash(key, 78) < 0.24) {
      this.emit("snow-log", 0, start + 65, 0, base + 12);
      this.groundCoins(safe, start + 65, base + 20, "jump");
    } else {
      this.emit(this.hash(key, 79) < 0.5 ? "stump" : "fire", lane, start + 65, 0, base + 12);
      this.emit(this.hash(key, 80) < 0.5 ? "snowman" : "snowdrift", other, start + 65, 0, base + 13);
      this.groundCoins(lane, start + 65, base + 20, "jump");
    }
  }
  private changeCold(amount: number) {
    this.cold = Math.max(0, this.cold + amount);
    this.coldDelta = amount; this.coldFeedback = 0.8;
  }
  private snowCollision(item: TrackItem, flying: boolean, travel: number) {
    if (flying) return;
    const lane = Math.abs(item.lane * 2.5 - this.x) < WINTER_HAZARD_HALF_WIDTH;
    const crossed = item.z <= 0 && item.z > -travel - 0.05;
    if (item.type === "ice") {
      if (lane && Math.abs(item.z) < 3 && this.y <= 0.05 && this.icy) this.triggeredIce.add(item.id);
      if (lane && Math.abs(item.z) < 3 && this.y <= 0.05 && !this.icy && !this.triggeredIce.has(item.id)) {
        this.triggeredIce.add(item.id); this.iceRemaining = CONFIG.iceDistance;
        this.iceX = this.x; this.lane = Math.round(this.x / 2.5);
        this.horizontalVelocity = this.y = this.velocity = this.slideTime = 0;
        this.fastFalling = false;
      }
    } else if (item.type === "pool") {
      // Long open water is a lane hazard: entering its footprint on foot or
      // landing mid-pool is lethal. A normal jump cannot cross all 28 metres.
      if (lane && Math.abs(item.z) < CONFIG.poolLength / 2 && this.y <= 0.12) {
        this.mode = "over"; this.lastHit = "pool";
      }
    } else if (item.type === "fire") {
      if (lane && Math.abs(item.z) < 0.9 && this.y < CONFIG.fireHeight) {
        this.mode = "over"; this.lastHit = "fire";
      } else if (crossed && lane && this.y >= CONFIG.fireHeight && !this.icy) {
        this.firePasses.add(item.id);
      }
      // Confirm clearance of the far edge, not a jump key or a nearby pass.
      if (item.z < -0.9 && this.firePasses.has(item.id)) {
        this.firePasses.delete(item.id);
        if (lane && this.y >= CONFIG.fireHeight && !this.warmedFires.has(item.id)) {
          this.warmedFires.add(item.id); this.changeCold(-CONFIG.fireWarmth);
        }
      }
    } else if (item.type === "liquor") {
      if (lane && Math.abs(item.z) < 0.65 && Math.abs(this.y + 0.95 - item.y) < 0.9) {
        this.collect(item); this.changeCold(-CONFIG.liquorWarmth); this.drinkTime = CONFIG.drinkDuration;
      }
    } else if (lane && Math.abs(item.z) < 0.8 && this.y < (item.type === "snowman" ? 1.7 : 0.65)) {
      this.cleared.add(item.id); this.changeCold(item.type === "snowman" ? CONFIG.snowmanCold : CONFIG.snowdriftCold);
      this.snowHitX = item.lane * 2.5; this.snowHitSerial++;
    }
  }
  // Fixed hazards stay out of the safe column. Schools leave its escape height open.
  private waterRow(z: number, row: number, base: number) {
    const safeLane = waterSafeLane(row, this.seed);
    const blocked = [-1, 0, 1].filter(lane => lane !== safeLane);
    const lane = blocked[Math.floor(this.hash(row, 10) * blocked.length)];
    const otherLane = blocked.find(column => column !== lane)!;
    const hasExtraHazard = this.hash(row, 19) < CONFIG.waterExtraHazardChance;
    const extraLevel = Math.floor(this.hash(row, 20) * 3);
    const types = ["bubble", "coral", "volcano"] as const;
    const roll = this.hash(row, 11);
    const type = roll < CONFIG.waterFishChance ? "fish"
      : types[Math.floor((roll - CONFIG.waterFishChance) / (1 - CONFIG.waterFishChance) * types.length)];
    const escapeLevel = fishSafeLevel(row, this.seed);
    const fishLevels = [0, 1, 2].filter(level => level !== escapeLevel);
    const level = type === "volcano" ? 0 : type === "fish"
      ? fishLevels[Math.floor(this.hash(row, 12) * fishLevels.length)]
      : Math.floor(this.hash(row, 12) * 3);
    const cellHeight = (index: number) => CONFIG.waterHeights[index] + 0.95;
    let coral: CoralPlan | undefined;
    if (type === "coral") {
      const neighbour = !hasExtraHazard && level < 2 && Math.abs(lane - otherLane) === 1 && this.hash(row, 13) < 0.5
        ? otherLane : undefined;
      const side = Math.sign(lane || neighbour || -safeLane);
      coral = makeCoral(lane, level + 1, neighbour, this.hash(row, 14) < 0.5 ? side : 0);
    }
    this.emit(type, lane, z, coral ? coral.rootY : type === "volcano" ? CONFIG.seabedHeight + 0.65 : cellHeight(level), base);
    const hazard = this.items.find(item => item.id === this.idBase + base);
    if (hazard) {
      hazard.shape = Math.floor(this.hash(row, 40) * 3);
      hazard.coral = coral;
      if (type === "fish") hazard.fish = this.fishCrossing(z, row, base, 15);
    }
    if (hasExtraHazard) this.emit("bubble", otherLane, z, cellHeight(extraLevel), base + 4);

    const extraZ = z + CONFIG.rowSpacing / 2;
    if (this.hash(row, 16) < CONFIG.waterExtraFishChance && obstacleAllowed(extraZ, this.seed, this.track)) {
      const extraId = base + 64;
      const extraFishLevel = fishLevels[Math.floor(this.hash(row, 17) * fishLevels.length)];
      this.emit("fish", lane, extraZ, cellHeight(extraFishLevel), extraId);
      const school = this.items.find(item => item.id === this.idBase + extraId);
      if (school) school.fish = this.fishCrossing(extraZ, row, extraId, 18);
    }
    const levels = [escapeLevel, (escapeLevel + 1) % 3, (escapeLevel + 2) % 3];
    const routes = levels.flatMap(depth => [safeLane, lane, otherLane].map(column => ({column, depth})))
      .filter(({column, depth}) => {
        if (hasExtraHazard && column === otherLane && depth === extraLevel) return false;
        if (type === "fish") return depth !== level;
        if (coral) return !touchesCoral(coral, column * 2.5, cellHeight(depth), 0, 0.7);
        return column !== lane || (type === "bubble" && depth !== level);
      });
    const count = CONFIG.waterCoinRoutes[Math.floor(this.hash(row, 8) * CONFIG.waterCoinRoutes.length)];
    for (const {column, depth} of routes.slice(0, count)) {
      const cellId = depth * 3 + column + 1;
      for (let i = 0; i < 5; i++) {
        const coinZ = z - 8 + i * 3.5;
        if (obstacleAllowed(coinZ, this.seed, this.track))
          this.emit("coin", column, coinZ, cellHeight(depth), base + 16 + cellId * 5 + i);
      }
    }
    if (this.hash(row, 3) < CONFIG.pickupChance &&
        Array.from({length: Math.ceil(CONFIG.pickupMinSpacing / CONFIG.rowSpacing) - 1}, (_, i) => row - i - 1)
          .every(previous => this.hash(previous, 3) >= CONFIG.pickupChance))
      this.emit(this.hash(row, 4) < 0.5 ? "magnet" : "shield", safeLane, z, cellHeight(escapeLevel), base + 8);
  }
  private fishCrossing(z: number, row: number, id: number, salt: number): FishCrossing {
    let crossing = this.fishCrossings.get(id);
    if (!crossing) {
      crossing = {
        direction: this.hash(row, salt) < 0.5 ? -1 : 1,
        startTime: this.worldTime + (z - this.distance) / this.baseSpeed - CONFIG.fishHalfSpan / CONFIG.fishSpeed,
      };
      this.fishCrossings.set(id, crossing);
    }
    return crossing;
  }
  waterBounds(item: TrackItem) {
    const phase = ((this.worldTime + this.hash(item.id, 41) * 10) % 10 + 10) % 10;
    const eruption = item.type === "volcano" && phase >= 4 && phase < 6;
    const warning = item.type === "volcano" && phase >= 2 && phase < 4;
    const fish = item.fish ? fishPosition(item.fish, this.worldTime) : undefined;
    return {
      x: fish?.x ?? item.coral?.rootX ?? item.lane * 2.5,
      y: eruption ? (CONFIG.seabedHeight + 1.3 + CONFIG.waterSurface) / 2 : item.coral?.rootY ?? item.y,
      active: fish?.active ?? true,
      direction: fish?.direction ?? 0,
      rx: fish ? 0.8 : 0.65,
      ry: eruption ? (CONFIG.waterSurface - CONFIG.seabedHeight - 1.3) / 2 : item.type === "coral" ? 0.65 + (item.shape ?? 0) * 0.3 : 0.65,
      phase, eruption, warning,
    };
  }
  private rebuildTrack(snapshot?: Snapshot) {
    if (!this.autoSpawn) {
      this.items = (snapshot?.items ?? this.items)
        .filter(
          (item) => !this.collected.has(item.id) && !this.cleared.has(item.id),
        )
        .map((item) => ({ ...item, z: item.worldZ - this.distance }));
      return;
    }
    this.items = [];
    this.generatedWalls.clear();
    this.generatedSnow.clear();
    this.nextRow =
      65 +
      Math.max(0, Math.floor((this.distance - 30 - 65) / CONFIG.rowSpacing)) *
        CONFIG.rowSpacing;
    this.nextLandRow = landAnchor(this.distance - 38);
    this.fillTrack();
    for (const item of snapshot?.items ?? []) {
      if (item.type === "ammo" && !this.collected.has(item.id))
        this.items.push({...item, z: item.worldZ - this.distance});
    }
  }
  private fillAmmo() {
    if (!this.autoSpawn || this.boosting) return;
    const hunt = this.nightCombat.hunt;
    const {refillLookahead, refillSpacing, refillGrid} = CONFIG.nightCombat;
    const slot = Math.ceil((this.distance + refillLookahead) / refillGrid);
    const worldZ = slot * refillGrid;
    if (worldZ < hunt.nextRefillAt) return;
    hunt.nextRefillAt = worldZ + refillGrid;
    const id = 600000000000 + slot;
    if (this.collected.has(this.idBase + id)) {
      hunt.nextRefillAt = worldZ + refillSpacing;
      return;
    }
    if (!obstacleAllowed(worldZ, this.seed, this.track)) return;
    const swimming = sectionAt(worldZ, this.track).biome === "water";
    const preferred = Math.floor(this.hash(slot, 99) * 3) - 1;
    const nearby = this.items.filter(item => Math.abs(item.worldZ - worldZ) <=
      (item.type === "pool" ? CONFIG.poolLength / 2 + 8 : item.type === "ice" ? CONFIG.iceDistance + 6 : 7));
    const lane = [preferred, ...[-1, 0, 1].filter(lane => lane !== preferred)].find(lane =>
      nearby.every(item => {
        if (item.type === "coin") return Math.abs(item.worldZ - worldZ) > 1.5 || item.lane !== lane;
        if (swimming || item.type === "snow-log") return false;
        return item.shelf ? !underRockShelf(item.shelf, lane * 2.5) : item.lane !== lane;
      }));
    if (lane === undefined) return;
    const level = swimming && this.swimming ? this.waterLevel : 1;
    this.emit("ammo", lane, worldZ, swimming ? CONFIG.waterHeights[level] + 0.95 : 0.95, id, "ground", level);
    hunt.nextRefillAt = worldZ + refillSpacing;
  }
  private collect(item: TrackItem) {
    if (this.collected.has(item.id)) return;
    this.collected.add(item.id);
    if (item.type === "coin") {
      this.coins++;
      this.onCoins(1);
    } else if (item.type === "ammo") {
      this.nightCombat.refill();
    } else if (item.type === "magnet" || item.type === "shield") {
      if (item.type === "magnet") this.magnetTime = CONFIG.magnetDuration;
      else this.shield = true;
      this.lastPickup = item.type;
      this.pickupSerial++;
    }
  }
  private collide(hit: TrackItem | "wolf") {
    if (this.mode !== "running" || this.protectionTime > 0 || this.boosting) return false;
    if (this.shield) {
      this.shield = false;
      this.protectionTime = CONFIG.shieldProtection;
      if (hit !== "wolf") this.cleared.add(hit.id);
      this.shieldBreakSerial++;
    } else {
      this.mode = "over";
      this.lastHit = hit === "wolf" ? hit : hit.type;
    }
    return true;
  }
  private safeLanding() {
    if (this.transitioning) return false;
    if (this.swimming) return !this.items.some(item => {
      if (!["bubble", "coral", "volcano", "fish"].includes(item.type) || Math.abs(item.z) > 16) return false;
      if (item.coral) return touchesCoral(item.coral, 0, this.visualWaterY + 0.95, 0, 0.65);
      const b = this.waterBounds(item);
      return b.active && Math.abs(b.x) < b.rx + 0.5 + (item.fish ? CONFIG.fishSpeed * 0.6 : 0) && Math.abs(this.visualWaterY + 0.95 - b.y) < b.ry + 0.5;
    });
    return (
      !gapsNear(this.distance, this.seed, this.track).some(
        (gap) =>
          this.distance >=
            gap.start -
              this.baseSpeed *
                (gap.tutorial ||
                !this.completedWallTutorial ||
                this.tutorialGaps.has(gap.id)
                  ? CONFIG.firstGapWarningSeconds
                  : CONFIG.gapWarningSeconds) -
              CONFIG.wallEntry && this.distance < gap.end + 8,
      ) &&
      !this.items.some(
        (item) =>
          item.route !== "wall" &&
          ["log", "arch", "rock", "stump", "snow-log", "ice", "pool", "fire"].includes(item.type) &&
          (item.type === "snow-log" || (item.shelf ? underRockShelf(item.shelf, 0) : item.lane === 0)) &&
          Math.abs(item.worldZ - this.distance) < (item.type === "pool" ? CONFIG.poolLength / 2 + 18 : 18),
      )
    );
  }
  private snapshot(): Snapshot {
    return {
      hunt: this.nightCombat.snapshot(),
      cold: this.cold, iceRemaining: this.iceRemaining, iceRecover: this.iceRecover, iceX: this.iceX,
      triggeredIce: [...this.triggeredIce], firePasses: [...this.firePasses], drinkTime: this.drinkTime,
      waterLevel: this.waterLevel, waterY: this.waterY, worldTime: this.worldTime,
      time: this.runClock,
      distance: this.distance,
      lane: this.lane,
      x: this.x,
      y: this.y,
      velocity: this.velocity,
      horizontalVelocity: this.horizontalVelocity,
      slideTime: this.slideTime,
      fastFalling: this.fastFalling,
      launchTime: this.launchTime,
      wallSide: this.wallSide,
      wallVisualSide: this.wallVisualSide,
      wallLevel: this.wallLevel,
      wallY: this.wallY,
      wallBlend: this.wallBlend,
      wallGap: this.wallGap ? { ...this.wallGap } : undefined,
      items: this.items.map((item) => ({ ...item })),
    };
  }
  private capture() {
    if (this.boosting || this.runClock - this.lastSnapshot < 0.1) return;
    this.lastSnapshot = this.runClock;
    this.history.push(this.snapshot());
    while (this.history.length > 1 && this.history[1].time < this.runClock - 6)
      this.history.shift();
  }
  private revivalPoint() {
    const valid = this.history.filter(
      (s) =>
        s.cold < CONFIG.coldMax - CONFIG.coldRate * CONFIG.coldGrace && s.iceRemaining === 0 && s.iceRecover === 0 &&
        !s.items.some(i => (i.type === "pool" || i.type === "ice") && Math.abs(i.lane * 2.5 - s.x) < 1.1 && Math.abs(i.worldZ - s.distance) < (i.type === "pool" ? CONFIG.poolLength / 2 + 12 : 12)) &&
        (!gapAt(s.distance, this.seed, this.track) ||
        (s.wallSide !== 0 && s.wallGap && s.distance < s.wallGap.end)),
    );
    return (
      [...valid]
        .reverse()
        .find((s) => s.time <= this.runClock - CONFIG.rewindSeconds) ?? valid[0]
    );
  }
  get canRewind() {
    return this.mode === "over" && !this.hourglassUsed && !!this.revivalPoint();
  }
  useHourglass(consume: () => boolean) {
    const target = this.revivalPoint();
    if (!this.canRewind || !target || !consume()) return false;
    this.hourglassUsed = true;
    this.rewindTarget = target;
    this.rewindElapsed = 0;
    this.rewindFromTime = this.runClock;
    this.history.push(this.snapshot());
    this.nightCombat.clearShots();
    this.mode = "rewinding";
    return true;
  }
  private restoreMovement(s: Snapshot) {
    this.cold = s.cold; this.iceRemaining = s.iceRemaining; this.iceRecover = s.iceRecover; this.iceX = s.iceX;
    this.triggeredIce = new Set(s.triggeredIce); this.firePasses = new Set(s.firePasses); this.drinkTime = s.drinkTime;
    this.waterLevel = s.waterLevel; this.waterY = s.waterY; this.worldTime = s.worldTime;
    this.distance = s.distance;
    this.lane = s.lane;
    this.x = s.x;
    this.y = s.y;
    this.velocity = s.velocity;
    this.horizontalVelocity = s.horizontalVelocity;
    this.slideTime = s.slideTime;
    this.fastFalling = s.fastFalling;
    this.launchTime = s.launchTime;
    this.wallSide = s.wallSide;
    this.wallVisualSide = s.wallVisualSide;
    this.wallLevel = s.wallLevel;
    this.wallY = s.wallY;
    this.wallBlend = s.wallBlend;
    this.wallGap = s.wallGap;
  }
  private updateRewind(dt: number) {
    const target = this.rewindTarget!;
    this.runClock += dt;
    this.rewindElapsed += dt;
    this.boostCooldown = Math.max(0, this.boostCooldown - dt);
    this.magnetTime = Math.max(0, this.magnetTime - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    const p = Math.min(1, this.rewindElapsed / CONFIG.rewindDuration);
    const time =
      this.rewindFromTime +
      (target.time - this.rewindFromTime) * (p * p * (3 - 2 * p));
    const a = [...this.history].reverse().find((s) => s.time <= time) ?? target;
    const b = this.history.find((s) => s.time >= time) ?? a;
    const blend = b.time === a.time ? 0 : (time - a.time) / (b.time - a.time);
    this.restoreMovement(a);
    this.distance = a.distance + (b.distance - a.distance) * blend;
    this.worldTime = a.worldTime + (b.worldTime - a.worldTime) * blend;
    this.nightCombat.restore(a.hunt, this.worldTime, false);
    this.x = a.x + (b.x - a.x) * blend;
    this.y = a.y + (b.y - a.y) * blend;
    this.rebuildTrack(a);
    if (p < 1) return;
    this.restoreMovement(target);
    this.nightCombat.restore(target.hunt, this.worldTime, true);
    this.rebuildTrack(target);
    this.shattered = this.items.filter(
      (item) =>
        ["log", "arch", "rock", "wall-rock", "bubble", "coral", "volcano", "fish", "snowdrift", "snowman", "stump", "snow-log", "fire"].includes(item.type) &&
        item.worldZ >= this.distance - 2 &&
        item.worldZ <= this.distance + CONFIG.rewindClearDistance,
    );
    this.shattered.forEach((item) => this.cleared.add(item.id));
    this.items = this.items.filter((item) => !this.cleared.has(item.id));
    this.clearSerial++;
    this.coldGrace = CONFIG.coldGrace;
    this.protectionTime = CONFIG.rewindProtection;
    this.lastHit = null;
    this.history = [];
    this.lastSnapshot = -1;
    this.mode = "running";
    this.capture();
  }
  private prepareOpening() {
    if (this.openingPrepared) return;
    if (this.autoSpawn) this.fillTrack();
    this.openingPrepared = true;
  }
  update(dt: number) {
    if (this.mode === "rewinding") {
      this.updateRewind(dt);
      return;
    }
    if (this.mode === "intro") {
      this.introTime = Math.min(INTRO_DURATION, this.introTime + dt);
      if (this.introTime >= INTRO_DURATION) {
        this.mode = "running";
        this.prepareOpening();
      }
      return;
    }
    if (this.mode === "running") this.prepareOpening();
    while (dt > 0 && this.mode === "running") {
      const step = Math.min(dt, 1 / 120);
      this.runClock += step;
      this.worldTime += step;
      this.launchTime = Math.min(LAUNCH_DURATION, this.launchTime + step);
      this.magnetTime = Math.max(0, this.magnetTime - step);
      this.shieldTime = Math.max(0, this.shieldTime - step);
      this.protectionTime = Math.max(0, this.protectionTime - step);
      this.boostCooldown = Math.max(0, this.boostCooldown - step);
      // Extend before the item generator reaches the old exit buffer.
      if (this.nightCombat.remaining > 0) {
        const forest = this.terrain;
        if (forest.biome === "forest" && forest.end - this.distance <= CONFIG.nightCombat.forestExtensionLead)
          this.track.extendForest(forest, CONFIG.nightCombat.forestExtensionLength);
      }
      const flying = this.boosting;
      const travel = step * this.speed;
      const wasSnow = this.inSnow;
      const wasSwimming = this.swimming;
      this.distance += travel;
      if (wasSnow !== this.inSnow || !this.inSnow) this.cold = 0;
      this.coldGrace = Math.max(0, this.coldGrace - step);
      this.coldFeedback = Math.max(0, this.coldFeedback - step);
      this.drinkTime = Math.max(0, this.drinkTime - step);
      if (this.iceRemaining > 0) {
        this.iceRemaining = Math.max(0, this.iceRemaining - travel);
        if (this.iceRemaining === 0) this.iceRecover = CONFIG.iceRecovery;
      } else this.iceRecover = Math.max(0, this.iceRecover - step);
      if (!this.inSnow) this.iceRemaining = this.iceRecover = 0;
      if (this.inSnow && !flying && this.coldGrace === 0) this.cold += step * CONFIG.coldRate * (this.blizzard > 0 ? CONFIG.blizzardColdMultiplier : 1);
      if (!wasSwimming && this.swimming) {
        this.waterLevel = 1; this.waterY = CONFIG.waterHeights[1]; this.lane = 0;
        this.y = this.velocity = this.slideTime = 0; this.fastFalling = false;
      }
      if (this.transitioning) { this.lane = 0; this.waterLevel = 1; }
      this.waterY += (CONFIG.waterHeights[this.waterLevel] - this.waterY) * (1 - Math.exp(-step * 12));
      this.slideTime = Math.max(0, this.slideTime - step);
      const targetX = this.lane * 2.5;
      const offset = this.x - targetX;
      const decay = Math.exp(-20 * step);
      const impulse = (this.horizontalVelocity + 20 * offset) * step;
      this.x = Math.max(
        -2.5,
        Math.min(2.5, targetX + (offset + impulse) * decay),
      );
      this.horizontalVelocity =
        (this.horizontalVelocity - 20 * impulse) * decay;
      if (this.icy) { this.x = this.iceX; this.horizontalVelocity = 0; }
      this.wallBlend +=
        ((this.wallSide ? 1 : 0) - this.wallBlend) * (1 - Math.exp(-step * 12));
      this.boostBlend +=
        ((this.boosting ? 1 : 0) - this.boostBlend) *
        (1 - Math.exp(-step * 10));
      if (this.wallSide) {
        this.wallY +=
          (CONFIG.wallHeights[this.wallLevel] - this.wallY) *
          (1 - Math.exp(-step * 12));
        if (this.wallGap && this.distance >= this.wallGap.end) {
          this.completedWallTutorial = true;
          this.lane = this.wallSide;
          this.x = this.lane * 2.5;
          this.wallSide = 0;
          this.wallGap = undefined;
          this.velocity = 4.5;
          this.y = 0.08;
          this.protectionTime = Math.max(this.protectionTime, 0.6);
        }
      } else if (!this.boosting && !this.swimming && !this.transitioning) {
        this.velocity -= (this.fastFalling ? 70 : 25) * step;
        this.y = Math.max(0, this.y + this.velocity * step);
        if (this.y === 0) {
          this.velocity = 0;
          if (this.fastFalling) {
            this.fastFalling = false;
            this.slideTime = SLIDE_DURATION;
          }
        }
      }
      if (this.autoSpawn) this.fillTrack();
      if (this.nightGearActive) this.fillAmmo();
      for (const item of this.items) item.z = item.worldZ - this.distance;
      if (this.boosting) {
        this.boostRemaining = Math.max(0, this.boostRemaining - travel);
        if (this.boostRemaining === 0 && this.safeLanding()) {
          this.boostActive = false;
          this.y = this.velocity = 0;
          this.protectionTime = CONFIG.boostProtection;
        }
      } else if (gapAt(this.distance, this.seed, this.track) && !this.wallSide) {
        this.mode = "over";
        this.lastHit = "gap";
      }
      for (const item of this.items) {
        if (
          this.mode !== "running" ||
          this.collected.has(item.id) ||
          this.cleared.has(item.id)
        )
          continue;
        if (["ice", "pool", "snowdrift", "snowman", "fire", "liquor"].includes(item.type)) {
          this.snowCollision(item, flying, travel); continue;
        }
        const aquatic = ["bubble", "coral", "volcano", "fish"].includes(item.type);
        if (aquatic) {
          if (item.coral) {
            if (Math.abs(item.z) < 1.4 && touchesCoral(item.coral, this.x, this.visualWaterY + 0.95, -item.z)) this.collide(item);
            continue;
          }
          const bounds = this.waterBounds(item);
          if (bounds.active && Math.abs(item.z) < 1.15 && Math.abs(this.x - bounds.x) < bounds.rx + 0.35 &&
              Math.abs(this.visualWaterY + 0.95 - bounds.y) < bounds.ry + 0.45) this.collide(item);
          continue;
        }
        const wall = item.route === "wall";
        const closeRoute = wall
          ? this.wallSide === item.side &&
            Math.abs(this.wallY + 0.95 - item.y) < 0.75
          : !this.wallSide &&
            (item.type === "snow-log" || (item.shelf
              ? underRockShelf(item.shelf, this.x)
              : Math.abs(item.lane * 2.5 - this.x) < 0.95));
        const closeHeight =
          wall ||
          Math.abs(
            this.visualWaterY + this.y + (this.sliding || this.fastFalling ? 0.4 : 0.95) - item.y,
          ) < 0.9;
        if (item.type === "coin") {
          if (item.attraction !== undefined) {
            item.attraction = Math.min(
              1,
              item.attraction + step / CONFIG.magnetTravelTime,
            );
            if (item.attraction >= 1) this.collect(item);
            continue;
          }
          if (
            (flying && item.z <= 0.65 && item.z >= -travel - 0.65) ||
            (this.magnetTime > 0 &&
              item.z >= -CONFIG.magnetRange &&
              item.z <= CONFIG.magnetRange)
          ) {
            item.attraction = 0;
            item.attractionFromZ = item.z;
          } else if (
            !flying &&
            Math.abs(item.z) < 0.65 &&
            closeRoute &&
            closeHeight
          )
            this.collect(item);
        } else if (item.type === "ammo") {
          if (!flying && Math.abs(item.z) < 0.85 && closeRoute && closeHeight)
            this.collect(item);
        } else if (item.type === "magnet" || item.type === "shield") {
          if (!flying && Math.abs(item.z) < 0.65 && closeRoute && closeHeight)
            this.collect(item);
        } else if (
          Math.abs(item.z) < (item.shelf ? 1.15 : 0.65) &&
          closeRoute &&
          (item.type === "wall-rock" ||
            item.type === "rock" ||
            (["log", "stump", "snow-log"].includes(item.type) && this.y < 0.9) ||
            (item.type === "arch" && !this.sliding))
        )
          this.collide(item);
      }
      if (this.mode === "running" && this.inSnow && this.cold >= CONFIG.coldMax) {
        this.cold = CONFIG.coldMax; this.mode = "over"; this.lastHit = "cold";
      }
      this.items = this.items.filter(
        (item) =>
          (item.z > -24 || item.attraction !== undefined || item.fish && this.worldTime < item.fish.startTime + CONFIG.fishHalfSpan * 2 / CONFIG.fishSpeed) &&
          !this.collected.has(item.id) &&
          !this.cleared.has(item.id),
      );
      if (this.mode === "running") this.nightCombat.update(this, step,
        (key, salt) => this.hash(key, salt), () => this.collide("wolf"));
      if (this.mode === "running") this.capture();
      dt -= step;
    }
  }
}
