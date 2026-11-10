import { YetiModel } from "./yeti-model.ts";
import { coastGridIndices, reefRockGeometry } from "./ocean-geometry.ts";
import { canyonRidgeGeometry, canyonRidgeStrength } from "./canyon-landform.ts";
import type { TrackSection } from "./track.ts";
import { TrackPlan, terrainCellSpans } from "./track.ts";
import { coastHeight, coastalSkyBlend, COAST_COLUMNS } from "./coast-layout.ts";
import { ForestHorizon } from "./forest-horizon.ts";
import { SquidView } from "./squid-view.ts";
import { RunnerGame } from "./game.ts";
import { CONFIG } from "./config.ts";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { mergeSceneryMeshes } from "./scenery-mesh.ts";
import { OceanProps } from "./ocean-props.ts";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial.js";

test("scenery merges uncolored wood with vertex-tinted leaves", () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine);
    const trunk = CreateCylinder("trunk", {}, scene);
    const leaves = CreateSphere("leaves", {}, scene);
    trunk.material = new StandardMaterial("bark", scene);
    leaves.material = new StandardMaterial("foliage", scene);
    const trunkVertices = trunk.getTotalVertices();
    const vertexCount = trunkVertices + leaves.getTotalVertices();
    const leafColors = new Float32Array(leaves.getTotalVertices() * 4);
    for (let i = 0; i < leafColors.length; i += 4) {
      leafColors.set([0.25, 0.5, 0.25, 1], i);
    }
    leaves.setVerticesData(VertexBuffer.ColorKind, leafColors);

    const merged = mergeSceneryMeshes([trunk, leaves]);
    const colors = merged.getVerticesData(VertexBuffer.ColorKind)!;
    assert.equal(merged.getTotalVertices(), vertexCount);
    assert.equal(colors.length, vertexCount * 4);
    assert.deepEqual(
      Array.from(colors.slice(0, trunkVertices * 4)),
      new Array(trunkVertices * 4).fill(1),
    );
    assert.deepEqual(
      Array.from(colors.slice(trunkVertices * 4)),
      Array.from(leafColors),
    );
    assert.equal(merged.subMeshes!.length, 2);
  } finally {
    engine.dispose();
  }
});

test("interleaved opaque scenery consolidates material draws and single materials stay shared", () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine);
    const rock = new StandardMaterial("rock", scene);
    const shell = new StandardMaterial("shell", scene);
    const meshes = [rock, shell, rock, shell].map((material, i) => {
      const mesh = CreateSphere("detail-" + i, {segments: 6}, scene);
      mesh.material = material;
      mesh.position.x = i * 3;
      return mesh;
    });
    const vertices = meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0);
    const merged = mergeSceneryMeshes(meshes);
    assert.equal(merged.getTotalVertices(), vertices);
    assert.equal(merged.subMeshes!.length, 2);
    assert.ok(merged.material instanceof MultiMaterial);
    assert.deepEqual(new Set(merged.material.subMaterials), new Set([rock, shell]));

    const same = [0, 1, 2].map(() => {
      const mesh = CreateSphere("coral", {segments: 6}, scene);
      mesh.material = rock;
      return mesh;
    });
    const count = scene.multiMaterials.length;
    const coral = mergeSceneryMeshes(same);
    assert.equal(coral.material, rock);
    assert.equal(coral.subMeshes!.length, 1);
    assert.equal(scene.multiMaterials.length, count);
  } finally {
    engine.dispose();
  }
});

test("repeated fish share body geometry while retaining independent animated tails", () => {
  const engine = new NullEngine();
  try {
    const scene = new Scene(engine);
    const props = new OceanProps(scene);
    const bodyMaterial = new StandardMaterial("scales", scene);
    const eyeMaterial = new StandardMaterial("eyes", scene);
    props.material = kind => kind === "eye" ? eyeMaterial : bodyMaterial;
    const school = new TransformNode("school", scene);
    const first = props.fish(school);
    const second = props.fish(school);
    const body = first.getChildMeshes().find(mesh => mesh.name === "reef-fish-body")!;
    const otherBody = second.getChildMeshes().find(mesh => mesh.name === "reef-fish-body")!;
    const tail = first.getChildMeshes().find(mesh => mesh.name === "fish-fan-tail")!;
    const otherTail = second.getChildMeshes().find(mesh => mesh.name === "fish-fan-tail")!;
    assert.ok(body instanceof InstancedMesh && otherBody instanceof InstancedMesh);
    assert.equal(body.sourceMesh, otherBody.sourceMesh);
    assert.equal(body.subMeshes!.length, 2);
    assert.equal(first.getChildMeshes().length, 2);
    tail.rotation.y = 0.4;
    assert.equal(otherTail.rotation.y, 0);
    assert.equal(tail.position.z, -0.43);
    first.dispose();
    assert.equal(otherBody.isDisposed(), false);
    assert.equal(otherBody.sourceMesh.isDisposed(), false);
  } finally {
    engine.dispose();
  }
});


test("coast surfaces face upward so sand and seabed textures remain visible", () => {
  const positions = [-1, 0, 0, 1, 0, 0, -1, -1, 2, 1, -1, 2];
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, coastGridIndices(1, 1), normals);
  for (let i = 1; i < normals.length; i += 3) assert.ok(normals[i] > 0.8);
});

test("canyon ridges meet their coastal and winter approaches with a continuous rock shoulder", () => {
  const canyon: TrackSection = {biome: "canyon", start: 800, end: 1600, cycle: 1};
  const forest: TrackSection = {biome: "forest", start: 0, end: 720, cycle: 0};
  const approaches: TrackSection[] = [
    {biome: "snow-transition", start: 740, end: 800, cycle: 1, from: "snow", to: "canyon"},
    {biome: "shore", start: 720, end: 800, cycle: 1, from: "water", to: "canyon"},
  ];
  for (const approach of approaches) {
    const plan = {at: (distance: number) => distance < canyon.start ? approach : distance < canyon.end ? canyon : forest};
    for (const side of [-1, 1]) {
      const before = canyonRidgeGeometry(side, 790, d => canyonRidgeStrength(approach, d, plan));
      const after = canyonRidgeGeometry(side, 800, d => canyonRidgeStrength(canyon, d, plan));
      const columnSize = after.positions.length / 11;
      const seam = after.positions.slice(0, columnSize);
      assert.deepEqual(before.positions.slice(-columnSize).map((v, i) => i % 3 === 2 ? v - 10 : v), seam);
      const highest = Math.max(...seam.filter((_, i) => i % 3 === 1));
      assert.ok(highest > 0.5);
      assert.ok(side * (seam.at(-3)! - seam[0]) > 25, "the shoulder extends outward behind the wall");
      const normals: number[] = [];
      VertexData.ComputeNormals(after.positions, after.indices, normals);
      assert.ok(normals.slice(0, columnSize).some((n, i) => i % 3 === 1 && n > 0.75), "the rock has an upward-facing top");
    }
  }
});

test("reef rocks face outward at their sides and closed end caps", () => {
  for (const seed of [0, 1, 3.7, 52]) {
    const {positions, indices} = reefRockGeometry([3, 3, 3], seed);
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    for (let i = 0; i < positions.length; i += 3)
      assert.ok(positions[i] * normals[i] + positions[i + 1] * normals[i + 1] + positions[i + 2] * normals[i + 2] > 0);
  }
});


test("yeti detail meshes keep valid bounds and picking through animation", () => {
  const engine=new NullEngine();
  try {
    const scene=new Scene(engine),palette=new Map<string,StandardMaterial>();
    const model=new YetiModel(scene,42,(color)=>{
      if(!palette.has(color))palette.set(color,new StandardMaterial(color,scene));
      return palette.get(color)!;
    });
    for(const time of [0,0.15,0.6]) {
      model.animate(time,5,1,Infinity);
      for(const mesh of model.root.getChildMeshes()) {
        mesh.computeWorldMatrix(true);
        const bounds=mesh.getBoundingInfo().boundingBox;
        assert.ok(Number.isFinite(bounds.minimumWorld.x)&&Number.isFinite(bounds.maximumWorld.y));
        if(!mesh.name.includes("health"))assert.equal(mesh.metadata.wolfId,42);
      }
    }
  } finally {engine.dispose();}
});

test("terrain cells split at actual biome boundaries after quick starts and combat extensions", () => {
  for (const biome of ["canyon", "water", "snow"] as const) for (const extension of [0, 17]) {
    const plan = new TrackPlan(4, biome, true);
    if (extension) plan.extendForCombat(plan.sections[0], extension);
    plan.at(2000);
    for (const section of plan.sections.slice(1)) {
      const start = Math.floor(section.start / 10) * 10;
      const spans = terrainCellSpans(start, start + 10, plan);
      assert.equal(spans[0].start, start);
      assert.equal(spans.at(-1)!.end, start + 10);
      assert.ok(spans.some(s => s.start === section.start), "the next surface starts at the exact join");
      for (let i=0;i<spans.length;i++) {
        const s=spans[i];
        assert.ok(s.end>s.start && s.end<=s.section.end);
        assert.equal(plan.at((s.start+s.end)/2),s.section);
        if(i)assert.equal(spans[i-1].end,s.start);
      }
    }
  }
});

test("forest horizon fades on real meshes and can reappear after returning from the coast",()=>{
  const engine=new NullEngine();
  try {
    const scene=new Scene(engine),material=new StandardMaterial("hills",scene);
    const horizon=new ForestHorizon(scene,()=>material);
    for(const opacity of [1,0.7,0.2,0.001,0,0.4,1]) {
      horizon.update(opacity,-3);
      assert.equal(horizon.root.isEnabled(),opacity>0);
      for(const hill of horizon.root.getChildMeshes()) {
        assert.equal(hill instanceof InstancedMesh,false);
        assert.equal(hill.visibility,opacity);
      }
    }
  } finally {engine.dispose();}
});

test("forest-to-beach sky fades continuously and coast vertices preserve the flat grass verge",()=>{
  const plan=new TrackPlan(4,"water",true),beach=plan.at(12);
  assert.equal(coastalSkyBlend(beach.start-0.0001,plan),0);
  assert.equal(coastalSkyBlend(beach.start,plan),0);
  assert.ok(coastalSkyBlend(beach.start+20,plan)>0&&coastalSkyBlend(beach.start+20,plan)<1);
  assert.equal(coastalSkyBlend(beach.start+40,plan),1);
  for(const side of [-1,1]) {
    const verge=COAST_COLUMNS.filter(x=>side*x>=4.3&&side*x<=74.3);
    assert.ok(verge.some(x=>side*x===4.3));
    for(const x of verge)assert.equal(coastHeight(x,beach.start,plan),0);
    assert.ok(COAST_COLUMNS.some(x=>side*x<4.3&&side*x>4.29));
  }
});

test("coastal road and verges meet forest, sea and canyon without a height gap", () => {
  const sections: TrackSection[] = [
    {biome:"forest",start:0,end:12,cycle:0},
    {biome:"beach",start:12,end:92,cycle:1,from:"forest",to:"water"},
    {biome:"water",start:92,end:692,cycle:1},
    {biome:"shore",start:692,end:772,cycle:2,from:"water",to:"canyon"},
    {biome:"canyon",start:772,end:1572,cycle:2},
    {biome:"beach",start:1572,end:1652,cycle:3,from:"canyon",to:"water"},
    {biome:"water",start:1652,end:2252,cycle:3},
  ];
  const plan=new TrackPlan();
  plan.sections.splice(0,plan.sections.length,...sections);
  for(const section of sections.slice(1))for(const x of [0,-6,6,-12,12,-30,30,-60,60]) {
    assert.ok(Math.abs(coastHeight(x,section.start-0.00001,plan)-coastHeight(x,section.start,plan))<0.0001,
      `${section.biome} joins at ${section.start}, x=${x}`);
  }
  assert.equal(coastHeight(0,12,plan),0.06);
  assert.equal(coastHeight(12,12,plan),0);
  assert.ok(Math.abs(coastHeight(30,772,plan)+18)<1e-9);
});

test("partial canyon cells share their exact shoreline cross-section", () => {
  const shore:TrackSection={biome:"shore",start:692,end:772,cycle:2,from:"water",to:"canyon"};
  const canyon:TrackSection={biome:"canyon",start:772,end:1572,cycle:2};
  const plan={at:(d:number)=>d<772?shore:canyon};
  for(const side of [-1,1]) {
    const before=canyonRidgeGeometry(side,770,d=>canyonRidgeStrength(shore,d,plan),2);
    const after=canyonRidgeGeometry(side,772,d=>canyonRidgeStrength(canyon,d,plan),8);
    const row=before.positions.length/3;
    assert.deepEqual(before.positions.slice(-row).map((v,i)=>i%3===2?v-2:v),after.positions.slice(0,row));
  }
});

for(const high of [false,true])for(const kind of ["ink","grab"] as const) {
  test(`squid ${kind} warning creates and clears on ${high?"high":"low"} quality without a renderer import error`,()=>{
    const engine=new NullEngine();
    try {
      const scene=new Scene(engine),palette=new Map<string,StandardMaterial>();
      const view=new SquidView(scene,color=>{
        if(!palette.has(color))palette.set(color,new StandardMaterial(color,scene));
        return palette.get(color)!;
      });
      const game=new RunnerGame({autoSpawn:false});game.nextTerrain="water";game.start(true);
      game.distance=CONFIG.forestLength+CONFIG.beachLength+160;
      const ocean=game.nightCombat.ocean,enemy={id:2000000010,kind:"squid" as const,homeX:-4.7,
        homeY:game.visualWaterY+1,homeZ:7,enteredAt:game.worldTime-4,readyAt:Infinity,hitAt:-Infinity};
      ocean.state.enemies=[enemy];
      ocean.state.attacks=[{id:1,enemy:enemy.id,kind,start:game.worldTime,releaseAt:game.worldTime+1.1,
        impactAt:game.worldTime+1.6,x:0,y:game.visualWaterY+0.95,worldZ:game.distance+game.speed*1.6,
        fromX:enemy.homeX,fromY:enemy.homeY,fromZ:game.distance+7,spent:false}];
      assert.doesNotThrow(()=>view.update(game,high));
      const box=scene.getMeshByName("squid-grab-warning")!;
      assert.ok(box.edgesRenderer);
      assert.equal(box.isEnabled(),kind==="grab");
      assert.equal(scene.getMeshByName("squid-ink-red-line")!.isEnabled(),kind==="ink");
      if(kind==="ink") {
        game.worldTime+=1.2;
        assert.doesNotThrow(()=>view.update(game,high));
        assert.equal(scene.getMeshByName("squid-ink-projectile")!.isEnabled(),true);
        const shot=ocean.state.attacks[0];shot.spent=true;shot.hit=false;
        game.worldTime=shot.impactAt+0.1;view.update(game,high);
        const projectile=scene.getMeshByName("squid-ink-projectile")!;
        const previous=projectile.position.clone();
        game.worldTime+=0.2;view.update(game,high);
        assert.equal(projectile.isEnabled(),true,"missed ink stays in flight past the target");
        assert.ok(Vector3.Distance(previous,projectile.position)>0.1);
      }
      ocean.clear();view.update(game,high);
      assert.equal(box.isEnabled(),false);
      assert.equal(scene.getMeshByName("squid-ink-projectile")!.isEnabled(),false);
    } finally {engine.dispose();}
  });
}
