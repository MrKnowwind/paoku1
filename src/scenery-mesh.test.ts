import { coastGridIndices, reefRockGeometry } from "./ocean-geometry.ts";
import { canyonRidgeGeometry, canyonRidgeStrength } from "./canyon-landform.ts";
import type { TrackSection } from "./track.ts";
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
