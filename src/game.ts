export type GameMode = "ready" | "running" | "paused" | "over";
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
  distance = 0;
  coins = 0;
  lastHit: ItemType | null = null;
  items: TrackItem[] = [];
  private nextId = 0;
  private nextRow = 65;
  private autoSpawn: boolean;
  private random: () => number;
  constructor(options: { autoSpawn?: boolean; random?: () => number } = {}) {
    this.autoSpawn = options.autoSpawn ?? true;
    this.random = options.random ?? Math.random;
  }
  get speed() {
    return Math.min(24, 12 + this.distance * 0.012);
  }
  get score() {
    return Math.floor(this.distance * 2) + this.coins * 50;
  }
  start() {
    this.mode = "running";
    this.lane = 0;
    this.x = 0;
    this.y = 0;
    this.velocity = 0;
    this.slideTime = 0;
    this.distance = 0;
    this.items = [];
    this.coins = 0;
    this.lastHit = null;
    this.nextRow = 65;
    if (this.autoSpawn) {
      for (let z = 16; z <= 40; z += 4) this.addItem("coin", 0, z);
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
    if (this.mode === "running" && this.y === 0 && !this.sliding)
      this.velocity = 9;
  }
  get sliding() {
    return this.slideTime > 0;
  }
  slide() {
    if (this.mode === "running" && this.y === 0 && !this.sliding)
      this.slideTime = 0.75;
  }
  pause() {
    if (this.mode === "running") this.mode = "paused";
  }
  resume() {
    if (this.mode === "paused") this.mode = "running";
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
    while (dt > 0 && this.mode === "running") {
      const step = Math.min(dt, 1 / 120);
      const travel = step * this.speed;
      this.distance += travel;
      this.slideTime = Math.max(0, this.slideTime - step);
      this.x += (this.lane * 2.5 - this.x) * Math.min(1, step * 16);
      this.velocity -= 23 * step;
      this.y = Math.max(0, this.y + this.velocity * step);
      if (this.y === 0) this.velocity = 0;
      for (const item of this.items) {
        item.z -= travel;
        if (
          Math.abs(item.z) < 0.65 &&
          Math.abs(item.lane * 2.5 - this.x) < 0.95
        ) {
          if (
            item.type === "coin" &&
            Math.abs(this.y + (this.sliding ? 0.4 : 0.95) - item.y) < 0.9
          ) {
            this.coins++;
            item.z = -10;
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
      this.items = this.items.filter((item) => item.z > -5);
      if (this.autoSpawn) this.fillTrack();
      dt -= step;
    }
  }
}
