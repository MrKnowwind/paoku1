import type { RunnerGame, TrackItem } from "./game.ts";
import { underRockShelf } from "./rock-shelf.ts";
import { CONFIG } from "./config.ts";

const onPath = (item: TrackItem, x: number) =>
  item.shelf
    ? underRockShelf(item.shelf, x)
    : Math.abs(item.lane * 2.5 - x) < 1.1;

export type GuideId = "snow" | "ocean";
export type LessonId =
  | GuideId
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
  encounter?: string;
}
const basics: LessonId[] = ["move"];

export class Tutorial {
  active: Lesson | null = null;
  guideStep = 0;
  reviewingGuide = false;
  private previousLesson: Lesson | null = null;
  private previousGuideStep = 0;
  get guide(): GuideId | null {
    const id = this.active?.id;
    return id === "snow" || id === "ocean" ? id : null;
  }
  reviewGuide(id: GuideId) {
    if (this.reviewingGuide) return;
    this.previousLesson = this.active;
    this.previousGuideStep = this.guideStep;
    this.reviewingGuide = true;
    this.openGuide(id);
  }
  private openGuide(id: GuideId) {
    this.guideStep = 1;
    this.show({id, gesture: "tap"});
  }
  closeGuideReview() {
    if (!this.reviewingGuide) return;
    this.active = this.previousLesson;
    this.previousLesson = null;
    this.reviewingGuide = false;
    this.guideStep = this.previousGuideStep;
    this.previousGuideStep = 0;
  }
  turnGuide(delta: -1 | 1) {
    if (this.guide) this.guideStep = Math.max(1, Math.min(3, this.guideStep + delta));
  }
  finishGuide() {
    const guide = this.guide;
    if (!guide || this.guideStep !== 3) return;
    if (this.reviewingGuide) this.closeGuideReview();
    else { this.guideStep = 0; this.complete(guide); }
  }
  private seen: Set<string>;
  private runSeen: Set<string>;
  private cooldown = 0;
  private handled = new Set<string>();
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
  resetRun(_game: RunnerGame) {
    this.runSeen = new Set(this.testMode ? [] : this.seen);
    if (this.needsBasics) basics.forEach((id) => this.runSeen.delete(id));
    this.active = null;
    this.guideStep = 0; this.reviewingGuide = false; this.previousLesson = null; this.previousGuideStep = 0;
    this.cooldown = 0;
    this.handled.clear();
  }
  complete(id: LessonId) {
    if (this.active?.id === id && this.active.encounter)
      this.handled.add(this.active.encounter);
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
  private canTeach(id: LessonId, encounter: string) {
    if (["jump", "slide", "dodge"].includes(id) && !this.testMode) return false;
    return !this.knows(id) || (this.testMode && !this.handled.has(encounter));
  }
  action(direction: Direction, game: RunnerGame, accepted: boolean) {
    if (!this.active) return;
    const id = this.active.id;
    if (this.guide) return;
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
    if (this.guide) return 0;
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
        onPath(item, game.x),
    );
    return (target && target.z < game.baseSpeed * 0.3) || near ? 0 : 0.08;
  }
  update(game: RunnerGame, dt: number, _boosterUnlocked: boolean) {
    if (game.mode !== "running") return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.active) {
      const id = this.active.id;
      if (id === "booster" && game.boosting) this.complete(id);
      else if (id === "wallEntry" && game.wallSide) this.complete(id);
      return;
    }
    if (this.cooldown > 0 || game.boosting) return;
    if (game.inSnow && !this.knows("snow")) {
      this.openGuide("snow"); return;
    }
    if (this.needsBasics && !this.knows("move") && game.distance < 6) {
      this.show({ id: "move", gesture: "left" });
      return;
    }
    if (game.swimming && !game.transitioning && !this.knows("ocean")) {
      const inEntryBuffer = game.distance < game.terrain.start + CONFIG.waterSafety;
      const safeAhead = !game.items.some(item =>
        (item.type === "bubble" || item.type === "coral" || item.type === "volcano" || item.type === "fish") &&
        item.z > -8 && item.z < Math.max(26, game.speed));
      if (inEntryBuffer || safeAhead) {
        this.openGuide("ocean");
        return;
      }
    }
    const gapKey = String(game.gapWarning?.id ?? game.distance);
    if (game.wallSide && this.canTeach("wallHeight", `height/${gapKey}`)) {
      this.show({
        id: "wallHeight",
        gesture: game.wallLevel < 2 ? "up" : "down",
        encounter: `height/${gapKey}`,
      });
      return;
    }
    if (
      !game.wallSide &&
      this.canTeach("wallEntry", `entry/${gapKey}`) &&
      game.gapWarning &&
      game.distance >= game.gapWarning.start - 13
    ) {
      this.show({
        id: "wallEntry",
        gesture: game.lane > 0 ? "right" : "left",
        encounter: `entry/${gapKey}`,
      });
      return;
    }
    const obstacle = game.items
      .filter(
        (item) =>
          ["log", "arch", "rock"].includes(item.type) &&
          item.z > 0 &&
          item.z <= game.baseSpeed * 0.58 &&
          onPath(item, game.x),
      )
      .sort((a, b) => a.z - b.z)[0];
    if (obstacle) {
      const id =
        obstacle.type === "log"
          ? "jump"
          : obstacle.type === "arch"
            ? "slide"
            : "dodge";
      if (this.canTeach(id, `obstacle/${obstacle.id}`)) {
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
          encounter: `obstacle/${obstacle.id}`,
        });
        return;
      }
    }
  }
}
