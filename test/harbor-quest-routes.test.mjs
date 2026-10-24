import test from 'node:test';
import assert from 'node:assert/strict';
import {harborQuestRadii} from '../public/js/harbor-quest-routes.js';
import {harborWaterAt} from '../public/js/harbor-water.js';
import {neonMarina} from '../neon-marina.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {boatMovementBlocked} from '../server-boat-assist.mjs';

const marina=neonMarina(),world={id:'expanded-quest-harbor',updatedAt:'quest-routes-v1',proceduralLand:true,builderScene:{layout:'community-park',mapSize:1536,objects:marina.objects,layoutMeta:{harbor:marina.harbor,locations:marina.locations}}};

test('expanded islands cannot invalidate every harbor mission and working crew circuit',()=>{
 for(const factor of [.66,.78,.84,.86])assert.ok(Array.from({length:4096},(_,index)=>{const angle=index*2*Math.PI/4096;return {x:768*factor*Math.cos(angle),z:768*factor*Math.sin(angle)};}).some(point=>!harborWaterAt(world,point,12)),'historical factor '+factor+' crosses current land');
 const traffic=harborQuestRadii(world),missions=harborQuestRadii(world,{count:1,preferredFactors:[.66,.78,.86]});
 assert.equal(traffic.length,2);assert.equal(missions.length,1);
 for(const radius of [...traffic,...missions]){
  assert.ok(radius>250&&radius<300,'nearby inner shipping channel remains useful');
  for(let index=0;index<8192;index++){const angle=index*2*Math.PI/8192;assert.ok(harborWaterAt(world,{x:radius*Math.cos(angle),z:radius*Math.sin(angle)},12),'entire circle has boat water clearance');}
 }
});

test('selected circles clear authored docks, island buildings and moored craft in authoritative collision',()=>{
 const collision=new ServerBuilderCollision(),actors=Object.fromEntries(marina.objects.filter(object=>object.placementAnchor==='waterline').map(object=>[object.id,{...object,active:true}])),radii=[...harborQuestRadii(world),...harborQuestRadii(world,{count:1,preferredFactors:[.66,.78,.86]})];
 for(const modelId of ['harbor-skiff','harbor-patrol','harbor-yacht']){
  const boat={id:'route-probe',modelId,active:true,position:{x:radii[0],y:0,z:0},rotation:{y:Math.PI}},blocked=boatMovementBlocked(world,boat,actors,collision,{});
  for(const radius of radii)for(let index=0;index<256;index++){
   const angle=index*2*Math.PI/256,nextAngle=(index+1)*2*Math.PI/256,from={x:radius*Math.cos(angle),y:0,z:radius*Math.sin(angle)},to={x:radius*Math.cos(nextAngle),y:0,z:radius*Math.sin(nextAngle)};boat.position=from;boat.rotation.y=Math.PI-angle;
   assert.equal(blocked(from,to,Math.PI-nextAngle),false,modelId+' has clear route at '+radius+' m / '+index);
  }
 }
});

test('existing safe factors remain stable, no full-water circle is invented for a small or blocked harbor',()=>{
 const simple={builderScene:{layoutMeta:{harbor:{extent:512,islands:[]}}}};
 assert.deepEqual(harborQuestRadii(simple),[512*.66,512*.84]);
 assert.deepEqual(harborQuestRadii({}),[]);
 assert.deepEqual(harborQuestRadii({builderScene:{layoutMeta:{harbor:{extent:128,islands:[]}}}}),[]);
 assert.deepEqual(harborQuestRadii({builderScene:{layoutMeta:{harbor:{extent:512,islands:[{x:0,z:0,width:1024,depth:1024}]}}}}),[]);
});

test('narrow islands between angular samples are excluded and cached routes refresh with edited metadata',()=>{
 const environment={builderScene:{layoutMeta:{harbor:{extent:512,islands:[]}}}},first=harborQuestRadii(environment),radius=first[0],angle=.031;
 environment.builderScene.layoutMeta.harbor.islands.push({x:radius*Math.cos(angle),z:radius*Math.sin(angle),width:.1,depth:.1});
 const next=harborQuestRadii(environment);assert.equal(next.length,2);assert.ok(!next.includes(radius));
 const saved=[...next];next[0]=0;assert.deepEqual(harborQuestRadii(environment),saved,'caller cannot mutate the cached route');
});
