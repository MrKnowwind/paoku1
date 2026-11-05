import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreatePolyhedron } from "@babylonjs/core/Meshes/Builders/polyhedronBuilder";
import { WINTER_VERTEX, withSnowLayer } from "./snow-layer.ts";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { CreateLathe } from "@babylonjs/core/Meshes/Builders/latheBuilder";
import { snowMaterial } from "./snow-materials.ts";
import type { ForestProps } from "./props.ts";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { CONFIG } from "./config.ts";
import type { ItemType } from "./game.ts";

// Shared meshes/materials for both the live course and its real 3D lesson.
// Created on demand; no image requests or startup asset dependency.
export class SnowProps {
  private materials = new Map<string, StandardMaterial>();
  constructor(private scene: Scene, private forest: ForestProps) {}
  private mat(color: string, glow = false) {
    const key = color + glow;
    if (!this.materials.has(key)) {
      const m = new StandardMaterial("snow-" + key, this.scene);
      m.diffuseColor = Color3.FromHexString(color);
      m.specularColor.setAll(color === "#89c9e5" ? 0.8 : 0.08);
      m.specularPower = 96;
      if (glow) m.emissiveColor = m.diffuseColor.scale(0.85);
      this.materials.set(key, m);
    }
    return this.materials.get(key)!;
  }
  private surface(name: string, color: string) {
    if (/scarf|knitted/.test(name)) return snowMaterial(this.scene, "cloth", this.forest);
    if (/bark|trunk|twig|firewood|stump-root/.test(name)) return this.forest.surfaceMaterial("bark");
    if (name === "cut-wood") return this.forest.surfaceMaterial("cut");
    if (name === "hearth-stone") return this.forest.surfaceMaterial("stone");
    if (name === "pine-boughs") return snowMaterial(this.scene, "needles", this.forest);
    if (/snow|frozen-bank|frozen-end/.test(name)) return snowMaterial(this.scene, "snow", this.forest);
    return this.mat(color);
  }
  private ball(name: string, parent: TransformNode, size: number[], at: number[], color = "#eef7ff") {
    const m = CreateSphere(name, {diameter: 1, segments: /snow|frozen/.test(name) ? 32 : 24}, this.scene);
    m.parent = parent; m.scaling.set(size[0], size[1], size[2]); m.position.set(at[0], at[1], at[2]);
    m.material = this.surface(name, color); m.receiveShadows = true;
    if (/snowman|hearth-stone|settled-snow/.test(name)) {
      const points = m.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < points.length; i += 3) {
        const x = points[i], y = points[i + 1], z = points[i + 2];
        const grain = 1 + Math.sin(x * 19 + z * 13) * Math.cos(y * 17 + z * 7) * 0.035 + Math.sin(x * 7 - y * 8) * 0.02;
        points[i] *= grain; points[i + 1] *= grain; points[i + 2] *= grain;
      }
      const normals: number[] = []; VertexData.ComputeNormals(points, m.getIndices()!, normals);
      m.setVerticesData(VertexBuffer.PositionKind, points); m.setVerticesData(VertexBuffer.NormalKind, normals);
    }
    return m;
  }
  private cylinder(name: string, parent: TransformNode, height: number, bottom: number, top: number, at: number[], color: string) {
    const m = CreateCylinder(name, {height, diameterBottom: bottom, diameterTop: top, tessellation: 32}, this.scene);
    m.parent = parent; m.position.set(at[0], at[1], at[2]); m.material = this.surface(name, color); m.receiveShadows = true;
    return m;
  }
  private snowCoat(mesh: Mesh, coverage: (x: number, y: number, z: number) => number) {
    const points = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const weights: number[] = [];
    for (let i = 0; i < points.length; i += 3) {
      const [x, y, z] = [points[i], points[i + 1], points[i + 2]];
      weights.push((x + y * 0.24) * 1.7, (z + y * 0.32) * 1.7, coverage(x, y, z));
    }
    mesh.setVerticesData(WINTER_VERTEX, weights, false, 3);
    mesh.material = withSnowLayer(mesh.material as StandardMaterial, snowMaterial(this.scene, "snow", this.forest).diffuseTexture!);
  }

  drift(parent: TransformNode) {
    const root = new TransformNode("wind-sculpted-snowdrift", this.scene);
    root.parent = parent;
    const drift = CreateGround("snowdrift-crust", {width: 2.18, height: 2.1, subdivisions: 28}, this.scene);
    const positions = drift.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], z = positions[i + 2];
      const radius = Math.hypot(x + z * 0.19, z * 0.99);
      const edge = 0.94 + Math.sin(z * 7.7 + x * 3.4) * 0.09;
      const falloff = Math.max(0, 1 - radius / edge);
      positions[i + 1] = -0.02 + Math.pow(falloff, 1.46) * (0.67 + Math.sin(x * 7 + z * 4) * 0.035);
    }
    this.shape(drift, positions);
    drift.material = snowMaterial(this.scene, "snow", this.forest);
    drift.parent = root; drift.receiveShadows = true;
    return root;
  }

  private shape(mesh: Mesh, positions: number[] | Float32Array) {
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, mesh.getIndices()!, normals);
    mesh.setVerticesData(VertexBuffer.PositionKind, positions);
    mesh.setVerticesData(VertexBuffer.NormalKind, normals);
  }

  outcrop(parent: TransformNode, seed: number, snow: number) {
    const root = new TransformNode("glacial-erratics", this.scene);
    root.parent = parent;
    for (let i = 0; i < 3; i++) {
      const height = 1.1 + Math.cos(seed + i * 2.7) * 0.55;
      const stone = this.forest.sandstone("frosted-glacial-boulder", [2.5 - i * 0.43, height, 2.2 - i * 0.32], seed + i * 3, root);
      stone.material = this.forest.surfaceMaterial("stone");
      stone.position.set((i - 1) * 1.1, height * 0.35, (i % 2) * 0.8);
      this.snowCoat(stone, (x, y, z) => Math.max(0, Math.min(1, (y / height + 0.16 + Math.sin(x * 4 + z * 3) * 0.13) * 2.7)) * snow);
    }
    return root;
  }

  pine(parent: TransformNode, snow: number) {
    const root = new TransformNode("snow-pine", this.scene);
    root.parent = parent;
    this.cylinder("pine-trunk", root, 4.2, 0.38, 0.16, [0, 2.1, 0], "#615042");
    for (let i = 0; i < 5; i++) {
      const radius = 1.55 - i * 0.26;
      const height = 1.65 - i * 0.12;
      const shape = [[0, 0], [radius * 0.74, 0.02], [radius, 0.16], [radius * 0.76, height * 0.35], [radius * 0.38, height * 0.68], [0, height]].map(([r, y]) => new Vector3(r, y, 0));
      const tier = CreateLathe("drooping-pine-boughs", {shape, tessellation: 38}, this.scene);
      tier.parent = root;
      tier.position.set(Math.sin(i * 2.4) * 0.08, 1.05 + i * 0.71, 0);
      tier.rotation.y = i * 0.63;
      tier.material = snowMaterial(this.scene, "needles", this.forest);
      const points = tier.getVerticesData(VertexBuffer.PositionKind)!;
      for (let n = 0; n < points.length; n += 3) {
        const x = points[n], z = points[n + 2], a = Math.atan2(z, x);
        const spread = 1 + Math.sin(a * 7 + i) * 0.16 + Math.cos(a * 11) * 0.05;
        points[n] *= spread; points[n + 2] *= spread;
        points[n + 1] += Math.hypot(x, z) * Math.sin(a * 6 + i) * 0.13;
      }
      this.shape(tier, points);
      this.snowCoat(tier, (x, y, z) => snow * Math.max(0, Math.min(1, (y / height - 0.13 + 0.14 * Math.sin(x * 5 + z * 5)) * 3.4)));
    }
    return root;
  }
  create(type: ItemType, pickupHalo = true) {
    const root = new TransformNode("snow-" + type, this.scene);
    if (type === "snowdrift") {
      this.drift(root);
    } else if (type === "snowman") {
      this.ball("snowman-base", root, [1.6, 1.3, 1.4], [0, 0.6, 0]);
      this.ball("snowman-body", root, [1.1, 1, 1.05], [0, 1.45, 0]);
      this.ball("snowman-head", root, [0.8, 0.8, 0.8], [0, 2.22, 0]);
      this.cylinder("knitted-hat-cuff", root, 0.15, 0.77, 0.76, [0, 2.57, 0], "#a53e36");
      this.ball("knitted-hat-crown", root, [0.7, 0.38, 0.7], [0, 2.71, 0], "#a53e36");
      this.ball("snow-hat-pom", root, [0.2, 0.2, 0.2], [0.06, 2.93, 0]);
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.2;
        this.ball("coal-smile", root, [0.045, 0.045, 0.04], [Math.sin(a) * 0.34, 2.06 + Math.abs(a) * 0.09, -0.35], "#263f4b");
      }
      for (const side of [-1, 1]) this.ball("coal-eye", root, [0.08, 0.08, 0.06], [side * 0.16, 2.33, -0.36], "#263f4b");
      const nose = this.cylinder("carrot-nose", root, 0.34, 0.15, 0, [0, 2.19, -0.48], "#e88a3e"); nose.rotation.x = -Math.PI / 2;
      for (let i = 0; i < 3; i++) this.ball("coal-button", root, [0.09, 0.09, 0.07], [0, 1.12 + i * 0.24, -0.49], "#263f4b");
      this.cylinder("snowman-scarf", root, 0.15, 0.84, 0.84, [0, 1.88, 0], "#b54d40");
      const scarf = this.ball("scarf-tail", root, [0.23, 0.55, 0.065], [0.25, 1.62, -0.48], "#a53e36"); scarf.rotation.z = 0.2;
      for (let i = 0; i < 4; i++) this.cylinder("scarf-fringe", root, 0.08, 0.022, 0.018, [0.19 + i * 0.045, 1.33, -0.49], "#a53e36");
      for (const side of [-1, 1]) {
        const tip = new Vector3(side * 1.15, 1.82, 0.03);
        for (const [start, end] of [
          [new Vector3(side * 0.39, 1.41, 0.04), tip],
          [tip, new Vector3(side * 1.36, 2.02, 0.05)],
          [tip, new Vector3(side * 1.39, 1.77, -0.14)],
        ]) {
          const twig = CreateTube("forked-snowman-twig", {path: [start, end], radius: 0.028, tessellation: 8, cap: 3}, this.scene);
          twig.parent = root; twig.material = this.forest.surfaceMaterial("bark");
        }
      }
    } else if (type === "liquor") {
      const shape = [[0,-0.25],[0.1,-0.25],[0.14,-0.22],[0.145,-0.12],[0.145,0.19],[0.135,0.26],[0.095,0.32],[0.058,0.37],[0.055,0.54],[0.064,0.55]].map(([r,y]) => new Vector3(r,y,0));
      const glass = CreateLathe("moulded-green-glass-bottle", {shape, tessellation: 48, cap: 3}, this.scene);
      glass.parent = root; glass.material = snowMaterial(this.scene, "glass", this.forest);
      this.cylinder("amber-spirit", root, 0.34, 0.255, 0.255, [0, -0.035, 0], "#94703d");
      const label = CreateCylinder("wraparound-bottle-label", {height: 0.22, diameter: 0.305, tessellation: 48, cap: Mesh.NO_CAP}, this.scene);
      label.parent = root;
      label.position.y = 0.015;
      label.material = snowMaterial(this.scene, "label", this.forest);
      this.cylinder("bottle-lip", root, 0.04, 0.136, 0.136, [0, 0.54, 0], "#c2a66b");
      const cork = this.cylinder("cork", root, 0.08, 0.105, 0.105, [0, 0.6, 0], "#c7aa76");
      cork.setEnabled(pickupHalo);
      const glint = CreateTube("glass-edge-glint", {path: [new Vector3(-0.065,-0.17,-0.128), new Vector3(-0.065,0.19,-0.128), new Vector3(-0.04,0.3,-0.08)], radius: 0.005, tessellation: 8}, this.scene);
      glint.parent = root; glint.material = this.mat("#bdd6c4");
      if (pickupHalo) {
        const halo = CreateTorus("warm-pickup-ring", {diameter: 0.85, thickness: 0.025, tessellation: 48}, this.scene);
        halo.parent = root; halo.position.y = -0.3; halo.material = this.mat("#ffc877", true);
      }
    } else if (type === "ice" || type === "pool") {
      const pool = type === "pool";
      const length = pool ? CONFIG.poolLength : 6;
      const surface = CreateGround(pool ? "open-dark-water" : "reflective-ice", {width: 2.18, height: length, subdivisions: pool ? 32 : 22}, this.scene);
      surface.parent = root;
      surface.material = snowMaterial(this.scene, pool ? "water" : "ice", this.forest);
      const profile = (z: number) => 1 + 0.048 * Math.sin(z * 1.65) + 0.027 * Math.cos(z * 4.1);
      const wave = surface.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < wave.length; i += 3) {
        wave[i] *= profile(wave[i + 2]);
        wave[i + 1] = 0.103 + Math.sin(wave[i] * 8 + wave[i + 2] * 3.7) * (pool ? 0.01 : 0.004);
      }
      this.shape(surface, wave);
      for (const side of [-1, 1]) {
        const bank = Array.from({length: pool ? 33 : 17}, (_, i) => {
          const z = (i / (pool ? 32 : 16) - 0.5) * length;
          return new Vector3(side * 1.09 * profile(z), 0.111 + Math.sin(z * 3.5) * 0.014, z);
        });
        const edge = CreateTube("weathered-ice-lip", {path: bank, radius: 0.095, tessellation: 12, cap: 3}, this.scene);
        edge.parent = root; edge.material = snowMaterial(this.scene, "ice", this.forest);
        const last = bank[side < 0 ? 0 : bank.length - 1];
        const frost = CreateTube("frosted-pool-end", {path: [new Vector3(-Math.abs(last.x), 0.11, last.z), new Vector3(0, 0.13, last.z), new Vector3(Math.abs(last.x), 0.11, last.z)], radius: 0.083, tessellation: 12, cap: 3}, this.scene);
        frost.parent = root; frost.material = snowMaterial(this.scene, "snow", this.forest);
      }
      for (let i = 0; i < (pool ? 12 : 7); i++) {
        const shard = CreatePolyhedron("broken-frost-chip", {type: 1, size: 0.12}, this.scene);
        shard.parent = root; shard.material = snowMaterial(this.scene, "ice", this.forest);
        shard.position.set((i % 2 ? 1 : -1) * (1.12 + 0.04 * Math.sin(i)), 0.122, (i / (pool ? 11 : 6) - 0.5) * length * 0.92);
        shard.scaling.set(1.1, 0.3 + i % 3 * 0.12, 1.3); shard.rotation.y = i * 2.1;
      }
    } else if (type === "fire") {
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        this.ball("hearth-stone", root, [0.35, 0.24, 0.35], [Math.cos(a) * 0.68, 0.12, Math.sin(a) * 0.68], "#687581");
      }
      for (const side of [-1, 1]) {
        const log = this.cylinder("firewood", root, 1.1, 0.23, 0.2, [0, side < 0 ? 0.13 : 0.25, 0], "#664935");
        log.rotation.z = Math.PI / 2; log.rotation.y = side * 0.6;
      }
      for (let i = 0; i < 7; i++) {
        const flame = CreateLathe("living-flame", {shape: [[0,0],[0.14,0.08],[0.18,0.22],[0.11,0.44],[0.08,0.6],[0,0.78]].map(([r,y]) => new Vector3(r,y,0)), tessellation: 24, cap: 3}, this.scene);
        flame.parent = root; flame.position.set(Math.sin(i * 2) * 0.24, 0.18, Math.cos(i * 2) * 0.24);
        flame.scaling.set(1, 0.9 - (i % 3) * 0.08, 0.65);
        flame.material = this.mat(i % 2 ? "#ffdb74" : "#f18a3a", true);
      }
      for (let i = 0; i < 6; i++) this.ball("glowing-ember", root, [0.08, 0.04, 0.08], [Math.sin(i * 2) * 0.35, 0.18, Math.cos(i * 2) * 0.35], "#f18a3a").material = this.mat("#f18a3a", true);
    } else if (type === "stump" || type === "snow-log") {
      const log = type === "snow-log";
      const wood = new TransformNode("bark-and-cut-wood", this.scene); wood.parent = root;
      const length = log ? 8.6 : 0.8;
      const bark = CreateCylinder("scored-bark", {height: length, diameterBottom: 0.95, diameterTop: 0.88, tessellation: 48, subdivisions: 7, cap: Mesh.NO_CAP}, this.scene);
      bark.parent = wood; bark.material = this.forest.surfaceMaterial("bark");
      const points = bark.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < points.length; i += 3) {
        const a = Math.atan2(points[i + 2], points[i]);
        const y = points[i + 1] / length + 0.5;
        const roughness = 1 + Math.sin(Math.PI * y) * (Math.sin(a * 13 + y * 3) * 0.04 + Math.cos(a * 17) * 0.025);
        points[i] *= roughness; points[i + 2] *= roughness;
      }
      this.shape(bark, points);
      for (const side of [-1, 1]) {
        const knot = this.cylinder("bark-branch-knot", wood, 0.34, 0.22, 0.14, [side * 0.43, -length * 0.16, 0.08], "#654939"); knot.rotation.z = side * -1.2;
        this.ball("snow-on-branch-knot", wood, [0.26, 0.12, 0.2], [side * 0.5, -length * 0.16 + 0.11, 0.08]);
      }
      for (const side of [-1, 1]) {
        const cut = CreateDisc("single-end-grain", {radius: side > 0 ? 0.44 : 0.475, tessellation: 48, sideOrientation: Mesh.DOUBLESIDE}, this.scene);
        cut.parent = wood; cut.position.y = side * length / 2;
        cut.rotation.x = Math.PI / 2; cut.material = this.forest.surfaceMaterial("cut");
      }
      if (log) wood.rotation.z = Math.PI / 2;
      wood.position.y = log ? 0.48 : 0.4;
      this.ball("settled-snow-cap", root, log ? [8.2, 0.25, 0.7] : [0.85, 0.18, 0.8], [0, log ? 0.92 : 0.82, 0]);
      if (!log) for (const side of [-1, 1]) this.ball("stump-root", root, [1.3, 0.24, 0.3], [0, 0.1, 0], "#654939").rotation.y = side * 0.7;
    }
    return root;
  }
  animate(root: TransformNode, time: number) {
    for (const m of root.getChildMeshes()) {
      if (m.name === "living-flame") { m.scaling.y = 0.85 + Math.sin(time * 12 + m.position.x * 8) * 0.15; m.rotation.z = Math.sin(time * 8 + m.position.z * 9) * 0.13; }
      if (m.name === "open-dark-water" && m.material instanceof StandardMaterial && m.material.diffuseTexture) {
        const texture = m.material.diffuseTexture as import("@babylonjs/core/Materials/Textures/texture").Texture;
        texture.uOffset = Math.sin(time * 0.04) * 0.03; texture.vOffset = time * 0.012;
      }
    }
  }
}
