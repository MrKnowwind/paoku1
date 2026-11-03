import { test } from "node:test";
import assert from "node:assert/strict";
import { RunnerGame } from "./game.ts";
import { Tutorial } from "./tutorial.ts";

const activeLesson = (tutorial: Tutorial) => tutorial.active?.id;

test("ordinary shelves do not interrupt play with first-encounter guidance", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  game.distance = 700;
  game.lane = 1;
  game.x = 2.5;
  const item = game.addItem("arch", 0, 5);
  item.shelf = { side: 1, laneCount: 2 };
  const tutorial = new Tutorial([], () => {});
  tutorial.resetRun(game);
  tutorial.update(game, 0.1, false);
  assert.equal(tutorial.active, null);
});

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
  assert.equal(stored.includes("basics"), true);
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

test("pickups and unlocked powers do not interrupt play with tutorials", () => {
  for (const testMode of [false, true]) {
    for (const type of ["shield", "magnet", "coin"] as const) {
      const game = new RunnerGame({ autoSpawn: false });
      game.start();
      game.distance = 30;
      const tutorial = new Tutorial(
        ["basics", "move", "jump", "slide", "dodge"], () => {}, testMode,
      );
      tutorial.resetRun(game);
      game.addItem(type, 0, 1);
      game.update(0.1);
      tutorial.update(game, 0.1, true);
      assert.equal(tutorial.active, null);
      assert.equal(tutorial.timeScale(game), 1);
      tutorial.update(game, 120, true);
      assert.equal(tutorial.active, null);
    }
  }
});


test("first encounters with ordinary obstacles never start lessons", () => {
  for (const type of ["log", "arch", "rock"] as const) {
    const game = new RunnerGame({ autoSpawn: false });
    game.start();
    game.distance = 30;
    game.addItem(type, 0, 5);
    const tutorial = new Tutorial([], () => {});
    tutorial.resetRun(game);
    tutorial.update(game, 0.1, false);
    assert.equal(tutorial.active, null);
    assert.equal(tutorial.timeScale(game), 1);
  }
});
