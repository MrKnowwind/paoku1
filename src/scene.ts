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
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { RunnerGame, TrackItem } from "./game.ts";
import { INTRO_TIMING } from "./game.ts";
import { RunnerMotion } from "./motion.ts";
import { ForestProps } from "./props.ts";

type Triple = [number, number, number];
type Particle = {
  mesh: Mesh;
  life: number;
  duration: number;
  velocity: Vector3;
  size: number;
  gravity: number;
};
type Limb = {
  upper: TransformNode;
  lower: TransformNode;
  foot?: TransformNode;
  side: number;
};
const damp = (a: number, b: number, rate: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-rate * dt));
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const REST_X = 4.85;
const REST_Z = 0.65;
const GRASS_TILE_SIZE = 2.5;

export class ForestScene {
  engine: Engine;
  scene: Scene;
  private camera: FreeCamera;
  private lookTarget = new Vector3(0, 1, 1.5);
  private shadows: ShadowGenerator;
  private props: ForestProps;
  private restStop: TransformNode;
  private runner!: TransformNode;
  private hips!: TransformNode;
  private torso!: TransformNode;
  private head!: TransformNode;
  private backpack!: TransformNode;
  private scarf!: TransformNode;
  private legs: Limb[] = [];
  private arms: Limb[] = [];
  private contact!: Mesh;
  private shock!: Mesh;
  private shockLife = 0;
  private motion = new RunnerMotion();
  private chunks: TransformNode[] = [];
  private swayingTrees: TransformNode[] = [];
  private leaves: InstancedMesh[] = [];
  private itemMeshes = new Map<number, TransformNode>();
  private previewItems: TransformNode[] = [];
  private materials = new Map<string, StandardMaterial>();
  private templates = new Map<string, Mesh>();
  private particles: Particle[] = [];
  private pool: Mesh[] = [];
  private softTexture!: DynamicTexture;
  private grassTexture!: Texture;
  private particleMaterials = new Map<string, StandardMaterial>();
  private time = 0;
  private lastCoins = 0;
  private lastPhase = 0;
  private lastLanding = 0;
  private lastTurn = 0;
  private airborne = false;
  private shake = 0;
  private mode = "";
  private high = true;

  constructor(canvas: HTMLCanvasElement, highQuality: boolean) {
    this.engine = new Engine(canvas, true, { stencil: false }, false);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString("#d9e9dbff");
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.009;
    this.scene.fogColor = Color3.FromHexString("#d9e9db");
    this.camera = new FreeCamera(
      "camera",
      new Vector3(0.5, 3.1, -7.4),
      this.scene,
    );
    this.lookTarget.set(innerWidth < 700 ? 3.95 : 3, 1.1, 1.5);
    this.camera.setTarget(this.lookTarget);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 230;
    const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), this.scene);
    sky.intensity = 0.75;
    sky.groundColor = Color3.FromHexString("#698463");
    const sun = new DirectionalLight(
      "sun",
      new Vector3(-0.65, -1, 0.65),
      this.scene,
    );
    sun.position.set(24, 40, -25);
    sun.intensity = 0.85;
    sun.diffuse = Color3.FromHexString("#fff0d4");
    this.shadows = new ShadowGenerator(1024, sun);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
    this.shadows.bias = 0.001;
    this.shadows.normalBias = 0.02;
    this.shadows.setDarkness(0.3);
    this.props = new ForestProps(this.scene);
    this.restStop = this.props.createRestStop();
    this.restStop.position.set(REST_X, 0, REST_Z);
    for (const mesh of this.restStop.getChildMeshes())
      this.shadows.addShadowCaster(mesh);
    this.createSoftTexture();
    this.createWorld();
    this.createRunner();
    for (const mesh of this.runner.getChildMeshes())
      this.shadows.addShadowCaster(mesh);
    this.contact = CreateGround(
      "contact-shadow",
      { width: 1.7, height: 1.3 },
      this.scene,
    );
    const shadowMat = new StandardMaterial("contact", this.scene);
    shadowMat.diffuseTexture = this.softTexture;
    shadowMat.useAlphaFromDiffuseTexture = true;
    shadowMat.disableLighting = true;
    shadowMat.emissiveColor = Color3.FromHexString("#31462f");
    shadowMat.alpha = 0.24;
    this.contact.material = shadowMat;
    this.contact.position.y = 0.071;
    this.shock = CreateTorus(
      "impact-ring",
      { diameter: 1, thickness: 0.035, tessellation: 36 },
      this.scene,
    );
    this.shock.material = this.mat("#ffdb8c", true);
    this.shock.setEnabled(false);
    this.previewItems = [
      this.createItem({ id: -1, type: "coin", lane: 0, z: 7, y: 1.1 }),
      this.createItem({ id: -2, type: "coin", lane: 0, z: 11, y: 1.1 }),
      this.createItem({ id: -3, type: "coin", lane: 0, z: 15, y: 1.1 }),
      this.createItem({ id: -4, type: "log", lane: 1, z: 24, y: 0 }),
      this.createItem({ id: -5, type: "arch", lane: -1, z: 39, y: 0 }),
    ];
    this.setQuality(highQuality);
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  private mat(color: string, glow = false) {
    const key = color + glow;
    if (!this.materials.has(key)) {
      const material = new StandardMaterial(key, this.scene);
      material.diffuseColor = Color3.FromHexString(color).toLinearSpace();
      material.specularColor.setAll(0.035);
      material.specularPower = 48;
      if (
        [
          "#dd7445",
          "#b95e38",
          "#c7673e",
          "#345d50",
          "#3e6c5b",
          "#386e60",
          "#5f9075",
          "#52836d",
          "#ddbf84",
          "#e7d9ad",
          "#d5be8c",
          "#edc260",
          "#d0b78d",
        ].includes(color)
      ) {
        material.diffuseTexture = this.props.texture("fabric");
        material.specularColor.setAll(0.01);
      }
      if (["#c68d56", "#8c6748", "#82664d"].includes(color))
        material.diffuseTexture = this.props.texture("leather");
      if (glow)
        material.emissiveColor = Color3.FromHexString(color).scale(0.45);
      this.materials.set(key, material);
    }
    return this.materials.get(key)!;
  }

  private part(
    kind: "box" | "sphere" | "capsule" | "cone",
    name: string,
    size: Triple,
    color: string,
    pos: Triple,
    parent?: TransformNode,
    detail = 12,
  ) {
    const key = `${kind}-${color}-${detail}`;
    let source = this.templates.get(key);
    if (!source) {
      source =
        kind === "box"
          ? CreateBox(key, { size: 1 }, this.scene)
          : kind === "capsule"
            ? CreateCapsule(
                key,
                {
                  height: 1,
                  radius: 0.25,
                  tessellation: 12,
                  capSubdivisions: 4,
                },
                this.scene,
              )
            : kind === "cone"
              ? CreateCylinder(
                  key,
                  {
                    height: 1,
                    diameterTop: 0.1,
                    diameterBottom: 1,
                    tessellation: 12,
                  },
                  this.scene,
                )
              : CreateSphere(
                  key,
                  {
                    diameter: 1,
                    segments: detail,
                    updatable: name === "padded-jacket",
                  },
                  this.scene,
                );
      source.material = this.mat(color);
      if (name === "padded-jacket") {
        const vertices = source.getVerticesData(VertexBuffer.PositionKind)!;
        for (let i = 0; i < vertices.length; i += 3) {
          const y = vertices[i + 1];
          vertices[i] *= 1 - Math.max(0, -y) * 0.24;
          vertices[i + 2] *= 1 + Math.sin(y * 17 + vertices[i] * 13) * 0.025;
        }
        const normals: number[] = [];
        VertexData.ComputeNormals(vertices, source.getIndices()!, normals);
        source.updateVerticesData(VertexBuffer.PositionKind, vertices, true);
        source.updateVerticesData(VertexBuffer.NormalKind, normals);
      }
      source.receiveShadows = true;
      source.setEnabled(false);
      this.templates.set(key, source);
    }
    const mesh = source.createInstance(name);
    mesh.position.set(...pos);
    mesh.scaling.set(
      size[0] * (kind === "capsule" ? 2 : 1),
      size[1],
      size[2] * (kind === "capsule" ? 2 : 1),
    );
    mesh.parent = parent ?? null;
    return mesh;
  }

  private joint(name: string, pos: Triple, parent: TransformNode) {
    const node = new TransformNode(name, this.scene);
    node.position.set(...pos);
    node.parent = parent;
    return node;
  }

  private scenery(
    kind: "tree" | "bush" | "grass" | "stones",
    name: string,
    pos: Triple,
    parent: TransformNode,
    variant = 0,
    scale = 1,
  ) {
    const source = this.props.scenery(kind, variant);
    const mesh = source.createInstance(name);
    mesh.position.set(...pos);
    mesh.scaling.setAll(scale);
    mesh.parent = parent;
    return mesh;
  }

  private tree(
    x: number,
    z: number,
    scale: number,
    variant: number,
    parent: TransformNode,
  ) {
    const tree = this.scenery(
      "tree",
      "woodland-tree",
      [x, 0, z],
      parent,
      variant,
      scale,
    );
    tree.rotation.y = variant * 0.73;
    if (Math.abs(x) < 12) this.swayingTrees.push(tree);
    if (Math.abs(x) < 9.5) this.shadows.addShadowCaster(tree);
  }

  private createWorld() {
    const meadow = CreateGround(
      "forest-floor",
      { width: 300, height: 350 },
      this.scene,
    );
    meadow.position.set(0, 0, 115);
    const floor = new StandardMaterial("woodland-grass-floor", this.scene);
    this.grassTexture = new Texture(
      import.meta.env.BASE_URL + "art/woodland-grass.jpg",
      this.scene,
    );
    this.grassTexture.uScale = 300 / GRASS_TILE_SIZE;
    this.grassTexture.vScale = 350 / GRASS_TILE_SIZE;
    this.grassTexture.wrapU = this.grassTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    this.grassTexture.anisotropicFilteringLevel = 8;
    floor.diffuseTexture = this.grassTexture;
    floor.specularColor = Color3.Black();
    meadow.material = floor;
    meadow.receiveShadows = true;
    for (let i = 0; i < 12; i++)
      this.part(
        "sphere",
        "distant-hill",
        [30 + i * 2, 17 + (i % 3) * 6, 40],
        i % 2 ? "#91aa96" : "#a6b49b",
        [(i % 2 ? 1 : -1) * (35 + i * 3), 0, 100 + i * 8],
        undefined,
        12,
      );
    const trail = new StandardMaterial("painted-trail", this.scene);
    const trailTexture = new Texture(
      import.meta.env.BASE_URL + "art/woodland-trail.jpg",
      this.scene,
    );
    trailTexture.uScale = 1;
    trailTexture.vScale = 5;
    trail.diffuseTexture = trailTexture;
    trail.diffuseColor = Color3.FromHexString("#e3dccc").toLinearSpace();
    trail.specularColor = Color3.Black();
    for (let chunk = 0; chunk < 5; chunk++) {
      const root = new TransformNode("woodland-" + chunk, this.scene);
      this.chunks.push(root);
      const chunkStart = ((chunk * 40 + 40) % 200) - 60;
      const ground = CreateGround(
        "painted-earth",
        { width: 8.6, height: 40 },
        this.scene,
      );
      ground.material = trail;
      ground.parent = root;
      ground.position.set(0, 0.06, 20);
      ground.receiveShadows = true;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
          const z = i * 5.7 + 1;
          this.part(
            "box",
            "lane-dash",
            [0.045, 0.012, 0.78],
            "#dfcfa5",
            [side * 1.25, 0.07, z + 1],
            root,
          );
          // Leave an actual clearing around the opening shot and seated explorer.
          const clearing =
            side === 1 && chunkStart + z > -8 && chunkStart + z < 10;
          if (!clearing) {
            this.tree(
              side * (7.8 + ((i * 3 + chunk) % 4)),
              z,
              0.85 + (i % 3) * 0.13,
              i + chunk,
              root,
            );
            const shrub = this.scenery(
              "bush",
              "wild-shrub",
              [side * (5.8 + (i % 2) * 0.45), 0, z + 0.3],
              root,
              i + chunk,
              0.8 + (i % 3) * 0.12,
            );
            shrub.rotation.y = i * 1.3;
          }
          this.tree(
            side * (20 + (i % 3) * 5),
            z + 3,
            1.3 + (i % 2) * 0.25,
            i + 1,
            root,
          );
          for (let g = 0; g < 2; g++)
            this.scenery(
              "grass",
              "verge-grass",
              [side * (4.65 + g * 0.42), 0.02, z + g * 1.4],
              root,
              i + g,
              0.85 + g * 0.2,
            ).rotation.y = i;
          if (i % 2 === 0) {
            this.scenery(
              "stones",
              "weathered-stones",
              [side * 5.3, 0, z + 2],
              root,
              i,
            ).rotation.y = z;
            for (let m = 0; m < 2; m++) {
              this.part(
                "capsule",
                "mushroom-stem",
                [0.045, 0.2, 0.045],
                "#d8cab0",
                [side * (5.05 + m * 0.2), 0.1, z + 2.7 + m * 0.16],
                root,
              );
              this.part(
                "sphere",
                "mushroom-cap",
                [0.26, 0.12, 0.25],
                m ? "#b99a64" : "#9b6f50",
                [side * (5.05 + m * 0.2), 0.22, z + 2.7 + m * 0.16],
                root,
                12,
              );
            }
          }
          if (i % 3 === 0) {
            this.part(
              "capsule",
              "flower-stem",
              [0.025, 0.36, 0.025],
              "#637851",
              [side * 4.9, 0.15, z + 0.8],
              root,
            );
            for (let p = 0; p < 5; p++)
              this.part(
                "sphere",
                "petal",
                [0.12, 0.04, 0.12],
                "#e7dfc7",
                [
                  side * 4.9 + Math.cos(p * 1.256) * 0.09,
                  0.33,
                  z + 0.8 + Math.sin(p * 1.256) * 0.09,
                ],
                root,
                8,
              );
            this.part(
              "sphere",
              "flower-center",
              [0.085, 0.06, 0.085],
              "#bba468",
              [side * 4.9, 0.35, z + 0.8],
              root,
              8,
            );
          }
        }
      }
    }
    for (let i = 0; i < 12; i++)
      this.leaves.push(
        this.part(
          "sphere",
          "drifting-leaf",
          [0.1, 0.018, 0.22],
          i % 2 ? "#b8a478" : "#88966a",
          [0, 0, 0],
          undefined,
          6,
        ),
      );
    const post = this.chunks[1];
    this.part(
      "capsule",
      "sign-post",
      [0.15, 2.4, 0.15],
      "#816145",
      [-5.3, 1.1, 14],
      post,
    );
    const board = this.part(
      "box",
      "trail-sign",
      [1.1, 0.45, 0.12],
      "#ba986b",
      [-5.3, 2.2, 14],
      post,
    );
    board.rotation.z = -0.08;
    this.part(
      "box",
      "sign-arrow",
      [0.45, 0.045, 0.13],
      "#5a5b41",
      [-5.3, 2.2, 13.93],
      post,
    );
  }

  private createRunner() {
    this.runner = new TransformNode("explorer", this.scene);
    this.hips = this.joint("hips", [0, 0.95, 0], this.runner);
    this.torso = this.joint("torso", [0, 0, 0], this.hips);
    this.part(
      "sphere",
      "trouser-seat",
      [0.6, 0.28, 0.42],
      "#345d50",
      [0, -0.035, -0.02],
      this.hips,
      16,
    );
    this.part(
      "sphere",
      "padded-jacket",
      [0.78, 0.8, 0.53],
      "#dd7445",
      [0, 0.38, 0],
      this.torso,
      20,
    );
    this.part(
      "capsule",
      "jacket-hem",
      [0.7, 0.17, 0.48],
      "#b95e38",
      [0, 0.04, 0],
      this.torso,
    );
    this.part(
      "capsule",
      "jacket-zip",
      [0.026, 0.51, 0.025],
      "#f4c584",
      [0, 0.39, 0.272],
      this.torso,
    );
    for (const side of [-1, 1]) {
      this.part(
        "capsule",
        "pocket",
        [0.2, 0.17, 0.06],
        "#c7673e",
        [side * 0.21, 0.18, 0.24],
        this.torso,
      );
      this.part(
        "capsule",
        "bag-strap",
        [0.085, 0.62, 0.06],
        "#ddbf84",
        [side * 0.25, 0.4, 0.21],
        this.torso,
      ).rotation.z = side * -0.15;
    }
    this.head = this.joint("head-joint", [0, 0.75, 0], this.torso);
    this.part(
      "sphere",
      "face",
      [0.64, 0.68, 0.59],
      "#e8b58a",
      [0, 0.28, 0.03],
      this.head,
      24,
    );
    this.part(
      "sphere",
      "hair",
      [0.69, 0.37, 0.62],
      "#5b4935",
      [0, 0.45, -0.06],
      this.head,
      16,
    );
    const hat = CreateCylinder(
      "canvas-hat",
      {
        height: 0.29,
        diameterTop: 0.61,
        diameterBottom: 0.73,
        tessellation: 32,
      },
      this.scene,
    );
    hat.position.set(0, 0.58, -0.015);
    hat.material = this.mat("#d0b78d");
    hat.parent = this.head;
    const brim = CreateCylinder(
      "hat-brim",
      { height: 0.026, diameter: 0.91, tessellation: 40 },
      this.scene,
    );
    brim.scaling.z = 1.1;
    brim.position.set(0, 0.43, 0.015);
    brim.material = this.mat("#d0b78d");
    brim.parent = this.head;
    const hatBand = CreateCylinder(
      "hat-band",
      {
        height: 0.065,
        diameterTop: 0.713,
        diameterBottom: 0.729,
        tessellation: 32,
      },
      this.scene,
    );
    hatBand.position.set(0, 0.475, -0.015);
    hatBand.material = this.mat("#82664d");
    hatBand.parent = this.head;
    for (const side of [-1, 1]) {
      this.part(
        "sphere",
        "ear",
        [0.14, 0.2, 0.13],
        "#dba57d",
        [side * 0.31, 0.22, 0.03],
        this.head,
        12,
      );
      this.part(
        "capsule",
        "eyebrow",
        [0.11, 0.022, 0.025],
        "#5b4935",
        [side * 0.13, 0.37, 0.29],
        this.head,
      ).rotation.z = side * 0.06;
      this.part(
        "capsule",
        "sideburn",
        [0.1, 0.17, 0.08],
        "#5b4935",
        [side * 0.28, 0.4, -0.01],
        this.head,
      );
      this.part(
        "sphere",
        "eye",
        [0.055, 0.075, 0.035],
        "#37433b",
        [side * 0.13, 0.29, 0.302],
        this.head,
        12,
      );
      this.part(
        "sphere",
        "eye-glint",
        [0.017, 0.02, 0.014],
        "#fff9e5",
        [side * 0.13 - 0.006, 0.31, 0.321],
        this.head,
        8,
      );
      this.part(
        "sphere",
        "cheek",
        [0.09, 0.04, 0.025],
        "#d79776",
        [side * 0.18, 0.15, 0.29],
        this.head,
        12,
      );
    }
    this.part(
      "sphere",
      "nose",
      [0.105, 0.1, 0.13],
      "#dca078",
      [0, 0.2, 0.32],
      this.head,
      12,
    );
    this.part(
      "capsule",
      "smile",
      [0.105, 0.02, 0.025],
      "#8c634c",
      [0, 0.1, 0.296],
      this.head,
    );
    this.backpack = this.joint("backpack-joint", [0, 0.42, -0.33], this.torso);
    this.part(
      "capsule",
      "backpack",
      [0.6, 0.7, 0.35],
      "#386e60",
      [0, 0, 0],
      this.backpack,
    );
    this.part(
      "capsule",
      "backpack-flap",
      [0.62, 0.25, 0.39],
      "#5f9075",
      [0, 0.25, -0.01],
      this.backpack,
    );
    this.part(
      "capsule",
      "backpack-pocket",
      [0.41, 0.26, 0.12],
      "#52836d",
      [0, -0.15, -0.2],
      this.backpack,
    );
    this.part(
      "capsule",
      "backpack-buckle",
      [0.11, 0.12, 0.04],
      "#e4bf75",
      [0, 0.1, -0.22],
      this.backpack,
    );
    this.part(
      "sphere",
      "leaf-badge",
      [0.12, 0.18, 0.025],
      "#dec78b",
      [0, -0.13, -0.27],
      this.backpack,
    ).rotation.z = -0.4;
    const roll = CreateCylinder(
      "rolled-groundsheet",
      { height: 0.58, diameter: 0.15, tessellation: 20 },
      this.scene,
    );
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, -0.39, -0.03);
    roll.material = this.mat("#ddbf84");
    roll.parent = this.backpack;
    for (const side of [-1, 1]) {
      this.part(
        "capsule",
        "bedroll-strap",
        [0.045, 0.19, 0.16],
        "#82664d",
        [side * 0.18, -0.37, -0.03],
        this.backpack,
      );
      this.part(
        "capsule",
        "pocket-seam",
        [0.018, 0.2, 0.018],
        "#708b6e",
        [side * 0.18, -0.15, -0.263],
        this.backpack,
      );
    }
    const bottle = CreateCylinder(
      "water-bottle",
      { height: 0.33, diameter: 0.14, tessellation: 20 },
      this.scene,
    );
    bottle.position.set(0.355, -0.07, -0.02);
    bottle.material = this.mat("#a4b0a1");
    bottle.parent = this.backpack;
    const bottleCap = CreateCylinder(
      "bottle-cap",
      { height: 0.055, diameter: 0.1, tessellation: 16 },
      this.scene,
    );
    bottleCap.position.set(0.355, 0.12, -0.02);
    bottleCap.material = this.mat("#455d50");
    bottleCap.parent = this.backpack;
    this.part(
      "capsule",
      "scarf-collar",
      [0.47, 0.14, 0.45],
      "#edc260",
      [0, 0.76, 0],
      this.torso,
    );
    this.scarf = this.joint("scarf-tail", [0.23, 0.73, -0.22], this.torso);
    this.part(
      "capsule",
      "scarf-fabric",
      [0.16, 0.04, 0.6],
      "#edc260",
      [0, 0, -0.22],
      this.scarf,
    );
    for (const side of [-1, 1]) {
      const upper = this.joint("hip-joint", [side * 0.205, 0, 0], this.hips);
      this.part(
        "capsule",
        "trousers",
        [0.265, 0.48, 0.29],
        "#345d50",
        [0, -0.23, 0],
        upper,
      );
      const lower = this.joint("knee", [0, -0.42, 0], upper);
      this.part(
        "capsule",
        "shin",
        [0.22, 0.38, 0.24],
        "#3e6c5b",
        [0, -0.15, 0],
        lower,
      );
      this.part(
        "capsule",
        "sock",
        [0.22, 0.12, 0.23],
        "#e4d9b6",
        [0, -0.29, 0],
        lower,
      );
      const foot = this.joint("ankle", [0, -0.37, 0], lower);
      this.part(
        "capsule",
        "sole",
        [0.34, 0.09, 0.53],
        "#e9dcc0",
        [0, -0.055, 0.1],
        foot,
      );
      this.part(
        "sphere",
        "hiking-shoe",
        [0.33, 0.22, 0.49],
        "#c68d56",
        [0, 0.02, 0.09],
        foot,
        16,
      );
      this.part(
        "capsule",
        "shoe-laces",
        [0.2, 0.025, 0.14],
        "#f1ddb3",
        [0, 0.13, 0.12],
        foot,
      );
      this.part(
        "capsule",
        "rubber-toe",
        [0.31, 0.09, 0.17],
        "#82664d",
        [0, 0.012, 0.265],
        foot,
      );
      this.part(
        "capsule",
        "boot-heel",
        [0.28, 0.1, 0.16],
        "#82664d",
        [0, -0.035, -0.075],
        foot,
      );
      for (let lace = 0; lace < 3; lace++) {
        const stitch = this.part(
          "capsule",
          "lace-crossing",
          [0.18, 0.014, 0.025],
          "#d8c7a3",
          [0, 0.135 - lace * 0.005, 0.06 + lace * 0.048],
          foot,
        );
        stitch.rotation.y = (lace % 2 ? 1 : -1) * 0.2;
      }
      this.legs.push({ upper, lower, foot, side });
      const shoulder = this.joint(
        "shoulder",
        [side * 0.43, 0.6, 0],
        this.torso,
      );
      this.part(
        "capsule",
        "sleeve",
        [0.25, 0.4, 0.27],
        "#dd7445",
        [0, -0.15, 0],
        shoulder,
      );
      const elbow = this.joint("elbow", [0, -0.31, 0], shoulder);
      this.part(
        "capsule",
        "forearm",
        [0.21, 0.32, 0.22],
        "#dd7445",
        [0, -0.12, 0],
        elbow,
      );
      this.part(
        "capsule",
        "cuff",
        [0.22, 0.075, 0.23],
        "#b95e38",
        [0, -0.25, 0],
        elbow,
      );
      this.part(
        "sphere",
        "hand",
        [0.23, 0.25, 0.23],
        "#e8b58a",
        [0, -0.34, 0.02],
        elbow,
        16,
      );
      this.part(
        "sphere",
        "thumb",
        [0.1, 0.14, 0.11],
        "#dba57d",
        [-side * 0.1, -0.31, 0.05],
        elbow,
        12,
      );
      for (let finger = 0; finger < 3; finger++)
        this.part(
          "capsule",
          "knuckle",
          [0.045, 0.1, 0.035],
          "#dba57d",
          [(finger - 1) * 0.055, -0.365, 0.12],
          elbow,
        );
      this.arms.push({ upper: shoulder, lower: elbow, side });
    }
  }

  private createItem(item: TrackItem) {
    if (item.type !== "coin") {
      const root = this.props.create(item.type, item.id);
      root.position.set(item.lane * 2.5, 0, item.z);
      return root;
    }
    const root = new TransformNode("coin", this.scene);
    root.position.set(item.lane * 2.5, item.y, item.z);
    const coin = CreateCylinder(
      "coin-medallion",
      { height: 0.13, diameter: 0.68, tessellation: 24 },
      this.scene,
    );
    coin.rotation.x = Math.PI / 2;
    coin.material = this.mat("#e8b545", true);
    coin.parent = root;
    for (const side of [-1, 1]) {
      const rim = CreateTorus(
        "raised-rim",
        { diameter: 0.58, thickness: 0.045, tessellation: 24 },
        this.scene,
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.z = side * 0.075;
      rim.material = this.mat("#ffe09a", true);
      rim.parent = root;
      const mark = this.part(
        "sphere",
        "coin-leaf",
        [0.17, 0.29, 0.045],
        "#ffe29b",
        [0, 0, side * 0.09],
        root,
        12,
      );
      mark.rotation.z = -0.38;
    }
    return root;
  }

  private createSoftTexture() {
    this.softTexture = new DynamicTexture(
      "soft-particle",
      64,
      this.scene,
      false,
    );
    const ctx = this.softTexture.getContext();
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,.8)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    this.softTexture.hasAlpha = true;
    this.softTexture.update();
  }

  private burst(
    position: Vector3,
    color: string,
    count: number,
    force: number,
    duration = 0.5,
    size = 0.2,
    gravity = 1,
  ) {
    if (!this.high) count = Math.ceil(count / 2);
    if (!this.particleMaterials.has(color)) {
      const material = new StandardMaterial(`particle-${color}`, this.scene);
      material.diffuseTexture = this.softTexture;
      material.useAlphaFromDiffuseTexture = true;
      material.disableLighting = true;
      material.emissiveColor = Color3.FromHexString(color);
      material.backFaceCulling = false;
      this.particleMaterials.set(color, material);
    }
    for (let i = 0; i < count && this.particles.length < 72; i++) {
      const mesh =
        this.pool.pop() ?? CreatePlane("particle", { size: 1 }, this.scene);
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
      mesh.material = this.particleMaterials.get(color)!;
      mesh.position.copyFrom(position);
      mesh.setEnabled(true);
      mesh.visibility = 1;
      this.particles.push({
        mesh,
        duration,
        life: duration,
        size: size * (0.65 + Math.random() * 0.7),
        velocity: new Vector3(
          (Math.random() - 0.5) * force,
          Math.random() * force * 0.7 + 0.2,
          (Math.random() - 0.5) * force,
        ),
        gravity,
      });
    }
  }

  setQuality(high: boolean) {
    this.high = high;
    this.scene.shadowsEnabled = high;
    this.engine.setHardwareScalingLevel(
      high ? 1 / Math.min(devicePixelRatio, 1.5) : 1.25,
    );
    this.leaves.forEach((leaf) => leaf.setEnabled(high));
  }

  resize() {
    this.camera.fov = innerWidth < 700 ? 1.02 : 0.8;
    this.engine.resize();
  }

  update(game: RunnerGame, dt: number) {
    const running = game.mode === "running",
      ready = game.mode === "ready",
      paused = game.mode === "paused",
      introducing = game.introducing;
    const oldMode = this.mode;
    if (!paused && game.mode !== "over") this.time += dt;
    if (this.mode !== game.mode) {
      this.previewItems.forEach((item) =>
        item.setEnabled(ready || introducing),
      );
      if (ready || introducing || (running && oldMode !== "paused")) {
        for (const mesh of this.itemMeshes.values()) mesh.dispose();
        this.itemMeshes.clear();
        this.lastCoins = 0;
        this.lastLanding = 0;
        this.shake = 0;
        this.shockLife = 0;
        for (const p of this.particles) {
          p.mesh.setEnabled(false);
          this.pool.push(p.mesh);
        }
        this.particles = [];
      }
      if (game.mode === "over") {
        this.shake = 0.2;
        this.shockLife = 0.5;
        this.shock.position.set(game.x, 0.1, 0);
        this.shock.setEnabled(true);
        this.burst(new Vector3(game.x, 1, 0), "#ffe0a0", 18, 5, 0.7, 0.22, 5);
      }
      this.mode = game.mode;
    }
    const pose = this.motion.update(game, dt);
    const scroll = ready || introducing ? 0 : game.distance;
    this.grassTexture.vOffset = (scroll / GRASS_TILE_SIZE) % 1;
    this.chunks.forEach((root, i) => {
      root.position.z = ((((i * 40 - scroll + 40) % 200) + 200) % 200) - 60;
    });
    const blend = 1 - pose.slide,
      airborne = !ready && !introducing && game.y > 0;
    const stand = ready
      ? 0
      : introducing
        ? smooth(game.introTime / INTRO_TIMING.stand)
        : 1;
    const walk = ready
      ? 0
      : introducing
        ? Math.max(
            0,
            Math.min(
              1,
              (game.introTime - INTRO_TIMING.stand) / INTRO_TIMING.walk,
            ),
          )
        : 1;
    const walkProgress = smooth(walk);
    const sitting = ready || introducing ? 1 - stand : 0;
    const walking = introducing ? Math.sin(Math.PI * walk) : 0;
    const walkPhase = (game.introTime - INTRO_TIMING.stand) * 9;
    const prepare = ready ? 0 : introducing ? smooth((walk - 0.78) / 0.22) : 1;
    const opening = ready || introducing;
    const airWeight = airborne ? pose.air * blend : 0;
    const runWeight = pose.run * (1 - airWeight) * blend;
    const tuck = airborne ? Math.max(0, 1 - Math.abs(game.velocity) / 10.6) : 0;
    const openingYaw = (-2.3 + (2.3 - Math.PI / 2) * stand) * (1 - prepare);
    // Rise in front of the stump before unfolding the legs and walking away.
    const exitOffset = stand * 0.8;
    this.runner.position.set(
      opening
        ? (REST_X + Math.sin(openingYaw) * exitOffset) * (1 - walkProgress)
        : game.x,
      opening ? 0 : game.y + Math.abs(pose.turn) * 0.045 * runWeight,
      opening
        ? (REST_Z + Math.cos(openingYaw) * exitOffset) * (1 - walkProgress)
        : 0,
    );
    if (opening) this.runner.rotation.y = openingYaw;
    else
      this.runner.rotation.y = damp(
        this.runner.rotation.y,
        pose.turn * 0.22 + pose.slide * 0.12,
        10,
        dt,
      );
    this.runner.rotation.z = opening
      ? Math.sin(walkPhase) * 0.025 * walking
      : -pose.turn * 0.26 * blend - pose.slide * 0.09 + pose.death * 0.65;
    this.runner.rotation.x = pose.death * 0.7;
    this.hips.position.y =
      (opening
        ? 0.79 + 0.16 * stand + Math.abs(Math.sin(walkPhase)) * 0.018 * walking
        : pose.hipY) -
      pose.death * 0.48;
    // Seat top is 0.6325 high: keep the pelvis above it and shins past its rim.
    this.hips.position.z = sitting * 0.24;
    this.hips.rotation.y = opening
      ? 0
      : Math.sin(pose.phase) * 0.035 * runWeight;
    const flightPitch = -Math.max(-1, Math.min(1, game.velocity / 10.6)) * 0.16;
    this.torso.position.y = ready ? Math.sin(this.time * 1.8) * 0.008 : 0;
    this.torso.rotation.x = opening
      ? 0.08 +
        sitting * 0.12 +
        (introducing ? Math.sin(Math.PI * stand) * 0.22 : 0)
      : (0.2 + (game.speed - 12) * 0.004) * runWeight -
        pose.slide * 1.12 +
        flightPitch * airWeight;
    this.torso.rotation.z =
      Math.sin(pose.phase) * 0.055 * runWeight - pose.slide * 0.07;
    this.torso.scaling.set(
      1 + pose.landing * 0.025,
      1 - pose.landing * 0.04,
      1,
    );
    this.head.rotation.y = opening
      ? Math.sin(this.time * 0.7) * 0.12
      : -pose.turn * 0.17;
    this.head.rotation.x = pose.slide * 0.33 - runWeight * 0.08;
    this.backpack.position.z = -0.33 + pose.slide * 0.13;
    this.backpack.rotation.x =
      Math.sin(pose.phase * 2) * 0.045 * runWeight - pose.slide * 0.1;
    this.backpack.rotation.z = -Math.sin(pose.phase) * 0.025 * runWeight;
    this.scarf.rotation.x =
      -0.2 + Math.sin(this.time * 13) * (running ? 0.18 : 0.04);
    this.scarf.rotation.z = Math.sin(this.time * 8) * 0.12;
    for (const leg of this.legs) {
      const stride = Math.sin(pose.phase + (leg.side > 0 ? Math.PI : 0));
      if (opening) {
        const walkStride = Math.sin(walkPhase + (leg.side > 0 ? Math.PI : 0));
        leg.upper.rotation.x = -sitting * 1.42 + walkStride * 0.44 * walking;
        leg.lower.rotation.x =
          sitting * 1.42 +
          Math.max(0, -walkStride) * 0.65 * walking +
          (1 - sitting) * 0.08;
        leg.foot!.rotation.x = 0;
      } else {
        const slideUpper = leg.side > 0 ? -1.25 : -1.78;
        const slideKnee = leg.side > 0 ? 0.05 : 1.78;
        const jumpUpper =
          leg.side > 0 ? -0.35 - tuck * 0.55 : -0.15 - tuck * 0.3;
        const jumpKnee = leg.side > 0 ? 0.55 + tuck : 0.8 + tuck * 0.55;
        leg.upper.rotation.x =
          stride * 0.92 * runWeight +
          jumpUpper * airWeight +
          slideUpper * pose.slide -
          pose.landing * 0.5 * blend;
        leg.lower.rotation.x =
          (0.15 + Math.max(0, -stride) * 1.2 + Math.max(0, stride) * 0.35) *
            runWeight +
          jumpKnee * airWeight +
          slideKnee * pose.slide +
          pose.landing * 1.1 * blend;
        leg.foot!.rotation.x =
          (-Math.max(0, stride) * 0.45 + Math.max(0, -stride) * 0.12) *
            runWeight +
          (leg.side > 0 ? 1.2 : 0) * pose.slide -
          pose.landing * 0.6 * blend;
      }
      leg.upper.rotation.z = opening
        ? leg.side * sitting * 0.055
        : -pose.turn * 0.1 * blend + leg.side * pose.slide * 0.065;
    }
    for (const arm of this.arms) {
      const stride = Math.sin(pose.phase + (arm.side > 0 ? 0 : Math.PI));
      arm.upper.rotation.x = opening
        ? -sitting * 0.4 +
          Math.sin(walkPhase + (arm.side > 0 ? 0 : Math.PI)) * 0.3 * walking
        : stride * 0.78 * runWeight -
          (0.65 + tuck * 0.2) * airWeight +
          pose.slide * 0.72;
      arm.upper.rotation.z =
        arm.side *
        (0.07 +
          Math.abs(pose.turn) * 0.22 * blend +
          airWeight * 0.26 +
          pose.slide * 0.12);
      arm.lower.rotation.x = opening
        ? -0.35 - sitting * 0.02
        : (-0.95 - Math.max(0, -stride) * 0.3) * runWeight -
          0.9 * airWeight -
          0.15 * pose.slide -
          0.35 * (1 - pose.run) * (1 - pose.air) * blend;
    }
    this.contact.position.x = this.runner.position.x;
    this.contact.position.z = this.runner.position.z;
    this.restStop.position.z = REST_Z - scroll;
    this.restStop.setEnabled(this.restStop.position.z > -24);
    this.contact.scaling.setAll(1 / (1 + (ready ? 0 : game.y) * 0.3));
    this.contact.visibility = 1 / (1 + (ready ? 0 : game.y) * 0.65);
    if (
      running &&
      !airborne &&
      Math.abs(pose.turn) > 0.65 &&
      this.lastTurn <= 0.65
    )
      this.burst(
        new Vector3(game.x, 0.12, -0.1),
        "#d0bd99",
        7,
        1.7,
        0.38,
        0.26,
        0,
      );
    this.lastTurn = Math.abs(pose.turn);
    if (running && airborne && !this.airborne)
      this.burst(
        new Vector3(game.x, 0.12, 0),
        "#e4cc9c",
        7,
        1.8,
        0.35,
        0.33,
        0,
      );
    this.airborne = airborne;
    if (running && pose.landing > 0.8 && this.lastLanding < 0.8)
      this.burst(
        new Vector3(game.x, 0.12, 0),
        "#ddc09a",
        12,
        2.8,
        0.6,
        0.42,
        0,
      );
    const footfall = Math.floor(pose.phase / Math.PI);
    if (running && game.y === 0 && footfall !== this.lastPhase)
      this.burst(
        new Vector3(game.x, 0.12, -0.13),
        "#d7b98d",
        game.sliding ? 4 : 2,
        0.7,
        0.4,
        game.sliding ? 0.5 : 0.28,
        0,
      );
    this.lastPhase = footfall;
    this.lastLanding = pose.landing;
    if (!ready && !introducing) {
      const alive = new Set(game.items.map((item) => item.id));
      for (const [id, mesh] of this.itemMeshes)
        if (!alive.has(id)) {
          mesh.dispose();
          this.itemMeshes.delete(id);
        }
      for (const item of game.items) {
        let mesh = this.itemMeshes.get(item.id);
        if (!mesh) {
          mesh = this.createItem(item);
          this.itemMeshes.set(item.id, mesh);
        }
        mesh.position.z = item.z;
        if (item.type === "coin") {
          mesh.rotation.y = this.time * 2.3 + item.id * 0.3;
          mesh.position.y = item.y + Math.sin(this.time * 3 + item.id) * 0.07;
        }
      }
    }
    this.previewItems
      .filter((item) => item.name === "coin")
      .forEach((item) => {
        item.rotation.y = this.time * 1.4;
      });
    if (running && game.coins > this.lastCoins)
      this.burst(
        new Vector3(game.x, game.y + 1, 0),
        "#ffdf83",
        10,
        3,
        0.45,
        0.17,
        -1,
      );
    this.lastCoins = game.coins;
    if (!paused) {
      this.particles = this.particles.filter((p) => {
        p.life -= dt;
        p.velocity.y -= p.gravity * dt;
        p.mesh.position.addInPlace(p.velocity.scale(dt));
        p.mesh.scaling.setAll(p.size * (0.6 + (1 - p.life / p.duration) * 0.8));
        p.mesh.visibility = Math.max(0, p.life / p.duration);
        if (p.life <= 0) {
          p.mesh.setEnabled(false);
          this.pool.push(p.mesh);
          return false;
        }
        return true;
      });
      this.shake *= Math.exp(-dt * 12);
      this.shockLife = Math.max(0, this.shockLife - dt);
      this.shock.setEnabled(this.shockLife > 0);
      this.shock.scaling.setAll(1 + (0.5 - this.shockLife) * 9);
      this.shock.visibility = this.shockLife * 1.5;
    }
    this.swayingTrees.forEach((tree, i) => {
      tree.rotation.z = Math.sin(this.time * 0.85 + i * 1.3) * 0.012;
    });
    if (this.high)
      this.leaves.forEach((leaf, i) => {
        leaf.position.set(
          Math.sin(this.time * 0.23 + i * 2.4) * 7,
          1 + ((((i * 0.73 - this.time * 0.3) % 5) + 5) % 5),
          ((((i * 7 - scroll * 0.65 + 25) % 70) + 70) % 70) - 12,
        );
        leaf.rotation.set(
          this.time * 0.7 + i,
          this.time + i,
          Math.sin(this.time + i),
        );
      });
    const cameraProgress = ready
      ? 0
      : introducing
        ? smooth(
            (game.introTime - 0.5) /
              (INTRO_TIMING.stand + INTRO_TIMING.walk - 0.5),
          )
        : 1;
    const mobile = innerWidth < 700;
    const homeCameraX = 0.5;
    this.camera.position.x = damp(
      this.camera.position.x,
      homeCameraX * (1 - cameraProgress) + game.x * 0.05 * cameraProgress,
      5,
      dt,
    );
    this.camera.position.y = damp(
      this.camera.position.y,
      3.1 + 1.3 * cameraProgress,
      5,
      dt,
    );
    this.camera.position.z = damp(
      this.camera.position.z,
      -7.4 - (mobile ? 5.4 : 4.0) * cameraProgress,
      4,
      dt,
    );
    const target = new Vector3(
      (mobile ? 3.95 : 3) * (1 - cameraProgress) +
        game.x * 0.025 * cameraProgress,
      1.1 - cameraProgress * 0.1,
      1.5 + 9.0 * cameraProgress,
    );
    Vector3.LerpToRef(
      this.lookTarget,
      target,
      1 - Math.exp(-dt * 5),
      this.lookTarget,
    );
    this.camera.setTarget(this.lookTarget);
    this.camera.rotation.z = -pose.turn * 0.012;
    this.camera.position.x += Math.sin(this.time * 70) * this.shake;
    this.camera.position.y += Math.cos(this.time * 57) * this.shake;
    this.camera.fov = damp(
      this.camera.fov,
      (mobile ? 1.02 + cameraProgress * 0.06 : 0.74 + cameraProgress * 0.04) +
        (running ? (game.speed - 12) * 0.005 : 0),
      3,
      dt,
    );
    this.scene.render();
  }
}
