import { fishPosition, fishSafeLevel } from "./fish.ts";
import type { FishCrossing } from "./fish.ts";
import { makeCoral, touchesCoral, waterSafeLane } from "./coral.ts";
import type { CoralPlan } from "./coral.ts";
import { CONFIG } from "./config.ts";
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
  | "wall-rock"
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
export class RunnerGame {
  mode: GameMode = "ready";
  waterLevel = 1;
  waterY: number = CONFIG.waterHeights[1];
  worldTime = 0;
  get swimming() { return this.terrain.biome === "water"; }
  get waterBlend() { return waterBlend(this.distance); }
  get transitioning() { return waterTransition(this.distance); }
  get visualWaterY() { return this.waterY * this.waterBlend; }
  lane = 0;
  x = 0;
  y = 0;
  velocity = 0;
  slideTime = 0;
  fastFalling = false;
  distance = 0;
  introTime = 0;
  coins = 0;
  lastHit: ItemType | "gap" | null = null;
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
      this.baseSpeed * (this.boosting ? CONFIG.boostSpeed : this.launchProgress)
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
    return sectionAt(this.distance);
  }
  get gapWarning() {
    const gap = nextGap(this.distance, this.seed);
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
  begin() {
    this.start();
    this.mode = "intro";
    this.introTime = 0;
    this.launchTime = 0;
  }
  returnHome() {
    this.start();
    this.mode = "ready";
    this.introTime = 0;
  }
  start() {
    this.waterLevel = 1;
    this.waterY = CONFIG.waterHeights[1];
    this.worldTime = 0;
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
    this.nextRow = 65;
    this.runClock = 0;
    this.lastSnapshot = -1;
    this.history = [];
    this.rewindTarget = undefined;
    this.capture();
  }
  move(direction: number) {
    if (this.mode !== "running" || this.boosting || this.wallSide || this.transitioning) return false;
    const side = Math.sign(direction);
    const gap = entryAt(this.distance, this.seed);
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
    if (this.mode !== "running" || this.boosting) return false;
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
    if (this.mode !== "running" || this.boosting) return false;
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
      this.boosting ||
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
    if (type !== "arch" || sectionAt(worldZ).biome !== "canyon") return;
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
    if (this.distance < 8) return;
    while (this.nextRow <= this.distance + CONFIG.trackLookahead) {
      const row = Math.round((this.nextRow - 65) / CONFIG.rowSpacing);
      const biome = sectionAt(this.nextRow).biome;
      const shifted = this.nextRow + (this.hash(row, 30) - 0.5) * 12;
      const z = biome !== "water" && sectionAt(shifted).biome === biome ? shifted : this.nextRow;
      const base = 1000 + row * 128;
      if (obstacleAllowed(z, this.seed)) {
        if (sectionAt(z).biome === "water") {
          this.waterRow(z, row, base);
          this.nextRow += CONFIG.rowSpacing;
          continue;
        }
        const lane = Math.floor(this.hash(row, 1) * 3) - 1;
        const types: ItemType[] = ["log", "arch", "rock"];
        const type = types[Math.floor(this.hash(row, 2) * 3)];
        const shelf = this.shelfFor(type, lane, z, base);
        const empty = this.hash(row, 7) < 0.22;
        if (!empty) this.emit(type, lane, z, 0, base);
        // Centre shelves span two lanes from their wall; leave coins on the open lane.
        const safeLane = shelf
          ? shelf.laneCount === 1
            ? 0
            : -shelf.side
          : lane === 1
            ? 0
            : lane + 1;
        const available = [-1, 0, 1].filter(l => empty || (shelf ? !underRockShelf(shelf, l * 2.5) : l !== lane));
        const roll = this.hash(row, 8);
        const count = roll < CONFIG.coinSingleRatio ? 1 : roll < CONFIG.coinSingleRatio + CONFIG.coinDoubleRatio ? 2 : 3;
        available.sort((a, b) => (a === safeLane ? -1 : b === safeLane ? 1 : a - b));
        for (const l of available.slice(0, count))
          for (let i = 0; i < 5; i++)
            if (obstacleAllowed(z - 8 + i * 3.5, this.seed))
              this.emit("coin", l, z - 8 + i * 3.5, 0.95, base + 16 + (l + 1) * 5 + i);
        if (
          this.hash(row, 3) < CONFIG.pickupChance &&
          Array.from(
            {
              length:
                Math.ceil(CONFIG.pickupMinSpacing / CONFIG.rowSpacing) - 1,
            },
            (_, i) => row - i - 1,
          ).every(
            (previous) =>
              previous < 0 || this.hash(previous, 3) >= CONFIG.pickupChance,
          )
        )
          this.emit(
            this.hash(row, 4) < 0.5 ? "magnet" : "shield",
            safeLane,
            z,
            1.0,
            base + 8,
          );
      }
      this.nextRow += CONFIG.rowSpacing;
    }
    for (const gap of gapsNear(this.distance, this.seed)) {
      if (
        gap.start > this.distance + CONFIG.trackLookahead ||
        gap.end < this.distance - 24 ||
        this.generatedWalls.has(gap.id)
      )
        continue;
      this.generatedWalls.add(gap.id);
      if (gap.tutorial || !this.completedWallTutorial)
        this.tutorialGaps.add(gap.id);
      const tutorial = this.tutorialGaps.has(gap.id);
      for (const side of [-1, 1]) {
        const base = 100000000000 + gap.id * 1000 + (side > 0 ? 400 : 0);
        for (
          let offset = 8, slot = 0;
          offset < gap.end - gap.start - 5;
          offset += 6, slot++
        ) {
          const level = tutorial
            ? 1
            : [1, 2, 1, 0][(Math.floor((offset - 8) / 22) + Math.floor(this.hash(gap.id, 31) * 4)) % 4];
          this.emit(
            "coin",
            side,
            gap.start + offset,
            CONFIG.wallHeights[level] + 0.95,
            base + slot,
            "wall",
            level,
          );
        }
        // A second height is offered only in obstacle-free wall sections.
        if (tutorial)
          for (let offset = 8, slot = 0; offset < gap.end - gap.start - 5; offset += 6, slot++)
            this.emit("coin", side, gap.start + offset, CONFIG.wallHeights[2] + 0.95,
              base + 250 + slot, "wall", 2);
        if (!tutorial)
          for (
            let offset = 22, column = 0;
            offset < gap.end - gap.start - 12;
            offset += 22, column++
          ) {
            const safe = [1, 2, 1, 0][(column + Math.floor(this.hash(gap.id, 31) * 4)) % 4];
            for (let level = 0; level < 3; level++)
              if (level !== safe)
                this.emit(
                  "wall-rock",
                  side,
                  gap.start + offset,
                  CONFIG.wallHeights[level] + 0.95,
                  base + 100 + column * 3 + level,
                  "wall",
                  level,
                );
          }
      }
    }
  }
  // Reserve a reachable column, then place rooted reefs and coins around it.
  private waterRow(z: number, row: number, base: number) {
    const safeLane = waterSafeLane(row);
    const blocked = [-1, 0, 1].filter(lane => lane !== safeLane);
    const lane = blocked[Math.floor(this.hash(row, 10) * blocked.length)];
    const types: ItemType[] = ["bubble", "coral", "volcano"];
    const rollType = this.hash(row, 11);
    const type: ItemType = rollType < CONFIG.waterFishChance ? "fish"
      : types[Math.floor((rollType - CONFIG.waterFishChance) / (1 - CONFIG.waterFishChance) * types.length)];
    const escapeLevel = fishSafeLevel(row);
    const fishLevels = [0, 1, 2].filter(level => level !== escapeLevel);
    const level = type === "volcano" ? 0 : type === "fish"
      ? fishLevels[Math.floor(this.hash(row, 12) * fishLevels.length)]
      : Math.floor(this.hash(row, 12) * 3);
    let coral: CoralPlan | undefined;
    if (type === "coral") {
      const neighbour = Math.abs(blocked[0] - blocked[1]) === 1 && this.hash(row, 13) < 0.5
        ? blocked.find(l => l !== lane) : undefined;
      const side = Math.sign(lane || neighbour || -safeLane);
      coral = makeCoral(lane, level + 1, neighbour, this.hash(row, 14) < 0.5 ? side : 0);
    }
    this.emit(type, lane, z, coral ? coral.rootY : type === "volcano" ? CONFIG.seabedHeight + 0.65 : CONFIG.waterHeights[level] + 0.95, base);
    const hazard = this.items.find(i => i.id === this.idBase + base);
    if (hazard) {
      hazard.shape = row % 3;
      hazard.coral = coral;
      if (type === "fish") hazard.fish = this.fishCrossing(z, row, base, 15);
    }
    // Interleave an extra school between ordinary rows without adding coins or pickups.
    const extraZ = z + CONFIG.rowSpacing / 2;
    if (this.hash(row, 16) < CONFIG.waterExtraFishChance &&
        sectionAt(extraZ).biome === "water" && obstacleAllowed(extraZ, this.seed)) {
      this.emit("fish", lane, extraZ, CONFIG.waterHeights[fishLevels[Math.floor(this.hash(row, 17) * fishLevels.length)]] + 0.95, base + 64);
      const school = this.items.find(item => item.id === this.idBase + base + 64);
      if (school) school.fish = this.fishCrossing(extraZ, row, base + 64, 18);
    }
    const roll = this.hash(row, 8);
    const count = roll < CONFIG.coinSingleRatio ? 1 : roll < CONFIG.coinSingleRatio + CONFIG.coinDoubleRatio ? 2 : 3;
    const routes = (type === "fish" ? [escapeLevel] : [1, 0, 2]).flatMap(level => [safeLane, ...blocked].map(l => ({lane: l, level})))
      .filter(cell => type === "fish" || (coral ? !touchesCoral(coral, cell.lane * 2.5, CONFIG.waterHeights[cell.level] + 0.95, 0, 0.7) : cell.lane !== lane));
    for (const [route, cell] of routes.slice(0, count).entries())
      for (let i = 0; i < 5; i++)
        if (obstacleAllowed(z - 8 + i * 3.5, this.seed))
          this.emit("coin", cell.lane, z - 8 + i * 3.5, CONFIG.waterHeights[cell.level] + 0.95, base + 16 + route * 5 + i);
    if (this.hash(row, 3) < CONFIG.pickupChance &&
        Array.from({length: Math.ceil(CONFIG.pickupMinSpacing / CONFIG.rowSpacing) - 1}, (_, i) => row - i - 1)
          .every(r => this.hash(r, 3) >= CONFIG.pickupChance))
      this.emit(this.hash(row, 4) < 0.5 ? "magnet" : "shield", safeLane, z, CONFIG.waterHeights[type === "fish" ? escapeLevel : 1] + 0.95, base + 8);
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
    const phase = ((this.worldTime + item.worldZ * 0.017) % 10 + 10) % 10;
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
    this.nextRow =
      65 +
      Math.max(0, Math.floor((this.distance - 30 - 65) / CONFIG.rowSpacing)) *
        CONFIG.rowSpacing;
    this.fillTrack();
  }
  private collect(item: TrackItem) {
    if (this.collected.has(item.id)) return;
    this.collected.add(item.id);
    if (item.type === "coin") {
      this.coins++;
      this.onCoins(1);
    } else if (item.type === "magnet" || item.type === "shield") {
      if (item.type === "magnet") this.magnetTime = CONFIG.magnetDuration;
      else this.shield = true;
      this.lastPickup = item.type;
      this.pickupSerial++;
    }
  }
  private collide(item: TrackItem) {
    if (this.protectionTime > 0 || this.boosting) return;
    if (this.shield) {
      this.shield = false;
      this.protectionTime = CONFIG.shieldProtection;
      this.cleared.add(item.id);
      this.shieldBreakSerial++;
    } else {
      this.mode = "over";
      this.lastHit = item.type;
    }
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
      !gapsNear(this.distance, this.seed).some(
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
          ["log", "arch", "rock"].includes(item.type) &&
          (item.shelf ? underRockShelf(item.shelf, 0) : item.lane === 0) &&
          Math.abs(item.worldZ - this.distance) < 12,
      )
    );
  }
  private snapshot(): Snapshot {
    return {
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
        !gapAt(s.distance, this.seed) ||
        (s.wallSide !== 0 && s.wallGap && s.distance < s.wallGap.end),
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
    this.mode = "rewinding";
    return true;
  }
  private restoreMovement(s: Snapshot) {
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
    this.x = a.x + (b.x - a.x) * blend;
    this.y = a.y + (b.y - a.y) * blend;
    this.rebuildTrack(a);
    if (p < 1) return;
    this.restoreMovement(target);
    this.rebuildTrack(target);
    this.shattered = this.items.filter(
      (item) =>
        ["log", "arch", "rock", "wall-rock", "bubble", "coral", "volcano", "fish"].includes(item.type) &&
        item.worldZ >= this.distance - 2 &&
        item.worldZ <= this.distance + CONFIG.rewindClearDistance,
    );
    this.shattered.forEach((item) => this.cleared.add(item.id));
    this.items = this.items.filter((item) => !this.cleared.has(item.id));
    this.clearSerial++;
    this.protectionTime = CONFIG.rewindProtection;
    this.lastHit = null;
    this.history = [];
    this.lastSnapshot = -1;
    this.mode = "running";
    this.capture();
  }
  update(dt: number) {
    if (this.mode === "rewinding") {
      this.updateRewind(dt);
      return;
    }
    if (this.mode === "intro") {
      this.introTime = Math.min(INTRO_DURATION, this.introTime + dt);
      if (this.introTime >= INTRO_DURATION) this.mode = "running";
      return;
    }
    while (dt > 0 && this.mode === "running") {
      const step = Math.min(dt, 1 / 120);
      this.runClock += step;
      this.worldTime += step;
      this.launchTime = Math.min(LAUNCH_DURATION, this.launchTime + step);
      this.magnetTime = Math.max(0, this.magnetTime - step);
      this.shieldTime = Math.max(0, this.shieldTime - step);
      this.protectionTime = Math.max(0, this.protectionTime - step);
      this.boostCooldown = Math.max(0, this.boostCooldown - step);
      const flying = this.boosting;
      const travel = step * this.speed;
      const wasSwimming = this.swimming;
      this.distance += travel;
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
      for (const item of this.items) item.z = item.worldZ - this.distance;
      if (this.boosting) {
        this.boostRemaining = Math.max(0, this.boostRemaining - travel);
        if (this.boostRemaining === 0 && this.safeLanding()) {
          this.boostActive = false;
          this.y = this.velocity = 0;
          this.protectionTime = CONFIG.boostProtection;
        }
      } else if (gapAt(this.distance, this.seed) && !this.wallSide) {
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
            (item.shelf
              ? underRockShelf(item.shelf, this.x)
              : Math.abs(item.lane * 2.5 - this.x) < 0.95);
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
        } else if (item.type === "magnet" || item.type === "shield") {
          if (!flying && Math.abs(item.z) < 0.65 && closeRoute && closeHeight)
            this.collect(item);
        } else if (
          Math.abs(item.z) < (item.shelf ? 1.15 : 0.65) &&
          closeRoute &&
          (item.type === "wall-rock" ||
            item.type === "rock" ||
            (item.type === "log" && this.y < 0.9) ||
            (item.type === "arch" && !this.sliding))
        )
          this.collide(item);
      }
      this.items = this.items.filter(
        (item) =>
          (item.z > -24 || item.attraction !== undefined || item.fish && this.worldTime < item.fish.startTime + CONFIG.fishHalfSpan * 2 / CONFIG.fishSpeed) &&
          !this.collected.has(item.id) &&
          !this.cleared.has(item.id),
      );
      if (this.mode === "running") this.capture();
      dt -= step;
    }
  }
}
