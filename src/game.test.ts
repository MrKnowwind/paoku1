import { test } from "node:test";
import assert from "node:assert/strict";
import { RunnerGame } from "./game.ts";

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
  assert.ok(game.items.some((item) => item.type === "coin"));
  const rows = new Map<number, Set<number>>();
  for (const item of game.items.filter((item) => item.type !== "coin")) {
    if (!rows.has(item.z)) rows.set(item.z, new Set());
    rows.get(item.z)!.add(item.lane);
  }
  assert.ok(rows.size > 0);
  assert.ok([...rows.values()].every((lanes) => lanes.size <= 2));
});
