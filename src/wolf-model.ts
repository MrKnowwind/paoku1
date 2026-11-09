import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CONFIG } from "./config.ts";

export class WolfModel {
  root: TransformNode;
  lastHitAt = -Infinity;
  private healthBar: TransformNode;
  private healthPips: Mesh[] = [];
  private body: TransformNode;
  private head: TransformNode;
  private jaw: TransformNode;
  private tail: TransformNode;
  private legs: {hip: TransformNode; shin: TransformNode; phase: number; front: boolean}[] = [];

  constructor(scene: Scene, id: number, material: (color: string, glow?: boolean) => StandardMaterial) {
    this.root = new TransformNode("forest-wolf", scene);
    const joint = (name: string, x: number, y: number, z: number, parent: TransformNode) => {
      const node = new TransformNode(name, scene);
      node.parent = parent;
      node.position.set(x, y, z);
      return node;
    };
    const fur = (name: string, color: string, size: number[], pos: number[], parent: TransformNode, glow = false) => {
      const mesh = CreateSphere(name, {diameter: 1, segments: 10}, scene);
      mesh.parent = parent;
      mesh.scaling.set(size[0], size[1], size[2]);
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.material = material(color, glow);
      mesh.metadata = {wolfId: id};
      return mesh;
    };
    const coat = "#536174", mane = "#3c4a5e", cream = "#b9adb0", paw = "#2d394b";
    this.body = joint("wolf-spine", 0, 0.78, 0, this.root);
    fur("wolf-ribcage", coat, [0.61, 0.62, 1.37], [0, 0.04, -0.04], this.body);
    fur("wolf-shoulders", mane, [0.66, 0.76, 0.73], [0, 0.05, 0.42], this.body);
    fur("wolf-haunches", coat, [0.56, 0.55, 0.58], [0, -0.03, -0.55], this.body);
    const neck = fur("wolf-ruff", "#667489", [0.61, 0.72, 0.63], [0, 0.22, 0.58], this.body);
    neck.rotation.x = 0.35;
    fur("wolf-throat", cream, [0.36, 0.48, 0.24], [0, 0.1, 0.82], this.body);
    this.head = joint("wolf-skull", 0, 0.35, 0.69, this.body);
    fur("wolf-cheeks", coat, [0.52, 0.49, 0.55], [0, 0.08, 0.12], this.head);
    fur("wolf-muzzle", "#a2a5ab", [0.29, 0.24, 0.52], [0, -0.02, 0.37], this.head);
    fur("wolf-nose", paw, [0.24, 0.14, 0.14], [0, 0.025, 0.59], this.head);
    this.jaw = joint("wolf-jaw", 0, -0.1, 0.16, this.head);
    fur("wolf-lower-jaw", cream, [0.24, 0.11, 0.39], [0, -0.016, 0.19], this.jaw);
    for (const side of [-1, 1]) {
      const ear = CreateCylinder("wolf-ear", {diameterTop: 0.015, diameterBottom: 0.26, height: 0.4, tessellation: 3}, scene);
      ear.parent = this.head;
      ear.position.set(side * 0.16, 0.36, 0.04);
      ear.rotation.z = -side * 0.24;
      ear.material = material(mane);
      ear.metadata = {wolfId: id};
      fur("wolf-eye", "#e5af64", [0.091, 0.057, 0.064], [side * 0.19, 0.14, 0.32], this.head, true);
      fur("wolf-fang", "#f9e3be", [0.045, 0.088, 0.05], [side * 0.09, -0.025, 0.28], this.jaw);
      for (const front of [true, false]) {
        const hip = joint("wolf-leg", side * 0.215, -0.11, front ? 0.43 : -0.54, this.body);
        fur("wolf-upper-leg", front ? mane : coat, [0.22, 0.43, front ? 0.23 : 0.33], [0, -0.1, 0], hip);
        const shin = joint("wolf-hock", 0, -0.32, 0, hip);
        fur("wolf-lower-leg", mane, [0.14, 0.34, 0.15], [0, -0.15, 0], shin);
        fur("wolf-paw", paw, [0.17, 0.14, 0.25], [0, -0.3, 0.045], shin);
        this.legs.push({hip, shin, phase: side * 0.57 + (front ? 0 : 2.5), front});
      }
    }
    this.tail = joint("wolf-tail", 0, 0.09, -0.68, this.body);
    fur("wolf-brush", mane, [0.25, 0.25, 0.79], [0, 0, -0.32], this.tail);
    fur("wolf-tail-tip", paw, [0.16, 0.18, 0.29], [0, 0, -0.62], this.tail);

    this.healthBar = joint("wolf-health", 0, 1.82, 0, this.root);
    this.healthBar.billboardMode = Mesh.BILLBOARDMODE_ALL;
    const bar = (name: string, width: number, height: number, x: number, z: number, color: string) => {
      const mesh = CreatePlane(name, {width, height, sideOrientation: Mesh.DOUBLESIDE}, scene);
      mesh.position.set(x, 0, z);
      mesh.parent = this.healthBar;
      mesh.material = material(color, true);
      mesh.isPickable = false;
      return mesh;
    };
    bar("wolf-health-rim", 1.04, 0.19, 0, 0.012, "#c4b0a6");
    bar("wolf-health-track", 0.98, 0.13, 0, 0.005, "#232637");
    const pips = CONFIG.nightCombat.wolfHealth;
    const width = 0.94 / pips;
    for (let i = 0; i < pips; i++)
      this.healthPips.push(bar("wolf-health-pip", width - 0.032, 0.095, (i + 0.5) * width - 0.47, -0.005, "#ff555d"));
  }

  updateHealth(health: number, leap: number, entered = true) {
    this.healthBar.setEnabled(health > 0 && entered);
    this.healthBar.position.y = 1.82 + leap;
    this.healthPips.forEach((pip, index) => pip.setEnabled(index < health));
  }

  animate(phase: number, crouch: number, leap: number, bite: number, flinch: number, fallen: number) {
    const bob = Math.cos(phase * 2) * 0.058 * (1 - crouch) * (1 - bite);
    this.body.position.y = (0.79 + bob - crouch * 0.22 + leap) * (1 - fallen * 0.48);
    this.body.rotation.set(Math.sin(phase) * 0.06 + crouch * 0.19 - leap * 0.45,
      flinch * 0.18, fallen * 1.58 + flinch * 0.14);
    this.head.rotation.x = -crouch * 0.28 + bite * 0.16 - flinch * 0.23;
    this.jaw.rotation.x = bite * (0.28 + Math.cos(phase * 2) * 0.22) + crouch * 0.09;
    this.tail.rotation.set(-0.27 + Math.cos(phase) * 0.16 + crouch * 0.45, Math.sin(phase * 0.75) * 0.24, 0);
    for (const {hip, shin, phase: offset, front} of this.legs) {
      const swing = Math.sin(phase + offset) * (1 - bite) * (1 - crouch * 0.74);
      hip.rotation.x = swing * 0.71 + (front ? -0.55 : 0.72) * bite - crouch * 0.23;
      shin.rotation.x = -Math.max(0, swing) * 0.78 + (front ? 0.12 : 0.28) + crouch * 0.62;
    }
  }
}
