import type { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { SnowProps } from "./snow-props.ts";

export class SnowPreview {
  readonly camera: FreeCamera;
  private root: TransformNode;
  private stageMaterial: StandardMaterial;
  constructor(scene: Scene, source: TransformNode, props: SnowProps, readonly step: number) {
    this.root = new TransformNode("snow-lesson-stage", scene);
    this.root.position.x = 1000;
    this.camera = new FreeCamera("snow-lesson-camera", new Vector3(1000, 6, -10), scene);
    this.camera.layerMask = 0x10000000;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 45;
    this.camera.fov = 0.66;

    if (step === 1) {
      const explorer = source.clone("lesson-explorer", this.root)!;
      explorer.position.set(0, 0, 0);
      explorer.rotation.set(0, Math.PI + 0.18, 0);
      for (const node of explorer.getDescendants()) {
        if (!(node instanceof TransformNode)) continue;
        if (/aura|jet|pulse|booster-pod|snow-liquor/.test(node.name)) node.setEnabled(false);
        if (node.name.endsWith("hips")) node.position.set(0, 0.95, 0);
        if (node.name.endsWith("torso")) { node.position.y = 0; node.scaling.setAll(1); }
        if (/(hips|shoulder|elbow|hip-joint|knee|ankle|torso|head-joint)$/.test(node.name)) node.rotation.set(0, 0, 0);
        if (node.name.endsWith("elbow")) node.rotation.x = -0.25;
      }
    } else if (step === 2) {
      const hazards = [
        {type: "ice", x: -3.35, z: -1.6, size: 0.51},
        {type: "snowdrift", x: -1.12, z: -1.8, size: 0.72},
        {type: "snowman", x: 1.18, z: -1.65, size: 0.65},
        {type: "stump", x: 3.36, z: -1.72, size: 0.82},
        {type: "pool", x: -3.2, z: 1.85, size: 0.66},
        {type: "fire", x: -0.62, z: 1.72, size: 0.88},
        {type: "snow-log", x: 2.35, z: 1.68, size: 0.32},
      ] as const;
      for (const {type, x, z, size} of hazards) {
        const model = props.create(type);
        model.parent = this.root;
        model.position.set(x, 0, z);
        model.scaling.setAll(size);
        if (type === "pool") model.scaling.z = 0.095;
      }
    } else {
      const fire = props.create("fire");
      fire.parent = this.root;
      fire.position.x = -1.35;
      fire.scaling.setAll(1.3);
      const bottle = props.create("liquor", false);
      bottle.parent = this.root;
      bottle.position.set(1.45, 0.68, 0);
      bottle.scaling.setAll(2.7);
    }
    const stage = CreateCylinder("lesson-display-plinth", {diameter: step === 1 ? 4.1 : step === 2 ? 10.2 : 6.4, height: 0.12, tessellation: 64}, scene);
    stage.parent = this.root;
    stage.position.y = -0.13;
    this.stageMaterial = new StandardMaterial("lesson-plinth", scene);
    this.stageMaterial.diffuseColor = Color3.FromHexString("#aec5cd");
    this.stageMaterial.specularColor.setAll(0.03);
    stage.material = this.stageMaterial;
    for (const mesh of this.root.getChildMeshes()) mesh.layerMask = 0x10000000;
  }

  frame(rect: DOMRect, canvas: DOMRect) {
    this.camera.viewport = new Viewport((rect.left - canvas.left) / canvas.width, (canvas.bottom - rect.bottom) / canvas.height, rect.width / canvas.width, rect.height / canvas.height);
    const aspect = Math.max(0.5, rect.width / Math.max(1, rect.height));
    const width = this.step === 1 ? 4.3 : this.step === 2 ? 10.6 : 6.6;
    const height = this.step === 1 ? 3.55 : this.step === 2 ? 6.1 : 4.15;
    const distance = Math.max(height, width / aspect) / (2 * Math.tan(this.camera.fov / 2)) * 1.05;
    const overhead = this.step === 2 ? 0.64 : 0.41;
    this.camera.position.set(1000 + distance * 0.08, 0.9 + distance * overhead, -distance * Math.sqrt(1 - overhead ** 2));
    this.camera.setTarget(new Vector3(1000, 0.9, 0));
  }

  dispose() {
    this.root.dispose();
    this.stageMaterial.dispose();
    this.camera.dispose();
  }
}
