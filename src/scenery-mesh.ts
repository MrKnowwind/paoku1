import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";

export function mergeSceneryMeshes(meshes: Mesh[]): Mesh {
  // Babylon requires identical vertex attributes across every merged mesh.
  // White preserves the wood material beside vertex-tinted leaves and moss.
  if (meshes.some((mesh) => mesh.isVerticesDataPresent(VertexBuffer.ColorKind))) {
    for (const mesh of meshes) {
      if (!mesh.isVerticesDataPresent(VertexBuffer.ColorKind)) {
        mesh.setVerticesData(
          VertexBuffer.ColorKind,
          new Float32Array(mesh.getTotalVertices() * 4).fill(1),
        );
      }
    }
  }
  return Mesh.MergeMeshes(meshes, true, true, undefined, false, true)!;
}
