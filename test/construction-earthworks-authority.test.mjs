import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureConstruction,constructionCommand,constructionCrewSetOperator,constructionCrewCommand,stepConstruction} from '../server-construction.mjs';
import {earthCargoVolume,earthworksSurfaceAt} from '../public/js/construction-earthworks.js';
import {constructionJointPose} from '../public/js/construction-kinematics.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';

const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} versus ${b}`);
const machine=(id,modelId,x,z)=>({id,modelId,position:{x,y:0,z},rotation:{x:0,y:0,z:0},active:true,health:100,driving:{speed:0,parked:true}});
function fixture(config={}){
 const actors={excavator:machine('excavator','site-excavator',0,0),truck:machine('truck','site-dumptruck',20,-4),dozer:machine('dozer','site-bulldozer',40,0)},sim={actors,players:{},events:[],sequence:1};
 ensureConstruction(sim,{construction:{enabled:true,excavation:{x:.7,z:-3.69,width:2,depth:2,radius:1,maxDepth:.25},stockpile:{x:20,z:0,width:8,depth:8},...config}});
 const player={actorId:'alice',vehicleId:null,health:100,lastSeen:1000,position:{x:0,y:0,z:0},input:{}};sim.players.alice=player;
 const board=id=>{if(player.vehicleId)actors[player.vehicleId].holderId=null;player.vehicleId=id;player.position={...actors[id].position};actors[id].holderId=player.actorId;};
 const send=(operation,fields={})=>constructionCommand(sim,player,{operation,...fields},player.lastSeen);
 const tick=(count=1)=>{for(let i=0;i<count;i++){player.lastSeen+=100;stepConstruction(sim,player.lastSeen,.1);}};
 const finish=()=>{for(let i=0;i<200&&actors[player.vehicleId]?.construction.workCycle;i++)tick();assert.ok(!actors[player.vehicleId]?.construction.workCycle,'accepted work completes within its bounded duration');};
 const move=(id,x,z)=>{actors[id].position={x,y:0,z};if(player.vehicleId===id)player.position={...actors[id].position};};
 return {actors,sim,player,board,send,tick,finish,move};
}
function ledger(sim){let soil=0,gravel=0;for(const patch of sim.construction.earthworks.patches)for(let i=0;i<patch.heights.length;i++){soil+=patch.soil[i];gravel+=patch.gravel[i];}for(const actor of Object.values(sim.actors)){soil+=actor.construction?.cargo?.soil||0;gravel+=actor.construction?.cargo?.gravel||0;}return {soil,gravel};}
function conserved(sim,initial,label){const current=ledger(sim);close(current.soil,initial.soil,label+' soil');close(current.gravel,initial.gravel,label+' gravel');}

test('a real excavator cycle can only scoop the finite material reached by its actual bucket',()=>{
 const f=fixture(),initial=ledger(f.sim);f.board('excavator');f.send('work');f.finish();
 assert.deepEqual(f.actors.excavator.construction.cargo,{soil:1,gravel:0});close(f.actors.excavator.construction.load,1,'last partial bucket');close(earthworksSurfaceAt(f.sim.construction.earthworks,{x:.7,z:-3.69}).y,-.25,'actual cut floor');conserved(f.sim,initial,'finished excavation');
 f.move('excavator',100,100);const retained=structuredClone(f.actors.excavator.construction.cargo);assert.throws(()=>f.send('empty'),/bucket|receiving|patch|position/i);assert.deepEqual(f.actors.excavator.construction.cargo,retained,'offsite bucket opening retains all material');
 const tip=constructionJointPose(f.actors.excavator).bucketTip;f.move('excavator',f.actors.excavator.position.x+20-tip.x,f.actors.excavator.position.z-tip.z);f.send('empty');close(f.actors.excavator.construction.load,0,'bucket emptied over real fill');conserved(f.sim,initial,'bucket discharge');
 f.move('excavator',0,0);assert.throws(()=>f.send('work'),/No reachable|unworked|lower/i);conserved(f.sim,initial,'exhausted source rejects further awards');
});

test('the mechanical soil to truck to fill chain preserves mixed cargo identity and changes receiving ground',()=>{
 const f=fixture({excavation:{x:.7,z:-3.69,width:2,depth:2,radius:1,maxDepth:.5,material:'gravel',height:.25}}),initial=ledger(f.sim);f.board('excavator');f.send('work');f.finish();
 const cargo=structuredClone(f.actors.excavator.construction.cargo);assert.ok(cargo.gravel>0,'the bucket really contains the upper gravel layer');assert.ok(cargo.soil>0,'the bucket also cuts underlying native soil');
 f.move('truck',5,0);f.send('work');f.finish();close(f.actors.excavator.construction.load,0,'excavator discharges through the receiving bed envelope');assert.deepEqual(f.actors.truck.construction.cargo,cargo);conserved(f.sim,initial,'bucket to truck');
 f.move('truck',20,-4);f.board('truck');const before=f.sim.construction.earthworks.patches.find(p=>p.id==='spoil').heights.slice();f.send('work');f.finish();close(f.actors.truck.construction.load,0,'rear outlet unloads at fill');assert.ok(f.sim.construction.earthworks.patches.find(p=>p.id==='spoil').heights.some((height,i)=>height>before[i]),'real material raises receiving cells');conserved(f.sim,initial,'truck to fill');
});

test('an empty dozer or an off-patch truck cannot create grading or fill material',()=>{
 const f=fixture(),initial=ledger(f.sim);f.board('dozer');assert.throws(()=>f.send('work'),/material|soil|gravel|blade/i);f.tick(40);assert.equal(f.sim.construction.graded,0);conserved(f.sim,initial,'no-material grading');
 f.board('excavator');f.send('work');f.finish();f.move('truck',5,0);f.send('work');f.finish();f.board('truck');f.move('truck',100,100);const cargo=structuredClone(f.actors.truck.construction.cargo);assert.throws(()=>f.send('work'),/rear discharge|patch|stockpile|fill/i);f.send('control',{axes:{bed:1}});for(let i=0;i<15;i++){f.send('control',{axes:{bed:1}});f.tick();}assert.deepEqual(f.actors.truck.construction.cargo,cargo,'even manual raised-body discharge retains cargo when no surface can receive it');conserved(f.sim,initial,'invalid tipping location');
});

test('manual bucket curl collects only contact material and an explicit empty action deposits at its current tip',()=>{
 const f=fixture(),initial=ledger(f.sim);f.board('excavator');Object.assign(f.actors.excavator.construction,{boom:.4,stick:-1.5,bucket:1});
 f.send('control',{axes:{bucket:-1}});f.tick();const collected=f.actors.excavator.construction.load;assert.ok(collected>0&&collected<=.4+1e-8,'one real contact frame fills only its bounded scoop rate');conserved(f.sim,initial,'manual contact scoop');f.send('control',{axes:{}});
 const tip=constructionJointPose(f.actors.excavator).bucketTip;f.move('excavator',20-tip.x,-tip.z);f.actors.excavator.position.y=3;f.player.position={...f.actors.excavator.position};f.send('empty');close(f.actors.excavator.construction.load,0,'tip over receiver empties the actual cargo');conserved(f.sim,initial,'manual explicit discharge');
});

test('cancelling, losing the input heartbeat or releasing a crew lease never advances unfinished excavation',()=>{
 const f=fixture(),initial=ledger(f.sim);f.board('excavator');f.send('work');f.tick(5);const terrain=structuredClone(f.sim.construction.earthworks);f.send('park');f.tick(40);assert.deepEqual(f.sim.construction.earthworks,terrain);conserved(f.sim,initial,'parked cycle');
 f.send('work');f.tick(5);const elapsed=f.actors.excavator.construction.workCycle.elapsed;stepConstruction(f.sim,f.player.lastSeen+1500,.1);assert.equal(f.actors.excavator.construction.workCycle.elapsed,elapsed);assert.equal(f.actors.excavator.construction.workCycle.paused,true);conserved(f.sim,initial,'stale human input');
 f.send('park');f.actors.excavator.holderId=null;f.player.vehicleId=null;constructionCrewSetOperator(f.sim,'excavator','worker-1',f.player.lastSeen);constructionCrewCommand(f.sim,'excavator','worker-1',{operation:'work'},f.player.lastSeen);stepConstruction(f.sim,f.player.lastSeen+100,.1);constructionCrewSetOperator(f.sim,'excavator',null,f.player.lastSeen+100);stepConstruction(f.sim,f.player.lastSeen+200,.1);assert.equal(f.actors.excavator.construction.workCycle,undefined);assert.deepEqual(f.actors.excavator.construction.axes,{});conserved(f.sim,initial,'released crew cycle');
});

test('trusted AI operators share hydraulic work, expire safely, and immediately yield control to seated humans',()=>{
 const f=fixture(),initial=ledger(f.sim);let now=f.player.lastSeen;constructionCrewSetOperator(f.sim,'excavator','worker-1',now);assert.throws(()=>constructionCrewSetOperator(f.sim,'excavator','worker-2',now),/Another crew/i);assert.throws(()=>constructionCrewCommand(f.sim,'excavator','worker-2',{operation:'work'},now),/lease/i);
 constructionCrewCommand(f.sim,'excavator','worker-1',{operation:'work'},now);stepConstruction(f.sim,now+100,.1);assert.ok(f.actors.excavator.construction.workCycle.elapsed>0);stepConstruction(f.sim,now+1600,.1);assert.equal(f.actors.excavator.construction.workCycle,undefined,'lease expiry stops unfinished hydraulics');conserved(f.sim,initial,'expired AI lease');
 constructionCrewSetOperator(f.sim,'excavator','worker-1',now+1700);constructionCrewCommand(f.sim,'excavator','worker-1',{operation:'work'},now+1700);f.player.lastSeen=now+1800;f.board('excavator');f.send('park');assert.equal(f.actors.excavator.construction.crewOperator,undefined);assert.throws(()=>constructionCrewSetOperator(f.sim,'excavator','worker-1',f.player.lastSeen),/human/i);assert.throws(()=>constructionCrewCommand(f.sim,'excavator','worker-1',{operation:'work'},f.player.lastSeen),/lease/i);conserved(f.sim,initial,'human takeover');
 f.send('work');f.finish();assert.equal(f.actors.excavator.construction.load,1,'the human can operate the same machine normally after taking over');conserved(f.sim,initial,'human completed work');
});

for(const deployed of [false,true])test(`a ${deployed?'player-placed':'map-authored'} roof in the real bucket drop path retains cargo instead of depositing through the solid`,()=>{
 const f=fixture(),initial=ledger(f.sim);f.board('excavator');f.send('work');f.finish();const tip=constructionJointPose(f.actors.excavator).bucketTip;f.move('excavator',20-tip.x,-tip.z);f.actors.truck.active=false;f.actors.dozer.active=false;
 const cover={id:'soil-cover',modelId:'material:cube',position:{x:20,y:1,z:0},rotation:{x:0,y:0,z:0},scale:{x:4/1.2,y:.2/1.2,z:4/1.2}},environment={id:'soil-drop-cover-'+deployed,proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:80,objects:deployed?[]:[cover]}},objects=deployed?{'soil-cover':{id:'soil-cover',revision:1,materialId:'cube',position:[20,1,0],rotation:[0,0,0],scale:[4/1.2,.2/1.2,4/1.2]}}:{},context={environment,objects,collision:new ServerBuilderCollision(),earthworks:f.sim.construction.earthworks};
 const before=structuredClone(f.actors.excavator.construction.cargo),terrain=structuredClone(f.sim.construction.earthworks);assert.throws(()=>constructionCommand(f.sim,f.player,{operation:'empty'},f.player.lastSeen,context),/bucket|receiving|position|space/i);assert.deepEqual(f.actors.excavator.construction.cargo,before);assert.deepEqual(f.sim.construction.earthworks,terrain);conserved(f.sim,initial,'blocked material drop');
 constructionCommand(f.sim,f.player,{operation:'empty'},f.player.lastSeen,{...context,collision:new ServerBuilderCollision(),environment:{...environment,id:environment.id+'-clear',builderScene:{...environment.builderScene,objects:[]}},objects:{}});assert.equal(f.actors.excavator.construction.load,0,'removing that roof makes the same actual discharge succeed');conserved(f.sim,initial,'cleared material drop');
});

test('late AI lease cleanup cannot neutralize a seated human work command or travel demand',()=>{
 const f=fixture();f.board('excavator');f.send('control',{axes:{boom:1}});const actor=f.actors.excavator;actor.driving={speed:.2,throttle:.4,steering:.1,parked:false};const before=structuredClone(actor.construction.axes),driving=structuredClone(actor.driving);
 assert.equal(constructionCrewSetOperator(f.sim,'excavator',null,f.player.lastSeen),false);assert.deepEqual(actor.construction.axes,before);assert.deepEqual(actor.driving,driving);assert.equal(actor.holderId,f.player.actorId);
});
