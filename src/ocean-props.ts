import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import { CreateLathe } from "@babylonjs/core/Meshes/Builders/latheBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

// Shared materials keep reef detail inexpensive when terrain cells are batched.
export class OceanProps {
  private materials = new Map<string, StandardMaterial>();
  constructor(private scene: Scene) {}

  material(kind: string, color: string) {
    const key = kind + color;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const mat = new StandardMaterial(`ocean-${key}`, this.scene);
    mat.diffuseColor = Color3.FromHexString(color).toLinearSpace();
    mat.specularColor.setAll(kind === "shell" ? 0.22 : 0.06);
    const texture = new DynamicTexture(`ocean-grain-${key}`, 128, this.scene, true);
    const ctx = texture.getContext();
    ctx.fillStyle = "#e9e5da"; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const x = (i * 37.71) % 128, y = (i * 71.37) % 128;
      const shade = 130 + (i * 31 % 110);
      ctx.fillStyle = `rgba(${shade},${shade},${shade},0.35)`;
      ctx.fillRect(x, y, kind === "sand" ? 1 : 2, 1);
    }
    if (kind === "sand") {
      ctx.strokeStyle = "rgba(130,115,90,0.12)";
      for (let row = -1; row < 12; row++) {
        ctx.beginPath();
        for (let x = 0; x <= 128; x += 4) {
          const y = row * 13 + Math.sin(x * Math.PI / 64) * 3;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    if (kind === "water") {
      ctx.fillStyle = "#8aafba"; ctx.fillRect(0, 0, 128, 128);
      for (let row = -1; row < 10; row++) {
        ctx.strokeStyle = row % 2 ? "#c4e9e5" : "#a6d4d8"; ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let x = 0; x <= 128; x += 2) {
          const y = row * 16 + Math.sin(x * Math.PI / 64 + row) * 4;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      mat.bumpTexture = texture; mat.bumpTexture.level = 0.18;
      mat.specularColor.setAll(0.6); mat.specularPower = 80;
    }
    texture.update(); mat.diffuseTexture = texture;
    mat.emissiveColor.setAll(0.025);
    this.materials.set(key, mat);
    return mat;
  }

  private tube(name: string, path: Vector3[], radius: number, mat: StandardMaterial, parent: TransformNode) {
    const mesh = CreateTube(name, {path, radius, tessellation: 7, cap: 3}, this.scene);
    mesh.material = mat; mesh.parent = parent;
    return mesh;
  }

  coral(parent: TransformNode, shape: number, height = 1.3, color = "#da8b9f") {
    const root = new TransformNode("branching-reef", this.scene); root.parent = parent;
    const mat = this.material("coral", color);
    if (shape % 3 === 2) {
      // Overlapping scalloped plates form a solid, readable reef silhouette.
      for (let i = 0; i < 5; i++) {
        const plate = CreateSphere("scalloped-table-coral", {diameter: 1, segments: 12}, this.scene);
        plate.parent = root; plate.material = mat;
        plate.scaling.set(1.22 - i * 0.12, height * 0.22, 1.1 - i * 0.09);
        plate.position.set(Math.sin(i * 2) * 0.08, (i - 2) * height * 0.18, 0);
      }
    } else {
      const core = CreateSphere("porous-coral-core", {diameter: 1, segments: 12}, this.scene);
      core.parent = root; core.material = mat; core.scaling.set(0.9, height, 0.85);
      for (let b = 0; b < 7; b++) {
        const a = b * 2.4, x = Math.cos(a), z = Math.sin(a);
        const h = height * (0.2 + (b % 3) * 0.1);
        this.tube("rounded-coral-bough", [new Vector3(0, -height * 0.3, 0),
          new Vector3(x * 0.25, h * 0.25, z * 0.22), new Vector3(x * 0.5, h, z * 0.43)],
          0.09 + (b % 2) * 0.025, mat, root);
        const tip = CreateSphere("coral-polyp-crown", {diameter: 0.22, segments: 8}, this.scene);
        tip.parent = root; tip.material = mat; tip.position.set(x * 0.5, h, z * 0.43);
      }
    }
    return root;
  }

  kelp(parent: TransformNode, height: number, phase: number) {
    const root = new TransformNode("ribbon-kelp", this.scene); root.parent = parent;
    const mat = this.material("kelp", phase % 2 ? "#498568" : "#6e9b69");
    for (let strand = 0; strand < 3; strand++) {
      const path = Array.from({length: 7}, (_, i) => new Vector3(
        Math.sin(i * 0.8 + phase + strand) * i * 0.055 + strand * 0.17,
        height * i / 6, Math.cos(i * 0.6 + phase) * i * 0.04));
      const blade = this.tube("kelp-frond", path, 0.09, mat, root);
      blade.scaling.z = 0.24;
    }
    return root;
  }

  fish(parent: TransformNode, color = "#efb762") {
    const root = new TransformNode("reef-fish", this.scene); root.parent = parent;
    const mat = this.material("shell", color);
    const body = CreateSphere("fish-streamlined-body", {diameter: 1, segments: 12}, this.scene);
    body.parent = root; body.material = mat; body.scaling.set(0.28, 0.36, 0.74);
    const tail = CreateSphere("fish-fan-tail", {diameter: 1, segments: 8}, this.scene);
    tail.parent = root; tail.material = mat; tail.position.z = -0.43; tail.scaling.set(0.045, 0.38, 0.28);
    for (const side of [-1, 1]) {
      const fin = CreateSphere("fish-pectoral-fin", {diameter: 1, segments: 8}, this.scene);
      fin.parent = root; fin.material = mat; fin.position.set(side * 0.15, -0.04, -0.05);
      fin.scaling.set(0.28, 0.045, 0.19); fin.rotation.z = side * 0.3;
      const eye = CreateSphere("fish-eye", {diameter: 0.09, segments: 8}, this.scene);
      eye.parent = root; eye.position.set(side * 0.115, 0.07, 0.23);
      eye.material = this.material("eye", "#233c4a");
    }
    const dorsal = CreateSphere("fish-dorsal-fin", {diameter: 1, segments: 8}, this.scene);
    dorsal.parent = root; dorsal.material = mat; dorsal.position.set(0, 0.2, -0.06);
    dorsal.scaling.set(0.04, 0.2, 0.36);
    return root;
  }

  vent(parent: TransformNode) {
    const root = new TransformNode("eroded-vent", this.scene); root.parent = parent;
    const mat = this.material("basalt", "#6e6878");
    const profile = [new Vector3(0.65, -0.65, 0), new Vector3(0.6, -0.4, 0),
      new Vector3(0.44, -0.1, 0), new Vector3(0.36, 0.35, 0),
      new Vector3(0.31, 0.61, 0), new Vector3(0.2, 0.59, 0), new Vector3(0.15, 0.3, 0)];
    const body = CreateLathe("hollow-volcanic-chimney", {shape: profile, tessellation: 18, sideOrientation: 2}, this.scene);
    body.parent = root; body.material = mat;
    for (let i = 0; i < 7; i++) {
      const rock = CreateSphere("vent-weathered-ridge", {diameter: 1, segments: 8}, this.scene);
      rock.parent = root; rock.material = mat;
      const a = i * Math.PI * 2 / 7;
      rock.position.set(Math.cos(a) * 0.32, -0.25, Math.sin(a) * 0.32);
      rock.scaling.set(0.38, 0.7, 0.35);
    }
    const lip = CreateTorus("vent-glowing-minerals", {diameter: 0.5, thickness: 0.065, tessellation: 20}, this.scene);
    lip.parent = root; lip.position.y = 0.59;
    lip.material = this.material("mineral", "#dd9d68");
    return root;
  }
}
