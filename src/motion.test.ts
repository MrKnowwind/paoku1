import { test } from "node:test";
import assert from "node:assert/strict";
import { RunnerGame } from "./game.ts";
import { RunnerMotion } from "./motion.ts";

test("slide eases into a crouched pose and recovers without flattening the character", () => {
  const game = new RunnerGame({ autoSpawn: false });
  const motion = new RunnerMotion();
  game.start();
  motion.update(game, 0.1);
  game.slide();
  const first = motion.update(game, 1 / 60);
  assert.ok(first.slide > 0 && first.slide < 0.8);
  for (let i = 0; i < 15; i++) motion.update(game, 1 / 60);
  assert.ok(motion.pose.slide > 0.95);
  assert.ok(motion.pose.hipY < 0.5);
  game.update(1);
  for (let i = 0; i < 30; i++) motion.update(game, 1 / 60);
  assert.ok(motion.pose.slide < 0.01);
  assert.ok(motion.pose.hipY > 0.85);
});

test("joint animation freezes on pause and a landing pulse occurs only after flight", () => {
  const game = new RunnerGame({ autoSpawn: false });
  const motion = new RunnerMotion();
  game.start();
  motion.update(game, 0.1);
  assert.equal(motion.pose.landing, 0);
  game.jump();
  for (let i = 0; i < 18; i++) {
    game.update(1 / 60);
    motion.update(game, 1 / 60);
  }
  game.pause();
  const paused = { ...motion.pose };
  motion.update(game, 0.5);
  assert.deepEqual(motion.pose, paused);
  game.resume();
  let landed = false;
  for (let i = 0; i < 60; i++) {
    game.update(1 / 60);
    motion.update(game, 1 / 60);
    if (motion.pose.landing > 0.8) landed = true;
  }
  assert.ok(landed);
  for (let i = 0; i < 60; i++) motion.update(game, 1 / 60);
  assert.ok(motion.pose.landing < 0.01);
});

test("returning to the menu restores the idle pose even during a slide", () => {
  const game = new RunnerGame({ autoSpawn: false });
  const motion = new RunnerMotion();
  game.start();
  game.slide();
  for (let i = 0; i < 20; i++) motion.update(game, 1 / 60);
  game.mode = "ready";
  for (let i = 0; i < 30; i++) motion.update(game, 1 / 60);
  assert.ok(motion.pose.slide < 0.01);
  assert.ok(motion.pose.hipY > 0.9);
});
