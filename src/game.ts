export type GameMode = "ready" | "intro" | "running" | "paused" | "over";
export const INTRO_TIMING = { stand: 1.15, walk: 3, countdown: 3, go: 0.5 };
const INTRO_DURATION =
  INTRO_TIMING.stand +
  INTRO_TIMING.walk +
  INTRO_TIMING.countdown +
  INTRO_TIMING.go;
const LAUNCH_DURATION = 0.9;
const SLIDE_DURATION = 0.75;
export type ItemType = "coin" | "log" | "arch" | "rock";
export interface TrackItem {
  id: number;
  type: ItemType;
  lane: number;
  z: number;
  y: number;
}

export class RunnerGame {
  mode: GameMode = "ready";
  lane = 0;
  x = 0;
  y = 0;
  velocity = 0;
  slideTime = 0;
  fastFalling = false;
  distance = 0;
  introTime = 0;
  coins = 0;
  lastHit: ItemType | null = null;
  items: TrackItem[] = [];
  private nextId = 0;
  private horizontalVelocity = 0;
  private resumeMode: "running" | "intro" = "running";
  private nextRow = 65;
  private autoSpawn: boolean;
  private random: () => number;
  private launchTime = LAUNCH_DURATION;
  constructor(options: { autoSpawn?: boolean; random?: () => number } = {}) {
    this.autoSpawn = options.autoSpawn ?? true;
    this.random = options.random ?? Math.random;
    this.returnHome();
  }
  get launchProgress() {
    const t = Math.min(1, this.launchTime / LAUNCH_DURATION);
    return t * t * (3 - 2 * t);
  }
  get speed() {
    return Math.min(24, 12 + this.distance * 0.012) * this.launchProgress;
  }
  get score() {
    return Math.floor(this.distance * 2) + this.coins * 50;
  }
  get lateralSpeed() {
    return this.horizontalVelocity;
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
    // Keep the visible opening track intact when leaving the home screen.
    if (this.mode !== "ready") this.start();
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
    this.mode = "running";
    this.lane = 0;
    this.x = 0;
    this.horizontalVelocity = 0;
    this.y = 0;
    this.velocity = 0;
    this.slideTime = 0;
    this.fastFalling = false;
    this.distance = 0;
    this.launchTime = LAUNCH_DURATION;
    this.introTime = INTRO_DURATION;
    this.resumeMode = "running";
    this.items = [];
    this.coins = 0;
    this.lastHit = null;
    this.nextRow = 65;
    if (this.autoSpawn) {
      for (let z = 7; z <= 39; z += 4) this.addItem("coin", 0, z, 1.1);
      this.addItem("log", 1, 24, 0);
      this.addItem("arch", -1, 39, 0);
      this.fillTrack();
    }
  }
  move(direction: number) {
    if (this.mode === "running")
      this.lane = Math.max(-1, Math.min(1, this.lane + direction));
  }
  addItem(type: ItemType, lane: number, z: number, y = 0.95) {
    this.items.push({ id: this.nextId++, type, lane, z, y });
  }
  jump() {
    if (this.mode !== "running" || this.y > 0 || this.velocity > 0)
      return false;
    this.slideTime = 0;
    this.fastFalling = false;
    this.velocity = 10.6;
    return true;
  }
  get sliding() {
    return this.slideTime > 0;
  }
  slide() {
    if (this.mode !== "running") return false;
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
  private fillTrack() {
    while (this.nextRow - this.distance < 145) {
      const z = this.nextRow - this.distance;
      const lane = Math.floor(this.random() * 3) - 1;
      const types: ItemType[] = ["log", "arch", "rock"];
      this.addItem(types[Math.floor(this.random() * 3)], lane, z);
      if (this.distance > 200 && this.random() > 0.5) {
        this.addItem(
          types[Math.floor(this.random() * 3)],
          lane === 1 ? -1 : lane + 1,
          z,
        );
      }
      const coinLane = lane === 1 ? 0 : lane + 1;
      for (let i = 0; i < 5; i++)
        this.addItem("coin", coinLane, z - 8 + i * 3.5);
      this.nextRow += 25 + this.random() * 8;
    }
  }
  update(dt: number) {
    if (this.mode === "intro") {
      this.introTime = Math.min(INTRO_DURATION, this.introTime + dt);
      if (this.introTime >= INTRO_DURATION) this.mode = "running";
      return;
    }
    while (dt > 0 && this.mode === "running") {
      const step = Math.min(dt, 1 / 120);
      this.launchTime = Math.min(LAUNCH_DURATION, this.launchTime + step);
      const travel = step * this.speed;
      this.distance += travel;
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
      this.velocity -= (this.fastFalling ? 70 : 25) * step;
      this.y = Math.max(0, this.y + this.velocity * step);
      if (this.y === 0) {
        this.velocity = 0;
        if (this.fastFalling) {
          this.fastFalling = false;
          this.slideTime = SLIDE_DURATION;
        }
      }
      for (const item of this.items) {
        item.z -= travel;
        if (
          Math.abs(item.z) < 0.65 &&
          Math.abs(item.lane * 2.5 - this.x) < 0.95
        ) {
          if (
            item.type === "coin" &&
            Math.abs(
              this.y + (this.sliding || this.fastFalling ? 0.4 : 0.95) - item.y,
            ) < 0.9
          ) {
            this.coins++;
            item.z = -1000;
          } else if (
            item.type === "rock" ||
            (item.type === "log" && this.y < 0.9) ||
            (item.type === "arch" && !this.sliding)
          ) {
            this.mode = "over";
            this.lastHit = item.type;
          }
        }
      }
      // Keep passed props until their full geometry is behind the chase camera.
      this.items = this.items.filter((item) => item.z > -24);
      if (this.autoSpawn) this.fillTrack();
      dt -= step;
    }
  }
}
