import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";

export class ForestHorizon {
  readonly root: TransformNode;
  private hills: Mesh[] = [];
  private opacity = -1;
  constructor(scene: Scene, material: (color: string) => StandardMaterial) {
    this.root = new TransformNode("forest-hills", scene);
    const source = CreateSphere("forest-hill-template", {diameter: 1, segments: 12}, scene);
    source.setEnabled(false);
    for(let i=0;i<12;i++) {
      // Share geometry, but use real meshes: InstancedMesh ignores per-instance visibility.
      const hill=source.clone("distant-hill",this.root,true)!;
      hill.scaling.set(30+i*2,17+i%3*6,40);
      hill.position.set((i%2?1:-1)*(35+i*3),0,100+i*8);
      hill.material=material(i%2?"#91aa96":"#a6b49b");hill.isPickable=false;hill.setEnabled(true);
      this.hills.push(hill);
    }
    source.dispose();
  }
  update(opacity: number, lowering: number) {
    this.root.position.y=lowering;
    const value=Math.max(0,Math.min(1,opacity));
    if(value===this.opacity)return;
    this.opacity=value;
    for(const hill of this.hills)hill.visibility=value;
    this.root.setEnabled(value>0);
  }
}
