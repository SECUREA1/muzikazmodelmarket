import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createClownFunhouseLand} from '../public/js/environments/clown-funhouse-land.js';
import {FUNHOUSE_ID} from '../public/js/clown-funhouse-config.js';
import {FUNHOUSE_ADVENTURE_START,FUNHOUSE_ADVENTURE_CLUES} from '../public/js/funhouse-adventure-rules.js';
import {funhouseInteractionTargets,funhouseInteractionHit} from '../public/js/funhouse-scene-actions.js';

function scene(t,environment={id:FUNHOUSE_ID}){
 const root=createClownFunhouseLand(environment);
 t.after(()=>{const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});for(const value of resources)value.dispose();root.clear();});
 return root;
}
function ray(origin,target){return {origin,direction:target.position.clone().sub(origin).normalize()};}

test('native adventure markers match the room coordinates and can be aimed at from clear standing approaches',t=>{
 const root=scene(t);root.userData.updateFunhouseEffects(0,true,100000);
 const targets=funhouseInteractionTargets(root).filter(target=>target.kind==='adventure');
 assert.equal(targets.length,7);
 for(const [index,definition]of [FUNHOUSE_ADVENTURE_START,...FUNHOUSE_ADVENTURE_CLUES].entries()){
  const operation=index===0?'adventure-start':'inspect',target=targets.find(value=>index===0?value.operation===operation:value.clueId===definition.id);
  assert.ok(target,definition.name+' has an actual world target');
  assert.equal(target.stationId,'funhouse-adventure');assert.equal(target.operation,operation);
  assert.deepEqual(target.position.toArray(),[definition.position.x,1.3,definition.position.z]);
  const origin=new T.Vector3(definition.position.x,1.67,definition.position.z+2.8);
  const hit=funhouseInteractionHit(ray(origin,target),root,{kind:'adventure',operation});
  assert.equal(hit?.id,target.id,definition.name+' has no wall or scenery covering its control');
 }
});

test('next-clue lights and discovered seals use authoritative adventure state, and set pieces settle under reduced motion',t=>{
 const root=scene(t),api=root.userData,now=100000;
 api.updateFunhouseEffects(10,true,now);
 const adventure={status:'active',clueIndex:2,found:['ticket-trick','wardrobe-whisper']};
 api.setFunhouseState({players:{guest:{funhouse:{adventure,effects:{'adventure:wardrobe-whisper':{kind:'adventure',clueId:'wardrobe-whisper',at:now,until:now+3500}}}}}},now);
 api.updateFunhouseEffects(10.1,true,now+100);
 assert.deepEqual(api.funhouseAdventureMarkers.filter(marker=>marker.highlight.visible).map(marker=>marker.id),['drowned-mask']);
 assert.deepEqual(api.funhouseAdventureMarkers.filter(marker=>marker.seal.visible).map(marker=>marker.id),['ticket-trick','wardrobe-whisper']);
 const door=root.getObjectByName('FUNHOUSE_WHISPER_WARDROBE_DOOR');assert.ok(door.rotation.y<-.5,'the inspected wardrobe responds in the world');
 assert.ok(api.funhouseAdventureMarkers.every(marker=>marker.token.position.y===1.3),'comfort mode stops the optional floating motion');
 api.updateFunhouseEffects(14,true,now+4000);assert.equal(door.rotation.y,0,'the timed reveal ends without replaying saved scares');
});

test('each visitor sees their own next clue and gallery target while other guests play in the same room',t=>{
 const root=scene(t),api=root.userData,now=100000;
 const own={adventure:{status:'active',clueIndex:2,found:['ticket-trick','wardrobe-whisper']},round:{status:'active',targetId:4,score:20,endsAt:now+30000}};
 const other={adventure:{status:'active',clueIndex:0,found:[]},round:{status:'active',targetId:1,score:10,endsAt:now+30000}};
 api.setFunhouseState({funhouse:own,players:{firstGuest:{funhouse:other},self:{funhouse:own}}},now);api.updateFunhouseEffects(10,true,now);
 assert.deepEqual(api.funhouseAdventureMarkers.filter(marker=>marker.highlight.visible).map(marker=>marker.id),['drowned-mask']);
 assert.deepEqual(api.funhouseTargets.filter(target=>target.highlight.visible).map(target=>target.id),[4]);
 api.setFunhouseState({funhouse:{adventure:{...own.adventure,status:'complete'}},players:{firstGuest:{funhouse:other}}},now);api.updateFunhouseEffects(11,true,now);
 assert.deepEqual(api.funhouseAdventureMarkers.filter(marker=>marker.highlight.visible).map(marker=>marker.id),['funhouse-adventure'],'another guest cannot replace a completed personal trail');
});

test('new scenery preserves ride head clearance, the original footprint and the existing mesh budget',t=>{
 const root=scene(t);root.userData.updateFunhouseEffects(0,true,100000);root.updateWorldMatrix(true,true);
 assert.ok(root.getObjectByName('FUNHOUSE_STORY_GALLERY'));
 assert.ok(root.getObjectByName('FUNHOUSE_CLOCKWORK_THEATRE'));
 assert.ok(root.getObjectByName('FUNHOUSE_LANTERN_WALK'));
 assert.ok(root.getObjectByName('FUNHOUSE_VELVET_HOUSE_RIBS'));
 const bounds=new T.Box3().setFromObject(root);assert.deepEqual([bounds.min.x,bounds.max.x,bounds.min.z,bounds.max.z],[-60,60,-60,60]);
 const staticMeshes=[];let meshCount=0;root.traverse(node=>{if(node.isMesh){meshCount++;if(node.visible&&[].concat(node.material||[]).some(material=>material.visible!==false&&!material.transparent))staticMeshes.push(node);}});
 assert.ok(meshCount<1200,'the expanded world retains the original scene mesh ceiling');
 for(const [kind,anchor]of Object.entries(root.userData.funhouseRideAnchors)){
  const eye=anchor.root.localToWorld(new T.Vector3(anchor.feetOffset.x,anchor.feetOffset.y+anchor.eyeHeight,anchor.feetOffset.z));
  const head=new T.Sphere(eye,.12);
  for(const mesh of staticMeshes){
   if(mesh.material.side===T.BackSide)continue;
   const cast=new T.Raycaster(eye,new T.Vector3(0,1,0),0,.12);
   assert.ok(!cast.intersectObject(mesh,false).length,kind+' seated head does not intersect a roof or canopy');
  }
  assert.ok(!new T.Box3().setFromObject(root.getObjectByName('FUNHOUSE_VELVET_HOUSE_RIBS')).intersectsSphere(head),kind+' seat stays outside new roof framing');
 }
});

test('purchased attraction previews and nonnative copied maps do not allocate native adventure markers',t=>{
 const model=scene(t,{funhouseAssetId:'funhouse-clown-car'});
 assert.equal(model.userData.funhouseAdventureMarkers.length,0);assert.equal(model.userData.funhouseScenery.length,0);
 const copy=scene(t,{id:'copied-funhouse',game:'funhouse'});
 assert.equal(copy.userData.funhouseAdventureMarkers.length,0,'only the permanent map owns the trail markers');
});
