import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createClownFunhouseLand} from '../public/js/environments/clown-funhouse-land.js';
import {FUNHOUSE_ID,FUNHOUSE_WALLS} from '../public/js/clown-funhouse-config.js';
import {FUNHOUSE_HAUNT_START,FUNHOUSE_HAUNT_WARDS} from '../public/js/funhouse-haunt-rules.js';
import {funhouseInteractionTargets,funhouseInteractionHit} from '../public/js/funhouse-scene-actions.js';

function scene(t,environment={id:FUNHOUSE_ID}){
 const root=createClownFunhouseLand(environment);
 t.after(()=>{const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});for(const resource of resources)resource.dispose();root.clear();});
 return root;
}

test('Night Watch lanterns have distinct visible controls that first-person and controller rays can reach',t=>{
 const root=scene(t);root.userData.updateFunhouseEffects(0,true,100000);
 const targets=funhouseInteractionTargets(root).filter(value=>value.kind==='haunt');assert.equal(targets.length,5);
 for(const [index,definition]of [FUNHOUSE_HAUNT_START,...FUNHOUSE_HAUNT_WARDS].entries()){
  const target=targets.find(value=>index===0?value.operation==='start':value.wardId===definition.id);assert.ok(target,definition.name);
  assert.equal(target.stationId,'funhouse-haunt');assert.equal(target.operation,index===0?'start':'seal');
  const marker=root.userData.funhouseHauntMarkers[index];assert.deepEqual(marker.position,definition.position);
  assert.deepEqual(target.position.toArray(),Object.values(marker.targetPosition));
  const origin=new T.Vector3(definition.position.x,1.67,definition.position.z+2.8),direction=target.position.clone().sub(origin).normalize();
  assert.equal(funhouseInteractionHit({origin,direction},root,{kind:'haunt',operation:target.operation})?.id,target.id,definition.name+' has no scenery or wall blocking its target');
 }
 const mirror=targets.find(value=>value.wardId==='mirror-lantern'),trail=funhouseInteractionTargets(root).find(value=>value.clueId==='last-laugh');
 assert.ok(mirror.position.distanceTo(trail.position)>.85,'the new seal control is beside the existing adventure lantern');
});

test('personal Night Watch state lights only its next ward and reveals a stationary shadow in comfort mode',t=>{
 const root=scene(t),api=root.userData,now=100000;
 const own={id:'own',status:'active',wardIndex:2,sealed:['nursery-lantern','clockwork-lantern'],endsAt:now+10000};
 const other={id:'other',status:'active',wardIndex:0,sealed:[],endsAt:now+10000};
 api.setFunhouseState({funhouse:{haunt:own},players:{first:{funhouse:{haunt:other}},self:{funhouse:{haunt:own}}}},now);api.updateFunhouseEffects(10,true,now);
 assert.deepEqual(api.funhouseHauntMarkers.filter(value=>value.highlight.visible).map(value=>value.id),['mirror-lantern']);
 assert.deepEqual(api.funhouseHauntMarkers.filter(value=>value.seal.visible).map(value=>value.id),['nursery-lantern','clockwork-lantern']);
 const {shadows}=api.funhouseHauntScenery;assert.deepEqual(shadows.map(value=>value.visible),[false,false,true,false]);
 for(const shadow of shadows){assert.equal(shadow.position.y,.2);assert.equal(shadow.rotation.z,0);}
 assert.ok(api.funhouseHauntMarkers.every(value=>value.token.position.y===1.3));
 api.updateFunhouseEffects(11,false,now+1000);assert.notEqual(shadows[2].position.y,.2,'optional spectre float animates outside comfort mode');
 api.setFunhouseState({funhouse:{},players:{other:{funhouse:{haunt:other}}}},now+1000);api.updateFunhouseEffects(12,true,now+1000);
 assert.ok(shadows.every(value=>!value.visible),'another visitor cannot start a private haunting in the local view');
 assert.deepEqual(api.funhouseHauntMarkers.filter(value=>value.highlight.visible).map(value=>value.id),['funhouse-haunt']);
});

test('the final ringmaster reveal expires by server time and never replays an old completed watch',t=>{
 const root=scene(t),api=root.userData,now=100000;
 const haunt={id:'finished',status:'complete',sealed:FUNHOUSE_HAUNT_WARDS.map(value=>value.id),wardIndex:4,finishedAt:now,lastSealedAt:now};
 api.setFunhouseState({funhouse:{haunt}},now);api.updateFunhouseEffects(10,true,now+100);
 assert.equal(api.funhouseHauntScenery.reveal.visible,true);assert.equal(api.funhouseHauntScenery.reveal.position.y,0);
 assert.ok(api.funhouseHauntScenery.shadows.every(value=>!value.visible));assert.equal(api.funhouseHauntMarkers.filter(value=>value.seal.visible).length,4);
 api.setFunhouseState({funhouse:{haunt}},now+5000);api.updateFunhouseEffects(15,true,now+5000);
 assert.equal(api.funhouseHauntScenery.reveal.visible,false,'repeated completed snapshots do not restart the scare');
 api.setFunhouseState({funhouse:{haunt:{...haunt,status:'cancelled'}}},now+6000);api.updateFunhouseEffects(16,true,now+6000);assert.equal(api.funhouseHauntScenery.reveal.visible,false);
});

test('the complete finale mask fits a normal first-person view and stays in front of physical maze walls',t=>{
 const root=scene(t),api=root.userData,now=100000;
 api.setFunhouseState({funhouse:{haunt:{status:'complete',sealed:FUNHOUSE_HAUNT_WARDS.map(value=>value.id),finishedAt:now}}},now);
 const camera=new T.PerspectiveCamera(50,1,.05,100);camera.position.set(-19.056,1.67,-17.974);camera.lookAt(camera.position.clone().add(new T.Vector3(0,0,-1)));camera.updateMatrixWorld();
 const reveal=api.funhouseHauntScenery.reveal,face=reveal.getObjectByName('FUNHOUSE_HAUNT_GRINNING_MASK');
 const {width,height}=face.geometry.parameters;
 for(const reducedMotion of [false,true])for(const elapsed of [0,2250,4400]){
  api.updateFunhouseEffects(10+elapsed/1000,reducedMotion,now+elapsed);root.updateWorldMatrix(true,true);
  assert.equal(reveal.visible,true);
  for(const x of [-width/2,width/2])for(const y of [-height/2,height/2]){
   const point=face.localToWorld(new T.Vector3(x,y,0)),screen=point.clone().project(camera);
   assert.ok(Math.abs(screen.x)<1&&Math.abs(screen.y)<1&&screen.z>-1&&screen.z<1,'the entire final mask fits a conservative 50-degree view without turning the camera');
  }
  const walls=FUNHOUSE_WALLS.map(wall=>root.getObjectByName('FUNHOUSE_WALL_'+wall.id));
  for(const point of [face.getWorldPosition(new T.Vector3()),reveal.localToWorld(new T.Vector3(0,.5,0)),face.localToWorld(new T.Vector3(0,height/2,0))]){
   const offset=point.clone().sub(camera.position),cast=new T.Raycaster(camera.position,offset.clone().normalize(),0,offset.length());
   assert.equal(cast.intersectObjects(walls,false).length,0,'the next maze wall remains behind the visible finale');
  }
 }
});

test('spectres, webs and lanterns keep all physical routes, seated views and the original mesh ceiling',t=>{
 const root=scene(t),api=root.userData;root.updateWorldMatrix(true,true);let count=0;root.traverse(node=>{if(node.isMesh)count++;});assert.ok(count<1200,'Night Watch shares geometry and stays within the full funhouse mesh budget');
 const bounds=new T.Box3().setFromObject(root);assert.deepEqual([bounds.min.x,bounds.max.x,bounds.min.z,bounds.max.z],[-60,60,-60,60]);
 for(const marker of api.funhouseHauntMarkers){
  assert.ok(marker.root.userData.collisionDisabled);assert.ok(marker.token.userData.collisionDisabled);
  for(const wall of FUNHOUSE_WALLS){assert.ok(!(Math.abs(marker.targetPosition.x-wall.x)<wall.width/2+.45&&Math.abs(marker.targetPosition.z-wall.z)<wall.depth/2+.45),marker.id+' has a clear standing approach');}
 }
 for(const node of [api.funhouseHauntScenery.root,api.funhouseHauntScenery.reveal,...api.funhouseHauntScenery.shadows])assert.equal(node.userData.collisionDisabled,true);
 assert.ok(root.getObjectByName('FUNHOUSE_HAUNT_CORNER_WEBS'));assert.equal(root.getObjectByName('FUNHOUSE_HAUNT_WATCHING_EYES').count,8);
 const carSeat=api.funhouseRideAnchors.car.root.localToWorld(new T.Vector3(0,1.7,0));assert.ok(!new T.Box3().setFromObject(api.funhouseHauntScenery.root).containsPoint(carSeat));
 const nursery=api.funhouseHauntScenery.shadows[0],playroom=root.getObjectByName('FUNHOUSE_PLAYROOM_CLOWN');
 assert.ok(Math.hypot(nursery.position.x-playroom.position.x,nursery.position.z-playroom.position.z)>3,'the nursery spectre keeps its own silhouette beside the existing playroom clown');
 assert.ok(!new T.Box3().setFromObject(nursery).intersectsBox(new T.Box3().setFromObject(playroom)),'the nursery mask does not overlap the solid-looking performer');
});

test('market item previews and copied or editable maps allocate no authored Night Watch scenery',t=>{
 for(const environment of [{funhouseAssetId:'funhouse-clown-car'},{id:'copied-funhouse',game:'funhouse'},{id:FUNHOUSE_ID,builderScene:{sourceFunhouse:{enabled:true,editableItems:true},objects:[]}}]){
  const root=scene(t,environment);assert.deepEqual(root.userData.funhouseHauntMarkers,[]);assert.equal(root.userData.funhouseHauntScenery,null);assert.equal(root.getObjectByName('FUNHOUSE_NIGHT_WATCH'),undefined);
 }
});
