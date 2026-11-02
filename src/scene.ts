import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { RunnerGame, TrackItem } from "./game.ts";

export class ForestScene {
  engine: Engine;
  scene: Scene;
  private camera: FreeCamera;
  private shadows: ShadowGenerator;
  private runner: TransformNode;
  private limbs: TransformNode[] = [];
  private scarf: Mesh;
  private chunks: TransformNode[] = [];
  private itemMeshes = new Map<number, TransformNode>();
  private previewItems: TransformNode[] = [];
  private materials = new Map<string, StandardMaterial>();
  private templates = new Map<string, Mesh>();
  private particles: { mesh: Mesh; life: number; velocity: Vector3 }[] = [];
  private time = 0;
  private lastCoins = 0;
  private mode = "";
  private high = true;

  constructor(canvas: HTMLCanvasElement, highQuality: boolean) {
    this.engine = new Engine(
      canvas,
      true,
      { stencil: false, preserveDrawingBuffer: false },
      false,
    );
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString("#e5efdfFF");
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.011;
    this.scene.fogColor = Color3.FromHexString("#e5efdf");
    this.camera = new FreeCamera("camera", new Vector3(-6, 8, -14), this.scene);
    this.camera.setTarget(new Vector3(0, 1, 11));
    this.camera.fov = 0.8;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 240;
    new HemisphericLight("sky", new Vector3(0, 1, 0), this.scene).intensity =
      0.6;
    const sun = new DirectionalLight(
      "sun",
      new Vector3(-0.6, -1, 0.5),
      this.scene,
    );
    sun.position = new Vector3(30, 50, -30);
    sun.intensity = 0.5;
    this.shadows = new ShadowGenerator(1024, sun);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
    this.shadows.bias = 0.002;
    this.shadows.normalBias = 0.03;
    this.shadows.setDarkness(0.22);
    this.createWorld();
    const character = this.createRunner();
    this.runner = character.root;
    this.scarf = character.scarf;
    for (const mesh of this.runner.getChildMeshes())
      this.shadows.addShadowCaster(mesh);
    this.previewItems = [
      this.createItem({ id: -1, type: "coin", lane: 0, z: 7, y: 1 }),
      this.createItem({ id: -2, type: "coin", lane: 0, z: 11, y: 1 }),
      this.createItem({ id: -3, type: "coin", lane: 0, z: 15, y: 1 }),
      this.createItem({ id: -4, type: "log", lane: 1, z: 25, y: 0 }),
      this.createItem({ id: -5, type: "arch", lane: -1, z: 43, y: 0 }),
    ];
    this.setQuality(highQuality);
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  private mat(color: string, emissive = false) {
    const key = color + emissive;
    if (!this.materials.has(key)) {
      const mat = new StandardMaterial(key, this.scene);
      mat.diffuseColor = Color3.FromHexString(color);
      mat.specularColor = Color3.Black();
      if (emissive) mat.emissiveColor = Color3.FromHexString(color).scale(0.35);
      this.materials.set(key, mat);
    }
    return this.materials.get(key)!;
  }

  private box(
    name: string,
    size: number[],
    color: string,
    pos: number[],
    parent?: TransformNode,
  ) {
    const key = `box-${color}-${size.join("-")}`;
    let source = this.templates.get(key);
    if (!source) {
      source = CreateBox(
        key,
        { width: size[0], height: size[1], depth: size[2] },
        this.scene,
      );
      source.material = this.mat(color);
      source.receiveShadows = true;
      source.setEnabled(false);
      this.templates.set(key, source);
    }
    const mesh = source.createInstance(name);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.parent = parent ?? null;
    return mesh;
  }

  private sphere(
    name: string,
    scale: number[],
    color: string,
    pos: number[],
    parent?: TransformNode,
  ) {
    const key = `sphere-${color}`;
    let source = this.templates.get(key);
    if (!source) {
      source = CreateSphere(key, { diameter: 1, segments: 4 }, this.scene);
      source.material = this.mat(color);
      source.setEnabled(false);
      this.templates.set(key, source);
    }
    const mesh = source.createInstance(name);
    mesh.scaling.set(scale[0], scale[1], scale[2]);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.parent = parent ?? null;
    return mesh;
  }

  private tree(
    x: number,
    z: number,
    size: number,
    color: string,
    parent: TransformNode,
  ) {
    this.box("trunk", [0.4, 2.6, 0.4], "#83664b", [x, 1, z], parent);
    const key = `pine-${color}`;
    let source = this.templates.get(key);
    if (!source) {
      source = CreateCylinder(
        key,
        { height: 2.7, diameterTop: 0, diameterBottom: 3.5, tessellation: 6 },
        this.scene,
      );
      source.material = this.mat(color);
      source.setEnabled(false);
      this.templates.set(key, source);
    }
    for (let j = 0; j < 3; j++) {
      const cone = source.createInstance("pine");
      cone.parent = parent;
      cone.scaling.setAll(size * (1 - j * 0.22));
      cone.position.set(x, size * (2.6 + j * 1.25), z);
      cone.rotation.y = x;
    }
  }

  private createWorld() {
    this.box("meadow", [350, 1, 400], "#b4c995", [0, -0.65, 140]);
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      this.sphere(
        "hill",
        [36 + i * 2, 18 + (i % 3) * 5, 32],
        i % 3 ? "#a5c6a1" : "#86b6a0",
        [side * (35 + i * 3), 1, 100 + i * 8],
      );
    }
    for (let chunk = 0; chunk < 5; chunk++) {
      const root = new TransformNode(`woodland-${chunk}`, this.scene);
      root.position.z = chunk * 40 - 20;
      this.chunks.push(root);
      this.box("trail", [8.8, 0.18, 40], "#ddc69c", [0, -0.04, 20], root);
      for (const side of [-1, 1]) {
        this.box(
          "trail-edge",
          [0.16, 0.12, 40],
          "#f2e5c7",
          [side * 4.35, 0.08, 20],
          root,
        );
        this.box(
          "grass-edge",
          [1.3, 0.3, 40],
          "#85aa76",
          [side * 5.05, -0.16, 20],
          root,
        );
        for (let i = 0; i < 8; i++) {
          this.box(
            "lane-mark",
            [0.075, 0.025, 1.4],
            "#f6e9ca",
            [side * 1.25, 0.065, 2 + i * 5],
            root,
          );
          const x = side * (7.8 + ((i * 7) % 9));
          this.tree(
            x,
            i * 5 + 1,
            0.8 + ((i * 3) % 5) * 0.14,
            ["#43846a", "#69a27b", "#8ab184"][i % 3],
            root,
          );
          this.tree(
            side * (23 + (i % 3) * 6),
            i * 5 + 3,
            1.5 + (i % 3) * 0.3,
            "#65977b",
            root,
          );
          this.sphere(
            "bush",
            [2.3, 1.2, 2],
            "#7ba369",
            [side * (5.8 + (i % 2)), 0.25, i * 5 + 2],
            root,
          );
          if (i % 2 === 0)
            this.sphere(
              "stone",
              [1.2, 0.7, 0.9],
              "#a2aa94",
              [side * 5.6, 0.2, i * 5 + 4],
              root,
            );
          for (let f = 0; f < 2; f++) {
            this.box(
              "flower-stem",
              [0.035, 0.32, 0.035],
              "#56815d",
              [side * (5.7 + f * 0.7), 0.1, i * 5 + f],
              root,
            );
            this.sphere(
              "flower",
              [0.2, 0.16, 0.2],
              f ? "#f4c36d" : "#f7ece0",
              [side * (5.7 + f * 0.7), 0.3, i * 5 + f],
              root,
            );
          }
        }
      }
    }
    // A few hand-built trail details keep the world readable at a running pace.
    this.box(
      "sign-post",
      [0.24, 2.8, 0.24],
      "#886548",
      [-6, 1.2, 6],
      this.chunks[0],
    );
    const sign = this.box(
      "trail-sign",
      [1.6, 0.65, 0.2],
      "#e8b46c",
      [-6, 2.3, 6],
      this.chunks[0],
    );
    sign.rotation.z = -0.1;
    this.box(
      "sign-arrow",
      [0.65, 0.1, 0.23],
      "#6b6745",
      [-6, 2.3, 5.99],
      this.chunks[0],
    );
  }

  private createRunner() {
    const root = new TransformNode("runner", this.scene);
    this.box("jacket", [0.78, 0.72, 0.46], "#ed8150", [0, 1.18, 0], root);
    this.box("jacket-hem", [0.8, 0.13, 0.48], "#cf633e", [0, 0.85, 0], root);
    this.sphere("head", [0.67, 0.7, 0.62], "#e7b28b", [0, 1.92, 0.04], root);
    this.sphere("helmet", [0.83, 0.66, 0.78], "#f7e7bf", [0, 2.1, -0.02], root);
    this.box(
      "helmet-stripe",
      [0.17, 0.035, 0.7],
      "#eb844e",
      [0, 2.41, -0.01],
      root,
    );
    this.box(
      "helmet-brim",
      [0.88, 0.08, 0.25],
      "#e8d3a4",
      [0, 1.99, 0.36],
      root,
    );
    this.box("backpack", [0.59, 0.63, 0.27], "#366f62", [0, 1.23, -0.34], root);
    this.box(
      "backpack-pocket",
      [0.41, 0.29, 0.12],
      "#80a58c",
      [0, 1.11, -0.51],
      root,
    );
    this.box(
      "backpack-patch",
      [0.15, 0.14, 0.02],
      "#e8dcb4",
      [0, 1.18, -0.58],
      root,
    );
    for (const side of [-1, 1]) {
      const leg = new TransformNode("leg", this.scene);
      leg.parent = root;
      leg.position.set(side * 0.22, 0.81, 0);
      this.box("trousers", [0.27, 0.5, 0.3], "#345649", [0, -0.23, 0], leg);
      this.box("sock", [0.24, 0.16, 0.27], "#f5dfb3", [0, -0.52, 0], leg);
      this.box("shoe", [0.32, 0.2, 0.49], "#f0e5cc", [0, -0.65, 0.08], leg);
      this.box("sole", [0.34, 0.065, 0.5], "#9b8061", [0, -0.75, 0.08], leg);
      this.limbs.push(leg);
      const arm = new TransformNode("arm", this.scene);
      arm.parent = root;
      arm.position.set(side * 0.53, 1.48, 0);
      this.box("sleeve", [0.25, 0.5, 0.28], "#ed8150", [0, -0.21, 0], arm);
      this.sphere("hand", [0.25, 0.25, 0.26], "#e7b28b", [0, -0.52, 0.04], arm);
      this.limbs.push(arm);
    }
    this.box("scarf", [0.55, 0.12, 0.5], "#ecd17d", [0, 1.62, 0], root);
    const scarf = CreateBox(
      "scarf-tail",
      { width: 0.17, height: 0.05, depth: 0.65 },
      this.scene,
    );
    scarf.material = this.mat("#ecd17d");
    scarf.position.set(0.23, 1.57, -0.55);
    scarf.parent = root;
    return { root, scarf };
  }

  private createItem(item: TrackItem) {
    const root = new TransformNode(item.type, this.scene);
    root.position.set(item.lane * 2.5, 0, item.z);
    if (item.type === "coin") {
      const coin = CreateTorus(
        "coin",
        { diameter: 0.75, thickness: 0.19, tessellation: 12 },
        this.scene,
      );
      coin.rotation.x = Math.PI / 2;
      coin.material = this.mat("#ffc44b", true);
      coin.parent = root;
      root.position.y = item.y;
      this.sphere(
        "coin-glint",
        [0.12, 0.12, 0.1],
        "#fff5bb",
        [0.26, 0.23, 0],
        root,
      );
    } else if (item.type === "log") {
      const log = CreateCylinder(
        "log",
        { height: 1.85, diameter: 1.05, tessellation: 10 },
        this.scene,
      );
      log.material = this.mat("#9d6f43");
      log.rotation.z = Math.PI / 2;
      log.position.y = 0.55;
      log.parent = root;
      for (const x of [-0.94, 0.94]) {
        const end = CreateCylinder(
          "log-end",
          { height: 0.025, diameter: 0.84, tessellation: 10 },
          this.scene,
        );
        end.material = this.mat("#e0bd83");
        end.rotation.z = Math.PI / 2;
        end.position.set(x, 0.55, 0);
        end.parent = root;
        this.box(
          "bark-mark",
          [0.025, 0.12, 0.45],
          "#9d6f43",
          [x * 1.02, 0.55, 0],
          root,
        );
      }
    } else if (item.type === "arch") {
      for (const side of [-1, 1])
        this.box(
          "bar-post",
          [0.18, 2.7, 0.22],
          "#866b49",
          [side * 0.98, 1.35, 0],
          root,
        );
      this.box("low-bar", [2.14, 1.28, 0.4], "#d79954", [0, 2.05, 0], root);
      for (const side of [-1, 1]) {
        const stripe = this.box(
          "bar-stripe",
          [0.2, 1.27, 0.42],
          "#f6e2b5",
          [side * 0.51, 2.05, 0],
          root,
        );
        stripe.rotation.z = -0.25;
      }
    } else {
      const rock = this.sphere(
        "boulder",
        [1.9, 2.7, 1.7],
        "#889990",
        [0, 1.25, 0],
        root,
      );
      rock.rotation.y = 0.5;
      this.sphere("moss", [1.4, 0.55, 1.1], "#6e9568", [0.15, 2.3, -0.1], root);
    }
    return root;
  }

  setQuality(high: boolean) {
    this.high = high;
    this.scene.shadowsEnabled = high;
    this.engine.setHardwareScalingLevel(
      high ? Math.max(0.65, 1 / Math.min(devicePixelRatio, 1.5)) : 1.3,
    );
  }

  resize() {
    this.camera.fov = innerWidth < 700 ? 1 : 0.8;
    this.engine.resize();
  }

  update(game: RunnerGame, dt: number) {
    const running = game.mode === "running";
    const ready = game.mode === "ready";
    if (game.mode !== "paused" && game.mode !== "over") this.time += dt;
    if (this.mode !== game.mode) {
      this.previewItems.forEach((item) => item.setEnabled(ready));
      if (ready || (running && this.mode !== "paused")) {
        for (const mesh of this.itemMeshes.values()) mesh.dispose();
        this.itemMeshes.clear();
        this.lastCoins = 0;
      }
      this.mode = game.mode;
    }
    const scroll = running
      ? game.distance
      : ready
        ? this.time * 0.8
        : game.distance;
    this.chunks.forEach((root, i) => {
      root.position.z = ((((i * 40 - scroll + 40) % 200) + 200) % 200) - 60;
    });
    const cameraX = ready ? (innerWidth < 700 ? -3 : -6) : 0;
    const lerp = 1 - Math.exp(-dt * 4);
    this.camera.position.x += (cameraX - this.camera.position.x) * lerp;
    this.camera.position.y += ((ready ? 8 : 6) - this.camera.position.y) * lerp;
    this.camera.setTarget(new Vector3(ready ? 0 : game.x * 0.12, 0.9, 11));
    this.runner.position.set(
      ready ? 0 : game.x,
      (ready ? 0 : game.y) +
        Math.abs(Math.sin(this.time * 12)) * (running ? 0.065 : 0.01),
      0,
    );
    this.runner.scaling.y +=
      ((game.sliding ? 0.39 : 1) - this.runner.scaling.y) *
      Math.min(1, dt * 24);
    this.runner.rotation.z +=
      ((game.lane * 2.5 - game.x) * -0.07 - this.runner.rotation.z) *
      Math.min(1, dt * 12);
    if (game.mode !== "paused" && game.mode !== "over") {
      const stride =
        running && game.y === 0 && !game.sliding
          ? Math.sin(this.time * (12 + game.speed * 0.2)) * 0.7
          : ready
            ? Math.sin(this.time * 1.8) * 0.08
            : 0.3;
      this.limbs.forEach((limb, i) => {
        limb.rotation.x = stride * [1, -1, -1, 1][i];
      });
      this.scarf.rotation.x = Math.sin(this.time * 10) * 0.1;
    }
    if (!ready) {
      const alive = new Set(game.items.map((item) => item.id));
      for (const [id, mesh] of this.itemMeshes) {
        if (!alive.has(id)) {
          mesh.dispose();
          this.itemMeshes.delete(id);
        }
      }
      for (const item of game.items) {
        let mesh = this.itemMeshes.get(item.id);
        if (!mesh) {
          mesh = this.createItem(item);
          this.itemMeshes.set(item.id, mesh);
        }
        mesh.position.z = item.z;
        if (item.type === "coin") {
          mesh.rotation.y = this.time * 2.5;
          mesh.position.y = item.y + Math.sin(this.time * 3 + item.id) * 0.09;
        }
      }
    }
    this.previewItems
      .filter((item) => item.name === "coin")
      .forEach((item) => {
        item.rotation.y = this.time * 1.5;
      });
    if (game.coins > this.lastCoins && this.high) {
      for (let i = 0; i < 7; i++) {
        const mesh = CreateBox("spark", { size: 0.09 }, this.scene);
        mesh.material = this.mat("#ffd76c", true);
        mesh.position.set(game.x, game.y + 1, 0);
        this.particles.push({
          mesh,
          life: 0.5,
          velocity: new Vector3(
            (Math.random() - 0.5) * 4,
            Math.random() * 3,
            (Math.random() - 0.5) * 4,
          ),
        });
      }
    }
    this.lastCoins = game.coins;
    if (game.mode !== "paused") {
      this.particles = this.particles.filter((p) => {
        p.life -= dt;
        p.mesh.position.addInPlace(p.velocity.scale(dt));
        p.mesh.scaling.setAll(Math.max(0, p.life * 2));
        if (p.life <= 0) {
          p.mesh.dispose();
          return false;
        }
        return true;
      });
    }
    this.scene.render();
  }
}
