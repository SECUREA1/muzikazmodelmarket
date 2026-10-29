import {createWorldResident,updateWorldResident} from './world-resident-model.js';
import {updateAvatarPaddle,disposeAvatarPaddle} from './avatar-paddle.js';
import {disposeModelResources} from './game-graphics-resources.js';
import {PING_PONG} from './ping-pong-rules.js';

const finitePoint=point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.z);
const noRaycast=()=>{};
function cosmetic(root){
 root.traverse(node=>{node.userData.collisionDisabled=true;node.userData.collider=false;node.raycast=noRaycast;});
}

// This projection never simulates hits. The authoritative scene (or the same
// rules in solo play) supplies the balls and the AI's most recent paddle stroke.
export function createPingPongScene({THREE,scene,getActorRoot=()=>null}={}){
 const root=new THREE.Group();root.name='MUZIKAZ_PING_PONG_SCENE';root.visible=false;scene?.add(root);cosmetic(root);
 const ballGeometry=new THREE.SphereGeometry(1,14,10),ballMaterial=new THREE.MeshStandardMaterial({color:0xfff1c9,roughness:.63,emissive:0xffce73,emissiveIntensity:.16});
 const balls=new Map(),partners=new Map();let disposed=false,serverTime=0,elapsed=0;
 const target=new THREE.Vector3();

 function removePartner(entry){
  if(entry.external){if(entry.model)disposeAvatarPaddle(entry.model);return;}
  disposeAvatarPaddle(entry.model);disposeModelResources(entry.model);entry.model.removeFromParent();
 }
 function receive(view,time){
  if(disposed)return;
  serverTime=Number.isFinite(time)?time:serverTime+elapsed;elapsed=0;
  const visibleBalls=new Set();
  for(const state of Array.isArray(view?.balls)?view.balls:[]){
   if(!state?.id||!finitePoint(state.position))continue;
   visibleBalls.add(state.id);let entry=balls.get(state.id);
   if(!entry){const mesh=new THREE.Mesh(ballGeometry,ballMaterial);mesh.name='PING_PONG_BALL';mesh.castShadow=true;mesh.position.copy(state.position);mesh.userData.ballId=state.id;root.add(mesh);cosmetic(mesh);entry={mesh,state};balls.set(state.id,entry);}
   entry.state={...state,position:{...state.position},velocity:finitePoint(state.velocity)?{...state.velocity}:{x:0,y:0,z:0}};
   const radius=Number.isFinite(state.radius)?Math.max(.01,Math.min(.15,state.radius)):.032;entry.mesh.scale.setScalar(radius);entry.mesh.userData.rally=state.rally||0;
   // A completed or redirected flight should not smear across an entire room.
   if(entry.mesh.position.distanceToSquared(state.position)>4)entry.mesh.position.copy(state.position);
  }
  for(const [id,entry]of balls)if(!visibleBalls.has(id)){entry.mesh.removeFromParent();balls.delete(id);}
  const visiblePartners=new Set();
  for(const state of Array.isArray(view?.partners)?view.partners:[]){
   if(!state?.id||!finitePoint(state.position))continue;
   visiblePartners.add(state.id);let entry=partners.get(state.id);
   const external=Boolean(state.residentId);
   if(entry&&(entry.external!==external||entry.residentId!==state.residentId)){removePartner(entry);partners.delete(state.id);entry=null;}
   if(!entry){
    const model=external?getActorRoot(state.residentId):createWorldResident();
    if(!external){model.name='PING_PONG_AI_PARTNER';model.userData.pingPongPartnerId=state.id;root.add(model);cosmetic(model);}
    entry={model,external,residentId:state.residentId,state};partners.set(state.id,entry);
   }
   entry.state={...state,position:{...state.position},pingPong:{...state.pingPong}};
   if(!external){entry.model.position.copy(state.position);entry.model.rotation.y=Number.isFinite(state.yaw)?state.yaw:0;}
  }
  for(const [id,entry]of partners)if(!visiblePartners.has(id)){removePartner(entry);partners.delete(id);}
  root.visible=balls.size>0||[...partners.values()].some(entry=>!entry.external);
 }

 function update(delta,now,{reducedMotion=false}={}){
  if(disposed)return;
  elapsed+=Number.isFinite(delta)?Math.max(0,Math.min(1,delta))*1000:0;
  const time=Number.isFinite(now)?now:serverTime+elapsed,age=Math.max(0,Math.min(.15,(time-serverTime)/1000)),dt=Math.max(0,Number.isFinite(delta)?delta:0);
  const blend=1-Math.exp(-dt*30);
  for(const entry of balls.values()){
   const {state,mesh}=entry;target.copy(state.position).addScaledVector(state.velocity,age);target.y-=PING_PONG.gravity*age*age/2;
   const floor=Number.isFinite(state.floor)?state.floor:Number.isFinite(state.floorY)?state.floorY:Number.isFinite(state.groundY)?state.groundY:null;
   if(floor!==null)target.y=Math.max(floor+mesh.scale.y,target.y);
   mesh.position.lerp(target,blend);mesh.rotation.x+=state.velocity.z*dt*2;mesh.rotation.z-=state.velocity.x*dt*2;
  }
  for(const entry of partners.values()){
   const state=entry.state;
   if(entry.external){
    // Scene actor roots may arrive asynchronously after the room snapshot.
    const model=getActorRoot(entry.residentId);if(entry.model&&entry.model!==model)disposeAvatarPaddle(entry.model);entry.model=model;
    if(model&&[...balls.values()].some(ball=>ball.state.status==='flying'&&(ball.state.targetId===state.id||ball.state.lastHitId===state.id))&&Number.isFinite(state.yaw))model.rotation.y=state.yaw;
   }else{
    entry.model.userData.residentState={name:state.username||'Ping-pong partner',role:'Ping-pong practice partner',uniform:'sports',color:'#64b7cb',gesture:'idle',appearance:{height:1,build:1,hairstyle:'short',accessory:'none'}};
    updateWorldResident(entry.model,time/1000);
   }
   if(entry.model)updateAvatarPaddle(THREE,entry.model,state.pingPong,time,{reducedMotion});
  }
 }
 function reset(){
  if(disposed)return;
  for(const entry of balls.values())entry.mesh.removeFromParent();balls.clear();
  for(const entry of partners.values())removePartner(entry);partners.clear();root.visible=false;elapsed=0;serverTime=0;
 }
 function dispose(){if(disposed)return;reset();disposed=true;root.removeFromParent();ballGeometry.dispose();ballMaterial.dispose();}
 return {root,receive,update,reset,dispose};
}
