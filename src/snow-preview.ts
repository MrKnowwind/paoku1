import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { SnowProps } from "./snow-props.ts";

export function drinkingPose(upper: TransformNode, lower: TransformNode, bottle: TransformNode, weight: number) {
  upper.rotation.x += (-1.45 - upper.rotation.x) * weight;
  lower.rotation.x += (-1.6 - lower.rotation.x) * weight;
  bottle.setEnabled(weight > 0.01);
  bottle.rotation.z = -weight * 0.5;
}

// Uses the existing engine and render loop. The display models are the same
// factories as the course, and the explorer is cloned from the actual player.
export class SnowPreview {
  readonly camera: FreeCamera;
  private root: TransformNode;
  private runner: TransformNode;
  private bottle: TransformNode;
  private shoulders: TransformNode[];
  private elbows: TransformNode[];
  private hips?: TransformNode;
  private thighs: TransformNode[];
  private knees: TransformNode[];
  private fire?: TransformNode;
  private liquorPickup?: TransformNode;
  private time = 0;
  constructor(private scene: Scene, source: TransformNode, private props: SnowProps, readonly step: number) {
    this.root = new TransformNode("snow-lesson-stage", scene);
    this.root.position.x = 1000;
    this.camera = new FreeCamera("snow-lesson-camera", new Vector3(1000, 6, -10), scene);
    this.camera.setTarget(new Vector3(1000, 1, 0)); this.camera.layerMask = 0x10000000;
    this.camera.minZ = 0.1; this.camera.maxZ = 30; this.camera.fov = 0.8;
    this.runner = source.clone("lesson-explorer", this.root)!;
    this.runner.position.set(0, 0, 0); this.runner.rotation.set(0, Math.PI + 0.18, 0);
    const joints = this.runner.getDescendants().filter(n => n instanceof TransformNode) as TransformNode[];
    this.shoulders = joints.filter(n => n.name.endsWith("shoulder"));
    this.elbows = joints.filter(n => n.name.endsWith("elbow"));
    this.thighs = joints.filter(n => n.name.endsWith("hip-joint"));
    this.knees = joints.filter(n => n.name.endsWith("knee"));
    this.hips = joints.find(n => n.name.endsWith("hips"));
    for (const j of joints) if (["shoulder", "elbow", "hip-joint", "knee", "ankle", "torso", "head-joint"].some(name => j.name.endsWith(name))) j.rotation.set(0, 0, 0);
    // Power effects are scene effects, not part of the lesson's character.
    for (const n of joints) if (/aura|jet|pulse|booster-pod|snow-liquor/.test(n.name)) n.setEnabled(false);
    this.bottle = props.create("liquor", false); this.bottle.parent = this.elbows[0] ?? this.runner;
    this.bottle.position.set(0, -0.34, 0); this.bottle.scaling.setAll(0.55);
    if (step === 2) {
      this.runner.setEnabled(false);
      const types = ["ice", "snowdrift", "snowman", "pool", "fire", "snow-log"] as const;
      types.forEach((type, i) => {
        const model = props.create(type); model.parent = this.root;
        model.position.set((i % 3 - 1) * 3, 0, i < 3 ? -1.6 : 2);
        model.scaling.setAll(type === "pool" ? 0.24 : type === "snow-log" ? 0.3 : 0.85);
        if (type === "pool") model.scaling.x = 0.85;
      });
    } else if (step === 3) {
      this.fire = props.create("fire"); this.fire.parent = this.root; this.fire.position.x = -2;
      this.liquorPickup = props.create("liquor"); this.liquorPickup.parent = this.root; this.liquorPickup.position.set(2, 0.95, 1);
    }
    const stage = CreateCylinder("lesson-display-plinth", {diameter: step === 1 ? 4.2 : 11, height: 0.12, tessellation: 64}, scene);
    stage.parent = this.root; stage.position.y = -0.1;
    const stageMaterial = new StandardMaterial("lesson-plinth", scene);
    stageMaterial.diffuseColor = Color3.FromHexString("#b9ccd4"); stageMaterial.specularColor.setAll(0.03);
    stage.material = stageMaterial;
    for (const m of this.root.getChildMeshes()) m.layerMask = 0x10000000;
  }
  update(dt: number, rect: DOMRect) {
    this.time += dt;
    const t = this.time;
    this.props.animate(this.root, t);
    if (this.step === 1) {
      this.runner.rotation.z = Math.sin(t * 35) * 0.025;
      for (const arm of this.shoulders) arm.rotation.x = -0.5 + Math.sin(t * 35) * 0.04;
      this.bottle.setEnabled(false);
    } else if (this.step === 3) {
      const cycle = t % 7;
      const jump = Math.min(1, cycle / 3);
      this.runner.position.set(cycle < 3 ? -2 : 2, cycle < 3 ? Math.sin(jump * Math.PI) * 2 : 0, cycle < 3 ? -2 + jump * 4 : cycle < 4 ? -1 + (cycle - 3) * 2 : 1);
      this.liquorPickup?.setEnabled(cycle < 4);
      for (const shoulder of this.shoulders) shoulder.rotation.x = cycle < 3 ? -0.7 : 0;
      for (const elbow of this.elbows) elbow.rotation.x = cycle < 3 ? -0.9 : 0;
      for (const thigh of this.thighs) thigh.rotation.x = cycle < 3 ? -0.35 - Math.sin(jump * Math.PI) * 0.5 : 0;
      for (const knee of this.knees) knee.rotation.x = cycle < 3 ? 0.55 + Math.sin(jump * Math.PI) : 0;
      const weight = cycle < 4 ? 0 : Math.sin(Math.min(1, (cycle - 4) / 3) * Math.PI);
      if (this.shoulders[0] && this.elbows[0]) drinkingPose(this.shoulders[0], this.elbows[0], this.bottle, weight);
    }
    if (this.hips) this.hips.position.y = 0.95;
    const canvas = this.scene.getEngine().getRenderingCanvas()!;
    const bounds = canvas.getBoundingClientRect();
    this.camera.viewport = new Viewport((rect.left - bounds.left) / bounds.width, (bounds.bottom - rect.bottom) / bounds.height, rect.width / bounds.width, rect.height / bounds.height);
    const aspect = Math.max(0.5, rect.width / Math.max(1, rect.height));
    this.camera.fov = 0.68;
    const width = this.step === 1 ? 3.8 : 10.5, height = this.step === 1 ? 3.8 : 5.8;
    const distance = Math.max(height, width / aspect) / (2 * Math.tan(this.camera.fov / 2)) * 1.08;
    this.camera.position.set(1000 + distance * 0.12, 1 + distance * 0.48, -distance * 0.87);
    this.camera.setTarget(new Vector3(1000, 1, 0));
  }
  dispose() {
    const stage = this.root.getChildMeshes().find(m => m.name === "lesson-display-plinth");
    stage?.material?.dispose(); this.root.dispose(); this.camera.dispose();
  }
}
