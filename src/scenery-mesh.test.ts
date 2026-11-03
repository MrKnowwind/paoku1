import { coastGridIndices, reefRockGeometry } from "./ocean-geometry.ts";
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

test("reef rocks face outward at their sides and closed end caps", () => {
  for (const seed of [0, 1, 3.7, 52]) {
    const {positions, indices} = reefRockGeometry([3, 3, 3], seed);
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    for (let i = 0; i < positions.length; i += 3)
      assert.ok(positions[i] * normals[i] + positions[i + 1] * normals[i + 1] + positions[i + 2] * normals[i + 2] > 0);
  }
});
