import type { RunnerGame } from "./game.ts";

export class RunnerMotion {
  pose = {
    swim: 0,
    slide: 0,
    dive: 0,
    hipY: 0.95,
    phase: 0,
    landing: 0,
    turn: 0,
    death: 0,
    run: 0,
    air: 0,
  };
  private airborne = false;
  private distance = 0;
  update(game: RunnerGame, dt: number) {
    if (game.mode === "paused") return this.pose;
    if (game.mode === "ready" || game.introducing) {
      const pose = this.pose;
      pose.swim = pose.slide = pose.dive = pose.phase = pose.landing = 0;
      pose.turn = pose.death = pose.run = pose.air = 0;
      pose.hipY = 0.95;
      this.airborne = false;
      this.distance = game.distance;
      return pose;
    }
    if (game.distance < this.distance) {
      this.airborne = false;
      this.pose.death = 0;
      this.pose.landing = 0;
    }
    this.distance = game.distance;
    this.pose.swim += (game.waterBlend - this.pose.swim) * (1 - Math.exp(-dt * 9));
    if (game.mode !== "over")
      this.pose.phase +=
        dt *
        (game.mode === "running"
          ? 1.8 + (7.2 + game.speed * 0.35) * game.launchProgress
          : 1.8);
    this.pose.landing *= Math.exp(-dt * 15);
    if (this.airborne && game.y === 0) this.pose.landing = 1;
    this.airborne = game.y > 0;
    const slideTarget =
      (game.sliding || game.fastFalling) && game.mode !== "ready";
    const slideResponse = game.fastFalling ? 36 : game.velocity > 0 ? 48 : 22;
    this.pose.slide +=
      ((slideTarget ? 1 : 0) - this.pose.slide) *
      (1 - Math.exp(-dt * slideResponse));
    this.pose.dive +=
      ((game.fastFalling && game.mode === "running" ? 1 : 0) - this.pose.dive) *
      (1 - Math.exp(-dt * 30));
    this.pose.run +=
      ((game.mode === "running" && game.y === 0 ? game.launchProgress * (1 - this.pose.swim) : 0) -
        this.pose.run) *
      (1 - Math.exp(-dt * 12));
    this.pose.air +=
      ((game.y > 0 && game.mode === "running" ? 1 : 0) - this.pose.air) *
      (1 - Math.exp(-dt * 22));
    this.pose.turn +=
      (Math.max(-1, Math.min(1, game.lateralSpeed / 17)) - this.pose.turn) *
      (1 - Math.exp(-dt * 14));
    this.pose.death +=
      ((game.mode === "over" ? 1 : 0) - this.pose.death) *
      (1 - Math.exp(-dt * 6));
    this.pose.hipY =
      0.95 -
      this.pose.slide * 0.51 -
      this.pose.landing * 0.14 * (1 - this.pose.slide) +
      Math.abs(Math.sin(this.pose.phase)) *
        0.065 *
        this.pose.run *
        (1 - this.pose.slide) *
        (1 - this.pose.air);
    return this.pose;
  }
}
