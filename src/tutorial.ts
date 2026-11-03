import type { RunnerGame } from "./game.ts";

export type LessonId =
  | "move"
  | "jump"
  | "slide"
  | "dodge"
  | "coin"
  | "magnet"
  | "shield"
  | "wallEntry"
  | "wallHeight"
  | "booster"
  | "hourglass";
type Direction = "left" | "right" | "jump" | "slide";
export interface Lesson {
  id: LessonId;
  gesture: "left" | "right" | "up" | "down" | "collect" | "tap";
  target?: number;
}
const basics: LessonId[] = ["move", "jump", "slide", "dodge"];

export class Tutorial {
  active: Lesson | null = null;
  private seen: Set<string>;
  private runSeen: Set<string>;
  private cooldown = 0;
  private pickupSerial = 0;
  private coins = 0;
  private pending: LessonId[] = [];
  private persist: (seen: string[]) => void;
  testMode: boolean;
  constructor(
    seen: string[],
    persist: (seen: string[]) => void,
    testMode = false,
  ) {
    this.persist = persist;
    this.testMode = testMode;
    this.seen = new Set(seen);
    this.runSeen = new Set(testMode ? [] : seen);
  }
  get needsBasics() {
    return this.testMode || !this.seen.has("basics");
  }
  knows(id: string) {
    return this.runSeen.has(id);
  }
  resetRun(game: RunnerGame) {
    this.runSeen = new Set(this.testMode ? [] : this.seen);
    if (this.needsBasics) basics.forEach((id) => this.runSeen.delete(id));
    this.active = null;
    this.cooldown = 0;
    this.pickupSerial = game.pickupSerial;
    this.coins = game.coins;
    this.pending = [];
  }
  complete(id: LessonId) {
    this.runSeen.add(id);
    if (!basics.includes(id) && !this.testMode) this.seen.add(id);
    if (basics.every((key) => this.runSeen.has(key)) && !this.testMode) {
      basics.forEach((key) => this.seen.add(key));
      this.seen.add("basics");
    }
    if (!this.testMode) this.persist([...this.seen]);
    this.active = null;
    this.cooldown = 0.65;
  }
  private show(lesson: Lesson) {
    this.active = lesson;
  }
  action(direction: Direction, game: RunnerGame, accepted: boolean) {
    if (!this.active) return;
    const id = this.active.id;
    if (["coin", "magnet", "shield"].includes(id)) {
      this.complete(id);
      return;
    }
    if (!accepted) return;
    if (
      (id === "move" || id === "dodge") &&
      direction === this.active.gesture &&
      (id !== "move" || game.lane === -1)
    )
      this.complete(id);
    else if (id === "jump" && direction === "jump") this.complete(id);
    else if (id === "slide" && direction === "slide") this.complete(id);
    else if (id === "wallEntry" && game.wallSide) this.complete(id);
    else if (
      id === "wallHeight" &&
      (direction === "jump" || direction === "slide")
    )
      this.complete(id);
  }
  timeScale(game: RunnerGame) {
    if (!this.active || game.mode !== "running") return 1;
    if (this.active.id === "wallHeight") return 0;
    if (this.active.id === "move" && game.distance >= 4) return 0;
    if (
      !game.wallSide &&
      game.gapWarning &&
      game.distance >= game.gapWarning.start - 10
    )
      return this.active.id === "wallEntry" &&
        Math.abs(game.lane) === 1 &&
        Math.abs(game.x - game.lane * 2.5) > 0.7
        ? 0.35
        : 0;
    const target = game.items.find((item) => item.id === this.active?.target);
    const near = game.items.some(
      (item) =>
        ["log", "arch", "rock"].includes(item.type) &&
        item.z > 0 &&
        item.z < game.baseSpeed * 0.3 &&
        Math.abs(item.lane * 2.5 - game.x) < 1.1,
    );
    return (target && target.z < game.baseSpeed * 0.3) || near ? 0 : 0.08;
  }
  update(game: RunnerGame, dt: number, boosterUnlocked: boolean) {
    if (game.mode !== "running") return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (game.pickupSerial !== this.pickupSerial) {
      this.pickupSerial = game.pickupSerial;
      if (!this.knows(game.lastPickup)) this.pending.push(game.lastPickup);
    }
    if (
      game.coins > this.coins &&
      !this.knows("coin") &&
      !this.pending.includes("coin")
    )
      this.pending.push("coin");
    this.coins = game.coins;
    if (this.active) {
      const id = this.active.id;
      if (id === "booster" && game.boosting) this.complete(id);
      else if (id === "wallEntry" && game.wallSide) this.complete(id);
      return;
    }
    if (this.cooldown > 0 || game.boosting) return;
    if (this.needsBasics && !this.knows("move") && game.distance < 6) {
      this.show({ id: "move", gesture: "left" });
      return;
    }
    if (game.wallSide && !this.knows("wallHeight")) {
      this.show({
        id: "wallHeight",
        gesture: game.wallLevel < 2 ? "up" : "down",
      });
      return;
    }
    if (
      !game.wallSide &&
      !this.knows("wallEntry") &&
      game.gapWarning &&
      game.distance >= game.gapWarning.start - 13
    ) {
      this.show({ id: "wallEntry", gesture: game.lane > 0 ? "right" : "left" });
      return;
    }
    const obstacle = game.items
      .filter(
        (item) =>
          ["log", "arch", "rock"].includes(item.type) &&
          item.z > 0 &&
          item.z <= game.baseSpeed * 0.58 &&
          Math.abs(item.lane * 2.5 - game.x) < 1.1,
      )
      .sort((a, b) => a.z - b.z)[0];
    if (obstacle) {
      const id =
        obstacle.type === "log"
          ? "jump"
          : obstacle.type === "arch"
            ? "slide"
            : "dodge";
      if (!this.knows(id)) {
        this.show({
          id,
          gesture:
            id === "jump"
              ? "up"
              : id === "slide"
                ? "down"
                : game.lane <= 0
                  ? "right"
                  : "left",
          target: obstacle.id,
        });
        return;
      }
    }
    const imminent = game.items.some(
      (item) =>
        ["log", "arch", "rock", "wall-rock"].includes(item.type) &&
        item.z > 0 &&
        item.z < game.baseSpeed * 1.5 &&
        (item.route === "wall"
          ? game.wallSide === item.side
          : Math.abs(item.lane * 2.5 - game.x) < 1.1),
    );
    if (!imminent && this.pending.length) {
      const id = this.pending.shift()!;
      if (!this.knows(id)) this.show({ id, gesture: "collect" });
    } else if (
      !imminent &&
      boosterUnlocked &&
      !this.knows("booster") &&
      basics.every((id) => this.knows(id)) &&
      !game.wallSide &&
      game.boostCooldown <= 0
    ) {
      this.show({ id: "booster", gesture: "tap" });
    }
  }
}
