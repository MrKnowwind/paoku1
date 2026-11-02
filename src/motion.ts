import type { RunnerGame } from "./game.ts";

export class RunnerMotion {
  pose = {
    slide: 0,
    hipY: 0.95,
    phase: 0,
    landing: 0,
    turn: 0,
    death: 0,
    run: 0,
  };
  private airborne = false;
  private distance = 0;
  update(game: RunnerGame, dt: number) {
    if (game.mode === "paused") return this.pose;
    if (game.distance < this.distance || game.mode === "ready") {
      this.airborne = false;
      this.pose.death = 0;
      this.pose.landing = 0;
    }
    this.distance = game.distance;
    if (game.mode !== "over")
      this.pose.phase +=
        dt * (game.mode === "running" ? 9 + game.speed * 0.35 : 1.8);
    this.pose.landing *= Math.exp(-dt * 15);
    if (this.airborne && game.y === 0) this.pose.landing = 1;
    this.airborne = game.y > 0;
    this.pose.slide +=
      ((game.sliding && game.mode !== "ready" ? 1 : 0) - this.pose.slide) *
      (1 - Math.exp(-dt * 22));
    this.pose.run +=
      ((game.mode === "running" && game.y === 0 ? 1 : 0) - this.pose.run) *
      (1 - Math.exp(-dt * 12));
    this.pose.turn +=
      ((game.lane * 2.5 - game.x) / 2.5 - this.pose.turn) *
      (1 - Math.exp(-dt * 14));
    this.pose.death +=
      ((game.mode === "over" ? 1 : 0) - this.pose.death) *
      (1 - Math.exp(-dt * 6));
    this.pose.hipY =
      0.95 -
      this.pose.slide * 0.57 -
      this.pose.landing * 0.14 +
      Math.cos(this.pose.phase * 2) *
        0.025 *
        this.pose.run *
        (1 - this.pose.slide);
    return this.pose;
  }
}
