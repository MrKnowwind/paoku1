import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial.js";

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
  // Keep equal materials adjacent so Babylon can consolidate their index ranges.
  meshes.sort((a, b) => (a.material?.uniqueId ?? -1) - (b.material?.uniqueId ?? -1));
  const material = meshes[0].material;
  const singleMaterial = !(material instanceof MultiMaterial) && meshes.every(mesh => mesh.material === material);
  return Mesh.MergeMeshes(meshes, true, true, undefined, false, !singleMaterial)!;
}
