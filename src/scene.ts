import { openingFog } from "./opening.ts";
import { fishWarning } from "./fish.ts";
import { CONFIG } from "./config.ts";
import "@babylonjs/core/Engines/thinEngine.scissor";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
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
import { CreateLathe } from "@babylonjs/core/Meshes/Builders/latheBuilder";
import { CreateTube } from "@babylonjs/core/Meshes/Builders/tubeBuilder";
import type { RunnerGame, TrackItem } from "./game.ts";
import { INTRO_TIMING } from "./game.ts";
import { RunnerMotion } from "./motion.ts";
import { OceanProps } from "./ocean-props.ts";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import { ForestProps } from "./props.ts";
import { TerrainScene } from "./terrain-scene.ts";
import { defaultTrack, sectionAt, tunnelDarkness, snowBlend } from "./track.ts";
import { SnowProps } from "./snow-props.ts";
import { ICE_IMPACT_METRES, iceFallPose, sipPose } from "./winter-motion.ts";
import { SnowPreview } from "./snow-preview.ts";
import { iconAsset } from "./art.ts";

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

export class ForestScene {
  engine: Engine;
  scene: Scene;
  private camera: FreeCamera;
  private lookTarget = new Vector3(0, 1, 1.5);
  private shadows: ShadowGenerator;
  private props: ForestProps;
  private ocean: OceanProps;
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
  private materials = new Map<string, StandardMaterial>();
  private templates = new Map<string, Mesh>();
  private particles: Particle[] = [];
  private pool: Mesh[] = [];
  private softTexture!: DynamicTexture;
  private terrainView!: TerrainScene;
  private forestBackdrop!: TransformNode;
  private sky: HemisphericLight;
  private sun: DirectionalLight;
  private shieldAura!: TransformNode;
  private magnetAura!: Mesh;
  private shieldRims: Mesh[] = [];
  private magnetSparks: Mesh[] = [];
  private shieldVisual = 0;
  private magnetVisual = 0;
  private powerPulse!: Mesh;
  private powerPulseLife = 0;
  private lastPowerPickup = 0;
  private boostJets: Mesh[] = [];
  private boosterPods: Mesh[] = [];
  private entries: Mesh[] = [];
  private lastShieldBreak = 0;
  private lastClear = 0;
  private lastEffectTick = -1;
  private forestVisible = true;
  private forestScales = new WeakMap<TransformNode, Vector3>();
  private particleMaterials = new Map<string, StandardMaterial>();
  private pickupMaterials = new Map<string, StandardMaterial>();
  private time = 0;
  private lastCoins = 0;
  private lastPhase = 0;
  private lastLanding = 0;
  private lastTurn = 0;
  private airborne = false;
  private shake = 0;
  private mode = "";
  private high = true;
  private track = defaultTrack;
  private openingMistTime = 0;
  private snow?: SnowProps;
  private snowPreview?: SnowPreview;
  private drinkBottle?: TransformNode;
  private lastSnowHit = 0;
  private lastIceRemaining = 0;
  private get snowProps() { return this.snow ??= new SnowProps(this.scene, this.props); }
  private drinkPose(remaining: number, falling: boolean) {
    if (!this.drinkBottle) return;
    const {lift, swallow} = sipPose(remaining);
    // Set the bottle down during the impact and keep the recovering arm free.
    this.drinkBottle.setEnabled(lift > 0.025 && !falling);
    if (lift <= 0.025 || falling) return;
    const arm = this.arms[1];
    this.head.rotation.x -= swallow * 0.19;
    this.head.rotation.y += swallow * 0.09;
    this.torso.rotation.y = -0.07 * lift;
    const torsoWorld = this.torso.computeWorldMatrix(true);
    const mouthWorld = Vector3.TransformCoordinates(new Vector3(0, 0.11, 0.285), this.head.computeWorldMatrix(true));
    const mouth = Vector3.TransformCoordinates(mouthWorld, torsoWorld.clone().invert());
    const bottleAxis = new Vector3(-0.22 * swallow, 1 - 0.29 * swallow, -0.66 * swallow).normalize();
    const grip = mouth.subtract(bottleAxis.scale(0.3));
    const reach = grip.subtract(arm.upper.position);
    const distance = Math.min(0.645, Math.max(0.07, reach.length()));
    const axis = reach.normalize();
    const upperLength = 0.31, lowerLength = 0.34;
    const projection = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
    const elbowOut = new Vector3(0.8, -1, -0.1);
    elbowOut.subtractInPlace(axis.scale(Vector3.Dot(elbowOut, axis))).normalize();
    const upperDirection = axis.scale(projection).add(elbowOut.scale(Math.sqrt(Math.max(0, upperLength ** 2 - projection ** 2))));
    const lowerDirection = axis.scale(distance).subtract(upperDirection);
    const upper = Quaternion.Identity(), lower = Quaternion.Identity();
    Quaternion.FromUnitVectorsToRef(Vector3.Down(), upperDirection.normalizeToNew(), upper);
    Quaternion.FromUnitVectorsToRef(Vector3.Down(), lowerDirection.applyRotationQuaternion(upper.conjugate()).normalize(), lower);
    Quaternion.Slerp(Quaternion.FromEulerVector(arm.upper.rotation), upper, lift).toEulerAnglesToRef(arm.upper.rotation);
    Quaternion.Slerp(Quaternion.FromEulerVector(arm.lower.rotation), lower, lift).toEulerAnglesToRef(arm.lower.rotation);
    const axisWorld = Vector3.TransformNormal(bottleAxis, torsoWorld);
    const axisInHand = Vector3.TransformNormal(axisWorld, arm.lower.computeWorldMatrix(true).clone().invert()).normalize();
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), axisInHand, lower).toEulerAnglesToRef(this.drinkBottle.rotation);
  }

  private snowPose(game: RunnerGame) {
    if (game.icy) {
      const {brace, fall, rise} = iceFallPose(game.iceRemaining, game.iceRecover);
      this.hips.position.y += (0.29 - this.hips.position.y) * fall + 0.08 * rise;
      this.hips.position.z += 0.13 * fall;
      this.runner.rotation.z = this.runner.rotation.z * (1 - fall) - 0.62 * fall + 0.16 * (brace - fall);
      this.runner.rotation.x += -0.27 * (brace - fall) + 0.2 * rise;
      this.torso.rotation.x += (-0.91 - this.torso.rotation.x) * fall + 0.51 * rise;
      this.torso.rotation.y = 0.24 * fall;
      this.head.rotation.x += 0.32 * fall - 0.19 * rise;
      for (const leg of this.legs) {
        leg.upper.rotation.x += ((leg.side > 0 ? -1.47 : -1.86) - leg.upper.rotation.x) * fall - (brace - fall) * 0.34;
        leg.lower.rotation.x += ((leg.side > 0 ? 0.22 : 1.21) - leg.lower.rotation.x) * fall + 0.41 * rise;
        leg.foot!.rotation.x += 0.28 * fall;
      }
      for (const arm of this.arms) {
        arm.upper.rotation.z += arm.side * (0.79 * brace - 0.35 * fall);
        arm.upper.rotation.x += (-0.72 - arm.upper.rotation.x) * brace + 1.16 * fall - 0.74 * rise;
        arm.lower.rotation.x += (-0.72 - arm.lower.rotation.x) * brace;
      }
    }
    if (game.inSnow && game.cold >= 75) {
      this.torso.rotation.z += Math.sin(game.worldTime * 35) * 0.028;
      this.head.rotation.z = Math.sin(game.worldTime * 35 + 1) * 0.035;
    }
    if (game.drinkTime > 0 && !this.drinkBottle) {
      this.drinkBottle = this.snowProps.create("liquor", false);
      this.drinkBottle.parent = this.arms[1].lower;
      this.drinkBottle.position.set(0, -0.34, 0.018);
      this.drinkBottle.scaling.setAll(0.55);
    }
    this.drinkPose(game.drinkTime, game.icy || game.mode === "over");
    if (game.lastHit === "pool") {
      this.runner.position.y -= this.motion.pose.death * 3.5;
      this.runner.rotation.x = this.motion.pose.death * 0.35;
      this.runner.rotation.z = Math.sin(this.time * 8) * 0.12;
      for (const arm of this.arms) arm.upper.rotation.z = arm.side * 1.4;
    } else if (game.lastHit === "cold") {
      this.runner.rotation.x = 0.18; this.runner.rotation.z = 0;
      this.hips.position.y = 0.65;
      this.torso.rotation.z = Math.sin(this.time * 40) * 0.02;
    }
  }

  constructor(canvas: HTMLCanvasElement, highQuality: boolean, progress: (percent: number) => void = () => {}) {
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
    this.sky = sky;
    sky.intensity = 0.75;
    sky.groundColor = Color3.FromHexString("#698463");
    const sun = new DirectionalLight(
      "sun",
      new Vector3(-0.65, -1, 0.65),
      this.scene,
    );
    sun.position.set(24, 40, -25);
    this.sun = sun;
    sun.intensity = 0.85;
    sun.diffuse = Color3.FromHexString("#fff0d4");
    this.shadows = new ShadowGenerator(1024, sun);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
    this.shadows.bias = 0.001;
    this.shadows.normalBias = 0.02;
    this.shadows.setDarkness(0.3);
    this.props = new ForestProps(this.scene);
    this.ocean = new OceanProps(this.scene);
    this.restStop = this.props.createRestStop();
    this.restStop.position.set(REST_X, 0, REST_Z);
    for (const mesh of this.restStop.getChildMeshes())
      this.shadows.addShadowCaster(mesh);
    this.createSoftTexture();
    this.createWorld();
    progress(75);
    this.createRunner();
    progress(81);
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
    this.createRunEffects();
    this.setQuality(highQuality);
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  isPlayable() {
    return this.scene.getActiveMeshes().length > 0 &&
      this.runner.getChildMeshes().every(mesh => mesh.isReady());
  }

  useTextureFallback() {
    for (const material of this.scene.materials) {
      if (!(material instanceof StandardMaterial)) continue;
      const texture = material.diffuseTexture;
      if (!(texture instanceof Texture) || texture.isReady() || !texture.url?.includes("/art/") || texture.url.includes("icons-")) continue;
      const color = material.diffuseColor.clone();
      material.diffuseTexture = null;
      material.diffuseColor = Color3.FromHexString(texture.url.includes("grass") ? "#78946a" : "#c5af8d");
      texture.onLoadObservable.addOnce(() => {
        material.diffuseTexture = texture; material.diffuseColor = color;
      });
    }
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
    const sculpted = [
      "padded-jacket",
      "face",
      "hair",
      "backpack",
      "backpack-flap",
      "backpack-pocket",
    ].includes(name);
    const key = `${kind}-${color}-${detail}${sculpted ? `-${name}` : ""}`;
    let source = this.templates.get(key);
    if (!source) {
      source =
        name === "padded-jacket"
          ? CreateLathe(
              key,
              {
                shape: [
                  new Vector3(0.43, -0.5, 0),
                  new Vector3(0.46, -0.35, 0),
                  new Vector3(0.49, -0.05, 0),
                  new Vector3(0.49, 0.2, 0),
                  new Vector3(0.44, 0.36, 0),
                  new Vector3(0.31, 0.46, 0),
                  new Vector3(0.22, 0.5, 0),
                ],
                tessellation: 32,
                cap: Mesh.CAP_ALL,
                updatable: true,
              },
              this.scene,
            )
          : kind === "box"
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
                      updatable: sculpted,
                    },
                    this.scene,
                  );
      source.material = this.mat(color);
      if (sculpted) {
        const vertices = source.getVerticesData(VertexBuffer.PositionKind)!;
        for (let i = 0; i < vertices.length; i += 3) {
          const y = vertices[i + 1];
          if (name === "padded-jacket") {
            vertices[i + 2] *= 1 + Math.sin(y * 17 + vertices[i] * 13) * 0.015;
          } else if (name === "face") {
            vertices[i] *= 1 - Math.max(0, -y - 0.04) * 0.28;
            vertices[i + 2] *= 1 - Math.max(0, -y) * 0.1;
          } else if (name === "hair") {
            vertices[i] *= 1 + Math.sin(y * 18 + vertices[i + 2] * 11) * 0.035;
            vertices[i + 2] *= 1 + Math.cos(vertices[i] * 17 + y * 7) * 0.035;
          } else {
            // Sculpt the backpack into rounded fabric panels with fuller corners.
            for (let axis = 0; axis < 3; axis++) {
              const value = vertices[i + axis];
              vertices[i + axis] =
                Math.sign(value) * 0.5 * Math.pow(Math.abs(value) * 2, 0.72);
            }
          }
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

  private seam(
    name: string,
    path: Triple[],
    radius: number,
    color: string,
    parent: TransformNode,
  ) {
    const mesh = CreateTube(
      name,
      {
        path: path.map(([x, y, z]) => new Vector3(x, y, z)),
        radius,
        tessellation: 6,
        cap: Mesh.CAP_ALL,
      },
      this.scene,
    );
    mesh.material = this.mat(color);
    mesh.parent = parent;
    mesh.receiveShadows = true;
    return mesh;
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
    this.terrainView = new TerrainScene(this.scene, this.props);
    this.terrainView.update(0);
    this.forestBackdrop = new TransformNode("forest-hills", this.scene);
    for (let i = 0; i < 12; i++)
      this.part(
        "sphere",
        "distant-hill",
        [30 + i * 2, 17 + (i % 3) * 6, 40],
        i % 2 ? "#91aa96" : "#a6b49b",
        [(i % 2 ? 1 : -1) * (35 + i * 3), 0, 100 + i * 8],
        this.forestBackdrop,
        12,
      );
    for (let chunk = 0; chunk < 5; chunk++) {
      const root = new TransformNode("woodland-" + chunk, this.scene);
      this.chunks.push(root);
      const chunkStart = ((chunk * 40 + 40) % 200) - 60;
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
    this.seam(
      "jacket-zip",
      [
        [0, 0.08, 0.24],
        [0, 0.3, 0.268],
        [0, 0.5, 0.262],
        [0, 0.7, 0.205],
      ],
      0.012,
      "#f4c584",
      this.torso,
    );
    this.part(
      "capsule",
      "zipper-pull",
      [0.045, 0.07, 0.025],
      "#e4bf75",
      [0, 0.66, 0.235],
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
      this.part(
        "capsule",
        "strap-adjuster",
        [0.09, 0.07, 0.03],
        "#e4bf75",
        [side * 0.25, 0.23, 0.258],
        this.torso,
      );
      this.seam(
        "pocket-flap-stitch",
        [
          [side * 0.21 - 0.075, 0.21, 0.274],
          [side * 0.21, 0.19, 0.278],
          [side * 0.21 + 0.075, 0.21, 0.274],
        ],
        0.006,
        "#e7b37d",
        this.torso,
      );
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
    const hat = CreateLathe(
      "canvas-hat",
      {
        shape: [
          new Vector3(0.36, -0.145, 0),
          new Vector3(0.355, -0.11, 0),
          new Vector3(0.325, 0.065, 0),
          new Vector3(0.3, 0.13, 0),
          new Vector3(0.25, 0.15, 0),
          new Vector3(0.12, 0.13, 0),
          new Vector3(0, 0.115, 0),
        ],
        cap: Mesh.CAP_START,
        tessellation: 40,
      },
      this.scene,
    );
    hat.position.set(0, 0.58, -0.015);
    hat.material = this.mat("#d0b78d");
    hat.parent = this.head;
    const brim = CreateLathe(
      "hat-brim",
      {
        shape: [
          new Vector3(0.29, 0, 0),
          new Vector3(0.37, -0.013, 0),
          new Vector3(0.43, -0.004, 0),
          new Vector3(0.475, 0.015, 0),
          new Vector3(0.49, 0.025, 0),
        ],
        tessellation: 48,
        sideOrientation: Mesh.DOUBLESIDE,
      },
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
    this.part(
      "capsule",
      "hat-band-buckle",
      [0.11, 0.075, 0.035],
      "#e4bf75",
      [-0.13, 0.474, 0.327],
      this.head,
    );
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
        "sphere",
        "inner-ear",
        [0.065, 0.12, 0.04],
        "#c68c6c",
        [side * 0.35, 0.225, 0.082],
        this.head,
        12,
      );
      this.seam(
        "eyebrow",
        [
          [side * 0.13 - 0.05, 0.366, side > 0 ? 0.312 : 0.27],
          [side * 0.13, 0.38, 0.295],
          [side * 0.13 + 0.05, 0.369, side > 0 ? 0.27 : 0.312],
        ],
        0.01,
        "#5b4935",
        this.head,
      );
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
        [0.064, 0.085, 0.035],
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
      this.part(
        "capsule",
        "hair-lock",
        [0.105, 0.16, 0.07],
        "#5b4935",
        [side * 0.19, 0.43, 0.24],
        this.head,
      ).rotation.z = side * 0.24;
    }
    this.part(
      "sphere",
      "nose",
      [0.085, 0.095, 0.11],
      "#dca078",
      [0, 0.2, 0.32],
      this.head,
      12,
    );
    this.seam(
      "smile",
      [
        [-0.05, 0.117, 0.284],
        [-0.025, 0.105, 0.284],
        [0, 0.102, 0.282],
        [0.025, 0.105, 0.284],
        [0.05, 0.117, 0.284],
      ],
      0.008,
      "#8c634c",
      this.head,
    );
    this.backpack = this.joint("backpack-joint", [0, 0.42, -0.33], this.torso);
    this.part(
      "sphere",
      "backpack",
      [0.6, 0.7, 0.35],
      "#386e60",
      [0, 0, 0],
      this.backpack,
    );
    this.part(
      "sphere",
      "backpack-flap",
      [0.62, 0.25, 0.39],
      "#5f9075",
      [0, 0.25, -0.01],
      this.backpack,
    );
    this.part(
      "sphere",
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
      "trail-patch",
      [0.19, 0.14, 0.025],
      "#dec78b",
      [0, -0.13, -0.27],
      this.backpack,
    );
    this.seam(
      "embroidered-mountains",
      [
        [-0.064, -0.16, -0.286],
        [-0.022, -0.095, -0.29],
        [0.005, -0.135, -0.291],
        [0.026, -0.11, -0.29],
        [0.064, -0.16, -0.286],
        [-0.064, -0.16, -0.286],
      ],
      0.006,
      "#455d50",
      this.backpack,
    );
    this.seam(
      "backpack-pocket-zip",
      [
        [-0.16, -0.025, -0.253],
        [0, -0.025, -0.267],
        [0.16, -0.025, -0.253],
      ],
      0.007,
      "#ddbf84",
      this.backpack,
    );
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
      this.seam(
        "backpack-edge-seam",
        [
          [side * 0.245, -0.27, -0.13],
          [side * 0.282, -0.2, -0.15],
          [side * 0.282, 0.13, -0.15],
          [side * 0.23, 0.27, -0.14],
        ],
        0.008,
        "#83a18a",
        this.backpack,
      );
      const rollEnd = CreateTorus(
        "bedroll-fold",
        { diameter: 0.105, thickness: 0.012, tessellation: 20 },
        this.scene,
      );
      rollEnd.parent = this.backpack;
      rollEnd.rotation.z = Math.PI / 2;
      rollEnd.position.set(side * 0.295, -0.39, -0.03);
      rollEnd.material = this.mat("#c5ab7b");
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
        "sphere",
        "fabric-knee",
        [0.24, 0.22, 0.255],
        "#345d50",
        [0, -0.005, 0.005],
        lower,
        16,
      );
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
        "boot-collar",
        [0.28, 0.13, 0.31],
        "#c68d56",
        [0, 0.12, -0.012],
        foot,
      );
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
      for (let tread = 0; tread < 3; tread++)
        this.part(
          "box",
          "boot-tread",
          [0.28, 0.025, 0.09],
          "#82664d",
          [0, -0.105, -0.05 + tread * 0.14],
          foot,
        );
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
        "sphere",
        "fabric-elbow",
        [0.225, 0.21, 0.235],
        "#dd7445",
        [0, 0, 0],
        elbow,
        16,
      );
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

  private fishSignTexture?: DynamicTexture;
  private fishSignColors = new Map<number, StandardMaterial>();

  private fishSignMaterial(urgency: number) {
    const step = Math.round(urgency * 24);
    const cached = this.fishSignColors.get(step);
    if (cached) return cached;
    if (!this.fishSignTexture) {
      const texture = new DynamicTexture("fish-warning-triangle", 128, this.scene, true);
      const ctx = texture.getContext() as CanvasRenderingContext2D;
      ctx.beginPath();
      ctx.moveTo(64, 8); ctx.lineTo(120, 110); ctx.lineTo(8, 110); ctx.closePath();
      ctx.lineJoin = "round";
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.lineWidth = 7; ctx.strokeStyle = "#352823"; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(64, 43); ctx.lineTo(64, 73);
      ctx.lineWidth = 11; ctx.lineCap = "round"; ctx.stroke();
      ctx.beginPath(); ctx.arc(64, 91, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#352823"; ctx.fill();
      texture.hasAlpha = true;
      texture.update();
      this.fishSignTexture = texture;
    }
    const material = new StandardMaterial(`fish-warning-${step}`, this.scene);
    material.diffuseTexture = this.fishSignTexture;
    material.useAlphaFromDiffuseTexture = true;
    material.disableLighting = true;
    material.backFaceCulling = false;
    material.fogEnabled = false;
    material.emissiveTexture = this.fishSignTexture;
    material.emissiveColor = Color3.Lerp(Color3.FromHexString("#ffd843"), Color3.FromHexString("#ff4735"), step / 24);
    this.fishSignColors.set(step, material);
    return material;
  }

  private createItem(item: TrackItem) {
    if (["ice", "pool", "snowdrift", "snowman", "fire", "liquor", "stump", "snow-log"].includes(item.type)) {
      const root = this.snowProps.create(item.type);
      root.position.set(item.type === "snow-log" ? 0 : item.lane * 2.5, item.y, item.z);
      return root;
    }
    if (["bubble", "coral", "volcano", "fish"].includes(item.type)) {
      const root = new TransformNode(item.type, this.scene);
      if (item.type === "bubble") {
        const bubble = CreateSphere("hazard-bubble", {diameter: 1.3, segments: 32}, this.scene);
        const mat = this.ocean.material("bubble", "#9be9fa");
        mat.alpha = 0.38; mat.specularColor.setAll(0.8); mat.specularPower = 96;
        mat.emissiveFresnelParameters = new FresnelParameters({
          leftColor: Color3.FromHexString("#c4faff"), rightColor: Color3.FromHexString("#163b50"), power: 3,
        });
        bubble.material = mat; bubble.parent = root;
        for (let i = 0; i < 3; i++) {
          const shine = CreateSphere("bubble-pearly-highlight", {diameter: 0.13 - i * 0.03, segments: 10}, this.scene);
          shine.parent = root; shine.material = this.mat("#eaffff", true);
          shine.position.set(-0.28 + i * 0.09, 0.37 + i * 0.045, -0.43);
          shine.scaling.set(0.6, 1.5, 0.35); shine.rotation.z = -0.5;
        }
      } else if (item.type === "fish") {
        const sign = CreatePlane("fish-entry-sign", {size: 1.25}, this.scene);
        sign.parent = root;
        sign.billboardMode = Mesh.BILLBOARDMODE_ALL;
        sign.isPickable = false;
        sign.material = this.fishSignMaterial(0);
        sign.setEnabled(false);
        const school = new TransformNode("fish-school", this.scene);
        school.parent = root;
        for (let i = 0; i < 6; i++) {
          const fish = this.ocean.fish(school, i % 2 ? "#efba69" : "#e6a177");
          fish.position.set((i % 3 - 1) * 0.5, (Math.floor(i / 3) - 0.5) * 0.4, (i % 2) * 0.18);
          fish.scaling.setAll(0.85);
        }
      } else if (item.type === "volcano") {
        this.ocean.vent(root);
        const plumeHeight = CONFIG.waterSurface - CONFIG.seabedHeight - 1.3;
        const plume = CreateCylinder("thermal-plume", {height: plumeHeight, diameterTop: 1.1, diameterBottom: 0.55, tessellation: 20}, this.scene);
        plume.parent = root; plume.position.y = 0.65 + plumeHeight / 2;
        const steam = this.ocean.material("steam", "#f4c083");
        steam.alpha = 0.3; plume.material = steam; plume.setEnabled(false);
        for (let i = 0; i < 9; i++) {
          const bubble = CreateSphere(`vent-steam-${i}`, {diameter: 0.15 + i * 0.035, segments: 10}, this.scene);
          bubble.parent = root; bubble.material = this.mat("#ffe3ac", true); bubble.setEnabled(false);
        }
      } else {
        if (item.coral) this.ocean.grownCoral(root, item.coral);
      }
      root.position.set(item.coral?.rootX ?? item.lane * 2.5, item.coral?.rootY ?? item.y, item.z);
      return root;
    }
    if (item.type === "magnet" || item.type === "shield") {
      const root = new TransformNode(item.type, this.scene);
      const color = item.type === "magnet" ? "#df9b65" : "#8abbd0";
      const painted = CreatePlane("painted-supply", { size: 1.28 }, this.scene);
      painted.material = this.pickupArt(item.type);
      painted.billboardMode = Mesh.BILLBOARDMODE_ALL;
      painted.parent = root;
      const ring = CreateTorus(
        "pickup-halo",
        { diameter: 1.1, thickness: 0.035, tessellation: 36 },
        this.scene,
      );
      ring.position.y = -0.49;
      ring.material = this.mat(color, true);
      ring.parent = root;
      root.position.set(item.lane * 2.5, item.y, item.z);
      return root;
    }
    if (item.type === "wall-rock") {
      const root = this.props.create("rock", item.id, true);
      root.scaling.set(0.65, 0.5, 0.65);
      root.position.set((item.side ?? 1) * 4.9, item.y - 0.65, item.z);
      return root;
    }
    if (item.type !== "coin") {
      const root = this.props.create(
        item.type as "log" | "arch" | "rock",
        item.id,
        sectionAt(item.worldZ, this.track).biome === "canyon",
        item.shelf,
      );
      root.position.set(item.shelf ? 0 : item.lane * 2.5, 0, item.z);
      return root;
    }
    const root = new TransformNode("coin", this.scene);
    root.position.set(
      item.route === "wall" ? (item.side ?? 1) * 4.95 : item.lane * 2.5,
      item.y,
      item.z,
    );
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

  private pickupArt(name: string) {
    let material = this.pickupMaterials.get(name);
    if (!material) {
      material = new StandardMaterial(`painted-${name}`, this.scene);
      const texture = new Texture(iconAsset(name), this.scene);
      texture.hasAlpha = true;
      texture.anisotropicFilteringLevel = 4;
      material.diffuseTexture = texture;
      material.useAlphaFromDiffuseTexture = true;
      material.emissiveColor.setAll(0.2);
      material.emissiveTexture = texture;
      material.specularColor = Color3.Black();
      material.backFaceCulling = false;
      this.pickupMaterials.set(name, material);
    }
    return material;
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

  private createRunEffects() {
    this.shieldAura = new TransformNode("orbiting-shields", this.scene);
    this.shieldAura.parent = this.runner;
    this.shieldAura.position.y = 1.15;
    // Closed shield silhouettes with real thickness, rather than flat icon planes.
    const outline = [[-0.32, 0.38], [0.32, 0.38], [0.36, 0.08],
      [0.23, -0.26], [0, -0.45], [-0.23, -0.26], [-0.36, 0.08]];
    const positions: number[] = [];
    const indices: number[] = [];
    for (const z of [-0.06, 0.06]) {
      positions.push(0, 0, z);
      for (const [x, y] of outline) positions.push(x, y, z);
    }
    for (let i = 0; i < outline.length; i++) {
      const a = i + 1, b = (i + 1) % outline.length + 1;
      indices.push(0, a, b, 8, b + 8, a + 8,
        a, a + 8, b, b, a + 8, b + 8);
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    for (let i = 0; i < 3; i++) {
      const shield = new Mesh(`orbit-shield-${i}`, this.scene);
      data.applyToMesh(shield);
      shield.parent = this.shieldAura;
      shield.material = this.mat("#e5bc69", true);
      const inset = shield.clone(`shield-inset-${i}`, shield)!;
      inset.scaling.set(0.78, 0.8, 1.1);
      inset.material = this.mat("#609ca4", true);
      this.shieldRims.push(shield);
    }
    this.magnetAura = CreateTorus(
      "magnet-field",
      { diameter: 1.8, thickness: 0.028, tessellation: 32 },
      this.scene,
    );
    this.magnetAura.parent = this.runner;
    this.magnetAura.position.y = 1.1;
    this.magnetAura.material = this.mat("#d9ae72", true);
    for (let i = 0; i < 4; i++) {
      const spark = CreateSphere(
        "magnetic-orbit-spark",
        { diameter: 0.09, segments: 8 },
        this.scene,
      );
      spark.parent = this.runner;
      spark.material = this.mat("#ffe6a0", true);
      this.magnetSparks.push(spark);
    }
    this.powerPulse = CreateTorus(
      "power-activation-wave",
      { diameter: 1, thickness: 0.04, tessellation: 48 },
      this.scene,
    );
    this.powerPulse.parent = this.runner;
    this.powerPulse.position.y = 0.12;
    this.powerPulse.material = this.mat("#e2d6a5", true);
    this.powerPulse.setEnabled(false);
    for (const side of [-1, 1]) {
      const jet = CreateCylinder(
        "booster-jet",
        {
          height: 0.55,
          diameterTop: 0.18,
          diameterBottom: 0,
          tessellation: 16,
        },
        this.scene,
      );
      jet.parent = this.backpack;
      jet.position.set(side * 0.22, -0.42, -0.23);
      jet.material = this.mat("#ffd38c", true);
      const core = CreateCylinder(
        "jet-flame-core",
        {
          height: 0.42,
          diameterTop: 0.09,
          diameterBottom: 0,
          tessellation: 12,
        },
        this.scene,
      );
      core.parent = jet;
      core.position.y = 0.04;
      core.material = this.mat("#e4f6ed", true);
      this.boostJets.push(jet);
      const pod = CreateCylinder(
        "booster-pod",
        {
          height: 0.46,
          diameterTop: 0.18,
          diameterBottom: 0.23,
          tessellation: 24,
        },
        this.scene,
      );
      pod.parent = this.backpack;
      pod.position.set(side * 0.22, -0.05, -0.23);
      pod.material = this.mat("#345d50");
      for (const y of [-0.16, 0.15]) {
        const band = CreateTorus(
          "jetpack-brass-collar",
          { diameter: 0.225, thickness: 0.035, tessellation: 24 },
          this.scene,
        );
        band.parent = pod;
        band.position.y = y;
        band.material = this.mat("#cfaa66");
      }
      const nozzle = CreateLathe(
        "flared-jet-nozzle",
        {
          shape: [
            new Vector3(0.085, 0, 0),
            new Vector3(0.09, -0.09, 0),
            new Vector3(0.145, -0.16, 0),
            new Vector3(0.145, -0.18, 0),
            new Vector3(0.11, -0.18, 0),
            new Vector3(0.07, -0.07, 0),
          ],
          tessellation: 24,
          sideOrientation: Mesh.DOUBLESIDE,
        },
        this.scene,
      );
      nozzle.parent = pod;
      nozzle.position.y = -0.2;
      nozzle.material = this.mat("#cfaa66");
      const cap = CreateSphere(
        "jetpack-rounded-cap",
        { diameter: 0.19, segments: 16 },
        this.scene,
      );
      cap.parent = pod;
      cap.position.y = 0.23;
      cap.scaling.y = 0.55;
      cap.material = this.mat("#cfaa66");
      this.boosterPods.push(pod);
      const entry = CreateTorus(
        "wall-entry-ring",
        { diameter: 1.7, thickness: 0.08, tessellation: 32 },
        this.scene,
      );
      entry.rotation.x = Math.PI / 2;
      entry.material = this.mat("#a9d5c5", true);
      this.entries.push(entry);
    }
  }
  private updateRunEffects(game: RunnerGame, dt: number, showWallEntryMarkers: boolean) {
    const animated = game.mode === "running" || game.mode === "rewinding";
    const effectDt = animated ? dt : 0;
    if (game.mode === "ready" || game.introducing) {
      this.shieldVisual = this.magnetVisual = this.powerPulseLife = 0;
    }
    this.shieldVisual = damp(
      this.shieldVisual,
      game.shield || game.protectionTime > 0 ? 1 : 0,
      12,
      effectDt,
    );
    this.magnetVisual = damp(
      this.magnetVisual,
      game.magnetTime > 0 ? 1 : 0,
      12,
      effectDt,
    );
    const warning = game.shield && game.shieldTime < 3;
    const shieldPulse = warning
      ? 0.58 + Math.sin(this.time * 14) * 0.3
      : 0.85 + Math.sin(this.time * 2.8) * 0.08;
    this.shieldAura.setEnabled(this.shieldVisual > 0.01);
    this.shieldAura.scaling.setAll(0.85 + this.shieldVisual * 0.15);
    this.shieldRims.forEach((shield, i) => {
      const angle = this.time * 1.8 + i * Math.PI * 2 / 3;
      shield.position.set(Math.cos(angle) * 1.15,
        Math.sin(this.time * 3 + i * 2) * 0.08, Math.sin(angle) * 1.15);
      shield.rotation.y = Math.PI / 2 - angle;
      for (const mesh of [shield, ...shield.getChildMeshes()])
        mesh.visibility = this.shieldVisual * shieldPulse;
    });
    this.magnetAura.setEnabled(this.magnetVisual > 0.01);
    this.magnetAura.visibility = this.magnetVisual * 0.5;
    this.magnetAura.scaling.setAll(
      0.85 + this.magnetVisual * 0.25 + Math.sin(this.time * 4) * 0.04,
    );
    this.magnetAura.rotation.y = this.time * 2;
    this.magnetAura.rotation.x = Math.sin(this.time * 2) * 0.3;
    this.magnetSparks.forEach((spark, i) => {
      const a = this.time * 3.8 + (i * Math.PI) / 2;
      spark.setEnabled(this.magnetVisual > 0.01);
      spark.position.set(
        Math.cos(a) * 0.9,
        1.05 + Math.sin(a * 1.5) * 0.38,
        Math.sin(a) * 0.65,
      );
      spark.scaling.setAll(this.magnetVisual * (0.7 + Math.sin(a * 2) * 0.25));
    });
    if (this.lastPowerPickup !== game.pickupSerial) {
      this.lastPowerPickup = game.pickupSerial;
      this.powerPulseLife = 0.65;
      this.burst(
        this.runner.position.add(new Vector3(0, 1.1, 0)),
        game.lastPickup === "shield" ? "#bce4eb" : "#ffdc8c",
        14,
        2.4,
        0.6,
        0.13,
        0.4,
      );
    }
    this.powerPulseLife = Math.max(0, this.powerPulseLife - effectDt);
    this.powerPulse.setEnabled(this.powerPulseLife > 0);
    this.powerPulse.scaling.setAll(1 + (1 - this.powerPulseLife / 0.65) * 2.2);
    this.powerPulse.visibility = this.powerPulseLife / 0.65;
    this.boostJets.forEach((jet, i) => {
      jet.setEnabled(game.boostBlend > 0.05);
      jet.scaling.set(
        1,
        (0.8 + Math.sin(this.time * 40 + i) * 0.2) * game.boostBlend,
        1,
      );
    });
    this.boosterPods.forEach((pod) => {
      pod.setEnabled(game.boostBlend > 0.05);
      pod.scaling.setAll(game.boostBlend);
    });
    this.entries.forEach((entry, i) => {
      const gap = game.gapWarning;
      entry.setEnabled(
        showWallEntryMarkers && !!gap && !game.boosting && !game.wallSide && game.mode === "running",
      );
      if (gap)
        entry.position.set(
          (i === 0 ? -1 : 1) * 5.1,
          1.95,
          gap.start - 10 - game.distance,
        );
    });
    if (this.lastShieldBreak !== game.shieldBreakSerial)
      this.burst(
        this.runner.position.add(new Vector3(0, 1, 0)),
        "#a8d4e2",
        18,
        4,
        0.7,
        0.14,
        2,
      );
    this.lastShieldBreak = game.shieldBreakSerial;
    if (this.lastClear !== game.clearSerial)
      for (const item of game.shattered)
        this.burst(
          new Vector3(
            item.route === "wall" ? (item.side ?? 1) * 4.95 : item.lane * 2.5,
            item.route === "wall" ? item.y : 1,
            item.worldZ - game.distance,
          ),
          "#bcb5a1",
          5,
          3,
          0.7,
          0.2,
          4,
        );
    this.lastClear = game.clearSerial;
    const tick = Math.floor(this.time * 18);
    if (
      tick !== this.lastEffectTick &&
      (game.boosting || game.mode === "rewinding")
    )
      this.burst(
        this.runner.position.add(new Vector3(0, 0.7, -0.4)),
        game.boosting ? "#ffd18b" : "#b4dcdf",
        2,
        1.5,
        0.55,
        0.15,
        0,
      );
    this.lastEffectTick = tick;
  }

  getTutorialAnchor(itemId: number) {
    const node = this.itemMeshes.get(itemId);
    if (!node) return null;
    const width = this.engine.getRenderWidth(),
      height = this.engine.getRenderHeight();
    const point = Vector3.Project(
      new Vector3(
        node.position.x === 0 && node.name === "wall-grown-stone-shelf"
          ? this.runner.position.x
          : 0,
        1.9,
        0,
      ),
      node.getWorldMatrix(),
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(width, height),
    );
    const rect = this.engine.getRenderingCanvas()!.getBoundingClientRect();
    return {
      x: rect.left + (point.x / width) * rect.width,
      y: rect.top + (point.y / height) * rect.height,
      visible: point.z >= 0 && point.z <= 1,
    };
  }

  update(game: RunnerGame, dt: number, showWallEntryMarkers = false, snowLesson = 0) {
    if (this.track !== game.track) this.openingMistTime = 0;
    this.track = game.track;
    const running = game.mode === "running",
      ready = game.mode === "ready",
      paused = game.mode === "paused",
      introducing = game.introducing;
    const oldMode = this.mode;
    if (!paused && game.mode !== "over") this.time += dt;
    if (this.mode !== game.mode) {
      if (
        ready ||
        (introducing && oldMode !== "paused") ||
        (running &&
          oldMode !== "paused" &&
          oldMode !== "intro" &&
          oldMode !== "rewinding")
      ) {
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
        if (game.lastHit === "pool") this.burst(new Vector3(game.x, 0.2, 0), "#bde7ff", 40, 5, 1.6, 0.2, 5);
        this.shake = 0.2;
        this.shockLife = 0.5;
        this.shock.position.set(game.x, 0.1, 0);
        this.shock.setEnabled(true);
        this.burst(new Vector3(game.x, 1, 0), "#ffe0a0", 18, 5, 0.7, 0.22, 5);
      }
      this.mode = game.mode;
    }
    const waterBefore = this.runner.position.y;
    const pose = this.motion.update(game, dt);
    const scroll = ready || introducing ? 0 : game.distance;
    this.terrainView.update(scroll, game.worldTime, game.trackSeed, this.track);
    // Exposure follows the lens crossing the mouth, not the runner seven metres ahead.
    const cameraDistance = Math.max(0, scroll + this.camera.position.z);
    const darkness = tunnelDarkness(cameraDistance, this.track);
    const section = sectionAt(cameraDistance, this.track);
    const inlandBridge = section.biome === "tunnel" || section.biome === "snow-transition";
    const from = inlandBridge ? section.from : section.biome;
    const to = inlandBridge ? section.to : section.biome;
    const progress =
      inlandBridge
        ? smooth(
            (cameraDistance - section.start) / (section.end - section.start),
          )
        : 0;
    const canyonBlend =
      (from === "canyon" ? 1 : 0) * (1 - progress) +
      (to === "canyon" ? 1 : 0) * progress;
    const inlandSky = Color3.Lerp(
      Color3.FromHexString("#d9e9db"),
      Color3.FromHexString("#ddc9ad"),
      canyonBlend,
    );
    const coastalSky = section.biome === "beach" || section.biome === "water" ? 1
      : section.biome === "shore" ? 1 - smooth((cameraDistance - section.start - 50) / 30)
      : section.biome === "canyon" && this.track.at(section.end).biome === "beach" ? smooth((cameraDistance - section.end + 80) / 80) : 0;
    const snowLight = snowBlend(cameraDistance, this.track);
    const outside = Color3.Lerp(Color3.Lerp(inlandSky, Color3.FromHexString("#b8dce7"), coastalSky), Color3.FromHexString("#d6e7f4"), snowLight);
    const immersed = game.waterBlend;
    const fog = Color3.Lerp(outside.scale(1 - darkness * 0.78), Color3.FromHexString("#247f98"), immersed);

    this.scene.fogColor = fog;
    this.scene.clearColor = new Color4(fog.r, fog.g, fog.b, 1);
    const openingReady = game.openingPrepared && game.items.every(item => {
      const model = this.itemMeshes.get(item.id);
      return model && model.getChildMeshes().every(mesh => mesh.isReady());
    });
    if (running && openingReady) this.openingMistTime += dt;
    const mist = ready || introducing ? 1 : openingFog(this.openingMistTime);
    const terrainFog = 0.009 + darkness * 0.012 + immersed * 0.008 + game.blizzard * 0.015;
    this.scene.fogDensity = terrainFog + (CONFIG.openingFogDensity - terrainFog) * mist;
    this.sky.intensity = 0.75 - darkness * 0.3;
    this.sun.intensity = 0.85 - darkness * 0.65;
    const inlandGround = Color3.Lerp(Color3.FromHexString("#698463"), Color3.FromHexString("#a88a67"), canyonBlend);
    this.sky.groundColor = Color3.Lerp(inlandGround, Color3.FromHexString("#a8b9ce"), snowLight);
    this.forestVisible = canyonBlend < 0.5 && snowLight < 0.55;
    let forestSnowFade = snowLight;
    if (section.biome === "snow-transition" && section.from === "forest")
      forestSnowFade = (cameraDistance - section.start) / (CONFIG.snowTransition + 90);
    if (section.biome === "snow" && section.from === "forest")
      forestSnowFade = (cameraDistance - section.start + CONFIG.snowTransition) / (CONFIG.snowTransition + 90);
    const forestHorizon = (1 - canyonBlend) * (1 - smooth(forestSnowFade)) * (1 - coastalSky) * (1 - immersed);
    this.forestBackdrop.position.y = -12 * smooth(forestSnowFade);
    this.forestBackdrop.setEnabled(forestHorizon > 0.005);
    for (const hill of this.forestBackdrop.getChildMeshes()) hill.visibility = forestHorizon;
    this.chunks.forEach((root, i) => {
      root.position.z = ((((i * 40 - scroll + 40) % 200) + 200) % 200) - 60;
      // Clip individual roadside objects to their section; a 40m group must not pop at the portal.
      for (const child of root.getChildren()) {
        const node = child as TransformNode;
        const worldZ = root.position.z + scroll + node.position.z;
        const road = sectionAt(worldZ, this.track);
        const forestBridge = road.biome === "snow-transition" && (road.from === "forest" || road.to === "forest");
        const forestAmount = forestBridge ? 1 - snowBlend(worldZ, this.track) : 1;
        const clearMouth = road.biome === "forest" &&
          (road.end - worldZ > 7 || this.track.at(road.end).biome === "snow-transition") &&
          (road.start === 0 || worldZ - road.start > 5 || this.track.at(road.start - 1).biome === "snow-transition");
        let scale = this.forestScales.get(node);
        if (forestBridge && !scale) {
          scale = node.scaling.clone();
          this.forestScales.set(node, scale);
        }
        if (scale) node.scaling.copyFrom(scale).scaleInPlace(forestAmount);
        node.setEnabled(clearMouth || (forestBridge && forestAmount > 0.035));
      }
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
      opening ? 0 : game.visualWaterY + (game.terrain.biome === "beach" ? Math.sin(game.waterBlend * Math.PI) * 2 : 0) + game.y + Math.abs(pose.turn) * 0.045 * runWeight,
      opening
        ? (REST_Z + Math.cos(openingYaw) * exitOffset) * (1 - walkProgress)
        : 0,
    );
    if (game.transitioning && running && (waterBefore >= 0 && this.runner.position.y < 0 || waterBefore < 0 && this.runner.position.y >= 0))
      this.burst(new Vector3(game.x, -0.15, 0), "#c5f8ff", 28, 4, 0.8, 0.16, 3);
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
    if (!opening) {
      this.runner.position.x +=
        (game.wallVisualSide * 5.4 - game.x) * game.wallBlend;
      this.runner.position.y +=
        game.wallY * game.wallBlend + game.boostBlend * 5.5 * (1 - immersed);
      this.runner.rotation.z += game.wallVisualSide * 0.95 * game.wallBlend;
      this.runner.rotation.x -= game.boostBlend * 0.22;
      if (game.lastHit === "gap") this.runner.position.y -= pose.death * 8;
    }
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
        pose.dive * 0.35 +
        flightPitch * airWeight +
        0.08 * (1 - game.launchProgress) * (1 - airWeight) * blend;
    this.torso.rotation.y = 0;
    this.torso.rotation.z =
      Math.sin(pose.phase) * 0.055 * runWeight - pose.slide * 0.07;
    this.torso.scaling.set(
      1 + pose.landing * 0.025,
      1 - pose.landing * 0.04,
      1,
    );
    this.head.rotation.y = opening
      ? Math.sin(this.time * 0.7) * 0.12 * (1 - prepare)
      : -pose.turn * 0.17;
    this.head.rotation.z = -game.wallVisualSide * 0.18 * game.wallBlend;
    this.head.rotation.x =
      pose.slide * 0.33 - runWeight * 0.08 - pose.dive * 0.18;
    this.backpack.position.z = -0.33 + pose.slide * 0.13;
    this.backpack.rotation.x =
      Math.sin(pose.phase * 2) * 0.045 * runWeight - pose.slide * 0.1;
    this.backpack.rotation.z = -Math.sin(pose.phase) * 0.025 * runWeight;
    this.scarf.rotation.x =
      -0.2 + Math.sin(this.time * 13) * (0.04 + runWeight * 0.14);
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
        const slideUpper = (leg.side > 0 ? -1.25 : -1.78) + pose.dive * 0.35;
        const slideKnee =
          (leg.side > 0 ? 0.05 : 1.78) +
          pose.dive * (leg.side > 0 ? 0.9 : 0.15);
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
          pose.landing * 1.1 * blend +
          0.08 * (1 - game.launchProgress) * (1 - airWeight) * blend;
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
          pose.slide * 0.72 -
          pose.dive * 0.85;
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
          0.8 * pose.dive -
          0.35 * (1 - pose.run) * (1 - pose.air) * blend;
    }
    for (const leg of this.legs) {
      leg.upper.rotation.z += leg.side * game.wallBlend * 0.12;
      leg.upper.rotation.x =
        leg.upper.rotation.x * (1 - game.boostBlend) -
        game.boostBlend * (leg.side > 0 ? 0.15 : 0.4);
      leg.lower.rotation.x =
        leg.lower.rotation.x * (1 - game.boostBlend) + game.boostBlend * 0.75;
    }
    for (const arm of this.arms)
      arm.upper.rotation.z +=
        arm.side * (game.wallBlend * 0.35 + game.boostBlend * 0.25);
    this.updateRunEffects(game, dt, showWallEntryMarkers);
    this.contact.setEnabled(
      immersed < 0.01 && game.wallBlend < 0.1 && game.boostBlend < 0.1 && game.lastHit !== "gap",
    );
    if (pose.swim > 0.001) {
      const swim = pose.swim;
      const cycle = game.worldTime * (game.boosting ? 3.8 : 2.6);
      const mix = (a: number, b: number) => a + (b - a) * swim;
      const heave = Math.sin(cycle * 2) * 0.025;
      // Small body roll follows the pulling shoulder instead of a rigid whole-body tilt.
      this.runner.rotation.x = mix(this.runner.rotation.x, 1.05 + heave);
      this.runner.rotation.z = mix(this.runner.rotation.z, Math.sin(cycle) * 0.075 - pose.turn * 0.18);
      this.hips.rotation.y = mix(this.hips.rotation.y, Math.sin(cycle - 0.35) * 0.07);
      this.torso.rotation.x = mix(this.torso.rotation.x, 0.04 + heave);
      this.torso.rotation.z = mix(this.torso.rotation.z, Math.sin(cycle + 0.2) * 0.045);
      this.head.rotation.x = mix(this.head.rotation.x, -0.22);
      for (const arm of this.arms) {
        const stroke = cycle + (arm.side > 0 ? Math.PI : 0);
        const pull = Math.sin(stroke);
        arm.upper.rotation.x = mix(arm.upper.rotation.x, -1.7 + pull * 1.05);
        arm.upper.rotation.z = mix(arm.upper.rotation.z, arm.side * (0.22 + (1 - Math.cos(stroke)) * 0.18));
        arm.lower.rotation.x = mix(arm.lower.rotation.x, -0.25 - Math.max(0, Math.cos(stroke - 0.5)) * 1.05);
      }
      for (const leg of this.legs) {
        const kick = cycle * 2 + (leg.side > 0 ? Math.PI : 0);
        leg.upper.rotation.x = mix(leg.upper.rotation.x, Math.sin(kick) * 0.2 - 0.08);
        leg.lower.rotation.x = mix(leg.lower.rotation.x, 0.14 + Math.max(0, Math.sin(kick - 0.6)) * 0.28);
        if (leg.foot) leg.foot.rotation.x = mix(leg.foot.rotation.x, 0.2 + Math.sin(kick - 0.9) * 0.08);
      }
    }
    this.snowPose(game);
    const impactDistance = CONFIG.iceDistance - ICE_IMPACT_METRES;
    if (running && game.iceRemaining > 0 && this.lastIceRemaining > impactDistance && game.iceRemaining <= impactDistance)
      this.burst(new Vector3(game.x, 0.17, -0.2), "#e4f4ff", this.high ? 24 : 12, 3.1, 0.48, 0.18, 2);
    this.lastIceRemaining = game.iceRemaining;
    if (this.lastSnowHit !== game.snowHitSerial) {
      this.lastSnowHit = game.snowHitSerial;
      this.burst(new Vector3(game.snowHitX, 0.8, 0), "#eef8ff", 22, 4, 0.7, 0.18, 5);
    }
    if (game.lastHit === "pool") {
      this.shock.position.set(game.x, 0.12, 0); this.shock.rotation.set(0, 0, 0);
      this.shock.scaling.setAll(1 + this.motion.pose.death * 2.5);
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
    if (running && !game.icy && game.y === 0 && footfall !== this.lastPhase)
      this.burst(
        new Vector3(game.x, 0.12, -0.13),
        game.inSnow ? "#e7f4ff" : "#d7b98d",
        game.sliding ? 4 : 2,
        0.7,
        0.4,
        game.sliding ? 0.5 : 0.28,
        0,
      );
    this.lastPhase = footfall;
    this.lastLanding = pose.landing;
    // Item IDs remain stable within a run, including rewinds.
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
      if (this.snow) this.snow.animate(mesh, game.worldTime);
      if (["bubble", "coral", "volcano", "fish"].includes(item.type)) {
        const b = game.waterBounds(item);
        mesh.position.set(b.x, item.type === "volcano" ? item.y : b.y, item.z);
        if (item.type === "fish") {
          mesh.position.x = 0;
          const school = mesh.getChildTransformNodes(true).find(node => node.name === "fish-school")!;
          school.position.x = b.x;
          school.rotation.y = b.direction * Math.PI / 2;
          school.setEnabled(b.active);
          const sign = mesh.getChildMeshes().find(node => node.name === "fish-entry-sign")!;
          const warning = item.fish && fishWarning(item.fish, game.worldTime);
          const visible = game.swimming && !game.transitioning && item.z >= -1.15 &&
            item.z <= CONFIG.fishWarningDistance && !!warning;
          sign.setEnabled(visible);
          if (visible && warning) {
            sign.position.x = warning.side * CONFIG.fishWarningEdge;
            sign.material = this.fishSignMaterial(warning.urgency);
            sign.scaling.setAll(1 + Math.max(0, item.z) * 0.019);
          }
          for (const tail of mesh.getChildMeshes().filter(m => m.name === "fish-fan-tail"))
            tail.rotation.y = Math.sin(game.worldTime * 7 + item.id) * 0.3;
        }
        if (item.type === "volcano") {
          const plume = mesh.getChildMeshes().find(m => m.name === "thermal-plume");
          plume?.setEnabled(b.eruption || b.warning);
          if (plume) {
            plume.scaling.y = b.eruption ? 1 : 0.08;
            plume.position.y = 0.65 + (CONFIG.waterSurface - CONFIG.seabedHeight - 1.3) / 2 * plume.scaling.y;
            plume.visibility = b.eruption ? 0.7 : 0.4 + Math.sin(game.worldTime * 12) * 0.2;
          }
          for (const steam of mesh.getChildMeshes().filter(m => m.name.startsWith("vent-steam-"))) {
            const i = Number(steam.name.split("-").pop());
            steam.setEnabled(b.eruption || b.warning);
            const lift = ((game.worldTime * (b.eruption ? 1.4 : 0.35) + i * 0.37) % 1);
            steam.position.set(Math.sin(i * 2.4) * 0.3, 0.65 + lift * (b.eruption ? CONFIG.waterSurface - CONFIG.seabedHeight - 1.3 : 0.45), Math.cos(i * 2.4) * 0.3);
            steam.scaling.setAll(0.35 + Math.sin(lift * Math.PI) * 0.8);
          }
        }
      }
      if (item.type === "coin") {
        const sourceX =
          item.route === "wall" ? (item.side ?? 1) * 4.95 : item.lane * 2.5;
        mesh.position.set(
          sourceX,
          item.y + Math.sin(this.time * 3 + item.id) * 0.07,
          item.z,
        );
        mesh.rotation.y =
          this.time * (item.attraction !== undefined ? 9 : 2.3) + item.id * 0.3;
        mesh.scaling.setAll(1);
        if (item.attraction !== undefined) {
          const p = smooth(item.attraction);
          const from = new Vector3(
            sourceX,
            item.y,
            item.attractionFromZ ?? item.z,
          );
          const to = this.runner.position.add(new Vector3(0, 1.15, 0));
          Vector3.LerpToRef(from, to, p, mesh.position);
          mesh.position.y +=
            Math.sin(p * Math.PI) * (0.55 + Math.abs(from.x - to.x) * 0.1);
          mesh.scaling.setAll(1 - p * 0.5);
          if (
            running &&
            Math.floor(this.time * 24) !== Math.floor((this.time - dt) * 24)
          )
            this.burst(
              mesh.position.clone(),
              "#ffe5a5",
              1,
              0.12,
              0.22,
              0.09,
              0,
            );
        }
      } else if (item.type === "magnet" || item.type === "shield") {
        mesh.position.y = item.y + Math.sin(this.time * 2.6 + item.id) * 0.1;
        mesh.rotation.y = Math.sin(this.time * 1.5 + item.id) * 0.15;
      }
    }
    if (running && game.coins > this.lastCoins)
      this.burst(
        this.runner.position.add(new Vector3(0, 1.15, 0)),
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
        leaf.setEnabled(this.forestVisible);
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
      homeCameraX * (1 - cameraProgress) +
        game.x * 0.05 * cameraProgress +
        game.wallVisualSide * 0.9 * game.wallBlend,
      5,
      dt,
    );
    this.camera.position.y = damp(
      this.camera.position.y,
      3.1 +
        1.3 * cameraProgress +
        game.wallBlend * (1 + game.wallY * 0.7) +
        game.boostBlend * 2.5 * (1 - immersed) + immersed * (game.waterY + 2 - 4.4),
      5,
      dt,
    );
    this.camera.position.z = damp(
      this.camera.position.z,
      -7.4 - (mobile ? 5.4 : 4.0) * cameraProgress - game.wallBlend * 2.6,
      4,
      dt,
    );
    const target = new Vector3(
      (mobile ? 3.95 : 3) * (1 - cameraProgress) +
        game.x * 0.025 * cameraProgress +
        game.wallVisualSide * 2.4 * game.wallBlend,
      1.1 -
        cameraProgress * 0.1 +
        game.wallBlend * game.wallY * 0.75 +
        game.boostBlend * 3.2 * (1 - immersed) + immersed * (game.waterY + 0.95 - 1),
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
        (running ? Math.max(0, game.speed - 12) * 0.005 : 0),
      3,
      dt,
    );
    if (this.snowPreview && this.snowPreview.step !== snowLesson) { this.snowPreview.dispose(); this.snowPreview = undefined; }
    if (snowLesson && !this.snowPreview) this.snowPreview = new SnowPreview(this.scene, this.runner, this.snowProps, snowLesson);
    this.scene.activeCamera = this.camera;
    this.scene.render();
    const viewport = document.querySelector<HTMLElement>("#snow-viewport");
    if (this.snowPreview && viewport) {
      const rect = viewport.getBoundingClientRect();
      const canvasRect = this.engine.getRenderingCanvas()!.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      this.snowPreview.frame(rect, canvasRect);
      const sx = this.engine.getRenderWidth() / canvasRect.width, sy = this.engine.getRenderHeight() / canvasRect.height;
      const fogEnabled = this.scene.fogEnabled, shadowsEnabled = this.scene.shadowsEnabled;
      const autoClearDepth = this.scene.autoClearDepthAndStencil;
      try {
        this.engine.enableScissor(Math.round((rect.left - canvasRect.left) * sx), Math.round((canvasRect.bottom - rect.bottom) * sy), Math.round(rect.width * sx), Math.round(rect.height * sy));
        this.scene.activeCamera = this.snowPreview.camera;
        this.scene.autoClear = false; this.scene.autoClearDepthAndStencil = false;
        this.scene.fogEnabled = false; this.scene.shadowsEnabled = false;
        this.engine.clear(Color4.FromHexString("#dce7ecff"), true, true, true);
        this.scene.render();
      } finally {
        this.engine.disableScissor(); this.scene.autoClear = true; this.scene.autoClearDepthAndStencil = autoClearDepth;
        this.scene.fogEnabled = fogEnabled; this.scene.shadowsEnabled = shadowsEnabled;
        this.scene.activeCamera = this.camera;
      }
    }
  }
}
