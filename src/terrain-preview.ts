import type { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { SnowProps } from "./snow-props.ts";
import type { GuideId } from "./tutorial.ts";
import type { TrackItem } from "./game.ts";
import { makeCoral } from "./coral.ts";
import { CONFIG } from "./config.ts";

export class TerrainPreview {
  readonly camera: FreeCamera;
  private root: TransformNode;
  private stageMaterial: StandardMaterial;
  private frameWidth = 4.3;
  private frameHeight = 3.55;
  private overhead = 0.41;
  private targetY = 0.9;

  constructor(
    scene: Scene, source: TransformNode, readonly guide: GuideId, readonly step: number,
    snow: () => SnowProps, makeItem: (item: TrackItem) => TransformNode,
    warningMaterial: (urgency: number) => StandardMaterial,
  ) {
    this.root = new TransformNode("terrain-guide-stage", scene);
    this.root.position.x = 1000;
    this.camera = new FreeCamera("terrain-guide-camera", new Vector3(1000, 6, -10), scene);
    this.camera.layerMask = 0x10000000;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 45;
    this.camera.fov = 0.66;

    if (step === 1) {
      const explorer = source.clone("lesson-explorer", this.root)!;
      explorer.position.set(0, 0, 0);
      explorer.rotation.set(0, Math.PI + 0.18, 0);
      explorer.scaling.setAll(1);
      for (const node of explorer.getDescendants()) {
        if (!(node instanceof TransformNode)) continue;
        if (/aura|jet|pulse|booster-pod|snow-liquor/.test(node.name)) node.setEnabled(false);
        if (node.name.endsWith("hips")) node.position.set(0, 0.95, 0);
        if (node.name.endsWith("torso")) { node.position.y = 0; node.scaling.setAll(1); }
        if (/(hips|shoulder|elbow|hip-joint|knee|ankle|torso|head-joint)$/.test(node.name)) node.rotation.set(0, 0, 0);
        if (node.name.endsWith("elbow")) node.rotation.x = -0.25;
        if (guide === "ocean") {
          const side = node.position.x || (node.parent instanceof TransformNode ? node.parent.position.x : 0);
          if (node.name.endsWith("shoulder")) node.rotation.set(side < 0 ? -2.5 : -0.92, 0, side < 0 ? -0.24 : 0.46);
          if (node.name.endsWith("elbow")) node.rotation.x = side < 0 ? -0.38 : -1.16;
          if (node.name.endsWith("hip-joint")) node.rotation.x = side < 0 ? -0.25 : 0.12;
          if (node.name.endsWith("knee")) node.rotation.x = 0.28;
          if (node.name.endsWith("ankle")) node.rotation.x = 0.19;
          if (node.name.endsWith("head-joint")) node.rotation.x = -0.22;
        }
      }
      if (guide === "ocean") {
        this.frameWidth = 6.1;
        this.frameHeight = 4.65;
        this.overhead = 0.18;
        this.targetY = 2.26;
        const lines: Vector3[][] = [];
        for (let row = 0; row < 3; row++) for (let col = -1; col <= 1; col++) {
          const x = col * 1.4, y = 0.86 + row * 1.4, half = 0.63;
          lines.push([
            new Vector3(x - half, y - half, 1), new Vector3(x + half, y - half, 1),
            new Vector3(x + half, y + half, 1), new Vector3(x - half, y + half, 1),
            new Vector3(x - half, y - half, 1),
          ]);
        }
        const grid = CreateLineSystem("guide-swim-grid", {lines}, scene);
        grid.color = Color3.FromHexString("#759c9a");
        grid.parent = this.root;
        const arrows: Vector3[][] = [];
        for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const point = (along: number, across = 0) =>
            new Vector3(x * along - y * across, 2.26 + y * along + x * across, 0.65);
          arrows.push([point(0.69), point(1.3)], [point(1.09, -0.13), point(1.3), point(1.09, 0.13)]);
        }
        const steps = CreateLineSystem("guide-swim-arrows", {lines: arrows}, scene);
        steps.color = Color3.FromHexString("#176b64");
        steps.parent = this.root;
        // Match the live runner's forward (+Z) swim pitch, viewed from behind.
        explorer.scaling.setAll(0.65);
        explorer.position.set(0, 1.95, -0.08);
        explorer.rotation.set(1.05, 0, 0);
      }
    } else if (guide === "snow" && step === 2) {
      this.frameWidth = 8.9;
      this.frameHeight = 5.5;
      this.overhead = 0.68;
      this.targetY = 0.56;
      const hazards = [
        {type: "ice", x: -2.95, z: -1.45, size: 0.65},
        {type: "snowdrift", x: 0.27, z: -1.7, size: 0.76},
        {type: "snowman", x: 1.95, z: -1.65, size: 0.62},
        {type: "pool", x: -3.01, z: 1.65, size: 0.73},
        {type: "fire", x: -1.32, z: 1.72, size: 0.82},
        {type: "stump", x: 0.66, z: 1.78, size: 0.7},
        {type: "snow-log", x: 2.53, z: 1.68, size: 0.31},
      ] as const;
      for (const {type, x, z, size} of hazards) {
        const model = snow().create(type);
        model.parent = this.root;
        model.position.set(x, 0, z);
        model.scaling.setAll(size);
        if (type === "pool") {
          model.scaling.z = 0.085;
          model.position.y = 0.35;
        }
        if (type === "ice") model.scaling.z = 0.3;
      }
    } else if (guide === "snow") {
      this.frameWidth = 5.6;
      this.frameHeight = 3.65;
      const fire = snow().create("fire");
      fire.parent = this.root;
      fire.position.x = -1.35;
      fire.scaling.setAll(1.3);
      const bottle = snow().create("liquor", false);
      bottle.parent = this.root;
      bottle.position.set(1.45, 0.68, 0);
      bottle.scaling.setAll(2.7);
    } else {
      this.frameWidth = step === 2 ? 8.8 : 7.6;
      this.frameHeight = 4.7;
      this.targetY = step === 2 ? 1.85 : 2.08;
      this.overhead = 0.13;
      const model = (type: TrackItem["type"]) => {
        const item = makeItem({type, id: 0, lane: 0, z: 0, y: 0, worldZ: 0,
          coral: type === "coral" ? makeCoral(0, 2) : undefined});
        item.parent = this.root;
        return item;
      };
      if (step === 2) {
        const bubble = model("bubble");
        bubble.position.set(-2.7, 1.25, 0);
        const coral = model("coral");
        coral.position.set(-0.2, 0, 0);
        coral.scaling.setAll(0.54);
        const vent = model("volcano");
        vent.position.x = 2.55;
        vent.scaling.setAll(0.54);
        const plume = vent.getChildMeshes().find(mesh => mesh.name === "thermal-plume")!;
        const bubbles = vent.getChildMeshes().filter(mesh => mesh.name.startsWith("vent-steam-"));
        const plumeHeight = CONFIG.waterSurface - CONFIG.seabedHeight - 1.3;
        plume.setEnabled(true);
        plume.visibility = 0.66;
        for (const [i, steam] of bubbles.entries()) {
          steam.setEnabled(true);
          steam.position.set(Math.sin(i * 2.4) * 0.3, 0.65 + (i + 0.4) / bubbles.length * plumeHeight, Math.cos(i * 2.4) * 0.3);
          steam.scaling.setAll(0.72);
        }
      } else {
        const crossing = model("fish");
        const school = crossing.getChildTransformNodes(true).find(node => node.name === "fish-school")!;
        const sign = crossing.getChildMeshes().find(mesh => mesh.name === "fish-entry-sign")!;
        const lines: Vector3[][] = [];
        for (const y of [1.1, 2.12, 3.14]) lines.push([new Vector3(-3.1, y, 1), new Vector3(3.1, y, 1)]);
        const lanes = CreateLineSystem("guide-fish-depths", {lines}, scene);
        lanes.parent = this.root;
        lanes.color = Color3.FromHexString("#75a2a9");
        crossing.position.y = 2.12;
        sign.setEnabled(true);
        sign.position.x = -2.75;
        sign.material = warningMaterial(0.78);
        school.position.x = 0.35;
        school.rotation.y = Math.PI / 2;
        const path = CreateLineSystem("guide-fish-direction", {lines: [
          [new Vector3(-1.8, 1.76, 0.42), new Vector3(2.65, 1.76, 0.42)],
          [new Vector3(2.36, 1.55, 0.42), new Vector3(2.65, 1.76, 0.42), new Vector3(2.36, 1.97, 0.42)],
        ]}, scene);
        path.color = Color3.FromHexString("#176b64");
        path.parent = this.root;
      }
    }
    const stage = CreateCylinder("lesson-display-plinth", {diameter: this.frameWidth, height: 0.12, tessellation: 48}, scene);
    stage.parent = this.root;
    stage.position.y = -0.14;
    this.stageMaterial = new StandardMaterial("lesson-plinth", scene);
    this.stageMaterial.diffuseColor = Color3.FromHexString(guide === "snow" ? "#aec5cd" : "#649aa5");
    this.stageMaterial.specularColor.setAll(0.03);
    stage.material = this.stageMaterial;
    stage.setEnabled(guide === "snow" || step === 2);
    for (const mesh of this.root.getChildMeshes()) mesh.layerMask = 0x10000000;
  }

  frame(rect: DOMRect, canvas: DOMRect) {
    this.camera.viewport = new Viewport((rect.left - canvas.left) / canvas.width, (canvas.bottom - rect.bottom) / canvas.height, rect.width / canvas.width, rect.height / canvas.height);
    const aspect = Math.max(0.5, rect.width / Math.max(1, rect.height));
    const distance = Math.max(this.frameHeight, this.frameWidth / aspect) / (2 * Math.tan(this.camera.fov / 2)) * 1.07;
    this.camera.position.set(1000 + distance * (this.guide === "snow" ? 0.055 : 0), this.targetY + distance * this.overhead,
      -distance * Math.sqrt(1 - this.overhead ** 2));
    this.camera.setTarget(new Vector3(1000, this.targetY, 0));
  }

  setEnabled(enabled: boolean) { this.root.setEnabled(enabled); }

  dispose() {
    this.root.dispose();
    this.stageMaterial.dispose();
    this.camera.dispose();
  }
}
