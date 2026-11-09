import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CONFIG } from "./config.ts";
import { RegionalEnemyModel } from "./regional-enemy-model.ts";
import type { RunnerGame } from "./game.ts";

const clamp = (v: number) => Math.max(0,Math.min(1,v));
export class RegionalCombatView {
  private models = new Map<number,RegionalEnemyModel>();
  private effects = new Map<string,Mesh>();
  constructor(private scene: Scene, private material: (color: string, glow?: boolean) => StandardMaterial) {}
  get size() { return this.models.size; }
  update(game: RunnerGame) {
    const combat=game.nightCombat, state=combat.region.state, time=game.worldTime;
    const keep=new Set<string>();
    for(const [id,model] of this.models) if(!state.enemies.some(e=>e.id===id)) {model.root.dispose();this.models.delete(id);}
    for(const e of state.enemies) {
      let model=this.models.get(e.id);
      if(!model) { model=new RegionalEnemyModel(this.scene,e.id,e.kind,this.material); this.models.set(e.id,model); }
      const p=combat.position(e,game), health=combat.health(e), since=time-e.hitAt;
      model.root.position.set(p.x,e.kind==="bat" ? p.y : 0.06,p.z); model.root.rotation.y=p.yaw;
      const a=state.attacks.find(a=>a.enemy===e.id);
      const throwing=a?.kind==="snowball" ? clamp((time-a.start-CONFIG.regionalCombat.snowballRoll+0.4)/0.4) :
        a?.kind==="small" ? clamp((time-a.start)/CONFIG.regionalCombat.smallWarning) : 0;
      model.animate(time+e.id,health,p.crouch,throwing,health<=0 ? clamp(since/0.35) : 0,1-clamp(since/0.2));
    }
    const effect=(key:string,shape:"ring"|"strip"|"ball",color:string)=>{
      keep.add(key); let mesh=this.effects.get(key);
      if(!mesh) {
        mesh=shape==="ring" ? CreateTorus(key,{diameter:2,thickness:0.065,tessellation:36},this.scene) :
          shape==="strip" ? CreateGround(key,{width:1,height:1},this.scene) : CreateSphere(key,{diameter:1,segments:8},this.scene);
        mesh.material=this.material(color,true);mesh.isPickable=false;
        mesh.renderingGroupId=1;this.effects.set(key,mesh);
      }
      mesh.setEnabled(true);mesh.rotation.set(0,0,0);mesh.scaling.setAll(1);mesh.visibility=1;return mesh;
    };
    const rules=CONFIG.regionalCombat;
    if(game.mode!=="over") for(const a of state.attacks) {
      const until=a.impactAt-time, locked=time>=a.lockAt;
      const progress=clamp((time-a.lockAt)/(a.impactAt-a.lockAt));
      if(locked && until >= (a.kind === "charge" ? -0.16 : 0)) {
        const strip=a.kind==="small"||a.kind==="charge";
        const circle=effect(`warn-${a.id}`,strip?"strip":"ring",a.kind==="dropping"?"#d6d8fa":"#ff4059");
        const z=a.worldZ-game.distance;
        circle.position.set(a.side ? a.x : a.kind==="charge"?0:a.x,a.side?a.y:0.09,z);
        if(a.side) circle.rotation.z=Math.PI/2;
        if(a.kind==="small") {circle.scaling.set(rules.smallHalfWidth*2,1,Math.max(1.2,Math.abs(z)));circle.position.z=z*0.5;}
        else if(a.kind==="charge") circle.scaling.set(7.4,1,0.7);
        else circle.scaling.setAll(rules.targetRadius);
        if(a.side) circle.scaling.x=rules.wallRadius;
        circle.visibility=0.6+progress*0.4;
        const fill=effect(`progress-${a.id}`,strip?"strip":"ring","#ffbbad");
        fill.position.copyFrom(circle.position);fill.position.y+=a.side?0:0.015;fill.rotation.copyFrom(circle.rotation);
        fill.scaling.copyFrom(circle.scaling).scaleInPlace(Math.max(0.02,1-progress));
      }
      if(["dropping","small","snowball"].includes(a.kind) && !a.spent) {
        const ball=effect(`projectile-${a.id}`,"ball",a.kind==="dropping"?"#fff5e1":"#e6fcff");
        let p=progress;
        if(a.kind==="small") p=clamp((time-a.start-rules.smallWarning)/rules.smallFlight);
        if(a.kind==="snowball" && !locked) {
          const enemy=state.enemies.find(e=>e.id===a.enemy)!;const pos=combat.position(enemy,game);
          const roll=clamp((time-a.start)/rules.snowballRoll);
          const diameter=0.2+Math.min(1,roll/0.72)*(rules.targetRadius*2-0.2);
          const lift=clamp((roll-0.72)/0.28);
          ball.position.set(pos.x,diameter/2+(2.75-diameter/2)*lift,pos.z-0.6);
          ball.scaling.setAll(diameter);
        } else {
          ball.position.set(a.fromX+(a.x-a.fromX)*p,a.fromY+(a.y-a.fromY)*p+
            (a.kind==="snowball"?Math.sin(p*Math.PI)*2:0),a.fromZ+(a.worldZ-a.fromZ)*p-game.distance);
          ball.scaling.setAll(a.kind==="snowball"?rules.targetRadius*2:a.kind==="small"?0.28:0.32);
          if(a.kind==="dropping") ball.scaling.y=0.6;
        }
      }
      if(a.spent && a.kind==="snowball" && until>-0.4) {
        for(let i=0;i<6;i++) {
          const shard=effect(`snow-shard-${a.id}-${i}`,"ball","#e6fcff");const p=-until/0.4, angle=i*Math.PI/3;
          shard.position.set(a.x+Math.cos(angle)*p*2,0.2+Math.sin(p*Math.PI)*0.8,a.worldZ-game.distance+Math.sin(angle)*p*2);
          shard.scaling.setAll(0.3*(1-p));
        }
      }
    }
    if(game.mode!=="over") for(const d of state.droppings) {
      const stain=effect(`stain-${d.id}`,"ball","#fff7df");stain.position.set(d.x,0.055,d.worldZ-game.distance);stain.scaling.set(2.1,0.09,2.6);
      const edge=effect(`stain-rim-${d.id}`,"ring","#b0a6d6");edge.position.set(d.x,0.065,d.worldZ-game.distance);edge.scaling.set(1.05,1,1.3);
    }
    if(game.mode!=="over") for(const b of combat.bombs) {
      const elapsed=time-b.start,p=clamp(elapsed/CONFIG.bomb.flight);
      if(p<1) {
        const mesh=effect(`bomb-${b.id}`,"ball","#74983e");mesh.scaling.setAll(0.5);
        mesh.position.set(b.fromX+(b.x-b.fromX)*p,b.fromY+(b.y-b.fromY)*p+Math.sin(p*Math.PI)*2,b.fromZ+(b.worldZ-b.fromZ)*p-game.distance);
      } else {
        const pulse=((elapsed-CONFIG.bomb.flight)%CONFIG.bomb.interval)/CONFIG.bomb.interval;
        const ring=effect(`bomb-ring-${b.id}`,"ring","#ffcd67");ring.position.set(b.x,b.y,b.worldZ-game.distance);
        ring.scaling.setAll(CONFIG.bomb.radius);ring.visibility=1-pulse*0.8;
        const shell=effect(`bomb-shell-${b.id}`,"ball","#ffb54f");shell.position.copyFrom(ring.position);
        shell.scaling.setAll(CONFIG.bomb.radius*2*(0.2+pulse*0.8));shell.visibility=0.13*(1-pulse);
      }
    }
    for(const [key,mesh] of this.effects) if(!keep.has(key)) {mesh.dispose();this.effects.delete(key);}
  }
}
