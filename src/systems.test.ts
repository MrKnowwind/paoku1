import { fishPosition, fishSafeLevel, fishWarning } from "./fish.ts";
import { coastFloor, coastWeights, coastSandUV } from "./coast-layout.ts";
import { TrackPlan } from "./track.ts";
import { makeCoral, touchesCoral, waterSafeLane } from "./coral.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "./config.ts";
import { Economy, PROGRESS_KEY } from "./economy.ts";
import { RunnerGame } from "./game.ts";
import { rockShelfSpan } from "./rock-shelf.ts";
import {
  sectionAt,
  gapAt,
  gapsNear,
  obstacleAllowed,
  tunnelDarkness,
} from "./track.ts";

// Ocean rules are tested in a directed ocean run rather than assuming the old
// fixed forest/canyon/ocean cycle. Preserve the original offset inside water.
function waterDistance(game: RunnerGame, oldDistance: number) {
  game.track = new TrackPlan(game.trackSeed, "water");
  return CONFIG.forestLength + CONFIG.beachLength + oldDistance - 1540;
}

test("wall-attached shelves block every covered lane and keep the opposite lane clear", () => {
  for (const laneCount of [1, 2, 3] as const) {
    const span = rockShelfSpan({ side: 1, laneCount });
    assert.ok(Math.abs(span.length - (4.37 + (laneCount - 1) * 2.5)) < 0.001);
    for (const lane of [-1, 0, 1]) {
      for (const sliding of [false, true]) {
        const game = new RunnerGame({ autoSpawn: false });
        game.start();
        game.distance = 700;
        game.lane = lane;
        game.x = lane * 2.5;
        const item = game.addItem("arch", 1, 4);
        item.shelf = { side: 1, laneCount };
        if (sliding) game.slide();
        game.update(0.3);
        assert.equal(
          game.mode,
          !sliding && span.lanes.includes(lane) ? "over" : "running",
        );
      }
    }
  }
});

test("booster landing respects a stone shelf extending across the centre lane", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  // Place the shelf beyond both seeded chasms and their landing buffers.
  game.distance = gapsNear(800, game.trackSeed)[1].end + 20;
  const item = game.addItem("arch", 1, 4);
  item.shelf = { side: 1, laneCount: 2 };
  game.activateBooster(true);
  game.boostRemaining = 1;
  game.update(0.04);
  assert.equal(game.boosting, true);
  game.update(0.6);
  assert.equal(game.boosting, false);
  assert.equal(game.mode, "running");
});

test("progress migrates independently and purchases atomically persist currency and goods", () => {
  const memory = new Map<string, string>([["wild-dash:best", "5000"]]);
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  const economy = new Economy(storage);
  assert.equal(economy.state.wallet, 0);
  economy.credit(500);
  assert.equal(economy.buy("booster"), "ok");
  assert.equal(economy.buy("booster"), "funds");
  assert.equal(economy.state.boosters, 1);
  assert.equal(economy.state.wallet, 200);
  assert.equal(economy.buy("hourglass"), "ok");
  assert.equal(economy.state.hourglasses, 1);
  const reloaded = new Economy(storage);
  assert.deepEqual(reloaded.state, economy.state);
  assert.equal(reloaded.consumeHourglass(), true);
  assert.equal(reloaded.consumeHourglass(), false);
  assert.equal(memory.get("wild-dash:best"), "5000");
  assert.equal(JSON.parse(memory.get(PROGRESS_KEY)!).hourglasses, 0);
  assert.equal(reloaded.buy("hourglass"), "ok");
  assert.equal(reloaded.buy("hourglass"), "funds");
  assert.equal(reloaded.state.wallet, 0);
});

test("failed purchase writes neither charge nor grant an item", () => {
  let raw: string | null = null;
  let failing = false;
  const economy = new Economy({
    getItem: () => raw,
    setItem: (_, value) => {
      if (failing) throw new Error("storage unavailable");
      raw = value;
    },
  });
  economy.credit(400);
  failing = true;
  assert.equal(economy.buy("hourglass"), "storage");
  assert.equal(economy.state.wallet, 400);
  assert.equal(economy.state.hourglasses, 0);
  assert.equal(economy.buy("booster"), "storage");
  assert.equal(economy.state.boosters, 0);
  failing = false;
  assert.equal(economy.buy("hourglass"), "ok");
  failing = true;
  assert.equal(economy.consumeHourglass(), false);
  assert.equal(economy.state.hourglasses, 1);
});

test("route boundaries, dark tunnel interiors and gap approach buffers use one plan", () => {
  assert.equal(sectionAt(599.9).biome, "forest");
  assert.equal(sectionAt(600).biome, "tunnel");
  assert.equal(sectionAt(660).biome, "canyon");
  assert.equal(sectionAt(1460).biome, "tunnel");
  assert.equal(sectionAt(1520).biome, "forest");
  assert.equal(tunnelDarkness(630), 1);
  assert.equal(tunnelDarkness(600), 0);
  assert.ok(tunnelDarkness(605) > 0 && tunnelDarkness(605) < 1);
  for (const gap of gapsNear(800)) {
    assert.equal(sectionAt(gap.start).biome, "canyon");
    assert.equal(sectionAt(gap.end).biome, "canyon");
    assert.equal(obstacleAllowed(gap.start - CONFIG.wallEntry), false);
    assert.equal(obstacleAllowed(gap.end + 10), false);
  }
});

test("magnet collects all routes and refreshes duration; pause freezes effects", () => {
  let credited = 0;
  const game = new RunnerGame({
    autoSpawn: false,
    onCoins: (count) => (credited += count),
  });
  game.start();
  game.addItem("magnet", 0, 1);
  for (const lane of [-1, 0, 1]) game.addItem("coin", lane, 8);
  const wallCoin = game.addItem("coin", 1, 10, 4);
  wallCoin.route = "wall";
  wallCoin.side = 1;
  game.update(0.1);
  assert.equal(credited, 0, "coins must travel to the runner before crediting");
  assert.ok(game.items.some((item) => item.attraction !== undefined));
  game.pause();
  const attraction = game.items.find(
    (item) => item.attraction !== undefined,
  )!.attraction;
  game.update(5);
  assert.equal(
    game.items.find((item) => item.attraction !== undefined)!.attraction,
    attraction,
  );
  game.resume();
  game.update(0.5);
  assert.equal(game.coins, 4);
  assert.equal(credited, 4);
  assert.ok(game.magnetTime > 9.3 && game.magnetTime <= 10);
  game.addItem("magnet", 0, 1);
  game.update(0.1);
  assert.ok(game.magnetTime > 9.8 && game.magnetTime <= 10);
  const duration = game.magnetTime;
  game.pause();
  game.update(20);
  assert.equal(game.magnetTime, duration);
  game.resume();
  game.update(11);
  assert.equal(game.magnetTime, 0);
});

test("shield expires after its duration, refreshes on pickup, and freezes while paused", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  game.addItem("shield", 0, 1);
  game.update(0.1);
  assert.ok(game.shieldTime > CONFIG.shieldDuration - 0.1);
  game.update(6);
  const remaining = game.shieldTime;
  game.pause();
  game.update(30);
  assert.equal(game.shieldTime, remaining);
  game.resume();
  game.addItem("shield", 0, 1);
  game.update(0.1);
  assert.ok(game.shieldTime > CONFIG.shieldDuration - 0.1);
  game.update(CONFIG.shieldDuration + 0.1);
  assert.equal(game.shield, false);
  assert.equal(game.shieldTime, 0);
  game.addItem("rock", 0, 1);
  game.update(0.1);
  assert.equal(game.mode, "over");
});

test("shield absorbs one ordinary hit and protects briefly, but cannot prevent a fall", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  game.addItem("shield", 0, 1);
  game.update(0.1);
  assert.equal(game.shield, true);
  game.addItem("rock", 0, 1);
  game.update(0.1);
  assert.equal(game.mode, "running");
  assert.equal(game.shield, false);
  assert.ok(game.protectionTime > 0);
  game.addItem("rock", 0, 1);
  game.update(0.1);
  assert.equal(game.mode, "running");
  game.update(1);
  game.addItem("rock", 0, 1);
  game.update(0.1);
  assert.equal(game.mode, "over");
  game.start();
  game.shield = true;
  game.distance = gapsNear(800, game.trackSeed)[0].start - 0.1;
  game.jump();
  game.update(0.02);
  assert.equal(game.mode, "over");
  assert.equal(game.lastHit, "gap");
  assert.equal(game.shield, true);
});

test("booster sweeps every coin without picking passive items and uses a real-time cooldown", () => {
  let credited = 0;
  const game = new RunnerGame({
    autoSpawn: false,
    onCoins: (n) => (credited += n),
  });
  game.start();
  for (const lane of [-1, 0, 1]) game.addItem("coin", lane, 5);
  const wallCoin = game.addItem("coin", -1, 6, 4);
  wallCoin.route = "wall";
  wallCoin.side = -1;
  game.addItem("magnet", 0, 5);
  game.addItem("rock", 0, 7);
  assert.equal(game.activateBooster(false), false);
  assert.equal(game.activateBooster(true), true);
  assert.equal(game.jump(), false);
  assert.equal(game.move(1), false);
  game.update(1);
  assert.equal(game.coins, 4);
  assert.equal(credited, 4);
  assert.equal(game.magnetTime, 0);
  assert.equal(game.mode, "running");
  assert.ok(Math.abs(game.boostCooldown - 59) < 0.001);
  const cooldown = game.boostCooldown;
  game.pause();
  game.update(10);
  assert.equal(game.boostCooldown, cooldown);
  game.resume();
  assert.equal(game.activateBooster(true), false);
});

test("booster crosses a tunnel and extends its flight to a safe landing beyond a gap", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  game.distance = 580;
  game.activateBooster(true);
  for (let n = 0; n < 200 && game.boosting; n++) game.update(0.05);
  assert.equal(game.terrain.biome, "canyon");
  assert.equal(game.mode, "running");
  assert.equal(game.boosting, false);
  game.start();
  const gap = gapsNear(800, game.trackSeed)[0];
  game.distance = gap.start - 10;
  game.activateBooster(true);
  game.boostRemaining = 25;
  for (let n = 0; n < 200 && game.boosting; n++) game.update(0.05);
  assert.equal(game.boosting, false);
  assert.equal(game.mode, "running");
  assert.ok(game.distance >= gap.end + 6);
  assert.equal(gapAt(game.distance, game.trackSeed), undefined);
  assert.ok(game.protectionTime > 0);
});

test("wall entry needs an extra outward gesture, height has limits and exit returns automatically", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  game.lane = -1;
  game.x = -2.5;
  game.move(-1);
  assert.equal(game.wallSide, 0);
  const gap = gapsNear(800, game.trackSeed)[0];
  game.distance = gap.start - 10;
  assert.equal(game.move(-1), true);
  assert.equal(game.wallSide, -1);
  assert.equal(game.jump(), true);
  assert.equal(game.wallLevel, 2);
  assert.equal(game.jump(), false);
  game.slide();
  assert.equal(game.wallLevel, 1);
  game.move(1);
  assert.equal(game.wallSide, -1);
  for (let n = 0; n < 400 && game.wallSide; n++) game.update(0.02);
  assert.equal(game.mode, "running");
  assert.equal(game.wallSide, 0);
  assert.equal(game.lane, -1);
  assert.ok(game.distance >= gap.end);
});

test("both wall sections generate obstacles while leaving open heights", () => {
  const game = new RunnerGame({ random: () => 0.5 });
  game.start();
  const [firstGap, secondGap] = gapsNear(800, game.trackSeed);
  game.distance = firstGap.start - 20;
  game.update(0.001);
  assert.ok(game.items.some((i) => i.route === "wall" && i.type === "coin"));
  assert.equal(
    game.items.some((i) => i.type === "wall-rock" && i.worldZ < firstGap.end),
    true,
  );
  game.distance = secondGap.start - 12;
  game.update(0.001);
  const rows = new Map<string, Set<number>>();
  for (const item of game.items.filter((i) => i.type === "wall-rock")) {
    const key = `${item.side}/${item.worldZ}`;
    if (!rows.has(key)) rows.set(key, new Set());
    rows.get(key)!.add(item.level!);
  }
  assert.ok(rows.size > 0);
  assert.ok([...rows.values()].every((levels) => levels.size >= 1 && levels.size <= 2));
});

test("rewind spends once, keeps unique coin income and clears obstacles without resetting cooldowns", () => {
  let credited = 0,
    spent = 0;
  const game = new RunnerGame({
    autoSpawn: false,
    onCoins: (n) => (credited += n),
  });
  game.start();
  const coin = game.addItem("coin", 0, 15);
  game.addItem("rock", 0, 60);
  game.update(3);
  assert.equal(credited, 1);
  game.boostCooldown = 20;
  game.magnetTime = 2;
  game.addItem("rock", 0, 1);
  game.update(0.1);
  assert.equal(game.mode, "over");
  const deathDistance = game.distance;
  assert.equal(
    game.useHourglass(() => {
      spent++;
      return true;
    }),
    true,
  );
  assert.equal(game.mode, "rewinding");
  game.update(CONFIG.rewindDuration + 0.01);
  assert.equal(game.mode, "running");
  assert.ok(game.distance < deathDistance);
  assert.equal(game.hourglassUsed, true);
  assert.equal(spent, 1);
  assert.equal(game.coins, 1);
  assert.equal(credited, 1);
  assert.equal(
    game.items.some((item) => item.id === coin.id),
    false,
  );
  assert.equal(
    game.items.some(
      (item) => item.type === "rock" && item.z >= -2 && item.z <= 60,
    ),
    false,
  );
  assert.ok(game.boostCooldown > 18 && game.boostCooldown < 20);
  assert.ok(game.magnetTime < 2);
  assert.ok(game.protectionTime > 0);
  game.update(2);
  assert.equal(credited, 1);
  game.mode = "over";
  assert.equal(
    game.useHourglass(() => {
      spent++;
      return true;
    }),
    false,
  );
  assert.equal(spent, 1);
});

test("rewinding to a wall state restores an attached route that can still exit", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  const gap = gapsNear(800, game.trackSeed)[0];
  game.distance = gap.start - 10;
  game.lane = -1;
  game.x = -2.5;
  game.move(-1);
  for (let n = 0; n < 400 && game.wallSide; n++) game.update(0.02);
  game.update(1.2);
  game.addItem("rock", -1, 1);
  game.update(0.1);
  assert.equal(game.mode, "over");
  assert.equal(
    game.useHourglass(() => true),
    true,
  );
  game.update(CONFIG.rewindDuration + 0.01);
  assert.equal(game.wallSide, -1);
  assert.ok(game.distance >= gap.start && game.distance < gap.end);
  game.update(3);
  assert.equal(game.mode, "running");
  assert.equal(game.wallSide, 0);
});

test("procedurally generated coins retain identity across rewind and never credit twice", () => {
  let credited = 0;
  const game = new RunnerGame({
    random: () => 0.5,
    onCoins: (n) => (credited += n),
  });
  game.start();
  game.update(0.8);
  const coin = game.items.find(item => item.type === "coin")!;
  assert.ok(coin);
  game.lane = coin.lane; game.x = coin.lane * 2.5;
  game.distance = coin.worldZ - 0.3;
  game.update(0.05);
  const earnings = credited;
  assert.ok(earnings > 0);
  game.addItem("rock", game.lane, 1);
  game.update(0.1);
  assert.equal(game.mode, "over");
  assert.equal(game.useHourglass(() => true), true);
  game.update(CONFIG.rewindDuration + 0.01);
  game.lane = coin.lane; game.x = coin.lane * 2.5;
  game.distance = coin.worldZ - 0.3;
  game.update(0.05);
  assert.ok(!game.items.some(item => item.id === coin.id));
  assert.equal(credited, earnings);
  assert.equal(game.coins, earnings);
});


test("legacy booster unlock becomes one consumable and persists after use", () => {
  let raw = JSON.stringify({ version: 1, wallet: 500, boosterUnlocked: true, hourglasses: 2 });
  const storage = { getItem: () => raw, setItem: (_: string, value: string) => { raw = value; } };
  const economy = new Economy(storage);
  assert.equal(economy.state.boosters, 1);
  assert.equal(economy.buy("booster"), "ok");
  assert.equal(economy.state.boosters, 2);
  const game = new RunnerGame({ autoSpawn: false });
  const use = () => game.activateBooster(true, () => economy.consumeBooster());
  assert.equal(use(), false);
  assert.equal(economy.state.boosters, 2);
  game.start();
  assert.equal(use(), true);
  assert.equal(economy.state.boosters, 1);
  assert.equal(use(), false);
  assert.equal(economy.state.boosters, 1);
  assert.equal(new Economy(storage).state.boosters, 1);
  assert.equal(economy.consumeBooster(), true);
  assert.equal(economy.consumeBooster(), false);
});

test("failed consumption leaves the booster and game state intact", () => {
  const economy = new Economy({
    getItem: () => JSON.stringify({ version: 2, wallet: 0, boosters: 1, hourglasses: 0 }),
    setItem: () => { throw new Error("storage unavailable"); },
  });
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  assert.equal(game.activateBooster(true, () => economy.consumeBooster()), false);
  assert.equal(economy.state.boosters, 1);
  assert.equal(game.boosting, false);
  assert.equal(game.boostCooldown, 0);
});

test("water grid clamps heights and freezes dynamic hazards while paused", () => {
  const game = new RunnerGame({autoSpawn: false});
  game.start(); game.distance = waterDistance(game, 1700);
  assert.equal(game.swimming, true);
  game.jump(); game.jump(); game.jump();
  assert.equal(game.waterLevel, 2);
  assert.equal(game.y, 0);
  const fish = game.addItem("fish", 1, 20, -2.05);
  const before = game.waterBounds(fish);
  game.pause(); game.update(4);
  assert.deepEqual(game.waterBounds(fish), before);
  game.resume(); game.update(0.1);
  assert.notEqual(game.waterBounds(fish).x, before.x);
  assert.equal(game.waterBounds(fish).y, before.y);
  assert.ok(game.waterY > CONFIG.waterHeights[1] && game.waterY < CONFIG.waterHeights[2]);
  game.slide(); game.slide(); game.slide();
  assert.equal(game.waterLevel, 0);
});

test("parallel water coins collect locally, then individually with magnet", () => {
  const game = new RunnerGame({autoSpawn: false});
  game.start(); game.distance = waterDistance(game, 1700);
  const local = game.addItem("coin", 0, 1, CONFIG.waterHeights[1] + 0.95);
  const side = game.addItem("coin", 1, 5, CONFIG.waterHeights[1] + 0.95);
  const upper = game.addItem("coin", 0, 5, CONFIG.waterHeights[2] + 0.95);
  assert.equal(new Set([local.id, side.id, upper.id]).size, 3);
  game.update(0.07); assert.equal(game.coins, 1);
  game.magnetTime = 10; game.update(0.6);
  assert.equal(game.coins, 3);
});

test("water generation leaves connected safe columns with unique IDs", () => {
  const game = new RunnerGame({random: () => 0.4});
  game.start(); game.distance = waterDistance(game, 1650); game.update(0.01);
  const waterItems = game.items.filter(i => sectionAt(i.worldZ, game.track).biome === "water");
  assert.ok(waterItems.some(i => i.type === "coin"));
  assert.equal(new Set(game.items.map(i => i.id)).size, game.items.length);
  for (const item of waterItems.filter(i => ["bubble", "coral", "volcano", "fish"].includes(i.type))) {
    const row = Math.floor((item.worldZ - 65) / CONFIG.rowSpacing);
    const safeX = waterSafeLane(row, game.trackSeed) * 2.5;
    assert.ok(Math.abs(waterSafeLane(row, game.trackSeed) - waterSafeLane(Math.max(0, row - 1), game.trackSeed)) <= 1);
    if (item.coral) {
      for (const y of CONFIG.waterHeights)
        assert.equal(touchesCoral(item.coral, safeX, y + 0.95, 0, 0.7), false);
    } else if (item.type === "fish") {
      assert.ok(Math.abs(item.y - CONFIG.waterHeights[fishSafeLevel(row, game.trackSeed)] - 0.95) > 2);
    } else {
      const b = game.waterBounds(item);
      assert.ok(Math.abs(b.x - safeX) - b.rx > 0.95);
    }
  }
});

test("water rewind restores dynamic time and clears aquatic hazards", () => {
  const game = new RunnerGame({autoSpawn: false});
  game.start(); game.distance = waterDistance(game, 1700); game.update(3.2);
  const clock = game.worldTime;
  game.addItem("bubble", 0, 1, CONFIG.waterHeights[1] + 0.95); game.update(0.1);
  assert.equal(game.mode, "over");
  assert.equal(game.useHourglass(() => true), true);
  game.update(CONFIG.rewindDuration + 0.01);
  assert.equal(game.mode, "running");
  assert.ok(game.worldTime < clock);
  assert.ok(!game.items.some(i => i.type === "bubble"));
});

test("volcano warns for two seconds before its visible thermal column is dangerous", () => {
  const game = new RunnerGame({autoSpawn: false});
  game.start(); game.distance = waterDistance(game, 1700);
  const volcano = game.addItem("volcano", 1, 20, CONFIG.seabedHeight + 0.65);
  game.worldTime += 102.001 - game.waterBounds(volcano).phase;
  assert.equal(game.waterBounds(volcano).warning, true);
  assert.equal(game.waterBounds(volcano).eruption, false);
  game.worldTime += 1.99;
  assert.equal(game.waterBounds(volcano).warning, true);
  game.worldTime += 0.02;
  assert.equal(game.waterBounds(volcano).eruption, true);
  game.worldTime += 2;
  assert.equal(game.waterBounds(volcano).eruption, false);
});

test("lowest swimming cell reaches a dormant seabed vent", () => {
  const game = new RunnerGame({autoSpawn: false});
  game.start(); game.distance = waterDistance(game, 1700);
  game.waterLevel = 0; game.waterY = CONFIG.waterHeights[0];
  game.lane = 1; game.x = 2.5;
  const vent = game.addItem("volcano", 1, 1, CONFIG.seabedHeight + 0.65);
  game.worldTime += 100.5 - game.waterBounds(vent).phase;
  game.shield = true;
  game.update(0.07);
  assert.equal(game.mode, "running");
  assert.equal(game.shield, false);
  assert.equal(game.shieldBreakSerial, 1);
  assert.ok(game.waterY > CONFIG.seabedHeight && game.waterY < CONFIG.seabedHeight + 0.5);
});


test("corals grow from the bed and block only the heights their branches reach", () => {
  for (const lane of [-1, 0, 1]) {
    for (let tiers = 1; tiers <= 3; tiers++) {
      const game = new RunnerGame({autoSpawn: false});
      game.start(); game.distance = waterDistance(game, 1700);
      const coral = game.addItem("coral", lane, 1);
      coral.coral = makeCoral(lane, tiers);
      assert.ok(coral.coral.rootY <= CONFIG.seabedHeight);
      assert.equal(coral.coral.branches[0].from.y, 0);
      for (let level = 0; level < 3; level++)
        assert.equal(touchesCoral(coral.coral, lane * 2.5, CONFIG.waterHeights[level] + 0.95, 0), level < tiers);
    }
  }
});

test("side-grown reefs reach two columns and preserve the opposite column", () => {
  for (const side of [-1, 1]) {
    const coral = makeCoral(side, 3, 0, side);
    assert.ok(Math.abs(coral.rootX) > 5);
    for (const y of CONFIG.waterHeights) {
      assert.equal(touchesCoral(coral, side * 2.5, y + 0.95, 0), true);
      assert.equal(touchesCoral(coral, 0, y + 0.95, 0), true);
      assert.equal(touchesCoral(coral, -side * 2.5, y + 0.95, 0, 0.7), false);
    }
  }
});

test("coral collision follows swimming between cells rather than only target lanes", () => {
  const game = new RunnerGame({autoSpawn: false});
  game.start(); game.distance = waterDistance(game, 1700);
  game.lane = -1; game.x = -2.5;
  game.addItem("coral", 0, 2);
  game.move(1); game.move(1);
  game.update(0.15);
  assert.equal(game.mode, "over");
  assert.equal(game.lastHit, "coral");
});


test("coastal texture coordinates keep world scale and remain continuous at both shorelines", () => {
  {
    const plan = new TrackPlan(18, "water");
    plan.at(12000);
    // Include every committed shore boundary, regardless of its next biome.
    for (const section of plan.sections.filter(s => ["beach", "water", "shore"].includes(s.biome))) {
      for (const distance of [section.start, section.end]) {
        const before = coastSandUV(0, distance - 0.001, plan), after = coastSandUV(0, distance + 0.001, plan);
        assert.ok(Math.abs(after[1] - before[1]) < 0.002);
        const a = coastWeights(distance - 0.001, plan), b = coastWeights(distance + 0.001, plan);
        a.forEach((weight, i) => assert.ok(Math.abs(weight - b[i]) < 0.001));
        assert.ok(Math.abs(coastFloor(distance - 0.001, plan) - coastFloor(distance + 0.001, plan)) < 0.002);
        assert.equal(coastSandUV(3, distance, plan)[0] - coastSandUV(0, distance, plan)[0], 1);
      }
    }
    const waterStart = CONFIG.forestLength + CONFIG.beachLength;
    assert.ok(coastSandUV(0, waterStart, plan)[1] - coastSandUV(0, waterStart - 24, plan)[1] > 8);
  }
});

test("fish cross once from outside the left or right edge without reversing", () => {
  for (const direction of [-1, 1]) {
    const crossing = {direction, startTime: 10};
    assert.equal(fishPosition(crossing, 9).active, false);
    let previous = fishPosition(crossing, 10).x;
    assert.equal(previous, -direction * CONFIG.fishHalfSpan);
    const duration = CONFIG.fishHalfSpan * 2 / CONFIG.fishSpeed;
    for (let step = 1; step <= 100; step++) {
      const p = fishPosition(crossing, 10 + duration * step / 100);
      assert.ok((p.x - previous) * direction > 0);
      previous = p.x;
    }
    assert.equal(fishPosition(crossing, 11 + duration).active, false);
    assert.equal(previous, direction * CONFIG.fishHalfSpan);
  }
});

test("all swimming levels stay below the surface while the lowest level still meets the bed", () => {
  const game = new RunnerGame({autoSpawn: false});
  game.start(); game.distance = waterDistance(game, 1700);
  game.jump(); game.update(2);
  assert.equal(game.waterLevel, 2);
  assert.ok(game.waterY + 2.1 < CONFIG.waterSurface - 0.12);
  game.slide(); game.slide(); game.update(2);
  assert.ok(game.waterY - CONFIG.seabedHeight < 0.5);
  assert.ok(game.waterY > CONFIG.seabedHeight);
});


test("denser ocean rows keep a route and spread coins across safe swimming cells", () => {
  let mainRows = 0, extraSchools = 0, doubleRows = 0;
  const fishHeights = new Set<number>();
  for (let seed = 1; seed <= 12; seed++) {
    const game = new RunnerGame({random: () => seed / 13});
    game.start(); game.distance = waterDistance(game, 1700); game.update(0.001);
    const hazards = game.items.filter(item => sectionAt(item.worldZ, game.track).biome === "water" &&
      ["bubble", "coral", "volcano", "fish"].includes(item.type));
    assert.equal(new Set(game.items.map(item => item.id)).size, game.items.length);
    const rows = new Map<number, typeof hazards>();
    for (const item of hazards) {
      const offset = (item.worldZ - 65) % CONFIG.rowSpacing;
      if (offset === 0) {
        const items = rows.get(item.worldZ) ?? [];
        items.push(item);
        rows.set(item.worldZ, items);
      } else {
        assert.equal(offset, CONFIG.rowSpacing / 2);
        assert.equal(item.type, "fish");
        extraSchools++;
      }
      if (item.type !== "fish") continue;
      assert.ok(item.fish);
      const row = Math.floor((item.worldZ - 65) / CONFIG.rowSpacing);
      const escape = fishSafeLevel(row, game.trackSeed);
      assert.ok(Math.abs(item.y - CONFIG.waterHeights[escape] - 0.95) > 1.1);
      fishHeights.add(item.y);
    }
    mainRows += rows.size;
    doubleRows += [...rows.values()].filter(items => items.length === 2).length;
    for (const [z, items] of rows) {
      if (z - game.distance < 8 || z - game.distance > CONFIG.trackLookahead - 8) continue;
      const coins = game.items.filter(item => item.type === "coin" && Math.abs(item.worldZ - z) <= 8);
      const cells = new Set(coins.map(coin => `${coin.lane}/${coin.y}`));
      assert.ok(cells.size >= 4 && cells.size <= 6);
      assert.ok(new Set(coins.map(coin => coin.y)).size >= 2);
      const row = (z - 65) / CONFIG.rowSpacing;
      const safeLane = waterSafeLane(row, game.trackSeed);
      const safeHeight = CONFIG.waterHeights[fishSafeLevel(row, game.trackSeed)] + 0.95;
      assert.ok(coins.some(coin => coin.lane === safeLane && coin.y === safeHeight));
      for (const coin of coins) for (const hazard of items) {
        if (hazard.coral) assert.equal(touchesCoral(hazard.coral, coin.lane * 2.5, coin.y, 0, 0.7), false);
        else if (hazard.type === "fish") assert.notEqual(coin.y, hazard.y);
        else if (hazard.type === "volcano") assert.notEqual(coin.lane, hazard.lane);
        else assert.ok(coin.lane !== hazard.lane || coin.y !== hazard.y);
      }
    }
  }
  assert.equal(fishHeights.size, 3, "fish use all three heights");
  assert.ok(extraSchools > mainRows * 0.6, "extra schools fill most intermediate rows");
  assert.ok(doubleRows > mainRows * 0.3, "fixed hazards regularly appear in pairs");
});

test("fish warning identifies the entry side and escalates until the school passes", () => {
  for (const direction of [-1, 1]) {
    const crossing = {direction, startTime: 10};
    const entry = crossing.startTime + (CONFIG.fishHalfSpan - CONFIG.fishWarningEdge) / CONFIG.fishSpeed;
    assert.equal(fishWarning(crossing, entry - CONFIG.fishWarningLead - 0.1), undefined);
    const early = fishWarning(crossing, entry - 1.6)!;
    const near = fishWarning(crossing, entry - 0.15)!;
    assert.equal(early.side, -direction);
    assert.ok(early.urgency < near.urgency && near.urgency < 1);
    assert.equal(fishWarning(crossing, entry)?.urgency, 1);
    assert.equal(fishWarning(crossing, entry + 2 * CONFIG.fishWarningEdge / CONFIG.fishSpeed + 0.1), undefined);
  }
});


test("magnet attracts nearby coins behind the runner across routes", () => {
  const game = new RunnerGame({ autoSpawn: false });
  game.start();
  game.magnetTime = 10;
  for (const lane of [-1, 0, 1]) game.addItem("coin", lane, -6);
  const distant = game.addItem("coin", 1, -18);
  game.update(0.01);
  assert.equal(game.items.filter(item => item.attraction !== undefined).length, 3);
  assert.equal(distant.attraction, undefined);
  game.update(0.5);
  assert.equal(game.coins, 3);
});


test("seeded canyon gaps vary per run, remain stable for rewind and leave approach buffers", () => {
  const layouts = new Set<string>();
  for (let seed = 1; seed <= 30; seed++) {
    const gaps = gapsNear(800, seed).filter(gap => gap.id < 2);
    assert.deepEqual(gapsNear(800, seed).filter(gap => gap.id < 2), gaps);
    layouts.add(JSON.stringify(gaps));
    assert.ok(gaps[1].start - gaps[0].end > 100);
    for (const gap of gaps) {
      assert.equal(sectionAt(gap.start).biome, "canyon");
      assert.equal(sectionAt(gap.end).biome, "canyon");
      assert.equal(obstacleAllowed(gap.start - CONFIG.wallEntry, seed), false);
      assert.equal(obstacleAllowed(gap.end + 10, seed), false);
    }
  }
  assert.ok(layouts.size > 25);
});


test("wall layouts vary across seeds and sides, including the first gap", () => {
  const layouts = new Set<string>();
  let differentSides = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const game = new RunnerGame({random: () => seed / 25});
    game.start();
    const gap = gapsNear(800, game.trackSeed)[0];
    game.distance = gap.start - 20; game.update(0.001);
    const signature = (side: number) => game.items.filter(item => item.type === "wall-rock" &&
      item.side === side && item.worldZ < gap.end).map(item => [item.worldZ - gap.start, item.level]);
    const left = signature(-1), right = signature(1);
    assert.ok(left.length > 0 && right.length > 0);
    layouts.add(JSON.stringify([left, right]));
    if (JSON.stringify(left) !== JSON.stringify(right)) differentSides++;
    for (const side of [-1, 1]) {
      const rocks = game.items.filter(item => item.type === "wall-rock" && item.side === side && item.worldZ < gap.end);
      const columns = [...new Set(rocks.map(item => item.worldZ))].sort((a,b) => a-b);
      let reachable = [1];
      for (const z of columns) {
        const blocked = rocks.filter(item => item.worldZ === z).map(item => item.level);
        reachable = [0,1,2].filter(level => !blocked.includes(level) && reachable.some(previous => Math.abs(previous-level) <= 1));
        assert.ok(reachable.length > 0);
        assert.ok(z - gap.start >= 28);
      }
    }
  }
  assert.equal(layouts.size, 24);
  assert.ok(differentSides >= 22);
});


test("underwater safe routes vary with the seed and remain reachable", () => {
  const lanes = new Set<string>(), heights = new Set<string>();
  for (let seed = 1; seed <= 24; seed++) {
    const laneRoute = Array.from({length: 80}, (_, row) => waterSafeLane(row, seed));
    const heightRoute = Array.from({length: 80}, (_, row) => fishSafeLevel(row, seed));
    lanes.add(JSON.stringify(laneRoute)); heights.add(JSON.stringify(heightRoute));
    assert.ok(laneRoute.every(value => value >= -1 && value <= 1));
    assert.ok(heightRoute.every(value => value >= 0 && value <= 2));
    for (const route of [laneRoute, heightRoute]) {
      for (let row = 1; row < route.length; row++) assert.ok(Math.abs(route[row] - route[row - 1]) <= 1);
    }
    assert.deepEqual(Array.from({length: 80}, (_, row) => waterSafeLane(row, seed)), laneRoute);
    assert.deepEqual(Array.from({length: 80}, (_, row) => fishSafeLevel(row, seed)), heightRoute);
  }
  assert.equal(lanes.size, 24); assert.equal(heights.size, 24);
});
