import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "./config.ts";
import { RunnerGame } from "./game.ts";
import { Tutorial } from "./tutorial.ts";
import { TrackPlan, coreBiomes, connection, terrainChoices, snowBlend, waterBlend, obstacleAllowed } from "./track.ts";
import { winterGroundHeight, winterShoulder } from "./snow-layout.ts";
import { iceFallPose, sipPose } from "./winter-motion.ts";
import { coastWeights, coastFloor } from "./coast-layout.ts";

function snowGame(autoSpawn = false) {
  const game = new RunnerGame({autoSpawn, random: () => 0.5});
  game.nextTerrain = "snow"; game.start(); game.distance = 680;
  return game;
}

test("terrain pools unlock by selection distance and every directed pair has a safe connector", () => {
  assert.deepEqual(terrainChoices("forest", 599), ["forest"]);
  assert.deepEqual(terrainChoices("forest", 600), ["canyon"]);
  assert.ok(!terrainChoices("canyon", 1599).includes("water"));
  assert.ok(terrainChoices("canyon", 1600).includes("water"));
  assert.ok(!terrainChoices("forest", 2599).includes("snow"));
  assert.ok(terrainChoices("forest", 2600).includes("snow"));
  for (const from of coreBiomes) for (const to of coreBiomes) {
    const bridge = connection(from, to);
    if (from === to) assert.equal(bridge.length, 0);
    else {
      assert.equal(bridge.length, 1);
      assert.equal(bridge[0].biome, from === "water" ? "shore" : to === "water" ? "beach" : from === "snow" || to === "snow" ? "snow-transition" : "tunnel");
    }
  }
});

test("seeded append-only planning survives out-of-order queries and forest overrides do not leak", () => {
  for (let seed = 1; seed < 30; seed++) {
    const a = new TrackPlan(seed), b = new TrackPlan(seed);
    a.at(20000);
    for (let d = 0; d <= 20000; d += 23) assert.deepEqual(a.at(d), b.at(d));
    const committed = JSON.stringify(a.sections);
    a.at(300); a.at(1800); a.at(15000);
    assert.equal(JSON.stringify(a.sections), committed);
    for (const section of a.sections.filter(s => coreBiomes.includes(s.biome as typeof coreBiomes[number]))) {
      if (section.start === 0) continue;
      const previous = a.sections.find(s => s.cycle === section.cycle - 1 && coreBiomes.includes(s.biome as typeof coreBiomes[number]))!;
      assert.ok(CONFIG.terrainUnlock[section.biome as typeof coreBiomes[number]] <= previous.end);
      assert.notEqual(section.biome, previous.biome);
    }
  }
  for (const forced of coreBiomes) {
    const plan = new TrackPlan(7, forced); plan.at(8000);
    const cores = plan.sections.filter(s => coreBiomes.includes(s.biome as typeof coreBiomes[number]));
    assert.equal(cores[1].biome, forced);
    for (let i = 1; i < cores.length; i++) {
      if (cores[i - 1].biome === "forest") assert.equal(cores[i].biome, forced);
      else assert.ok(terrainChoices(cores[i - 1].biome as typeof coreBiomes[number], cores[i - 1].end).includes(cores[i].biome as typeof coreBiomes[number]));
    }
  }
});

test("all 12 directed connectors preserve surface continuity and safety", () => {
  const checked = new Set<string>();
  for (let seed = 1; seed <= 16; seed++) {
    const plan = new TrackPlan(seed); plan.at(18000);
    for (const s of plan.sections.filter(s => !coreBiomes.includes(s.biome as typeof coreBiomes[number]))) {
      checked.add(`${s.from}/${s.to}`);
      assert.equal(obstacleAllowed((s.start + s.end) / 2, seed, plan), false);
      for (const boundary of [s.start, s.end]) {
        const a = coastWeights(boundary - 0.0001, plan), b = coastWeights(boundary + 0.0001, plan);
        if (s.biome !== "tunnel") a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 0.001));
        assert.ok(Math.abs(coastFloor(boundary - 0.0001, plan) - coastFloor(boundary + 0.0001, plan)) < 0.001);
        assert.ok(Math.abs(snowBlend(boundary - 0.0001, plan) - snowBlend(boundary + 0.0001, plan)) < 0.001);
        assert.ok(Math.abs(waterBlend(boundary - 0.0001, plan) - waterBlend(boundary + 0.0001, plan)) < 0.001);
      }
    }
  }
  assert.equal(checked.size, 12);
  const game = snowGame(); game.distance = 620; game.update(0.5); assert.equal(game.cold, 0);
});

test("cold freezes during pause and teaching, warms before the cap check, and clears on exit", () => {
  const game = snowGame(); game.update(1); assert.ok(Math.abs(game.cold - 2.25) < 0.001);
  game.pause(); game.update(5); assert.ok(Math.abs(game.cold - CONFIG.coldRate) < 0.001); game.resume();
  game.cold = 99.999; game.addItem("liquor", 0, 0.2); game.update(0.01);
  assert.equal(game.mode, "running"); assert.ok(game.cold < 66); assert.ok(game.drinkTime > 0);
  game.cold = 99.999; game.update(0.01); assert.equal(game.lastHit, "cold");
  game.start(); game.distance = 1259.99; game.cold = 80; game.update(0.01); assert.equal(game.cold, 0);
});

test("soft snow is a one-time cold penalty; shields only block physical snow obstacles", () => {
  for (const [type, amount] of [["snowdrift", CONFIG.snowdriftCold], ["snowman", CONFIG.snowmanCold]] as const) {
    const game = snowGame(); game.shield = true; game.protectionTime = 5; game.addItem(type, 0, 0);
    game.update(0.02); assert.equal(game.mode, "running"); assert.ok(game.cold >= amount && game.cold < amount + 0.1); assert.equal(game.shield, true);
    game.update(0.05); assert.ok(game.cold < amount + 0.2);
  }
  for (const type of ["pool", "fire"] as const) {
    const game = snowGame(); game.shield = true; game.protectionTime = 5; game.addItem(type, 0, 0);
    game.update(0.01); assert.equal(game.lastHit, type);
  }
  for (const type of ["stump", "snow-log"] as const) {
    const game = snowGame(); game.shield = true; game.addItem(type, 0, 0); game.update(0.01);
    assert.equal(game.mode, "running"); assert.equal(game.shield, false);
  }
});

test("ice freezes lateral motion and all active controls for exactly one controlled slide", () => {
  const game = snowGame(); game.move(1); game.addItem("ice", 0, 0); game.update(0.01);
  assert.ok(game.icy); const x = game.x, start = game.distance;
  assert.equal(game.move(-1), false); assert.equal(game.jump(), false); assert.equal(game.slide(), false);
  let spent = 0; assert.equal(game.activateBooster(true, () => {spent++; return true;}), false); assert.equal(spent, 0);
  game.update(0.3); assert.equal(game.x, x); assert.ok(game.cold > 0);
  while (game.icy) game.update(0.01);
  assert.ok(game.distance - start >= CONFIG.iceDistance);
  assert.ok(game.distance - start < CONFIG.iceDistance + game.baseSpeed * (CONFIG.iceRecovery + 0.03));
  assert.equal(game.jump(), true);
  const airborne = snowGame(); airborne.jump(); airborne.addItem("ice", 0, 8); airborne.update(0.3); assert.equal(airborne.icy, false);
});

test("fire rewards a completed normal jump, while passing beside it or flying does not", () => {
  const game = snowGame(); game.cold = 60; game.jump(); game.addItem("fire", 0, 9); game.update(0.6);
  assert.equal(game.mode, "running"); assert.ok(game.cold < 37);
  const side = snowGame(); side.cold = 60; side.addItem("fire", 1, 1); side.update(0.2); assert.ok(side.cold > 60);
  const flying = snowGame(); flying.cold = 60; flying.activateBooster(true);
  flying.addItem("ice", 0, 1); flying.addItem("fire", 0, 2); flying.addItem("pool", 0, 4); flying.addItem("liquor", 0, 6);
  flying.update(0.5); assert.equal(flying.cold, 60); assert.equal(flying.icy, false); assert.equal(flying.drinkTime, 0); assert.equal(flying.mode, "running");
});

test("snow planning includes a soft introduction, visible lethal combos, warming and a complete bypass", () => {
  const combinations = new Set<string>();
  const iceWidths = new Set<number>();
  for (let seed = 1; seed <= 30; seed++) {
    const game = new RunnerGame({random: () => seed / 31}); game.nextTerrain = "snow"; game.start();
    const hazards = new Map<number, typeof game.items[number]>();
    for (let d = 680; d < 1130; d += 32) {
      game.distance = d; game.lane = game.x = 0; game.protectionTime = 10;
      game.update(0.001);
      for (const item of game.items) hazards.set(item.id, {...item});
      // Inspect future rows without simulating a player's choices through them.
      game.mode = "running";
    }
    const items = [...hazards.values()];
    const liquor = items.filter(i => i.type === "liquor").sort((a,b) => a.worldZ-b.worldZ);
    assert.ok(liquor.length >= 4);
    for (let i = 1; i < liquor.length; i++) assert.equal(liquor[i].worldZ - liquor[i-1].worldZ, CONFIG.snowWarmSpacing);
    const ice = items.filter(i => i.type === "ice").sort((a,b) => a.worldZ-b.worldZ);
    assert.ok(ice.length > 0);
    for (const z of new Set(ice.map(i => i.worldZ))) {
      const patches = ice.filter(i => i.worldZ === z);
      iceWidths.add(patches.length);
      assert.equal(new Set(patches.map(i => i.lane)).size, patches.length);
      const followup = items.filter(i => i.worldZ === z + 18);
      assert.equal(followup.length, 2);
      assert.ok(followup.every(i => i.lane !== liquor[0].lane));
      for (const item of followup) combinations.add(item.type);
      assert.equal(items.some(i => ["pool", "fire", "stump", "snow-log"].includes(i.type) &&
        i.lane === liquor[0].lane && i.worldZ >= z && i.worldZ < z + CONFIG.iceDistance + 18), false);
    }
    assert.equal(ice.filter(i => i.worldZ === ice[0].worldZ).length, 2);
    assert.deepEqual(items.filter(i => i.worldZ === ice[0].worldZ + 18).map(i => i.type).sort(), ["snowdrift", "snowman"]);
  }
  assert.deepEqual([...iceWidths].sort(), [2, 3]);
  assert.deepEqual([...combinations].sort(), ["fire", "pool", "snowdrift", "snowman", "stump"]);
});

test("seeded blizzard increases passive cold by 50 percent and clears when leaving snow", () => {
  const game = snowGame();
  let stormDistance = 0;
  for (let d = 660; d < 1260; d++) {
    game.distance = d;
    if (game.blizzard === 1) { stormDistance = d + 5; break; }
  }
  assert.ok(stormDistance > 805 && stormDistance < 1000);
  game.distance = stormDistance;
  game.update(0.5);
  assert.ok(Math.abs(game.cold - 0.5 * 3.375) < 0.001);
  const duplicate = snowGame();
  duplicate.distance = stormDistance;
  assert.equal(duplicate.blizzard, 1);
  game.distance = 1260;
  game.update(0.01);
  assert.equal(game.blizzard, 0);
  assert.equal(game.cold, 0);
});

test("three real-model lesson steps freeze cold and timers and persist only on final confirmation", () => {
  const game = snowGame(); game.magnetTime = 6; game.boostCooldown = 20;
  let saved: string[] = [];
  const tutorial = new Tutorial(["basics", "move", "swim"], seen => {saved = seen;}); tutorial.resetRun(game);
  tutorial.update(game, 0.1, false); assert.equal(tutorial.guideStep, 1);
  for (let i = 0; i < 3; i++) {
    game.update(10 * tutorial.timeScale(game)); assert.equal(game.cold, 0); assert.equal(game.magnetTime, 6); assert.equal(game.boostCooldown, 20);
    assert.equal(saved.includes("snow"), false); tutorial.turnGuide(1);
  }
  assert.equal(saved.includes("snow"), false);
  tutorial.finishGuide();
  assert.ok(saved.includes("snow") && saved.includes("swim")); assert.equal(tutorial.active, null);
  tutorial.resetRun(game); tutorial.update(game, 1, false); assert.equal(tutorial.active, null);
  tutorial.reviewGuide("snow"); tutorial.turnGuide(1); tutorial.turnGuide(1); tutorial.finishGuide(); assert.ok(tutorial.knows("snow"));
  tutorial.testMode = true; tutorial.resetRun(game); tutorial.update(game, 1, false); assert.equal(tutorial.guideStep, 1);
});

test("rewind restores historical cold without replaying liquor or fire warmth and avoids uncontrolled revival", () => {
  const game = snowGame(); game.cold = 70; game.addItem("liquor", 0, 12);
  game.update(3.4); const after = game.cold;
  game.addItem("pool", 0, 1); game.update(0.01); assert.equal(game.lastHit, "pool");
  assert.equal(game.useHourglass(() => true), true); game.update(CONFIG.rewindDuration + 0.01);
  assert.equal(game.mode, "running"); assert.equal(game.icy, false); assert.ok(game.cold > after);
  assert.equal(game.items.some(i => i.type === "liquor"), false); assert.ok(game.coldGrace >= 2);
  const cold = game.cold; game.update(1); assert.equal(game.cold, cold);
  assert.equal(game.hourglassUsed, true);
});


test("closing the snow review preserves the interrupted lesson without marking snow as learned", () => {
  const game = new RunnerGame({autoSpawn: false}); game.start();
  let saved: string[] = [];
  const tutorial = new Tutorial([], seen => {saved = seen;});
  tutorial.update(game, 0, false); assert.equal(tutorial.active?.id, "move");
  tutorial.reviewGuide("snow"); tutorial.turnGuide(1); assert.equal(tutorial.guideStep, 2);
  tutorial.closeGuideReview();
  assert.equal(tutorial.active?.id, "move"); assert.equal(tutorial.guideStep, 0);
  assert.equal(tutorial.knows("snow"), false); assert.deepEqual(saved, []);
});


test("snow accumulates at the verge while the forest join and runnable road stay level", () => {
  const plan = new TrackPlan(4, "snow");
  const entry = CONFIG.forestLength, exit = entry + CONFIG.snowTransition;
  assert.equal(winterShoulder(11, entry, plan), 0);
  assert.equal(winterShoulder(11, exit, plan), 1);
  for (let distance = entry; distance <= exit; distance += 3) {
    const cover = snowBlend(distance, plan);
    assert.equal(winterGroundHeight(2.5, distance, cover, 4.3), 0.06);
    assert.ok(winterShoulder(11, distance, plan) >= winterShoulder(0, distance, plan));
  }
  assert.equal(winterGroundHeight(11, entry, 0, 4.3), 0);
  assert.ok(winterGroundHeight(40, exit, 1, 4.3) > 2);
});

test("ice and drink poses ease in and recover to the running pose", () => {
  assert.deepEqual(iceFallPose(CONFIG.iceDistance, 0), {brace: 0, fall: 0, rise: 0});
  const brace = iceFallPose(CONFIG.iceDistance - 2, 0);
  assert.ok(brace.brace > brace.fall);
  assert.deepEqual(iceFallPose(1, 0), iceFallPose(0, CONFIG.iceRecovery));
  assert.ok(iceFallPose(0, CONFIG.iceRecovery / 2).rise > 0);
  assert.deepEqual(iceFallPose(0, 0), {brace: 0, fall: 0, rise: 0});
  assert.deepEqual(sipPose(CONFIG.drinkDuration), {lift: 0, swallow: 0});
  assert.equal(sipPose(CONFIG.drinkDuration / 2).swallow, 1);
  assert.deepEqual(sipPose(0), {lift: 0, swallow: 0});
});
