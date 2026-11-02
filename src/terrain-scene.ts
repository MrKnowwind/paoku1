import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { gapsNear, roadSpans, sectionAt } from "./track.ts";
import type { ForestProps } from "./props.ts";

export class TerrainScene {
  private cells = new Map<number, TransformNode>();
  private grass: StandardMaterial;
  private trail: StandardMaterial;
  private stone: StandardMaterial;
  private cliff: StandardMaterial;
  private tunnel: StandardMaterial;
  constructor(
    private scene: Scene,
    props: ForestProps,
  ) {
    const material = (name: string, color: string) => {
      const mat = new StandardMaterial(name, scene);
      mat.diffuseColor = Color3.FromHexString(color).toLinearSpace();
      mat.specularColor = Color3.Black();
      return mat;
    };
    this.grass = material("grass-floor", "#ffffff");
    this.grass.diffuseTexture = new Texture(
      import.meta.env.BASE_URL + "art/woodland-grass.jpg",
      scene,
    );
    this.grass.diffuseTexture.anisotropicFilteringLevel = 8;
    this.trail = material("forest-trail", "#e3dccc");
    this.trail.diffuseTexture = new Texture(
      import.meta.env.BASE_URL + "art/woodland-trail.jpg",
      scene,
    );
    this.stone = material("canyon-road", "#c4ae8d");
    this.stone.diffuseTexture = props.texture("stone");
    this.cliff = material("canyon-cliff", "#a8957c");
    this.cliff.diffuseTexture = props.texture("stone");
    this.tunnel = material("unlit-tunnel-rock", "#242824");
  }
  private box(
    name: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    parent: TransformNode,
    material: StandardMaterial,
  ) {
    const mesh = CreateBox(name, { width, height, depth }, this.scene);
    mesh.position.set(x, y, z);
    mesh.parent = parent;
    mesh.material = material;
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
      material === this.grass ? 2.5 : material === this.trail ? 8 : 6;
    for (let i = 0; i < uv.length; i += 2) {
      uv[i] = (uv[i] * width + x - width / 2) / tile;
      uv[i + 1] = (uv[i + 1] * length) / tile + ((world / tile) % 1);
    }
    mesh.setVerticesData(VertexBuffer.UVKind, uv);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.receiveShadows = true;
  }
  private build(index: number) {
    const world = index * 10;
    const section = sectionAt(world + 5);
    const root = new TransformNode(`terrain-${index}`, this.scene);
    const gap = gapsNear(world).find(
      (gap) => gap.start < world + 10 && gap.end > world,
    );
    const spans = roadSpans(world, world + 10);
    for (const span of spans)
      this.ground(
        8.6,
        span.end - span.start,
        0,
        0.06,
        span.start - world + (span.end - span.start) / 2,
        root,
        section.biome === "forest"
          ? this.trail
          : section.biome === "canyon"
            ? this.stone
            : this.tunnel,
        span.start,
      );
    if (section.biome === "forest") {
      for (const side of [-1, 1])
        this.ground(70, 10, side * 39.3, 0, 5, root, this.grass, world);
    } else if (section.biome === "tunnel") {
      for (const side of [-1, 1])
        this.box("tunnel-wall", 3, 16, 10, side * 6.2, 3, 5, root, this.tunnel);
      this.box("tunnel-roof", 16, 3, 10, 0, 10, 5, root, this.tunnel);
    } else {
      this.ground(90, 10, 0, -18, 5, root, this.cliff, world);
      for (const span of spans)
        this.box(
          "road-rock-slab",
          8.6,
          1,
          span.end - span.start,
          0,
          -0.46,
          span.start - world + (span.end - span.start) / 2,
          root,
          this.cliff,
        );
      for (const side of [-1, 1]) {
        const wall = CreateGround(
          "continuous-rock-wall",
          {
            width: 22,
            height: 10,
            subdivisionsX: 20,
            subdivisionsY: 10,
            updatable: true,
          },
          this.scene,
        );
        const positions = wall.getVerticesData(VertexBuffer.PositionKind)!;
        for (let i = 0; i < positions.length; i += 3)
          positions[i + 1] =
            Math.sin(
              (world + positions[i + 2] + 5) * 0.19 + positions[i] * 0.5,
            ) *
              0.13 +
            Math.sin(positions[i] * 2.5) * 0.07;
        const normals: number[] = [];
        VertexData.ComputeNormals(positions, wall.getIndices()!, normals);
        wall.updateVerticesData(VertexBuffer.PositionKind, positions, true);
        wall.updateVerticesData(VertexBuffer.NormalKind, normals);
        wall.rotation.z = (side * Math.PI) / 2;
        wall.position.set(side * 5.5, -2, 5);
        wall.parent = root;
        wall.material = this.cliff;
        wall.receiveShadows = true;
        for (const y of [-8, -3, 6])
          this.box(
            "rock-stratum",
            0.2,
            0.22,
            10,
            side * 5.43,
            y,
            5,
            root,
            this.cliff,
          );
        if (gap) {
          for (let level = 0; level < 3; level++)
            this.box(
              "wall-height-guide",
              0.04,
              0.035,
              10,
              side * 5.24,
              0.45 + level * 1.5,
              5,
              root,
              this.stone,
            );
          if (world === gap.start)
            this.box(
              "wall-entry-anchor",
              0.2,
              5.6,
              0.28,
              side * 5.21,
              2.8,
              0,
              root,
              this.stone,
            );
        }
      }
      if (gap && gap.start >= world && gap.start < world + 10)
        this.box(
          "broken-ledge",
          8.6,
          0.8,
          0.4,
          0,
          -0.35,
          gap.start - world - 0.2,
          root,
          this.stone,
        );
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
