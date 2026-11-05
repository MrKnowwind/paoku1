import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
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
    if (/packed-snow|loose-snow|snowman|frozen-bank|settled-snow/.test(name)) {
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
  drift(parent: TransformNode) {
    const root = new TransformNode("soft-snowdrift", this.scene); root.parent = parent;
    this.ball("packed-snow", root, [1.9, 1.1, 1.7], [0, 0.1, 0]);
    this.ball("loose-snow", root, [1.1, 0.65, 1.2], [0.5, 0.12, 0.15], "#d9ebf7");
    for (let i = 0; i < 5; i++) this.ball("wind-packed-snow-fringe", root, [0.35, 0.18, 0.4], [Math.sin(i * 2.3) * 0.83, 0.12, Math.cos(i * 2.3) * 0.65]);
    return root;
  }
  pine(parent: TransformNode, snow: number) {
    const root = new TransformNode("snow-pine", this.scene); root.parent = parent;
    this.cylinder("pine-trunk", root, 3, 0.4, 0.25, [0, 1.5, 0], "#615042");
    for (let i = 0; i < 3; i++) {
      const foliage = this.cylinder("pine-boughs", root, 2.1, 3 - i * 0.65, 0, [0, 2 + i * 1.1, 0], "#476a63");
      const points = foliage.getVerticesData(VertexBuffer.PositionKind)!;
      for (let v = 0; v < points.length; v += 3) {
        const a = Math.atan2(points[v + 2], points[v]);
        const spread = 1 + Math.sin(a * 7 + i) * 0.12 + Math.cos(a * 11) * 0.06;
        points[v] *= spread; points[v + 2] *= spread;
      }
      const normals: number[] = []; VertexData.ComputeNormals(points, foliage.getIndices()!, normals);
      foliage.setVerticesData(VertexBuffer.PositionKind, points); foliage.setVerticesData(VertexBuffer.NormalKind, normals);
      for (let twig = 0; twig < 3; twig++) {
        const a = twig * Math.PI * 2 / 3 + i * 1.2, reach = 1.15 - i * 0.23;
        const branch = CreateTube("pine-twig", {path: [new Vector3(0, 1.35 + i * 1.1, 0), new Vector3(Math.cos(a) * reach, 1.45 + i * 1.1, Math.sin(a) * reach)], radius: 0.035, tessellation: 8, cap: 3}, this.scene);
        branch.parent = root; branch.material = this.forest.surfaceMaterial("bark");
      }
      if (snow > 0.01) this.cylinder("snow-on-boughs", root, 1.5, (2.65 - i * 0.6) * snow, 0, [0, 2.4 + i * 1.1, 0], "#edf7ff");
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
        const arm = this.cylinder("twig-arm", root, 1.1, 0.07, 0.035, [side * 0.8, 1.5, 0], "#615042"); arm.rotation.z = side * -1.1;
      }
    } else if (type === "liquor") {
      const shape = [[0,-0.25],[0.1,-0.25],[0.14,-0.22],[0.145,-0.12],[0.145,0.19],[0.135,0.26],[0.095,0.32],[0.058,0.37],[0.055,0.54],[0.064,0.55]].map(([r,y]) => new Vector3(r,y,0));
      const glass = CreateLathe("moulded-green-glass-bottle", {shape, tessellation: 48, cap: 3}, this.scene);
      glass.parent = root; glass.material = snowMaterial(this.scene, "glass", this.forest);
      this.cylinder("amber-spirit", root, 0.34, 0.255, 0.255, [0, -0.035, 0], "#94703d");
      const label = this.cylinder("bottle-label", root, 0.22, 0.294, 0.294, [0, 0.015, 0], "#f5d9a2");
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
      const surface = CreateGround(pool ? "open-dark-water" : "reflective-ice", {width: 2.12, height: length, subdivisions: 16}, this.scene);
      surface.parent = root; surface.position.y = 0.085;
      surface.material = snowMaterial(this.scene, pool ? "water" : "ice", this.forest);
      const wave = surface.getVerticesData(VertexBuffer.PositionKind)!;
      for (let i = 0; i < wave.length; i += 3) wave[i + 1] = Math.sin(wave[i] * 8 + wave[i + 2] * 3.7) * (pool ? 0.008 : 0.003);
      const normals: number[] = []; VertexData.ComputeNormals(wave, surface.getIndices()!, normals);
      surface.setVerticesData(VertexBuffer.PositionKind, wave); surface.setVerticesData(VertexBuffer.NormalKind, normals);
      for (let i = 0; i < (pool ? 10 : 5); i++) {
        const shard = this.cylinder("fractured-ice-bank", root, 0.05 + i % 3 * 0.02, 0.23, 0.18, [i % 2 ? 0.99 : -0.99, 0.13, (i / (pool ? 9 : 4) - 0.5) * length * 0.9], "#89c9e5");
        shard.rotation.y = i * 2.1; shard.material = snowMaterial(this.scene, "ice", this.forest);
      }
      for (const side of [-1, 1]) {
        this.ball("frozen-bank", root, [0.14, 0.18, length], [side * 1.06, 0.09, 0], "#deeffa");
        this.ball("frozen-end", root, [2.05, 0.13, 0.3], [0, 0.09, side * length / 2], "#deeffa");
      }
      for (let i = 0; i < 5; i++) {
        const glint = this.ball(pool ? "water-ripple" : "ice-crack", root, [1.3, 0.014, 0.06], [Math.sin(i) * 0.22, 0.105, (i - 2) * length / 6], pool ? "#5399b5" : "#e3f8ff");
        glint.rotation.y = i * 0.7;
      }
    } else if (type === "fire") {
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        this.ball("hearth-stone", root, [0.35, 0.24, 0.35], [Math.cos(a) * 0.68, 0.12, Math.sin(a) * 0.68], "#687581");
      }
      for (const side of [-1, 1]) {
        const log = this.cylinder("firewood", root, 1.1, 0.23, 0.2, [0, 0.18, 0], "#664935"); log.rotation.z = Math.PI / 2; log.rotation.y = side * 0.6;
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
      this.cylinder("bark", wood, length, 0.95, 0.88, [0, 0, 0], "#654939");
      for (const side of [-1, 1]) {
        const knot = this.cylinder("bark-branch-knot", wood, 0.34, 0.22, 0.14, [side * 0.43, -length * 0.16, 0.08], "#654939"); knot.rotation.z = side * -1.2;
        this.ball("snow-on-branch-knot", wood, [0.26, 0.12, 0.2], [side * 0.5, -length * 0.16 + 0.11, 0.08]);
      }
      for (const side of [-1, 1]) {
        this.cylinder("cut-wood", wood, 0.025, 0.79, 0.79, [0, side * length / 2, 0], "#cfad76");
        for (let i = 1; i <= 3; i++) {
          const ring = CreateTorus("growth-ring", {diameter: i * 0.19, thickness: 0.018, tessellation: 40}, this.scene);
          ring.parent = wood; ring.position.y = side * (length / 2 + 0.015); ring.material = this.mat("#96744e");
        }
      }
      for (let i = 0; i < 9; i++) {
        const a = i * Math.PI * 2 / 9;
        this.cylinder("bark-ridge", wood, length * 0.95, 0.055, 0.04, [Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], "#473c33");
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
      if (m.name === "water-ripple") m.scaling.x = 1 + Math.sin(time * 2 + m.position.z) * 0.15;
    }
  }
}
