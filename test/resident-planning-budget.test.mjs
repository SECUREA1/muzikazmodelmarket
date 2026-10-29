import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureResidentIntelligence,stepResidentLife} from '../server-resident-life.mjs';
import {planResidentObjective} from '../server-resident-objectives.mjs';

function fixture(count=1){
 const environment={id:'route-budget-garden',name:'Garden',builderScene:{mapSize:120,layout:'grand-floor',objects:[],layoutMeta:{locations:[{id:'home',name:'Welcome',x:0,y:0,z:0},{id:'lookout',name:'Lookout',x:30,y:0,z:0}]}}};
 const sim={actors:{},players:{},events:[]};
 for(let index=0;index<count;index++){
  const npc={id:'walker-'+index,health:100,active:true,position:{x:0,y:0,z:index*.01},resident:{name:'Ellis Reed',home:{x:0,y:0,z:index*.01},locationIndex:0}};
  sim.actors[npc.id]=npc;ensureResidentIntelligence(sim,npc,environment,100000);
  Object.assign(npc.resident,{nextObjectiveAt:100000,nextSocialAt:9999999,nextAmbientAt:9999999,pauseUntil:0});
 }
 return {environment,sim,npc:sim.actors['walker-0']};
}
const plainCollision={groundAt:(_environment,point)=>({...point}),hasBodyClearance:()=>true,resolve:(_environment,_from,to)=>({...to})};

test('a crowded blocked map shares bounded route validation while every resident makes planning progress',()=>{
 const f=fixture(16);let groundQueries=0;
 for(const npc of Object.values(f.sim.actors))npc.resident.goal={kind:'rest',status:'active',target:{...npc.position},arrivedAt:100000};
 const collision={...plainCollision,groundAt:(_environment,point)=>{groundQueries++;return {...point};},resolve:(_environment,from,to)=>to.x>2?from:{...to}};
 for(let index=0;index<8;index++){
  groundQueries=0;stepResidentLife(f.sim,f.environment,100000+index*250,.25,{collision});
  assert.ok(groundQueries<=64+16,`bounded planning plus one current-floor check per resident: ${groundQueries}`);
  assert.ok(Object.values(f.sim.actors).every(npc=>f.sim.residentLife.objectivePlans[npc.id]),'blocked residents retain their unfinished search');
 }
 assert.ok(Object.values(f.sim.actors).every(npc=>f.sim.residentLife.objectivePlans[npc.id].candidate>0||f.sim.residentLife.objectivePlans[npc.id].search?.segment.index>1),'later residents receive work as well as the first');
});

test('planning retains the entire candidate search instead of dropping difficult or late destinations',()=>{
 const f=fixture(),npc=f.npc;
 f.environment.builderScene.layoutMeta.locations=Array.from({length:6},(_,index)=>({id:'place-'+index,name:'Lookout '+index,x:14+index,y:0,z:0}));
 let probes=0;
 const navigation={safePoint:point=>{probes++;return probes<144?null:{...point};},clearSegment:()=>true};
 for(let index=0;index<40&&!npc.resident.objective;index++){
  const before=probes;planResidentObjective(f.sim,npc,f.environment,100000+index*250,{...navigation,budget:{remaining:5}});
  assert.ok(probes-before<=5,'candidate work is bounded per continuation');
 }
 assert.equal(probes,145,'all 144 candidate points are retained, followed by the home check');
 assert.equal(npc.resident.objective?.status,'active');assert.equal(f.sim.residentLife.objectivePlans[npc.id],undefined);
 assert.equal(npc.resident.objectivesCompleted,undefined,'planning alone earns no journal credit');
});

test('partially validated segments survive room serialization and retain deterministic physical movement',()=>{
 const f=fixture();let queries=0;
 const collision={...plainCollision,groundAt:(_environment,point)=>{queries++;return {...point};}};
 stepResidentLife(f.sim,f.environment,100000,.25,{collision});
 assert.ok(f.sim.residentLife.objectivePlans[f.npc.id]);assert.equal(f.npc.resident.objective,undefined);assert.ok(queries<=85);
 const restored=JSON.parse(JSON.stringify(f.sim));
 for(let index=1;index<=12;index++){
  const now=100000+index*250;stepResidentLife(f.sim,f.environment,now,.25,{collision:plainCollision});stepResidentLife(restored,f.environment,now,.25,{collision:plainCollision});
 }
 assert.deepEqual(restored,f.sim);assert.equal(f.npc.resident.objective?.status,'active');
 assert.ok(Math.hypot(f.npc.position.x,f.npc.position.z)>0,'the resident walks after both routes have been validated');
 const before=JSON.stringify(f.sim);stepResidentLife(f.sim,f.environment,103000,.25,{collision:plainCollision});assert.equal(JSON.stringify(f.sim),before,'duplicate snapshots do not repeat planning or movement');
});

test('map edits, building changes and priority assignments invalidate pending route work',()=>{
 for(const change of ['landmark','building','shared','tired']){
  const f=fixture(),objects={piece:{id:'piece',revision:1}};
  stepResidentLife(f.sim,f.environment,100000,.25,{collision:plainCollision,objects});assert.ok(f.sim.residentLife.objectivePlans[f.npc.id]);
  if(change==='landmark')f.environment.builderScene.layoutMeta.locations[1].x=20;
  if(change==='building')objects.piece.revision++;
  if(change==='shared')f.npc.resident.sharedTask={id:'priority-job'};
  if(change==='tired')f.npc.resident.needs.energy=20;
  stepResidentLife(f.sim,f.environment,100250,.25,{collision:plainCollision,objects});
  assert.equal(f.sim.residentLife.objectivePlans[f.npc.id],undefined,change);assert.equal(f.npc.resident.objective,undefined,change);
 }
});

test('the total allowance stays fixed above 64 residents and rotates to later planners',()=>{
 const f=fixture(72);let queries=0;
 for(const npc of Object.values(f.sim.actors))npc.resident.goal={kind:'rest',status:'active',target:{...npc.position},arrivedAt:100000};
 const collision={...plainCollision,groundAt:(_environment,point)=>{queries++;return {...point};},resolve:(_environment,from,to)=>to.x>2?from:{...to}};
 for(let index=0;index<4;index++){
  queries=0;stepResidentLife(f.sim,f.environment,100000+index*250,.25,{collision});
  assert.ok(queries<=64+72,`one cast-wide allowance plus current-floor checks: ${queries}`);
 }
 assert.equal(Object.keys(f.sim.residentLife.objectivePlans).length,72,'all residents eventually start their own search');
 assert.ok(Object.values(f.sim.residentLife.objectivePlans).every(plan=>plan.candidate>0||plan.search?.segment.index>1),'later residents resume their unfinished work');
});

test('ordinary work continues while an impossible landmark route is being searched',()=>{
 const f=fixture();f.npc.resident.goal={kind:'work',status:'active',target:{...f.npc.position},arrivedAt:100000};
 const collision={...plainCollision,resolve:(_environment,from,to)=>to.x>2?from:{...to}};
 for(let index=0;index<6;index++)stepResidentLife(f.sim,f.environment,100000+index*250,.25,{collision});
 assert.ok(f.sim.residentLife.objectivePlans[f.npc.id],'the difficult landmark search is still pending');
 assert.ok(f.npc.resident.work.progress>.15,'the existing work cycle progresses between planning slices');
 assert.equal(f.npc.resident.objective,undefined);assert.equal(f.npc.resident.objectivesCompleted,undefined);
});
