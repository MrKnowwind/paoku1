import { test } from "node:test";
import assert from "node:assert/strict";
import { RunnerGame } from "./game.ts";
import { Tutorial } from "./tutorial.ts";

const activeLesson = (tutorial: Tutorial) => tutorial.active?.id;

test("opening lesson keeps slow motion until the matching accepted gesture", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  let stored: string[] = [];
  const tutorial = new Tutorial([], (seen) => {
    stored = seen;
  });
  tutorial.resetRun(game);
  tutorial.update(game, 0.1, false);
  assert.equal(tutorial.active?.id, "move");
  tutorial.update(game, 120, false);
  assert.equal(
    tutorial.active?.id,
    "move",
    "waiting must never dismiss a lesson",
  );
  assert.ok(tutorial.timeScale(game) < 1);
  tutorial.action("right", game, game.move(1));
  assert.equal(tutorial.active?.id, "move");
  tutorial.action("left", game, game.move(-1));
  assert.equal(tutorial.active?.id, "move");
  tutorial.action("left", game, game.move(-1));
  assert.equal(tutorial.active, null);
  assert.equal(tutorial.timeScale(game), 1);
  assert.equal(stored.includes("basics"), false);
});

test("new obstacle lessons trigger only nearby and completed lessons persist across runs", () => {
  const saved = ["basics", "move", "jump", "slide", "dodge", "coin"];
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  const normal = new Tutorial(saved, () => {});
  normal.resetRun(game);
  const log = game.addItem("log", 0, 5);
  normal.update(game, 0.1, false);
  assert.equal(normal.active, null);
  const replay = new Tutorial(saved, () => {}, true);
  game.distance = 20;
  log.worldZ = 25;
  log.z = 5;
  replay.resetRun(game);
  replay.update(game, 0.1, false);
  assert.equal(activeLesson(replay), "jump");
  replay.update(game, 120, false);
  assert.equal(activeLesson(replay), "jump");
  replay.action("jump", game, false);
  assert.equal(activeLesson(replay), "jump");
  replay.action("jump", game, game.jump());
  assert.equal(replay.active, null);
  game.items = [];
  game.addItem("log", 0, 6);
  replay.update(game, 0.8, false);
  assert.equal(
    activeLesson(replay),
    "jump",
    "test mode repeats for a new obstacle encounter",
  );
  replay.resetRun(game);
  replay.update(game, 0.1, false);
  assert.equal(activeLesson(replay), "jump");
});

test("automatic powers still wait for player input before restoring speed", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  const tutorial = new Tutorial(
    ["basics", "move", "jump", "slide", "dodge", "coin"],
    () => {},
  );
  tutorial.resetRun(game);
  game.addItem("shield", 0, 1);
  game.update(0.1);
  tutorial.update(game, 0.1, false);
  assert.equal(tutorial.active?.id, "shield");
  tutorial.update(game, 120, false);
  assert.ok(tutorial.timeScale(game) < 1);
  game.distance = 802;
  assert.equal(
    tutorial.timeScale(game),
    0,
    "waiting near the first chasm must stay safe",
  );
  game.wallSide = -1;
  tutorial.action("left", game, game.move(-1));
  assert.equal(tutorial.active, null);
  assert.equal(tutorial.timeScale(game), 1);
});
