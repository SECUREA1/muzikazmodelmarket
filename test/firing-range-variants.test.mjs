import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {rangeRecoilStrength,decayRangeRecoil} from '../public/js/firing-range-feedback.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {FIRING_RANGE_LANES} from '../public/js/firing-range.js';
const manifest=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));

test('both range variants persist on the atlas with distinct rooms and qualification scenery',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'range-variants-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const {environments,atlas}=await synchronizeWorldDirectory(new WorldAtlas(join(dir,'atlas.json')),[]);
 const live=environments.find(item=>item.id==='firing-range'),classic=environments.find(item=>item.id==='force-training-range');
 assert.ok(live&&classic);assert.notEqual(live.roomId,classic.roomId);
 for(const world of [live,classic]){assert.ok(world.permanent);assert.ok(Object.values(atlas.cells).some(cell=>cell.mapId===world.id));assert.ok(world.playUrl.includes('environment='+world.id));}
 const roots=[createBuilderLand(live),createBuilderLand(classic)];assert.equal(roots[0].userData.rangeStyle,'live');assert.equal(roots[1].userData.rangeStyle,'force-training');
 assert.equal(roots[0].getObjectByName('RANGE_SHOOTING_BAY_PARTITION').geometry.parameters.depth,3.6);
 assert.equal(roots[1].getObjectByName('RANGE_SHOOTING_BAY_PARTITION').geometry.parameters.depth,15);
 const collision=new ServerBuilderCollision();for(const world of [live,classic])for(const lane of FIRING_RANGE_LANES){const origin={x:lane.x,y:1.65,z:13.8},end={x:lane.x,y:1.55,z:-13.72},delta=[end.x-origin.x,end.y-origin.y,end.z-origin.z],distance=Math.hypot(...delta);assert.equal(collision.blocksShot(world,origin,delta.map(n=>n/distance),distance),false);}
});

test('both ranges score confirmed impacts, preserve bounded marks and isolate rooms',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'range-impacts-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000;
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>now});
 for(const id of ['firing-range','force-training-range']){
  const world=manifest.find(item=>item.id===id),identity={accountId:id,username:'Shooter',stats:{health:100}};
  await runtime.command(id,world,identity,{action:'join',requestId:'join'});
  let snapshot=await runtime.command(id,world,identity,{action:'range-practice',requestId:'practice'});
  const position=snapshot.players['account:'+id].position,target={x:-14,y:1.55,z:-13.72},delta=[target.x-position.x,target.y-position.y-1.65,target.z-position.z],length=Math.hypot(...delta);
  snapshot=await runtime.command(id,world,identity,{action:'fire',requestId:'shot',tool:'marksman',eyeHeight:1.65,direction:delta.map(n=>n/length)});
  assert.equal(snapshot.result.rangeShot.score,100);assert.ok(Math.abs(snapshot.result.rangeShot.impact.x)<1e-6);assert.ok(Math.abs(snapshot.result.rangeShot.impact.y)<1e-6);
  const root=createBuilderLand(world);root.userData.setFiringRangeState(snapshot.firingRange,{locationId:'main',serverTime:now});
  const marks=()=>{const found=[];root.traverse(item=>{if(item.name==='RANGE_SHOT_IMPACT'&&item.visible)found.push(item);});return found;};assert.equal(marks().length,1);
  root.userData.setFiringRangeState(snapshot.firingRange,{locationId:'main',serverTime:now});assert.equal(marks().length,1,'repeated snapshots do not duplicate holes');
  for(let index=1;index<40;index++)root.userData.setFiringRangeState({...snapshot.firingRange,lastShot:{...snapshot.firingRange.lastShot,at:now+index}},{serverTime:now+index});assert.equal(marks().length,24,'decals stay bounded');
  root.userData.setFiringRangeState({...snapshot.firingRange,matchId:'new-round',lastShot:null},{serverTime:now+100});assert.equal(marks().length,0);
  now+=1000;
 }
});

test('weapon recoil differs by weight and settles consistently across frame rates',()=>{
 assert.ok(rangeRecoilStrength('rail-cannon')>rangeRecoilStrength('pulse-rifle'));
 let a=.02,b=.02;for(let i=0;i<30;i++)a=decayRangeRecoil(a,1/30);for(let i=0;i<120;i++)b=decayRangeRecoil(b,1/120);
 assert.ok(Math.abs(a-b)<1e-12);assert.ok(a<1e-6);assert.equal(decayRangeRecoil(.02,-1),.02);
});

test('confirmed shot presentation is depth-tested, pooled and respects reduced motion',async()=>{
 const THREE=await import('../public/vendor/three/three.module.min.js');
 const {createFiringRangeFeedback}=await import('../public/js/firing-range-feedback.js');
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),canvas=new EventTarget();
 const feedback=createFiringRangeFeedback({THREE,scene,camera,canvas});
 const event={origin:{x:0,y:1.65,z:13.8},end:{x:0,y:1.55,z:-13.72},tool:'marksman'};
 for(let index=0;index<30;index++)feedback.shot(event,true);
 assert.equal(scene.children.length,24,'effect pool never exceeds twelve shots');
 assert.ok(scene.children.every(item=>item.material.depthTest));
 feedback.update(.016,true);assert.ok(camera.rotation.x>0);
 feedback.reset();assert.ok(scene.children.every(item=>!item.visible));feedback.destroy();assert.equal(scene.children.length,0);
 camera.rotation.x=0;const still=createFiringRangeFeedback({THREE,scene,camera,canvas,reducedMotion:true});still.shot(event,true);still.update(.016,true);assert.equal(camera.rotation.x,0);still.destroy();
});
