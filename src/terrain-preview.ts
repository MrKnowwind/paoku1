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
  private demo?: (time: number) => void;

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
      }
      if (guide === "ocean") {
        this.frameWidth = 5.6;
        this.frameHeight = 5.3;
        this.overhead = 0.03;
        this.targetY = 2.26;
        const lines: Vector3[][] = [];
        for (let i = 0; i < 4; i++) {
          lines.push([new Vector3(-2.1, i * 1.4 + 0.15, 0.75), new Vector3(2.1, i * 1.4 + 0.15, 0.75)]);
          lines.push([new Vector3((i - 1.5) * 1.4, 0.15, 0.75), new Vector3((i - 1.5) * 1.4, 4.35, 0.75)]);
        }
        const grid = CreateLineSystem("guide-swim-grid", {lines}, scene);
        grid.color = Color3.FromHexString("#57868f");
        grid.parent = this.root;
        explorer.scaling.setAll(0.48);
        explorer.rotation.set(0.8, Math.PI + 0.55, 0.06);
        const cells = [[0, 1], [-1, 1], [-1, 2], [0, 2], [1, 2], [1, 1], [1, 0], [0, 0], [0, 1]];
        this.demo = time => {
          const phase = time * 0.91, index = Math.floor(phase) % (cells.length - 1);
          const t = Math.min(1, (phase % 1) * 2.4);
          const [x, y] = cells[index], [nx, ny] = cells[index + 1];
          explorer.position.set((x + (nx - x) * t) * 1.4, 0.44 + (y + (ny - y) * t) * 1.4, 0.12);
        };
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
      this.demo = time => snow().animate(fire, time);
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
        this.demo = time => {
          bubble.position.y = 1.3 + 0.12 * Math.sin(time * 2);
          const phase = time % 4;
          const erupting = phase >= 2.25;
          plume.setEnabled(phase > 1);
          plume.scaling.y = erupting ? 1 : 0.08;
          plume.position.y = 0.65 + plumeHeight / 2 * plume.scaling.y;
          plume.visibility = erupting ? 0.84 : 0.28 + Math.sin(time * 14) * 0.13;
          for (const [i, steam] of bubbles.entries()) {
            steam.setEnabled(phase > 1);
            const lift = (time * (erupting ? 1.4 : 0.35) + i * 0.37) % 1;
            steam.position.set(Math.sin(i * 2.4) * 0.3, 0.65 + lift * (erupting ? plumeHeight : 0.45), Math.cos(i * 2.4) * 0.3);
            steam.scaling.setAll(0.35 + Math.sin(lift * Math.PI) * 0.8);
          }
        };
      } else {
        const crossing = model("fish");
        const school = crossing.getChildTransformNodes(true).find(node => node.name === "fish-school")!;
        const sign = crossing.getChildMeshes().find(mesh => mesh.name === "fish-entry-sign")!;
        const tails = school.getChildMeshes().filter(mesh => mesh.name === "fish-fan-tail");
        const lines: Vector3[][] = [];
        for (const y of [1.1, 2.12, 3.14]) lines.push([new Vector3(-3.1, y, 1), new Vector3(3.1, y, 1)]);
        const lanes = CreateLineSystem("guide-fish-depths", {lines}, scene);
        lanes.parent = this.root;
        lanes.color = Color3.FromHexString("#75a2a9");
        this.demo = time => {
          const cycle = Math.floor(time / 3.8), phase = (time % 3.8) / 3.8;
          const side = cycle % 2 ? 1 : -1;
          crossing.position.y = 1.1 + cycle % 3 * 1.02;
          sign.setEnabled(phase < 0.5);
          sign.position.x = side * 2.6;
          sign.material = warningMaterial(Math.min(1, phase * 2));
          school.setEnabled(phase > 0.24);
          school.position.x = side * (3.8 - 7.6 * Math.max(0, (phase - 0.25) / 0.75));
          school.rotation.y = -side * Math.PI / 2;
          for (const tail of tails) tail.rotation.y = Math.sin(time * 7) * 0.3;
        };
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

  frame(rect: DOMRect, canvas: DOMRect, time: number) {
    this.demo?.(time);
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
