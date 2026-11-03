import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { gapsNear, roadSpans, sectionAt } from "./track.ts";
import { mergeSceneryMeshes } from "./scenery-mesh";
import type { ForestProps } from "./props.ts";

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export class TerrainScene {
  private cells = new Map<number, TransformNode>();
  private grass: StandardMaterial;
  private trail: StandardMaterial;
  private stone: StandardMaterial;
  private cliff: StandardMaterial;
  private tunnel: StandardMaterial;
  private tunnelTrail: StandardMaterial;
  private tunnelStone: StandardMaterial;
  private guide: StandardMaterial;
  constructor(
    private scene: Scene,
    private props: ForestProps,
  ) {
    const material = (name: string, color: string, file?: string) => {
      const mat = new StandardMaterial(name, scene);
      mat.diffuseColor = Color3.FromHexString(color).toLinearSpace();
      mat.specularColor = Color3.Black();
      if (file) {
        mat.diffuseTexture = new Texture(
          import.meta.env.BASE_URL + "art/" + file,
          scene,
        );
        mat.diffuseTexture.anisotropicFilteringLevel = 8;
      }
      return mat;
    };
    this.grass = material("grass-floor", "#ffffff", "woodland-grass.jpg");
    this.trail = material("forest-trail", "#e3dccc", "woodland-trail.jpg");
    this.stone = material("canyon-road", "#ffffff", "canyon-trail.jpg");
    this.cliff = material(
      "layered-sandstone",
      "#ffffff",
      "canyon-sandstone.jpg",
    );
    this.cliff.backFaceCulling = false;
    this.cliff.twoSidedLighting = true;
    this.tunnel = material("cave-interior", "#9e9586", "canyon-sandstone.jpg");
    this.tunnel.backFaceCulling = false;
    this.tunnel.twoSidedLighting = true;
    this.tunnelTrail = material(
      "cave-trail-floor",
      "#e3dccc",
      "woodland-trail.jpg",
    );
    this.tunnelStone = material(
      "cave-canyon-floor",
      "#ffffff",
      "canyon-trail.jpg",
    );
    this.guide = material("chalk-wall-route", "#ead8ac");
    this.guide.backFaceCulling = false;
    // Exterior surfaces remain faintly readable through a dark cave mouth.
    for (const mat of [this.grass, this.trail, this.stone, this.cliff]) {
      mat.emissiveTexture = mat.diffuseTexture;
      mat.emissiveColor.setAll(0.09);
    }
  }

  private surface(
    name: string,
    positions: number[],
    indices: number[],
    uvs: number[],
    colors: number[],
    parent: TransformNode,
    material: StandardMaterial,
  ) {
    const mesh = new Mesh(name, this.scene);
    const data = new VertexData();
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    data.positions = positions;
    data.indices = indices;
    data.uvs = uvs;
    data.colors = colors;
    data.normals = normals;
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.parent = parent;
    mesh.receiveShadows = true;
    return mesh;
  }

  private ground(
    width: number,
    length: number,
    x: number,
    y: number,
    z: number,
    parent: TransformNode,
    material: StandardMaterial,
    world: number,
  ) {
    const mesh = CreateGround(
      "terrain-surface",
      { width, height: length },
      this.scene,
    );
    const uv = mesh.getVerticesData(VertexBuffer.UVKind)!;
    const tile =
      material === this.grass
        ? 2.5
        : material === this.trail || material === this.tunnelTrail
          ? 8
          : 6;
    for (let i = 0; i < uv.length; i += 2) {
      uv[i] = (uv[i] * width + x - width / 2) / tile;
      uv[i + 1] = (uv[i + 1] * length + world) / tile;
    }
    mesh.setVerticesData(VertexBuffer.UVKind, uv);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.receiveShadows = true;
  }

  private cliffWall(side: number, world: number, parent: TransformNode) {
    const positions: number[] = [],
      indices: number[] = [],
      uvs: number[] = [],
      colors: number[] = [];
    const rows = 24,
      columns = 10;
    for (let z = 0; z <= columns; z++) {
      const absolute = world + z;
      const crest =
        13 +
        Math.sin(absolute * 0.037 + side) * 2.4 +
        Math.sin(absolute * 0.11) * 0.6;
      for (let row = 0; row <= rows; row++) {
        const y = -18 + (row / rows) * (crest + 18);
        // Keep the three playable wall heights close to the collision surface.
        const relief =
          0.07 + smooth((y - 4.5) / 4) * 0.7 + smooth((-y - 1) / 8) * 0.6;
        const contour =
          Math.sin(absolute * 0.13 + y * 0.58) * 0.6 +
          Math.cos(y * 2.2 + absolute * 0.06) * 0.18;
        const x = side * (5.46 + contour * relief + smooth((y - 7) / 6) * 2.4);
        positions.push(x, y, z);
        uvs.push(absolute / 5.5, y / 5.5);
        const shade = 0.69 + smooth((y + 12) / 22) * 0.31;
        const stratum = 0.95 + Math.sin(y * 2.2 + absolute * 0.012) * 0.05;
        colors.push(shade * stratum, shade * stratum * 0.96, shade * 0.9, 1);
        if (z < columns && row < rows) {
          const a = z * (rows + 1) + row,
            b = a + rows + 1;
          if (side < 0) indices.push(a, a + 1, b, a + 1, b + 1, b);
          else indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    this.surface(
      "eroded-continuous-cliff",
      positions,
      indices,
      uvs,
      colors,
      parent,
      this.cliff,
    );
  }

  private arch(
    world: number,
    parent: TransformNode,
    portal = false,
    offset = 0,
  ) {
    const section = sectionAt(world + 0.1);
    const positions: number[] = [],
      indices: number[] = [],
      uvs: number[] = [],
      colors: number[] = [];
    const profile: [number, number][] = [[-5.65, -1.2]];
    for (let i = 0; i <= 24; i++) {
      const angle = (i / 24) * Math.PI;
      profile.push([-Math.cos(angle) * 5.65, 3.1 + Math.sin(angle) * 4.7]);
    }
    profile.push([5.65, -1.2]);
    const rows = profile.length,
      depth = portal ? 1.8 : 10;
    const layers = portal ? 3 : 5;
    for (let layer = 0; layer <= layers; layer++) {
      const z = offset + (depth * layer) / layers;
      for (let i = 0; i < rows; i++) {
        const [x, y] = profile[i];
        const wear =
          Math.sin(i * 1.3 + (world + z) * 0.22) * (portal ? 0.1 : 0.06);
        positions.push(x + Math.sign(x) * wear, y + wear * 0.6, z);
        uvs.push(i / 8, (world + z) / 5);
        const mouth = Math.min(
          world + z - section.start,
          section.end - world - z,
        );
        const shade = portal ? 0.9 : 0.28 + (1 - smooth(mouth / 18)) * 0.52;
        colors.push(shade, shade * 0.97, shade * 0.91, 1);
        if (layer < layers && i < rows - 1) {
          const a = layer * rows + i,
            b = a + rows;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    this.surface(
      portal ? "weathered-cave-mouth" : "arched-cave-vault",
      positions,
      indices,
      uvs,
      colors,
      parent,
      portal ? this.cliff : this.tunnel,
    );
    if (portal) {
      const face: number[] = [],
        triangles: number[] = [],
        faceUvs: number[] = [];
      for (let i = 0; i < rows; i++) {
        const [x, y] = profile[i];
        const crown = smooth((y - 3.1) / 4.7);
        face.push(x, y, offset, x * 1.85, y + crown * 6.5, offset);
        faceUvs.push(x / 5, y / 5, (x * 1.85) / 5, (y + crown * 6.5) / 5);
        if (i < rows - 1) {
          const a = i * 2;
          triangles.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      this.surface(
        "solid-rock-portal-face",
        face,
        triangles,
        faceUvs,
        new Array((face.length / 3) * 4).fill(1),
        parent,
        this.cliff,
      );
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI;
        const stone = this.props.sandstone(
          "portal-arch-stone",
          [1.65, 1.15, 2.2],
          world + i,
          parent,
        );
        stone.position.set(
          -Math.cos(a) * 6.15,
          3.1 + Math.sin(a) * 5.25,
          offset + 0.8,
        );
        stone.rotation.z = Math.PI / 2 - a;
      }
      for (const side of [-1, 1]) {
        const buttress = this.props.sandstone(
          "cave-mouth-buttress",
          [4.4, 8, 6],
          world + side,
          parent,
        );
        buttress.position.set(side * 8, 2.6, offset + 1.6);
      }
    }
  }

  private build(index: number) {
    const world = index * 10,
      section = sectionAt(world + 5);
    const root = new TransformNode(`terrain-${index}`, this.scene);
    const gap = gapsNear(world).find(
      (gap) => gap.start < world + 10 && gap.end > world,
    );
    const spans = roadSpans(world, world + 10);
    const adjacent = sectionAt(
      world < (section.start + section.end) / 2
        ? section.start - 1
        : section.end + 1,
    );
    const floor =
      section.biome === "forest"
        ? this.trail
        : section.biome === "canyon"
          ? this.stone
          : adjacent.biome === "forest"
            ? this.tunnelTrail
            : this.tunnelStone;
    for (const span of spans) {
      this.ground(
        8.6,
        span.end - span.start,
        0,
        0.06,
        span.start - world + (span.end - span.start) / 2,
        root,
        floor,
        span.start,
      );
      if (section.biome === "canyon") {
        const slab = this.props.sandstone(
          "fractured-road-foundation",
          [8.7, 1.5, span.end - span.start + 0.3],
          world,
          root,
        );
        slab.position.set(
          0,
          -0.9,
          span.start - world + (span.end - span.start) / 2,
        );
      }
    }
    if (section.biome === "forest") {
      for (const side of [-1, 1])
        this.ground(70, 10, side * 39.3, 0, 5, root, this.grass, world);
    } else if (section.biome === "tunnel") {
      this.arch(world, root);
      if (world === section.start) this.arch(world, root, true);
      if (world + 10 === section.end) this.arch(world, root, true, 8.2);
      for (const side of [-1, 1]) {
        const ledge = this.props.sandstone(
          "cave-footing",
          [0.8, 0.55, 10.2],
          world + side,
          root,
        );
        ledge.position.set(side * 5.2, 0.12, 5);
        ledge.material = this.tunnel;
      }
    } else {
      this.ground(90, 10, 0, -18, 5, root, this.stone, world);
      for (const side of [-1, 1]) {
        this.cliffWall(side, world, root);
        const shoulder = this.props.sandstone(
          "eroded-ridge-crown",
          [5.5, 3.2, 10.8],
          world + side,
          root,
        );
        shoulder.position.set(
          side * 9.7,
          12 + Math.sin(world * 0.037 + side) * 2.4,
          5,
        );
        if (index % 3 === 0) {
          const mesa = this.props.sandstone(
            "distant-layered-mesa",
            [13, 17 + (index % 5), 24],
            world * side,
            root,
          );
          mesa.position.set(side * 24, 6, 5);
        }
        if (!gap) {
          for (let n = 0; n < 3; n++) {
            const scree = this.props.sandstone(
              "canyon-verge-scree",
              [0.35 + n * 0.12, 0.2 + n * 0.1, 0.6],
              world + n,
              root,
            );
            scree.position.set(side * (4.7 + n * 0.16), 0.12, 1.5 + n * 3.1);
            const tuft = this.props
              .scenery("grass", n)
              .createInstance("canyon-dry-grass");
            tuft.parent = root;
            tuft.position.set(side * 4.65, 0.02, 2.4 + n * 3.1);
            tuft.scaling.setAll(0.58);
          }
          if (index % 2 === 0) {
            const shrub = this.props
              .scenery("bush", index)
              .createInstance("canyon-sage-shrub");
            shrub.parent = root;
            shrub.position.set(side * 4.95, 0, 6);
            shrub.scaling.setAll(0.43);
          }
        } else {
          for (let level = 0; level < 3; level++) {
            for (let mark = 0; mark < 2; mark++) {
              const x = side * 5.31,
                y = 0.45 + level * 1.5,
                z = 1 + mark * 5;
              this.surface(
                "chalk-climbing-mark",
                [x, y, z, x, y + 0.04, z, x, y, z + 2, x, y + 0.04, z + 2],
                [0, 1, 2, 1, 3, 2],
                [0, 0, 0, 1, 1, 0, 1, 1],
                new Array(16).fill(1),
                root,
                this.guide,
              );
            }
          }
        }
      }
      if (gap) {
        for (const edge of [gap.start, gap.end]) {
          if (edge >= world && edge < world + 10) {
            for (let chip = 0; chip < 7; chip++) {
              const fracture = this.props.sandstone(
                "broken-canyon-lip",
                [1.35, 0.65, 0.7],
                world + chip,
                root,
              );
              fracture.position.set(
                (chip - 3) * 1.2,
                -0.28,
                edge - world + (edge === gap.start ? -0.4 : 0.4),
              );
            }
          }
        }
      }
    }
    // Rocky shoulders gradually enclose the approach and open beyond the exit.
    if (section.biome !== "tunnel") {
      const toMouth = section.end - world,
        fromMouth = world - section.start;
      const hasEntrance = sectionAt(section.end + 1).biome === "tunnel";
      const hasExit =
        section.start > 0 && sectionAt(section.start - 1).biome === "tunnel";
      const approach =
        hasEntrance && toMouth <= 30
          ? 1 - toMouth / 40
          : hasExit && fromMouth < 30
            ? 1 - fromMouth / 40
            : 0;
      if (approach > 0) {
        for (const side of [-1, 1]) {
          const ridge = this.props.sandstone(
            "portal-landscape-shoulder",
            [8, 7 + approach * 7, 12],
            world + side,
            root,
          );
          ridge.position.set(side * (13 - approach * 2.2), 2 + approach * 2, 5);
          const talus = this.props.sandstone(
            "portal-talus",
            [2.3, 1.6 + approach * 2, 8],
            world,
            root,
          );
          talus.position.set(side * (6.8 - approach * 0.4), 0.6, 5);
        }
      }
    }
    // Reuse foliage instances and batch the static rock and road meshes per cell.
    const meshes = root
      .getChildMeshes()
      .filter((mesh) => mesh instanceof Mesh) as Mesh[];
    if (meshes.length) {
      const merged = mergeSceneryMeshes(meshes);
      merged.name = `terrain-detail-${index}`;
      merged.parent = root;
    }
    return root;
  }
  update(distance: number) {
    const first = Math.floor((distance - 50) / 10),
      last = Math.ceil((distance + 180) / 10);
    for (const [index, root] of this.cells)
      if (index < first || index > last) {
        root.dispose();
        this.cells.delete(index);
      }
    for (let index = first; index <= last; index++) {
      let root = this.cells.get(index);
      if (!root) {
        root = this.build(index);
        this.cells.set(index, root);
      }
      root.position.z = index * 10 - distance;
    }
  }
}
