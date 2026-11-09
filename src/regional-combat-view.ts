import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreatePolyhedron } from "@babylonjs/core/Meshes/Builders/polyhedronBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { CONFIG } from "./config.ts";
import { RegionalEnemyModel } from "./regional-enemy-model.ts";
import { YetiModel } from "./yeti-model.ts";
import { releaseTime, yetiMotion } from "./yeti-motion.ts";
import type { RunnerGame } from "./game.ts";

type Paint = "danger" | "countdown" | "strip" | "shadow" | "splat" | "shock";
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export class RegionalCombatView {
  private models = new Map<number, RegionalEnemyModel | YetiModel>();
  private effects = new Map<string, Mesh>();
  private paints = new Map<Paint, StandardMaterial>();
  private high = true;
  constructor(private scene: Scene, private material: (color: string, glow?: boolean) => StandardMaterial) {}
  get size() { return this.models.size; }
  warningMaterial() { return this.paint("strip"); }

  private paint(kind: Paint) {
    const cached = this.paints.get(kind);
    if (cached) return cached;
    const texture = new DynamicTexture(`combat-${kind}`, 256, this.scene, false);
    texture.hasAlpha = true; texture.isBlocking = false;
    const ctx = texture.getContext(); ctx.clearRect(0, 0, 256, 256);
    const ellipse = (x: number, y: number, rx: number, ry: number, rotation = 0) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.scale(rx, ry);
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    };
    if (kind === "danger" || kind === "countdown" || kind === "shock") {
      const color = kind === "shock" ? "255,204,117" : kind === "countdown" ? "255,228,202" : "255,68,94";
      const glow = ctx.createRadialGradient(128,128,95,128,128,128);
      glow.addColorStop(0,`rgba(${color},0)`); glow.addColorStop(0.75,`rgba(${color},0.85)`); glow.addColorStop(1,`rgba(${color},0)`);
      ctx.fillStyle=glow; ctx.fillRect(0,0,256,256);
      ctx.strokeStyle=`rgba(${color},0.95)`;ctx.lineWidth=3;ctx.beginPath();ctx.arc(128,128,120,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=`rgba(${color},0.3)`;ctx.lineWidth=1;ctx.beginPath();ctx.arc(128,128,111,0,Math.PI*2);ctx.stroke();
      for(let i=0;i<12;i++) {
        const a=i*Math.PI/6;ctx.beginPath();ctx.moveTo(128+Math.cos(a)*115,128+Math.sin(a)*115);
        ctx.lineTo(128+Math.cos(a)*125,128+Math.sin(a)*125);ctx.stroke();
      }
    } else if (kind === "strip") {
      const gradient=ctx.createLinearGradient(0,0,256,0);
      gradient.addColorStop(0,"#ff244b");gradient.addColorStop(0.12,"#d91838a0");gradient.addColorStop(0.88,"#d91838a0");gradient.addColorStop(1,"#ff244b");
      ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
      ctx.strokeStyle="#ffc1bb";ctx.lineWidth=3;
      for(let y=-32;y<280;y+=48) {ctx.beginPath();ctx.moveTo(64,y+18);ctx.lineTo(128,y);ctx.lineTo(192,y+18);ctx.stroke();}
    } else if (kind === "shadow") {
      const gradient=ctx.createRadialGradient(128,128,15,128,128,122);
      gradient.addColorStop(0,"#302b4799");gradient.addColorStop(0.8,"#302b4740");gradient.addColorStop(1,"#302b4700");
      ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
      ctx.strokeStyle="#fff1cba0";ctx.lineWidth=2;ctx.beginPath();ctx.arc(128,128,84,0,Math.PI*2);ctx.stroke();
    } else {
      ctx.fillStyle="#51446280";ellipse(132,136,91,83);
      ctx.fillStyle="#f2edcf";ctx.beginPath();
      for(let i=0;i<=64;i++) {
        const a=i*Math.PI/32,r=79+Math.sin(a*5)*9+Math.cos(a*9)*6;
        const x=128+Math.cos(a)*r,y=128+Math.sin(a)*r; if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.closePath();ctx.fill();ctx.fillStyle="#fffcee";ellipse(112,111,48,31,-0.35);
      for(let i=0;i<7;i++) {const a=i*2.4;ctx.beginPath();ctx.arc(128+Math.cos(a)*106,128+Math.sin(a)*103,4+i%3*2,0,Math.PI*2);ctx.fill();}
    }
    texture.update();
    const mat=new StandardMaterial(`combat-${kind}-ink`,this.scene);
    mat.diffuseTexture=texture;mat.useAlphaFromDiffuseTexture=true;mat.emissiveColor=Color3.White();
    mat.disableLighting=true;mat.fogEnabled=false;mat.backFaceCulling=false;
    this.paints.set(kind,mat);return mat;
  }

  update(game: RunnerGame, high = true) {
    if(high!==this.high) {for(const model of this.models.values())model.root.dispose();this.models.clear();this.high=high;}
    const combat=game.nightCombat,state=combat.region.state,time=game.worldTime,keep=new Set<string>();
    for(const [id,model] of this.models) if(!state.enemies.some(e=>e.id===id)) {model.root.dispose();this.models.delete(id);}
    const effect=(key:string,shape:"ring"|"strip"|"ball"|"shard"|"hoop",color:string,paint?:Paint)=>{
      keep.add(key);let mesh=this.effects.get(key);
      if(!mesh) {
        mesh=shape==="ring"?CreateGround(key,{width:2,height:2},this.scene):shape==="strip"?CreateGround(key,{width:1,height:1},this.scene):
          shape==="shard"?CreatePolyhedron(key,{type:1,size:0.5},this.scene):shape==="hoop"?CreateTorus(key,{diameter:1,thickness:0.12,tessellation:24},this.scene):CreateSphere(key,{diameter:1,segments:high?14:8},this.scene);
        mesh.material=paint?this.paint(paint):this.material(color,shape==="shard"||key.includes("flash"));mesh.isPickable=false;this.effects.set(key,mesh);
      }
      mesh.setEnabled(true);mesh.rotation.set(0,0,0);mesh.scaling.setAll(1);mesh.visibility=1;return mesh;
    };
    const particles=(key:string,x:number,y:number,z:number,age:number,duration:number,color:string,count:number,radius:number)=>{
      const p=clamp(age/duration);
      for(let i=0;i<(high?count:Math.ceil(count*0.6));i++) {
        const angle=i*2.39996,seed=0.55+(i%5)*0.1;
        const shard=effect(`${key}-${i}`,"shard",color);
        shard.position.set(x+Math.cos(angle)*p*radius*seed,y+Math.sin(p*Math.PI)*seed*radius*0.5,z+Math.sin(angle)*p*radius*seed);
        shard.rotation.set(i+p*4,i*0.7+p*3,p*2);shard.scaling.setAll((0.08+i%3*0.04)*(1-p));shard.visibility=1-p;
      }
    };
    for (const hit of combat.damageEvents) {
      const age=time-hit.at;
      if(age<0||age>0.3||game.mode==="rewinding")continue;
      particles(`damage-${hit.id}`,hit.x,hit.y-0.35,hit.worldZ-game.distance,age,0.3,"#fff0ae",high?14:8,1.7);
      const flash=effect(`impact-${hit.id}`,"ring","#ffbd52","shock");
      flash.position.set(hit.x,hit.y-0.35,hit.worldZ-game.distance);flash.rotation.x=Math.PI/2;
      flash.scaling.setAll(0.3+age*3);flash.visibility=1-age/0.3;
    }
    for(const e of state.enemies) {
      let model=this.models.get(e.id);
      if(!model) {model=e.kind==="yeti"?new YetiModel(this.scene,e.id,this.material,high):new RegionalEnemyModel(this.scene,e.id,"bat",this.material,high);this.models.set(e.id,model);}
      const p=combat.position(e,game),health=combat.health(e),since=time-e.hitAt;
      const entry=clamp((time-e.enteredAt)/CONFIG.regionalCombat.entrance);
      model.root.setEnabled(time>=e.enteredAt);
      model.root.position.set(p.x,e.kind==="bat"?p.y:0.06,p.z);model.root.rotation.y=p.yaw;
      const a=state.attacks.find(a=>a.enemy===e.id);
      if(model instanceof YetiModel)model.animate(time,health,entry,since,a);
      else model.animate(time+e.id,health,p.crouch,0,health<=0?clamp(since/0.35):0,1-clamp(since/0.2),entry);
      if(since>=0&&since<0.35&&game.mode!=="rewinding")particles(`hit-${e.id}`,p.x,p.y,p.z,since,0.35,health>0?"#ffe5ad":"#d8def4",high?10:6,1.4);
      if(e.kind==="yeti"&&entry>0&&entry<1)particles(`entry-${e.id}`,p.x,0.1,p.z,(time-e.enteredAt)%0.3,0.3,"#d3e7eb",4,0.65);
    }
    const rules=CONFIG.regionalCombat;
    if(game.mode!=="over")for(const a of state.attacks) {
      const until=a.impactAt-time,locked=time>=a.lockAt,progress=clamp((time-a.lockAt)/(a.impactAt-a.lockAt));
      if(locked&&until>=(a.kind==="charge"?-0.16:0)) {
        const strip=a.kind==="small"||a.kind==="charge",dropping=a.kind==="dropping",z=a.worldZ-game.distance;
        const area=effect(`warn-${a.id}`,strip?"strip":"ring","#ff4059",dropping?"shadow":strip?"strip":"danger");
        area.position.set(a.kind==="charge"?0:a.x,a.side?a.y:0.065,z);
        if(a.side)area.rotation.z=Math.PI/2;
        if(a.kind==="small") {
          const enemy=state.enemies.find(e=>e.id===a.enemy)!,pose=yetiMotion(time,a),root=this.models.get(a.enemy)!.root;
          root.computeWorldMatrix(true);
          const source=pose.ball?Vector3.TransformCoordinates(new Vector3(...pose.ball),root.getWorldMatrix()):combat.position(enemy,game);
          const dx=a.x-source.x,dz=-source.z,length=Math.hypot(dx,dz);
          area.position.set(source.x+dx*0.5,0.065,source.z+dz*0.5);
          area.rotation.y=Math.atan2(dx,dz);area.scaling.set(rules.smallHalfWidth*2,1,length);
          area.setEnabled(time<releaseTime(a));
        }
        else if(a.kind==="charge") {area.rotation.y=Math.PI/2;area.scaling.set(0.7,1,7.4);}
        else area.scaling.set(rules.targetRadius,1,rules.targetRadius);
        if(a.side)area.scaling.x=rules.wallRadius;
        area.visibility=dropping?0.8:0.68+progress*0.25;
        if(!dropping&&!strip) {
          const fill=effect(`progress-${a.id}`,"ring","#ffe2cf","countdown");
          fill.position.copyFrom(area.position);fill.position.y+=a.side?0:0.008;fill.rotation.copyFrom(area.rotation);
          fill.scaling.copyFrom(area.scaling);const shrink=Math.max(0.015,1-progress);fill.scaling.x*=shrink;fill.scaling.z*=shrink;
        }
      }
      if(["dropping","small","snowball"].includes(a.kind)&&!a.spent) {
        const ball=effect(`projectile-${a.id}`,"ball",a.kind==="dropping"?"#fff6dd":"#d9eef4");
        const releasing=a.kind==="small"||a.kind==="snowball";
        let p=releasing?clamp((time-releaseTime(a))/(a.impactAt-releaseTime(a))):progress;
        if(releasing&&time<releaseTime(a)) {
          const pose=yetiMotion(time,a);
          const local=new Vector3(...pose.ball!);
          const root=this.models.get(a.enemy)!.root;root.computeWorldMatrix(true);
          ball.position.copyFrom(Vector3.TransformCoordinates(local,root.getWorldMatrix()));
          ball.scaling.setAll(pose.radius*2);ball.rotation.x=time*3;
        } else {
          if(a.kind==="dropping")p*=p;
          ball.position.set(a.fromX+(a.x-a.fromX)*p,a.fromY+(a.y-a.fromY)*p+(a.kind==="snowball"?Math.sin(p*Math.PI)*2:0),a.fromZ+(a.worldZ-a.fromZ)*p-game.distance);
          ball.scaling.setAll(a.kind==="snowball"?rules.targetRadius*2:a.kind==="small"?0.3:0.28);ball.rotation.x=p*9;
          if(a.kind==="dropping")ball.scaling.y=0.5+progress*0.2;
        }
        if(a.kind==="snowball")for(let i=0;i<(high?7:4);i++) {
          const crust=effect(`crust-${a.id}-${i}`,"ball",i%2?"#f3fcfa":"#bfd8e6");
          const angle=i*2.4+time*2,diameter=ball.scaling.x;
          crust.position.set(ball.position.x+Math.cos(angle)*diameter*0.4,ball.position.y+Math.sin(i*1.7)*diameter*0.35,ball.position.z+Math.sin(angle)*diameter*0.4);
          crust.scaling.setAll(diameter*0.22);
        }
        if(a.kind==="small"&&p>0)for(let i=1;i<=3;i++) {
          const tail=effect(`snow-tail-${a.id}-${i}`,"ball","#cbeaf5"),back=Math.max(0,p-i*0.08);
          tail.position.set(a.fromX+(a.x-a.fromX)*back,a.fromY+(a.y-a.fromY)*back,a.fromZ+(a.worldZ-a.fromZ)*back-game.distance);
          tail.scaling.setAll(0.23-i*0.045);tail.visibility=0.6-i*0.12;
        }
      }
      if(a.kind==="dive"&&progress>0.7&&until>-0.2) {
        const e=state.enemies.find(e=>e.id===a.enemy)!,pos=combat.position(e,game);
        for(const side of [-1,1]) {
          const streak=effect(`dive-trail-${a.id}-${side}`,"ball","#dacbe9");
          streak.position.set(pos.x+side*0.6,pos.y+0.15,pos.z+0.6);streak.scaling.set(0.04,0.04,1.7);
          streak.lookAt(new Vector3(a.x,a.y,a.worldZ-game.distance));streak.visibility=0.32;
        }
      }
      if(a.spent&&until>-0.42&&(a.kind==="snowball"||a.kind==="dropping"||a.kind==="charge")) {
        particles(`impact-${a.id}`,a.x,0.12,a.worldZ-game.distance,-until,0.42,a.kind==="dropping"?"#fff4d6":"#e0f5f8",a.kind==="snowball"?16:8,a.kind==="snowball"?2.6:1.3);
        if(a.kind!=="dropping") {
          const wave=effect(`snow-wave-${a.id}`,"ring","#fff2d0","shock");wave.position.set(a.x,0.055,a.worldZ-game.distance);
          wave.scaling.setAll(0.2+clamp(-until/0.42)*2.4);wave.visibility=1-clamp(-until/0.42);
        }
      }
    }
    if(game.mode!=="over")for(const d of state.droppings) {
      const stain=effect(`stain-${d.id}`,"ring","#fff4da","splat");stain.position.set(d.x,0.045,d.worldZ-game.distance);stain.scaling.set(1.35,1,1.65);
      stain.visibility=Math.min(1,(d.expires-time)/1.5);
    }
    if(game.mode!=="over")for(const b of combat.bombs) {
      const elapsed=time-b.start,p=clamp(elapsed/CONFIG.bomb.flight);
      if(p<1) {
        const mesh=effect(`bomb-${b.id}`,"ball","#638337");mesh.scaling.setAll(0.48);
        mesh.position.set(b.fromX+(b.x-b.fromX)*p,b.fromY+(b.y-b.fromY)*p+Math.sin(p*Math.PI)*2,b.fromZ+(b.worldZ-b.fromZ)*p-game.distance);
        const band=effect(`bomb-band-${b.id}`,"hoop","#d6ac48");band.position.copyFrom(mesh.position);band.scaling.setAll(0.47);
        const cap=effect(`bomb-cap-${b.id}`,"ball","#e2bb58");cap.position.copyFrom(mesh.position);cap.position.y+=0.23;cap.scaling.set(0.17,0.09,0.17);
        const fuse=effect(`bomb-fuse-${b.id}`,"ball","#f5deb0");fuse.position.copyFrom(cap.position);fuse.position.y+=0.08;fuse.scaling.set(0.04,0.13,0.04);fuse.rotation.z=-0.3;
        for(let i=0;i<3;i++) {
          const small=effect(`bomblet-${b.id}-${i}`,"ball","#8ba34a"),angle=i*Math.PI*2/3+elapsed*5;
          small.position.set(mesh.position.x+Math.cos(angle)*0.25,mesh.position.y-0.18,mesh.position.z+Math.sin(angle)*0.25);small.scaling.setAll(0.23);
        }
      } else {
        const age=(elapsed-CONFIG.bomb.flight)%CONFIG.bomb.interval,pulse=age/CONFIG.bomb.interval;
        const ring=effect(`bomb-wave-${b.id}`,"ring","#ffcd67","shock");ring.position.set(b.x,b.y,b.worldZ-game.distance);
        ring.scaling.setAll(CONFIG.bomb.radius*(0.25+pulse*0.75));ring.visibility=1-pulse;
        particles(`bomb-sparks-${b.id}`,b.x,b.y,b.worldZ-game.distance,age,CONFIG.bomb.interval,"#ffd392",16,CONFIG.bomb.radius);
        const flash=effect(`bomb-flash-${b.id}`,"ball","#fff0be");flash.position.copyFrom(ring.position);
        flash.scaling.setAll(0.3+(1-pulse)*1.4);flash.visibility=(1-pulse)*0.55;
      }
    }
    for(const [key,mesh] of this.effects)if(!keep.has(key)){mesh.dispose();this.effects.delete(key);}
  }
}
