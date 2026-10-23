import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {constructionWorld} from '../construction-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import * as constructionServer from '../server-construction.mjs';
import {craneHookPosition,initialConstructionState,CONSTRUCTION_LOAD_OFFSET} from '../public/js/construction-state.js';
import {constructionColliders,constructionMotionBlocked,constructionBoxContact,constructionBoxFromBounds} from '../public/js/construction-collision.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
const {ensureConstruction,constructionCommand,stepConstruction,constructionTelemetry}=constructionServer;

const machine=(id,modelId,x=0,z=0)=>({id,modelId,active:true,health:100,position:{x,y:0,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},driving:{speed:0,parked:true}});
const obstacle=(id,size,position)=>({part:'test obstruction',objectId:id,size:{x:size[0],y:size[1],z:size[2]},matrix:new THREE.Matrix4().makeTranslation(...position).toArray()});
const bounds=parts=>{const result=new THREE.Box3();for(const part of parts){const size=part.size,matrix=new THREE.Matrix4().fromArray(part.matrix),box=new THREE.Box3(new THREE.Vector3(-size.x/2,-size.y/2,-size.z/2),new THREE.Vector3(size.x/2,size.y/2,size.z/2));result.union(box.applyMatrix4(matrix));}return result;};
function fixture(){
 const sim={actors:{crane:machine('crane','tower-crane',-18,-4),truck:machine('truck','site-dumptruck',25,24),excavator:machine('excavator','site-excavator',25,17),dozer:machine('dozer','site-bulldozer',29,28)},players:{},events:[],sequence:1};
 const environment={id:'construction-collision-fixture',proceduralLand:true,construction:{enabled:true},builderScene:{layout:'grand-floor',mapSize:200,objects:[]}};
 ensureConstruction(sim,environment);
 const player={actorId:'operator',vehicleId:null,position:{x:0,y:0,z:0},health:100,lastSeen:1000,input:{}};sim.players.operator=player;
 const board=id=>{if(player.vehicleId)sim.actors[player.vehicleId].holderId=null;player.vehicleId=id;player.position={...sim.actors[id].position};sim.actors[id].holderId=player.actorId;};
 const send=(operation,fields={})=>constructionCommand(sim,player,{operation,...fields},player.lastSeen);
 const tick=(count=1,context)=>{for(let i=0;i<count;i++){player.lastSeen+=100;stepConstruction(sim,player.lastSeen,.1,context);}};
 return {sim,environment,player,board,send,tick};
}

test('an elevated crane release keeps its beam attached rather than teleporting steel to ground',()=>{
 const {sim,board,send}=fixture();board('crane');send('attach');const crane=sim.actors.crane,beam=sim.actors[crane.construction.load];
 crane.construction.hoist=30;beam.position=craneHookPosition(crane);const before=structuredClone(beam.position);
 assert.throws(()=>send('release'),/lower|ground|target|release/i);
 assert.equal(crane.construction.load,beam.id);assert.equal(beam.constructionBeam.state,'attached');assert.deepEqual(beam.position,before);assert.equal(sim.construction.tower.placed,0);
});

test('crane placement rejects snapping through a solid obstacle while retaining the suspended load',()=>{
 const {sim,environment,board,send}=fixture();board('crane');send('attach');const crane=sim.actors.crane,beam=sim.actors[crane.construction.load],target=sim.construction.tower.target;
 const dx=target.x-crane.position.x,dz=target.z-crane.position.z;crane.construction.slew=Math.atan2(dx,dz);crane.construction.trolley=Math.hypot(dx,dz);crane.construction.hoist=target.y+CONSTRUCTION_LOAD_OFFSET;
 beam.position={...craneHookPosition(crane),y:target.y};
 const objects={obstacle:{id:'obstacle',revision:1,materialId:'wall',position:[target.x,target.y+1.2,target.z],rotation:[0,0,0],scale:[1,1,1]}};
 const collision=new ServerBuilderCollision();
 const clear=structuredClone(sim);constructionCommand(clear,clear.players.operator,{operation:'release'},clear.players.operator.lastSeen,{collision:new ServerBuilderCollision(),environment,objects:{}});assert.equal(clear.construction.tower.placed,1,'the same aligned placement succeeds without an obstruction');
 assert.throws(()=>constructionCommand(sim,sim.players.operator,{operation:'release'},sim.players.operator.lastSeen,{collision,environment,objects}),/blocked|clearance|obstacle|collision|obstruct/i);
 assert.equal(crane.construction.load,beam.id);assert.equal(sim.construction.tower.placed,0);
});

test('attaching nearby steel cannot pull it through a wall to reach the hook',()=>{
 const {sim,environment,board}=fixture();board('crane');const crane=sim.actors.crane,beam=Object.values(sim.actors).find(actor=>actor.constructionBeam);
 for(const other of Object.values(sim.actors))if(other.constructionBeam&&other!==beam){other.active=false;other.constructionBeam.state='removed';}
 const hook={x:beam.position.x,y:beam.position.y+CONSTRUCTION_LOAD_OFFSET,z:beam.position.z+1},dx=hook.x-crane.position.x,dz=hook.z-crane.position.z;
 Object.assign(crane.construction,{slew:Math.atan2(dx,dz),trolley:Math.hypot(dx,dz),hoist:hook.y});
 const objects={wall:{id:'wall',revision:1,materialId:'wall',position:[beam.position.x,1.2,beam.position.z+.5],rotation:[0,0,0],scale:[10,1,1]}},before=structuredClone(beam.position);
 const clear=structuredClone(sim);constructionCommand(clear,clear.players.operator,{operation:'attach'},clear.players.operator.lastSeen,{collision:new ServerBuilderCollision(),environment,objects:{}});assert.equal(clear.actors.crane.construction.load,beam.id,'nearby steel can attach when its short alignment path is clear');
 assert.throws(()=>constructionCommand(sim,sim.players.operator,{operation:'attach'},sim.players.operator.lastSeen,{collision:new ServerBuilderCollision(),environment,objects}),/blocked|clearance|wall|obstacle|collision|obstruct/i);
 assert.equal(crane.construction.load,null);assert.equal(beam.constructionBeam.state,'supply');assert.deepEqual(beam.position,before);
});

test('a moving machine refuses an automated work cycle and cannot award excavation progress',()=>{
 const {sim,board,send,tick}=fixture();board('excavator');sim.actors.excavator.driving.speed=1;
 assert.throws(()=>send('work'),/park|stop/i);tick(30);assert.equal(sim.construction.excavation.volume,0);assert.equal(sim.actors.excavator.construction.load,0);
});

test('a full forty cubic metre truck refuses more soil without losing the excavator bucket payload',()=>{
 const {sim,board,send,tick}=fixture();board('excavator');sim.actors.excavator.construction.load=2;sim.actors.truck.construction.load=40;
 assert.throws(()=>send('work'),/full|capacity|load|truck/i);tick(30);
 assert.equal(sim.actors.excavator.construction.load,2);assert.equal(sim.actors.truck.construction.load,40);assert.equal(sim.construction.stockpile.volume,0);
});

test('an automated tipping cycle stops at overhead geometry and awards no spoil through a blocked body path',()=>{
 const {sim,environment,player,board,send,tick}=fixture();board('truck');const truck=sim.actors.truck;truck.position={x:30,y:0,z:33};sim.players.operator.position={...truck.position};truck.construction.load=2;truck.construction.cargo={soil:2,gravel:0};
 const objects={ceiling:{id:'ceiling',revision:1,materialId:'cube',position:[truck.position.x,4.5,truck.position.z],rotation:[0,0,0],scale:[8/1.2,.2/1.2,12/1.2]}},context={collision:new ServerBuilderCollision(),environment,objects};
 constructionCommand(sim,player,{operation:'work'},player.lastSeen,context);tick(40,context);
 assert.equal(sim.construction.stockpile.volume,0,'blocked motion cannot deliver soil');assert.equal(truck.construction.load,2,'the truck retains its load');
 const instruments=constructionTelemetry(sim,truck,player.lastSeen,context);assert.ok(instruments.blocked);assert.match(instruments.blockedReason,/truck|bed|body|obstruct|blocked/i);assert.ok(instruments.cycleProgress<1);
 send('park');assert.equal(truck.construction.workCycle,undefined,'the operator can safely cancel a blocked cycle');
});

test('machine colliders follow articulated dump beds, blades and upper-carriage swing in world coordinates',()=>{
 const truck=machine('truck','site-dumptruck',11,7);truck.construction=initialConstructionState(truck);const lowered=bounds(constructionColliders(truck));truck.construction.bed=.9;const raised=bounds(constructionColliders(truck));
 assert.ok(raised.max.y>lowered.max.y+1,'a raised body has a higher physical envelope');
 const dozer=machine('dozer','site-bulldozer',-8,12);dozer.construction=initialConstructionState(dozer);dozer.construction.blade=0;const down=constructionColliders(dozer).filter(part=>/blade/i.test(part.part));dozer.construction.blade=1;const up=constructionColliders(dozer).filter(part=>/blade/i.test(part.part));assert.ok(down.length&&up.length,'blade has dedicated physical geometry');assert.ok(bounds(up).min.y>bounds(down).min.y+.9);
 const excavator=machine('excavator','site-excavator',15,20);excavator.construction=initialConstructionState(excavator);const straight=bounds(constructionColliders(excavator));excavator.construction.swing=Math.PI/2;const turned=bounds(constructionColliders(excavator));assert.ok(Math.abs(straight.max.z-turned.max.z)>.5||Math.abs(straight.min.z-turned.min.z)>.5,'upper carriage articulation changes the machine envelope');
 assert.ok([lowered,raised,straight,turned].every(box=>Number.isFinite(box.min.x+box.min.y+box.min.z+box.max.x+box.max.y+box.max.z)));
});

test('continuous machine motion catches a thin barrier between otherwise clear endpoints',()=>{
 const from=machine('dozer','site-bulldozer');from.construction=initialConstructionState(from);const to=structuredClone(from);to.position.z=-20;
 const wall=obstacle('thin-wall',[15,4,.03],[0,2,-10]);
 const hit=constructionMotionBlocked(from,to,[wall]);assert.ok(hit,'a twenty metre travel request cannot tunnel across a thin wall');assert.equal(hit.objectId,'thin-wall');assert.ok(hit.part&&hit.reason);
 const clear=structuredClone(to);clear.position.x=30;const moved=structuredClone(from);moved.position.x=30;assert.equal(constructionMotionBlocked(moved,clear,[wall]),null,'the same unobstructed travel remains available');
});

test('a suspended crane beam cannot slew across an obstruction missed by endpoint-only checks',()=>{
 const from=machine('crane','tower-crane');from.construction={...initialConstructionState(from),slew:0,trolley:20,hoist:12,load:'lifted-beam',loadYaw:0};const to=structuredClone(from);to.construction.slew=Math.PI/2;
 const wall=obstacle('mid-arc-obstacle',[.15,.5,.15],[Math.SQRT1_2*20+6,12-CONSTRUCTION_LOAD_OFFSET+.3,Math.SQRT1_2*20]);
 assert.ok(constructionColliders(from).every(part=>!constructionBoxContact(part,wall)));assert.ok(constructionColliders(to).every(part=>!constructionBoxContact(part,wall)));
 const hit=constructionMotionBlocked(from,to,[wall]);assert.ok(hit,'swept payload collision is checked along the slew arc');assert.equal(hit.objectId,'mid-arc-obstacle');assert.equal(hit.part,'crane-payload');
});

test('earthwork tools can enter designated soil while ordinary walls and the machine running gear remain solid',()=>{
 const excavator=machine('excavator','site-excavator');excavator.construction=initialConstructionState(excavator);const digging=structuredClone(excavator);Object.assign(digging.construction,{boom:.4,stick:-1.5,bucket:1});
 const surface={min:{x:-10,y:-.025,z:-10},max:{x:10,y:.005,z:10}};
 assert.equal(constructionMotionBlocked(excavator,digging,[constructionBoxFromBounds(surface,'construction-excavation-work-area')]),null,'the bucket can scoop through the authored excavation surface');
 assert.equal(constructionMotionBlocked(excavator,digging,[constructionBoxFromBounds(surface,'ordinary-wall')])?.part,'excavator-bucket','the same bucket path hits an ordinary solid of identical dimensions');
 const dozer=machine('dozer','site-bulldozer',0,4);dozer.construction={...initialConstructionState(dozer),blade:0};const advanced=structuredClone(dozer);advanced.position.z=-4;
 const berm={min:{x:-5,y:.2,z:-.2},max:{x:5,y:.8,z:.2}},spoil=constructionBoxFromBounds(berm,'construction-spoil-pad'),wall=constructionBoxFromBounds(berm,'ordinary-wall');
 assert.equal(constructionMotionBlocked(dozer,advanced,[wall])?.part,'dozer-blade','a lowered blade cannot push through an ordinary wall');
 assert.notEqual(constructionMotionBlocked(dozer,advanced,[spoil])?.part,'dozer-blade','the blade can engage designated spoil');
 dozer.construction.blade=advanced.construction.blade=1;
 assert.equal(constructionMotionBlocked(dozer,advanced,[spoil])?.part,'dozer-track','tagging soil never permits tracks to pass through an above-ground obstacle');
});

test('raising a truck body interlocks travel and precision mode reduces requested hydraulic speed',()=>{
 const {sim,board,send,tick}=fixture();board('truck');const truck=sim.actors.truck;truck.construction.bed=.6;
 let instruments=constructionTelemetry(sim,truck,sim.players.operator.lastSeen);assert.equal(instruments.travelAllowed,false);assert.ok(instruments.travelReason||instruments.warning||instruments.status);
 truck.construction.bed=0;instruments=constructionTelemetry(sim,truck,sim.players.operator.lastSeen);assert.equal(instruments.travelAllowed,true);
 board('crane');const crane=sim.actors.crane,start=crane.construction.hoist;send('control',{axes:{hoist:1}});tick();const normalDistance=crane.construction.hoist-start;send('precision',{enabled:true});const second=crane.construction.hoist;send('control',{axes:{hoist:1}});tick();assert.ok(crane.construction.hoist-second>0&&crane.construction.hoist-second<normalDistance*.7);
});

test('a fully framed floor supplies real walking support and overhead collision',()=>{
 const {sim,environment}=fixture(),site=sim.construction;site.tower.placed=4;site.tower.floors=1;ensureConstruction(sim,environment);
 const collision=new ServerBuilderCollision(),floor=collision.groundAt(environment,{x:site.tower.x,y:5,z:site.tower.z},{actors:sim.actors,objects:{}});
 assert.ok(floor&&floor.y>3.5&&floor.y<4.2,'completed deck supports a player above the base floor');
 const landed=collision.resolve(environment,{x:site.tower.x,y:5,z:site.tower.z},{x:site.tower.x,y:3,z:site.tower.z},sim.actors,{});assert.ok(landed.y>3.5,'falling lands on the completed deck');
 assert.ok(collision.blocksShot(environment,{x:site.tower.x,y:3,z:site.tower.z},[0,1,0],3,sim.actors),'the deck has a physical underside');
});

test('an occupied machine remains a solid obstacle for other site workers and ray queries',()=>{
 const {sim,environment,board}=fixture();board('truck');const truck=sim.actors.truck,collision=new ServerBuilderCollision(),point={x:truck.position.x,y:.02,z:truck.position.z};
 assert.equal(collision.hasBodyClearance(environment,point,.38,{actors:sim.actors,objects:{}}),false,'boarding does not remove the truck collider');
 const from={...point,x:point.x-5},moved=collision.resolve(environment,from,point,sim.actors,{});assert.ok(moved.x<point.x-1,'another worker cannot walk into the occupied chassis');
 assert.equal(collision.blocksShot(environment,{...from,y:1},[1,0,0],10,sim.actors),true,'an occupied truck also blocks a line through its chassis');
});

test('each native mobile construction machine starts on clear support and can drive out of its parking place',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'construction-native-clearance-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let now=100000,request=0;const environment=constructionWorld(),runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>now}),identity={accountId:'construction-driver',username:'Driver'};
 const send=(action,fields={})=>runtime.command(environment.id,environment,identity,{action,requestId:'construction-clearance-'+ ++request,...fields});
 let state=await send('join');
 for(const modelId of ['site-dumptruck','site-bulldozer','site-excavator']){
  const actor=Object.values(state.actors).find(candidate=>candidate.modelId===modelId);assert.ok(actor,modelId+' is present');state=await send('map-access',{entityId:actor.id});const before={...state.actors[actor.id].position};
  if(modelId!=='site-dumptruck'){
   const heading=state.actors[actor.id].rotation.y;
   for(let index=0;index<5;index++){now+=100;state=await send('input',{input:{forward:0,side:.35,yaw:heading}});}
   const pivoted=state.actors[actor.id],turn=Math.atan2(Math.sin(pivoted.rotation.y-heading),Math.cos(pivoted.rotation.y-heading));
   assert.ok(Math.hypot(pivoted.position.x-before.x,pivoted.position.z-before.z)<.05,modelId+' pivots without translating its tracked undercarriage');assert.ok(Math.abs(turn)>.02,modelId+' accepts side-only steering through authoritative collision checks');
   state=await send('construction-controls',{operation:'park',entityId:actor.id});
  }
  for(let i=0;i<10;i++){now+=100;state=await send('input',{input:{forward:.35,side:0,yaw:actor.rotation.y}});}
  const after=state.actors[actor.id].position;assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>.1,modelId+' moves from its native position: '+JSON.stringify(state.actors[actor.id].driving));
  await send('construction-controls',{operation:'park',entityId:actor.id});state=await send('interact');assert.equal(state.players['account:construction-driver'].vehicleId,null);
 }
 assert.equal(Object.values(state.actors).some(actor=>actor.resident||actor.roadWorkingAI||actor.id.startsWith('road-working-crew-')),false,'native construction leaves ambient residents and road crews disabled by default');
});

test('construction ambient activity remains disabled by default and explicitly opts into residents and road crews',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'construction-ambient-policy-'));t.after(()=>rm(directory,{recursive:true,force:true}));let now=100000,request=0;
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>now}),identity={accountId:'site-observer',username:'Observer'};
 const base={proceduralLand:true,spawn:{x:15,y:.02,z:0},streets:[{id:'service-road',from:{x:0,y:0,z:-45},to:{x:0,y:0,z:45},width:10}],builderScene:{layout:'grand-floor',mapSize:160,objects:[],layoutMeta:{locations:[{id:'office',name:'Construction office',x:20,z:0},{id:'storage',name:'Equipment store',x:20,z:30}]}}};
 const send=(environment,action,fields={})=>runtime.command(environment.id,environment,identity,{action,requestId:'ambient-policy-'+ ++request,...fields});
 for(const enabled of [false,true]){
  const environment={...structuredClone(base),id:'construction-ambient-'+enabled,construction:{enabled:true,...(enabled?{ambientActivity:true}:{})}};
  await send(environment,'join');let state;
  for(let index=0;index<3;index++){now+=200;state=await send(environment,'input',{input:{}});}
  const residents=Object.values(state.actors).filter(actor=>actor.resident),crews=Object.values(state.actors).filter(actor=>actor.roadWorkingAI||actor.id.startsWith('road-working-crew-'));
  assert.equal(residents.length>0,enabled,'resident generation follows explicit construction ambient opt-in');assert.equal(crews.length>0,enabled,'working road crews follow the same opt-in');
 }
});

test('the native excavator completes its dig cycle against authored soil and synchronizes its real payload',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'construction-native-dig-'));t.after(()=>rm(directory,{recursive:true,force:true}));let now=100000,request=0;
 const environment=constructionWorld(),runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>now}),identity={accountId:'native-excavator',username:'Excavator operator'};
 const send=(action,fields={})=>runtime.command(environment.id,environment,identity,{action,requestId:'native-dig-'+ ++request,...fields});
 let state=await send('join');const actor=Object.values(state.actors).find(candidate=>candidate.modelId==='site-excavator');assert.ok(actor);await send('map-access',{entityId:actor.id});state=await send('construction-controls',{operation:'work',entityId:actor.id});
 const duration=state.actors[actor.id].construction.workCycle.duration;assert.ok(duration>=3000,'a real hydraulic cycle has begun');
 for(let index=0;index<Math.ceil(duration/100)+3;index++){now+=100;state=await send('input',{input:{}});}
 const machineState=state.actors[actor.id].construction;
 assert.equal(machineState.workCycle,undefined,'the cycle completes within its accepted simulation duration');assert.equal(machineState.load,2);assert.equal(state.construction.excavation.volume,2);assert.ok(state.construction.excavation.depth>0);assert.equal(!!machineState.blocked,false,'the authored soil pad does not obstruct the bucket');
 assert.equal(Object.values(state.actors).some(candidate=>candidate.resident||candidate.roadWorkingAI||candidate.id.startsWith('road-working-crew-')),false,'ambient tasks do not enter the working cut during the default cycle');
});
