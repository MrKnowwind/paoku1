import { test } from "node:test";
import assert from "node:assert/strict";
import { RunnerGame } from "./game.ts";
import { Tutorial } from "./tutorial.ts";
import { CONFIG } from "./config.ts";

const activeLesson = (tutorial: Tutorial) => tutorial.active?.id;

test("nightfall does not interrupt play with a monster guide", () => {
  const game = new RunnerGame({autoSpawn:false});game.start(true);
  const tutorial = new Tutorial(["basics","move"],()=>{});
  tutorial.update(game,0,false);
  assert.equal(tutorial.active,null);
  assert.equal(tutorial.timeScale(game),1);
});

test("ocean guide waits for swimming controls and saves only on explicit completion", () => {
  const game = new RunnerGame({autoSpawn: false});
  game.nextTerrain = "water";
  game.start();
  const shore = CONFIG.forestLength + CONFIG.beachLength;
  const stored = ["move", "basics", "swim"];
  let saved = stored;
  const tutorial = new Tutorial(stored, seen => { saved = seen; });
  game.distance = shore + 10;
  tutorial.update(game, 0.1, false);
  assert.equal(activeLesson(tutorial), undefined);
  game.distance = shore + 23;
  tutorial.update(game, 0.1, false);
  assert.equal(activeLesson(tutorial), "ocean");
  const distance = game.distance;
  const time = game.worldTime;
  game.update(1 * tutorial.timeScale(game));
  assert.equal(game.distance, distance);
  assert.equal(game.worldTime, time);
  tutorial.turnGuide(1);
  tutorial.turnGuide(-1);
  assert.equal(tutorial.guideStep, 1);
  tutorial.finishGuide();
  assert.equal(activeLesson(tutorial), "ocean");
  tutorial.turnGuide(1);
  tutorial.turnGuide(1);
  tutorial.turnGuide(1);
  assert.equal(tutorial.guideStep, 3);
  assert.deepEqual(saved, stored);
  tutorial.finishGuide();
  assert.ok(saved.includes("ocean"));
  tutorial.resetRun(game);
  tutorial.update(game, 1, false);
  assert.equal(activeLesson(tutorial), undefined);
  tutorial.testMode = true;
  tutorial.resetRun(game);
  tutorial.update(game, 1, false);
  assert.equal(activeLesson(tutorial), "ocean");
});

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


test("regional attacks never open a monster guide, and terrain help remains available", () => {
  const game = new RunnerGame({autoSpawn:false});game.start(true);
  const tutorial=new Tutorial(["basics","move"],()=>{});
  game.nightCombat.region.state.attacks.push({id:1,enemy:1,kind:"small",start:game.worldTime,
    lockAt:game.worldTime,impactAt:game.worldTime+1.2,x:0,y:0.95,worldZ:30,side:0,
    fromX:4,fromY:1,fromZ:8,spent:false,locked:true});
  tutorial.update(game,0,false);
  assert.equal(tutorial.active,null);assert.equal(tutorial.timeScale(game),1);
  tutorial.reviewGuide("ocean");
  for(let i=0;i<5;i++)tutorial.turnGuide(1);
  assert.equal(tutorial.guideStep,3);tutorial.finishGuide();assert.equal(tutorial.active,null);
});
