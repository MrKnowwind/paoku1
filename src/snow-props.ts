import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
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
  constructor(private scene: Scene) {}
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
  private ball(name: string, parent: TransformNode, size: number[], at: number[], color = "#eef7ff") {
    const m = CreateSphere(name, {diameter: 1, segments: 12}, this.scene);
    m.parent = parent; m.scaling.set(size[0], size[1], size[2]); m.position.set(at[0], at[1], at[2]);
    m.material = this.mat(color); m.receiveShadows = true;
    return m;
  }
  private cylinder(name: string, parent: TransformNode, height: number, bottom: number, top: number, at: number[], color: string) {
    const m = CreateCylinder(name, {height, diameterBottom: bottom, diameterTop: top, tessellation: 14}, this.scene);
    m.parent = parent; m.position.set(at[0], at[1], at[2]); m.material = this.mat(color); m.receiveShadows = true;
    return m;
  }
  drift(parent: TransformNode) {
    const root = new TransformNode("soft-snowdrift", this.scene); root.parent = parent;
    this.ball("packed-snow", root, [1.9, 1.1, 1.7], [0, 0.1, 0]);
    this.ball("loose-snow", root, [1.1, 0.65, 1.2], [0.5, 0.12, 0.15], "#d9ebf7");
    return root;
  }
  pine(parent: TransformNode, snow: number) {
    const root = new TransformNode("snow-pine", this.scene); root.parent = parent;
    this.cylinder("pine-trunk", root, 3, 0.4, 0.25, [0, 1.5, 0], "#615042");
    for (let i = 0; i < 3; i++) {
      this.cylinder("pine-boughs", root, 2.1, 3 - i * 0.65, 0, [0, 2 + i * 1.1, 0], "#476a63");
      if (snow > 0.01) this.cylinder("snow-on-boughs", root, 1.5, (2.65 - i * 0.6) * snow, 0, [0, 2.4 + i * 1.1, 0], "#edf7ff");
    }
    return root;
  }
  create(type: ItemType) {
    const root = new TransformNode("snow-" + type, this.scene);
    if (type === "snowdrift") {
      this.drift(root);
    } else if (type === "snowman") {
      this.ball("snowman-base", root, [1.6, 1.3, 1.4], [0, 0.6, 0]);
      this.ball("snowman-body", root, [1.1, 1, 1.05], [0, 1.45, 0]);
      this.ball("snowman-head", root, [0.8, 0.8, 0.8], [0, 2.22, 0]);
      for (const side of [-1, 1]) this.ball("coal-eye", root, [0.08, 0.08, 0.06], [side * 0.16, 2.33, -0.36], "#263f4b");
      const nose = this.cylinder("carrot-nose", root, 0.34, 0.15, 0, [0, 2.19, -0.48], "#e88a3e"); nose.rotation.x = -Math.PI / 2;
      for (let i = 0; i < 3; i++) this.ball("coal-button", root, [0.09, 0.09, 0.07], [0, 1.12 + i * 0.24, -0.49], "#263f4b");
      this.cylinder("snowman-scarf", root, 0.15, 0.84, 0.84, [0, 1.88, 0], "#b54d40");
      for (const side of [-1, 1]) {
        const arm = this.cylinder("twig-arm", root, 1.1, 0.07, 0.035, [side * 0.8, 1.5, 0], "#615042"); arm.rotation.z = side * -1.1;
      }
    } else if (type === "liquor") {
      this.cylinder("amber-bottle", root, 0.48, 0.29, 0.26, [0, 0, 0], "#466c54");
      this.cylinder("bottle-shoulder", root, 0.14, 0.26, 0.12, [0, 0.3, 0], "#466c54");
      this.cylinder("bottle-neck", root, 0.2, 0.12, 0.12, [0, 0.45, 0], "#466c54");
      this.cylinder("cork", root, 0.09, 0.14, 0.14, [0, 0.58, 0], "#d7b881");
      this.cylinder("bottle-label", root, 0.2, 0.298, 0.298, [0, 0, 0], "#f5d9a2");
      const halo = CreateTorus("warm-pickup-ring", {diameter: 0.85, thickness: 0.035}, this.scene);
      halo.parent = root; halo.position.y = -0.3; halo.material = this.mat("#ffc877", true);
    } else if (type === "ice" || type === "pool") {
      const pool = type === "pool";
      const length = pool ? CONFIG.poolLength : 6;
      const surface = CreateGround(pool ? "open-dark-water" : "reflective-ice", {width: 2.12, height: length}, this.scene);
      surface.parent = root; surface.position.y = 0.085;
      surface.material = this.mat(pool ? "#133f58" : "#89c9e5");
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
      for (let i = 0; i < 5; i++) {
        const flame = this.cylinder("living-flame", root, 0.75 - i * 0.07, 0.38, 0, [Math.sin(i * 2) * 0.24, 0.5, Math.cos(i * 2) * 0.24], i % 2 ? "#ffdb74" : "#f18a3a");
        flame.material = this.mat(i % 2 ? "#ffdb74" : "#f18a3a", true);
      }
    } else if (type === "stump" || type === "snow-log") {
      const log = type === "snow-log";
      const wood = new TransformNode("bark-and-cut-wood", this.scene); wood.parent = root;
      const length = log ? 8.6 : 0.8;
      this.cylinder("bark", wood, length, 0.95, 0.88, [0, 0, 0], "#654939");
      for (const side of [-1, 1]) {
        this.cylinder("cut-wood", wood, 0.025, 0.79, 0.79, [0, side * length / 2, 0], "#cfad76");
        for (let i = 1; i <= 3; i++) {
          const ring = CreateTorus("growth-ring", {diameter: i * 0.19, thickness: 0.018, tessellation: 20}, this.scene);
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
      if (m.name === "water-ripple") m.scaling.x = 1 + Math.sin(time * 2 + m.position.z) * 0.15;
    }
  }
}
