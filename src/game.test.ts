import { test } from "node:test";
import assert from "node:assert/strict";
import { RunnerGame, INTRO_TIMING } from "./game.ts";

test("home and countdown stay empty; generation starts after the launch run", () => {
  const game = new RunnerGame({ random: () => 0.5 });
  assert.equal(game.mode, "ready");
  assert.equal(game.items.length, 0);
  game.begin();
  assert.equal(game.items.length, 0);
  game.update(
    Object.values(INTRO_TIMING).reduce((sum, value) => sum + value, 0),
  );
  assert.equal(game.mode, "running");
  assert.equal(game.items.length, 0);
  assert.equal(game.distance, 0);
  assert.equal(game.speed, 0);
  game.update(0.2);
  assert.ok(game.speed > 0 && game.speed < 12);
  assert.ok(game.distance > 0);
  const speed = game.speed;
  game.pause();
  game.update(1);
  assert.equal(game.speed, speed);
  game.resume();
  game.update(1);
  assert.equal(game.launchProgress, 1);
  assert.ok(game.speed >= 12);
  assert.ok(game.items.length > 0);
  assert.ok(game.items.every(item => item.worldZ > game.distance + 30));
  game.returnHome();
  assert.equal(game.items.length, 0);
});

test("starts in the middle lane and never leaves the three lanes", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  assert.equal(game.lane, 0);
  game.move(-1);
  game.move(-1);
  assert.equal(game.lane, -1);
  game.move(1);
  game.move(1);
  game.move(1);
  assert.equal(game.lane, 1);
  game.update(1);
  assert.ok(game.distance > 0);
});

test("lane changes ease into motion and settle without overshooting", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  game.move(1);
  game.update(0.02);
  assert.ok(game.x > 0 && game.x < 0.3);
  game.update(0.35);
  assert.ok(game.x > 2.3 && game.x <= 2.5);
  game.move(-1);
  game.move(-1);
  for (let i = 0; i < 90; i++) {
    game.update(1 / 120);
    assert.ok(game.x >= -2.5 && game.x <= 2.5);
  }
  assert.ok(game.x < -2.49);
});

test("a jump clears a log and lands; staying on the ground causes a collision", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  game.addItem("log", 0, 3);
  game.jump();
  game.update(0.45);
  assert.equal(game.mode, "running");
  assert.ok(game.y > 0);
  game.update(0.6);
  assert.equal(game.y, 0);
  game.addItem("log", 0, 2);
  game.update(0.4);
  assert.equal(game.mode, "over");
});

test("sliding clears a low arch and expires; a standing runner hits it", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  game.addItem("arch", 0, 3);
  game.slide();
  game.update(0.4);
  assert.equal(game.mode, "running");
  assert.ok(game.sliding);
  game.update(0.6);
  assert.equal(game.sliding, false);
  game.addItem("arch", 0, 3);
  game.update(0.4);
  assert.equal(game.mode, "over");
});

test("jump interrupts a slide immediately without granting a midair double jump", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  assert.equal(game.slide(), true);
  game.update(0.1);
  assert.equal(game.jump(), true);
  assert.equal(game.sliding, false);
  game.update(0.08);
  assert.ok(game.y > 0.5);
  assert.equal(game.jump(), false);
});

test("downward input cancels ascent and starts a full slide on landing", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  game.jump();
  game.update(0.2);
  const height = game.y;
  assert.equal(game.slide(), true);
  assert.equal(game.y, height);
  assert.ok(game.velocity <= -20);
  assert.equal(game.fastFalling, true);
  assert.equal(game.slideTime, 0);
  assert.equal(game.slide(), false);
  game.pause();
  game.update(0.5);
  assert.equal(game.y, height);
  assert.equal(game.fastFalling, true);
  game.resume();
  game.update(0.25);
  assert.equal(game.y, 0);
  assert.equal(game.fastFalling, false);
  assert.ok(game.slideTime > 0.5 && game.slideTime <= 0.75);
  assert.equal(game.jump(), true);
  assert.equal(game.sliding, false);
});

test("opposite input before the next frame cancels takeoff and restart clears fast fall", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  game.jump();
  game.slide();
  game.update(1 / 120);
  assert.equal(game.y, 0);
  assert.equal(game.sliding, true);
  game.jump();
  game.update(0.1);
  game.slide();
  game.start();
  assert.equal(game.fastFalling, false);
  assert.equal(game.slideTime, 0);
});

test("collects a coin once, avoids another lane, and freezes while paused", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  game.addItem("coin", 0, 2);
  game.addItem("rock", -1, 2);
  game.update(0.3);
  assert.equal(game.coins, 1);
  assert.equal(game.mode, "running");
  const distance = game.distance;
  game.pause();
  game.update(1);
  game.move(-1);
  game.jump();
  assert.equal(game.distance, distance);
  assert.equal(game.lane, 0);
  game.resume();
  game.update(0.5);
  assert.equal(game.coins, 1);
  game.start();
  assert.equal(game.coins, 0);
  assert.equal(game.distance, 0);
});

test("a boulder ends the run and speed increases within its limit", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  const initial = game.speed;
  game.update(20);
  assert.ok(game.speed > initial && game.speed <= 24);
  game.addItem("rock", 0, 2);
  game.update(0.5);
  assert.equal(game.mode, "over");
  const distance = game.distance;
  game.update(1);
  assert.equal(game.distance, distance);
});

test("generated obstacle rows always leave an open lane", () => {
  const game = new RunnerGame({ random: () => 0.5 });
  game.start();
  game.update(0.8);
  assert.ok(game.items.some((item) => item.type === "coin"));
  const rows = new Map<number, Set<number>>();
  for (const item of game.items.filter((item) => item.type !== "coin")) {
    if (!rows.has(item.z)) rows.set(item.z, new Set());
    rows.get(item.z)!.add(item.lane);
  }
  assert.ok(rows.size > 0);
  assert.ok([...rows.values()].every((lanes) => lanes.size <= 2));
});


test("separate runs generate different obstacle and coin layouts", () => {
  let seed = 0;
  const game = new RunnerGame({random: () => ++seed / 10});
  const layout = () => {
    game.start(); game.update(0.8);
    return game.items.map(item => [item.type, item.lane, item.worldZ]);
  };
  const first = layout();
  assert.ok(first.length > 0);
  assert.notDeepEqual(layout(), first);
});
