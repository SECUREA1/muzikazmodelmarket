import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createClownFunhouseLand} from '../public/js/environments/clown-funhouse-land.js';
import {createFunhouseModel} from '../public/js/clown-funhouse-models.js';
import {funhouseInteractionTargets,funhouseInteractionHit} from '../public/js/funhouse-scene-actions.js';
import {funhouseGalleryTargets,funhouseBallTargets,funhouseAimedTarget,funhouseRidePose} from '../public/js/funhouse-experience-rules.js';

function own(t,root){
 t.after(()=>{
  const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});
  for(const resource of resources)resource.dispose();root.clear();
 });return root;
}
function near(actual,expected,message){assert.ok(actual.distanceTo(new T.Vector3(expected.x,expected.y,expected.z))<1e-6,message);}
function aim(origin,target){return {origin,direction:target.position.clone().sub(origin).normalize()};}
function named(root,name){const values=[];root.traverse(node=>{if(node.name===name)values.push(node);});return values;}
function transform(root){return {position:{...root.position},rotation:{x:root.rotation.x,y:root.rotation.y,z:root.rotation.z},scale:{...root.scale}};}

test('all six real gallery targets can be aimed at from a standing player above the physical counter',t=>{
 const root=own(t,createClownFunhouseLand()),origin=new T.Vector3(-30,1.67,12);
 root.userData.updateFunhouseEffects(0,true,1000);
 const targets=funhouseInteractionTargets(root).filter(target=>target.operation==='squirt'),expected=funhouseGalleryTargets({kind:'water'});
 assert.equal(targets.length,6);
 for(const target of targets){
  near(target.position,expected[target.targetId],'rendered clown face matches the server target');
  const ray=aim(origin,target),hit=funhouseInteractionHit(ray,root,{operation:'squirt'});
  assert.equal(hit?.targetId,target.targetId,'counter and start button leave each firing lane open');
  assert.equal(funhouseAimedTarget({kind:'water'},origin,ray.direction),target.targetId,'server accepts the same aimed target');
 }
 const operations=new Set(funhouseInteractionTargets(root).map(target=>target.kind+':'+target.operation));
 for(const key of ['water:start','car:ride','car:honk','spinner:ride','spinner:balance','ballpit:start','ballpit:toss','jackbox:start','jackbox:wind','mirrors:start','maze-finish:ring','dressup:hat','dressup:shoes'])assert.ok(operations.has(key),key+' has an authored world control');
});

test('portable targets preserve owner identity and exact world positions after rotation and scaling',t=>{
 const root=own(t,createFunhouseModel('funhouse-water-gallery'));
 root.userData.builderObjectId='gallery-copy';root.position.set(13,.8,-7);root.rotation.set(.1,.8,-.05);root.scale.set(1.25,.9,1.1);
 root.userData.updateFunhouseEffects(0,true,1000);
 const station={kind:'water',source:'placed',objectTransform:transform(root)},expected=funhouseGalleryTargets(station);
 const targets=funhouseInteractionTargets([root,root.children[0]]).filter(target=>target.operation==='squirt');
 assert.equal(targets.length,6,'wrapper and content re-export the same descriptors without duplicate hits');
 root.updateWorldMatrix(true,true);const origin=root.localToWorld(new T.Vector3(0,1.67,9));
 for(const target of targets){
  near(target.position,expected[target.targetId],'native pivot follows the shared equipment transform');
  assert.equal(target.stationId,'funhouse-instance:gallery-copy');assert.equal(target.canonicalStationId,'funhouse-water-gallery');
  const hit=funhouseInteractionHit(aim(origin,target),root,{objectId:'gallery-copy',operation:'squirt'});
  assert.equal(hit?.targetId,target.targetId);assert.equal(hit.objectId,'gallery-copy');
 }
 assert.equal(funhouseInteractionHit(aim(origin,targets[0]),root,{objectId:'another-copy'}),null);
});

test('the same ray helper rejects an exit bell through the real maze walls and allows its open approach',t=>{
 const root=own(t,createClownFunhouseLand()),bell=funhouseInteractionTargets(root).find(target=>target.operation==='ring');
 const blocked=aim(new T.Vector3(-18,1.67,-20),bell);
 assert.equal(funhouseInteractionHit(blocked,root,{operation:'ring',maxDistance:30}),null,'physical partitions occlude interaction');
 assert.equal(funhouseInteractionHit(blocked,root,{operation:'ring',maxDistance:30,occlusion:false})?.id,'maze-exit-bell','the target exists behind the partition');
 assert.equal(funhouseInteractionHit(aim(new T.Vector3(-18,1.67,-38),bell),root,{operation:'ring'})?.id,'maze-exit-bell');
 for(const ray of [{origin:[0,1,0],direction:[0,0,0]},{origin:[Number.NaN,0,0],direction:[0,0,-1]},{origin:null,direction:[0,0,-1]}])assert.equal(funhouseInteractionHit(ray,root),null);
 const backwards={origin:blocked.origin,direction:blocked.direction.clone().negate()};assert.equal(funhouseInteractionHit(backwards,root,{operation:'ring',occlusion:false,maxDistance:30}),null);
});

test('occupied car and spinner seat anchors match the authoritative pose at the same server time',t=>{
 const startedAt=100000,now=105125;
 for(const [kind,id]of [['car','funhouse-clown-car'],['spinner','funhouse-dizzy-spinner']]){
  const root=own(t,createFunhouseModel(id)),owner=kind+'-copy';root.userData.builderObjectId=owner;
  root.position.set(-6,.35,11);root.rotation.set(.05,.6,-.02);root.scale.set(1.1,.8,1.2);
  const ride={kind,status:'active',objectId:owner,startedAt,endsAt:120000,durationMs:20000,nextCueAt:104000,cueUntil:105500,cueIndex:1,lastCueHit:-1,targetId:1,score:0};
  root.userData.setFunhouseState({funhouse:{},players:{other:{funhouse:{ride}}}},now);
  root.userData.updateFunhouseEffects(3.2,false,now);
  const anchor=root.userData.funhouseRideAnchors[kind],position=anchor.root.localToWorld(new T.Vector3(anchor.feetOffset.x,anchor.feetOffset.y,anchor.feetOffset.z));
  const expected=funhouseRidePose(ride,{kind,source:'placed',objectTransform:transform(root)},now);
  near(position,expected.position,kind+' camera anchor matches server feet even with decorative motion enabled');
  if(kind==='car'){
   assert.equal(root.getObjectByName('FUNHOUSE_CLOWN_CAR_HORN_CUE').visible,true);
   root.userData.updateFunhouseEffects(3.3,false,105501);assert.equal(root.getObjectByName('FUNHOUSE_CLOWN_CAR_HORN_CUE').visible,false,'honk cue closes on server time');
  }else{
   const lights=named(root,'FUNHOUSE_SPINNER_BALANCE_CUE');assert.deepEqual(lights.map(light=>light.visible),[false,true]);
   root.userData.updateFunhouseEffects(3.3,true,now);near(anchor.root.localToWorld(new T.Vector3(0,-.6,0)),expected.position,'comfort mode retains the same physical seat phase');
  }
 }
});

test('jack crank, popup and catch hit volume follow the server ready window',t=>{
 const root=own(t,createFunhouseModel('funhouse-jack-box'));root.userData.builderObjectId='jack-copy';
 const challenge={kind:'jackbox',objectId:'jack-copy',status:'active',phase:'ready',windCount:3,readyAt:51200,catchUntil:52700,endsAt:70000};
 root.userData.setFunhouseState({challenge},51000);
 const popup=root.getObjectByName('FUNHOUSE_POPUP_CLOWN_0'),crank=root.getObjectByName('FUNHOUSE_JACK_CRANK_ASSEMBLY');
 root.userData.updateFunhouseEffects(1,true,51199);assert.equal(popup.visible,false);assert.equal(crank.rotation.z,-2*Math.PI);
 assert.equal(funhouseInteractionTargets(root).some(target=>target.operation==='catch'),false);
 root.userData.updateFunhouseEffects(1.1,true,51200);assert.equal(popup.visible,true);assert.equal(funhouseInteractionTargets(root).filter(target=>target.operation==='catch').length,1);
 root.userData.updateFunhouseEffects(2.7,true,52701);assert.equal(popup.visible,false,'late catches lose their physical target');
 assert.equal(root.getObjectByName('FUNHOUSE_JACK_LID').rotation.x,0);
});

test('ball pit presents four server-aligned hoops and a missed toss follows its actual ray',t=>{
 const root=own(t,createFunhouseModel('funhouse-ball-pit'));root.userData.builderObjectId='pit-copy';
 const targets=funhouseInteractionTargets(root).filter(target=>target.operation==='toss'),expected=funhouseBallTargets({kind:'ballpit',source:'placed',objectTransform:transform(root)});
 assert.equal(targets.length,4);for(const target of targets)near(target.position,expected[target.targetId]);
 root.userData.updateFunhouseEffects(1,true,40000);
 const challenge={kind:'ballpit',objectId:'pit-copy',status:'active',targetId:2,score:10,endsAt:60000};
 root.userData.setFunhouseState({challenge,effects:{'funhouse-instance:pit-copy':{kind:'toss',canonicalStationId:'funhouse-ball-pit',objectId:'pit-copy',at:40000,until:41000,targetId:-1,hit:false,origin:{x:0,y:1.67,z:5},direction:[1,0,0]}}},40000);
 root.userData.updateFunhouseEffects(1.3,true,40300);
 assert.deepEqual(root.userData.funhouseBallTargets.filter(target=>target.highlight.visible).map(target=>target.id),[2]);
 const ball=root.getObjectByName('FUNHOUSE_THROWN_CARNIVAL_BALL');assert.equal(ball.visible,true);
 const world=ball.getWorldPosition(new T.Vector3());assert.ok(world.x>4&&Math.abs(world.z-5)<1e-6,'a blank shot throws along its own ray instead of a previous hoop');
 root.userData.updateFunhouseEffects(2,true,41000);assert.equal(ball.visible,false);
});

test('portable gallery uses matching remote state only and a missed squirt follows the world aim',t=>{
 const root=own(t,createFunhouseModel('funhouse-water-gallery'));root.userData.builderObjectId='gallery-copy';
 const api=root.userData;api.updateFunhouseEffects(1,true,40000);
 api.setFunhouseState({round:{status:'active',objectId:'wrong-copy',targetId:4}},40000);api.updateFunhouseEffects(1,true,40000);
 assert.deepEqual(api.funhouseTargets.filter(target=>target.highlight.visible).map(target=>target.id),[0]);
 const remote={round:{status:'active',objectId:'gallery-copy',targetId:4,score:10,endsAt:60000},effects:{'funhouse-instance:gallery-copy':{kind:'squirt',canonicalStationId:'funhouse-water-gallery',objectId:'gallery-copy',at:40000,until:41000,targetId:-1,hit:false,origin:[0,1.67,9],direction:[1,0,0]}}};
 api.setFunhouseState({funhouse:{},players:{other:{funhouse:remote}}},40000);api.updateFunhouseEffects(1.2,true,40200);
 assert.deepEqual(api.funhouseTargets.filter(target=>target.highlight.visible).map(target=>target.id),[4]);
 assert.ok(api.funhouseTargets.every(target=>target.root.rotation.z===0),'misses leave all clowns upright');
 const jets=named(root,'FUNHOUSE_WATER_JET');assert.ok(jets.every(jet=>jet.visible));
 for(const jet of jets){const world=jet.getWorldPosition(new T.Vector3());assert.ok(world.x>=-.03&&world.x<=12.03);assert.ok(Math.abs(world.z-9)<1e-6,'spray follows the new miss ray, not the last target');}
});
