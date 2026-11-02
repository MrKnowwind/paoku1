import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";

type Surface = "bark" | "cut" | "stone" | "plank" | "rope";

export class ForestProps {
  private scene: Scene;
  private materials = new Map<Surface, StandardMaterial>();
  constructor(scene: Scene) {
    this.scene = scene;
  }

  private material(surface: Surface) {
    const cached = this.materials.get(surface);
    if (cached) return cached;
    const material = new StandardMaterial(`natural-${surface}`, this.scene);
    material.specularColor.setAll(0.025);
    if (surface === "rope") {
      material.diffuseColor = Color3.FromHexString("#c1ac82").toLinearSpace();
    } else {
      const texture = new DynamicTexture(
        `surface-${surface}`,
        512,
        this.scene,
        true,
      );
      const ctx = texture.getContext() as CanvasRenderingContext2D;
      let seed = 93287;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      ctx.fillStyle = {
        bark: "#805a40",
        cut: "#c9aa79",
        stone: "#92998e",
        plank: "#aa8259",
      }[surface];
      ctx.fillRect(0, 0, 512, 512);
      if (surface === "cut") {
        ctx.strokeStyle = "#896943";
        for (let ring = 18; ring < 251; ring += 13 + random() * 8) {
          ctx.lineWidth = 1 + random() * 1.8;
          ctx.globalAlpha = 0.36 + random() * 0.3;
          ctx.beginPath();
          for (let i = 0; i <= 128; i++) {
            const a = (i / 128) * Math.PI * 2,
              r = ring + Math.sin(a * 5 + ring) * 2.4 + Math.sin(a * 9) * 1.2;
            const x = 250 + Math.cos(a) * r,
              y = 257 + Math.sin(a) * r * 0.94;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        for (let i = 0; i < 4; i++) {
          const a = i * 1.7 + 0.4;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(256 + Math.cos(a) * 250, 256 + Math.sin(a) * 250);
          ctx.lineTo(
            258 + Math.cos(a + 0.04) * 190,
            253 + Math.sin(a + 0.04) * 190,
          );
          ctx.lineTo(
            253 + Math.cos(a - 0.02) * 135,
            257 + Math.sin(a - 0.02) * 135,
          );
          ctx.stroke();
        }
      } else if (surface === "stone") {
        for (let i = 0; i < 9000; i++) {
          ctx.globalAlpha = 0.08 + random() * 0.16;
          ctx.fillStyle = ["#e1ddca", "#474f48", "#b7ae97", "#7e886e"][i % 4];
          const size = 1 + random() * 4;
          ctx.fillRect(random() * 512, random() * 512, size, size);
        }
        ctx.strokeStyle = "#555e53";
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < 9; i++) {
          let x = random() * 512,
            y = random() * 512;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let j = 0; j < 5; j++) {
            x += random() * 22 - 8;
            y += random() * 23;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else {
        for (let i = 0; i < 115; i++) {
          const x = (i / 115) * 512;
          ctx.globalAlpha = 0.15 + random() * 0.35;
          ctx.strokeStyle = i % 3 ? "#523d2a" : "#d1aa76";
          ctx.lineWidth = 0.8 + random() * 3.5;
          ctx.beginPath();
          for (let y = 0; y <= 512; y += 12) {
            const bend =
              Math.sin(y * 0.025 + i * 1.8) * 2 + Math.sin(y * 0.07 + i) * 0.8;
            if (y === 0) ctx.moveTo(x + bend, y);
            else ctx.lineTo(x + bend, y);
          }
          ctx.stroke();
        }
        ctx.strokeStyle = "#503b2b";
        ctx.globalAlpha = 0.26;
        for (let i = 0; i < 4; i++) {
          const x = 70 + random() * 370,
            y = 65 + random() * 380;
          for (let r = 3; r < 17; r += 3) {
            ctx.beginPath();
            ctx.ellipse(x, y, r, r * 2.5, 0.08, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      texture.update();
      material.diffuseTexture = texture;
      material.diffuseColor = Color3.White();
    }
    this.materials.set(surface, material);
    return material;
  }

  private reshape(
    mesh: Mesh,
    deform: (x: number, y: number, z: number) => [number, number, number],
  ) {
    const vertices = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    for (let i = 0; i < vertices.length; i += 3) {
      const p = deform(vertices[i], vertices[i + 1], vertices[i + 2]);
      vertices[i] = p[0];
      vertices[i + 1] = p[1];
      vertices[i + 2] = p[2];
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(vertices, mesh.getIndices()!, normals);
    mesh.updateVerticesData(VertexBuffer.PositionKind, vertices, true);
    mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
    mesh.receiveShadows = true;
  }

  private timber(name: string, height: number, diameter: number, seed: number) {
    const mesh = CreateCylinder(
      name,
      {
        height,
        diameterTop: diameter * 0.95,
        diameterBottom: diameter,
        tessellation: 32,
        subdivisions: 10,
        updatable: true,
      },
      this.scene,
    );
    this.reshape(mesh, (x, y, z) => {
      const angle = Math.atan2(z, x);
      const noise =
        1 +
        Math.sin(angle * 5 + y * 2 + seed) * 0.037 +
        Math.sin(angle * 11 - y * 5) * 0.017;
      return [
        x * noise + Math.sin(y * 2 + seed) * diameter * 0.025,
        y,
        z * noise,
      ];
    });
    mesh.material = this.material("bark");
    return mesh;
  }

  private stone(
    name: string,
    size: [number, number, number],
    seed: number,
    parent: TransformNode,
  ) {
    const mesh = CreateSphere(
      name,
      { diameter: 1, segments: 16, updatable: true },
      this.scene,
    );
    this.reshape(mesh, (x, y, z) => {
      const bump =
        1 +
        Math.sin(x * 13 + seed) * Math.cos(z * 11 - y * 7) * 0.1 +
        Math.sin(y * 17 + z * 8) * 0.045;
      return [x * bump * size[0], y * bump * size[1], z * bump * size[2]];
    });
    const vertices = mesh.getVerticesData(VertexBuffer.PositionKind)!,
      colors: number[] = [];
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i],
        y = vertices[i + 1],
        z = vertices[i + 2];
      const patch = Math.sin(x * 11 + seed) * Math.sin(z * 9 + y * 6);
      const moss = y > size[1] * 0.27 && patch > -0.15;
      const shade = 0.88 + Math.sin(x * 7 + z * 5 + seed) * 0.08;
      colors.push(
        moss ? shade * 0.72 : shade,
        moss ? shade * 0.87 : shade,
        moss ? shade * 0.48 : shade * 0.96,
        1,
      );
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    mesh.useVertexColors = true;
    mesh.material = this.material("stone");
    mesh.parent = parent;
    return mesh;
  }

  create(type: "log" | "arch" | "rock", seed: number) {
    const root = new TransformNode(`natural-${type}`, this.scene);
    if (type === "log") {
      const log = this.timber("fallen-trunk", 1.9, 1.04, seed);
      log.rotation.z = Math.PI / 2;
      log.position.y = 0.55;
      log.parent = root;
      for (const side of [-1, 1]) {
        const end = CreateCylinder(
          "exposed-end-grain",
          { height: 0.015, diameter: 0.91, tessellation: 40 },
          this.scene,
        );
        end.rotation.z = Math.PI / 2;
        end.position.set(side * 0.958, 0.55, 0);
        end.material = this.material("cut");
        end.parent = root;
      }
      const branch = this.timber("broken-branch", 0.35, 0.16, seed + 3);
      branch.rotation.z = 0.8;
      branch.rotation.x = -0.2;
      branch.position.set(-0.5, 1.03, 0.12);
      branch.parent = root;
    } else if (type === "arch") {
      for (const side of [-1, 1]) {
        const post = this.timber("rough-post", 2.65, 0.22, seed + side);
        post.position.set(side * 0.98, 1.325, 0);
        post.rotation.z = side * 0.018;
        post.parent = root;
        for (const y of [1.85, 1.9, 2.34, 2.39]) {
          const rope = CreateTorus(
            "rope-binding",
            { diameter: 0.28, thickness: 0.025, tessellation: 20 },
            this.scene,
          );
          rope.position.set(side * 0.98, y, 0);
          rope.material = this.material("rope");
          rope.parent = root;
        }
      }
      for (let i = 0; i < 3; i++) {
        const board = CreateBox(
          "weathered-plank",
          {
            width: 0.67,
            height: 1.08 + i * 0.025,
            depth: 0.18,
            updatable: true,
          },
          this.scene,
        );
        this.reshape(board, (x, y, z) => [
          x + Math.sin(y * 7 + i) * 0.012,
          y + Math.sin(x * 14 + i * 2) * 0.025,
          z + Math.cos(y * 8 + x * 9) * 0.01,
        ]);
        board.material = this.material("plank");
        board.position.set((i - 1) * 0.66, 2.04, 0.015 * i);
        board.rotation.z = (i - 1) * 0.025;
        board.parent = root;
      }
      const top = this.timber("top-crosspiece", 2.18, 0.16, seed);
      top.rotation.z = Math.PI / 2;
      top.position.y = 2.58;
      top.parent = root;
    } else {
      const main = this.stone(
        "weathered-boulder",
        [1.74, 2.6, 1.65],
        seed,
        root,
      );
      main.position.set(0, 1.27, 0);
      main.rotation.set(0.04, seed * 0.37, -0.08);
      const base = this.stone("buried-rock", [0.8, 0.75, 1.0], seed + 5, root);
      base.position.set(-0.48, 0.27, 0.1);
      const chip = this.stone(
        "rock-fragment",
        [0.28, 0.22, 0.4],
        seed + 11,
        root,
      );
      chip.position.set(0.6, 0.1, -0.45);
    }
    return root;
  }

  createRestStop() {
    const root = new TransformNode("roadside-rest", this.scene);
    const stump = this.timber("resting-stump", 0.61, 1.06, 37);
    stump.position.y = 0.305;
    stump.parent = root;
    const top = CreateCylinder(
      "stump-seat",
      { height: 0.025, diameter: 1.02, tessellation: 40 },
      this.scene,
    );
    top.position.y = 0.62;
    top.material = this.material("cut");
    top.parent = root;
    return root;
  }
}
