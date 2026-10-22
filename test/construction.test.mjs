import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {ensureConstruction,constructionCommand,stepConstruction,constructionView} from '../server-construction.mjs';
import {craneHookPosition,constructionTarget,isConstructionMachine,CONSTRUCTION_LOAD_OFFSET} from '../public/js/construction-state.js';

const machine=(id,modelId,x,z)=>({id,modelId,position:{x,y:0,z},rotation:{x:0,y:0,z:0},active:true,health:100,driving:{speed:0,parked:true}});
function fixture(){
 const actors={crane:machine('crane','tower-crane',-18,-4),truck:machine('truck','site-dumptruck',25,24),dozer:machine('dozer','site-bulldozer',29,28),excavator:machine('excavator','site-excavator',25,17)};
 const sim={actors,players:{},events:[],sequence:1};ensureConstruction(sim,{construction:{enabled:true}});
 const player={actorId:'alice',vehicleId:'crane',health:100,lastSeen:1000,position:{...actors.crane.position},input:{}};sim.players.alice=player;actors.crane.holderId='alice';
 const board=id=>{if(player.vehicleId)actors[player.vehicleId].holderId=null;player.vehicleId=id;player.position={...actors[id].position};actors[id].holderId=player.actorId;};
 const send=(operation,fields={})=>constructionCommand(sim,player,{operation,...fields},player.lastSeen);
 const tick=(count=1)=>{for(let index=0;index<count;index++){player.lastSeen+=100;stepConstruction(sim,player.lastSeen,.1);}};
 const finish=()=>{let count=0;while(actors[player.vehicleId]?.construction.workCycle&&count++<200)tick();assert.ok(count<200,'hydraulic cycle completes within its bounded work duration: '+JSON.stringify(actors[player.vehicleId]?.construction.blocked));return count;};
 return {sim,actors,player,board,send,tick,finish};
}
test('crane attaches, lifts, slews and secures an authoritative tower beam; every four beams completes a floor',()=>{
 const {sim,actors,send,tick}=fixture(),crane=actors.crane;
 const beamCount=constructionView(sim).beams.length;assert.equal(beamCount,6);assert.equal(sim.construction.tower.target.y,4);
 send('attach');const beam=sim.actors[crane.construction.load];assert.equal(beam.constructionBeam.state,'attached');
 send('aim-target');let maximumHeight=0;for(let index=0;index<200&&crane.construction.assist;index++){tick();maximumHeight=Math.max(maximumHeight,crane.construction.hoist);}
 const target=sim.construction.tower.target,hook=craneHookPosition(crane);assert.ok(maximumHeight>=9);assert.ok(Math.hypot(target.x-hook.x,target.z-hook.z)<.2);assert.ok(Math.abs(hook.y-target.y-CONSTRUCTION_LOAD_OFFSET)<.2);
 send('release');assert.equal(beam.constructionBeam.state,'placed');assert.equal(sim.construction.tower.placed,1);assert.equal(sim.construction.tower.floors,0);assert.equal(crane.construction.load,null);
 for(let index=1;index<4;index++){send('aim-supply');for(let step=0;step<300&&crane.construction.assist;step++)tick();send('attach');send('aim-target');for(let step=0;step<300&&crane.construction.assist;step++)tick();send('release');}
 assert.equal(sim.construction.tower.floors,1);assert.equal(sim.construction.tower.target.y,8);assert.equal(Object.values(sim.actors).filter(a=>a.constructionBeam?.state==='placed').length,4);
 assert.equal(constructionTarget(sim.construction.tower,0).yaw,0);assert.equal(constructionTarget(sim.construction.tower,1).yaw,Math.PI/2);
});
test('crane validates reach, prevents duplicate loads, rejects another operator and neutralizes stale hydraulic input',()=>{
 const {sim,actors,player,send,tick}=fixture(),crane=actors.crane;
 assert.throws(()=>send('control',{entityId:'truck',axes:{hoist:1}}),/another machine/);
 assert.throws(()=>send('control',{axes:[]}),/valid hydraulic/);
 send('control',{axes:{hoist:999,trolley:999,slew:Infinity}});assert.equal(crane.construction.axes.hoist,1);assert.equal(crane.construction.axes.slew,0);tick(2);const raised=crane.construction.hoist;tick(8);assert.ok(crane.construction.hoist-raised<=2);const stopped=crane.construction.hoist;tick(10);assert.equal(crane.construction.hoist,stopped);
 assert.throws(()=>send('attach'),/Lower.*hook/);send('aim-supply');for(let index=0;index<200&&crane.construction.assist;index++)tick();send('attach');assert.throws(()=>send('attach'),/Release the attached/);
 const before=crane.construction.hoist;send('control',{axes:{hoist:1}});crane.holderId='bob';tick(2);assert.equal(crane.construction.hoist,before);assert.throws(()=>send('park'),/Enter an available/);crane.holderId=player.actorId;
 player.position.x+=20;assert.throws(()=>send('park'),/operator station/);
});
test('a crane can assemble the entire 64-beam skyscraper through the highest floor and stops offering targets at completion',()=>{
 const {sim,actors,send,tick}=fixture(),crane=actors.crane;
 for(let index=0;index<64;index++){
  if(index){send('aim-supply');for(let step=0;step<2000&&crane.construction.assist;step++)tick();assert.equal(crane.construction.assist,null,'supply alignment '+index);}
  send('attach');send('aim-target');for(let step=0;step<2000&&crane.construction.assist;step++)tick();assert.equal(crane.construction.assist,null,'tower alignment '+index);send('release');assert.equal(sim.construction.tower.placed,index+1);
 }
 assert.equal(sim.construction.tower.floors,16);assert.equal(sim.construction.tower.target,null);assert.equal(Object.values(sim.actors).filter(actor=>actor.constructionBeam?.state==='placed'&&actor.position.y===64).length,4);assert.throws(()=>send('aim-target'),/already complete/);
});
test('parking and losing a crane operator hold the suspended steel safely for the next operator',()=>{
 const {sim,actors,player,send,tick}=fixture(),crane=actors.crane;send('attach');send('control',{axes:{hoist:1}});tick(2);send('park');const load=crane.construction.load,position={...sim.actors[load].position};tick(30);
 assert.equal(crane.construction.load,load);assert.deepEqual(sim.actors[load].position,position);assert.equal(sim.actors[load].constructionBeam.state,'attached');
 player.vehicleId=null;crane.holderId=null;stepConstruction(sim,player.lastSeen+16000,.1);assert.deepEqual(sim.actors[load].position,position);assert.equal(crane.construction.load,load);
 const next={actorId:'bob',vehicleId:'crane',health:100,lastSeen:player.lastSeen+16000,position:{...crane.position}};sim.players.bob=next;crane.holderId='bob';assert.match(constructionCommand(sim,next,{operation:'aim-target'},next.lastSeen),/engaged/);
});
test('excavator loads a nearby truck, truck transports spoil to stockpile and bulldozer grades with synchronized work cycles',()=>{
 const {sim,actors,board,send,tick,finish}=fixture();actors.truck.position={x:30,y:0,z:17};board('excavator');send('work');assert.throws(()=>send('work'),/current hydraulic/);assert.ok(finish()>=35);
 assert.equal(actors.excavator.construction.load,2);assert.equal(sim.construction.excavation.volume,2);assert.ok(sim.construction.excavation.depth>0);
 send('work');finish();assert.equal(actors.excavator.construction.load,0);assert.equal(actors.truck.construction.load,2);
 board('truck');actors.truck.position={x:30,y:0,z:33};sim.players.alice.position={...actors.truck.position};send('work');assert.ok(finish()>=40);assert.equal(actors.truck.construction.load,0);assert.equal(sim.construction.stockpile.volume,2);assert.equal(actors.truck.construction.bed,0);
 actors.dozer.position={x:36,y:0,z:39};board('dozer');send('work');assert.ok(finish()>=27);assert.equal(sim.construction.graded,10);assert.equal(actors.dozer.construction.blade,1);
});
test('parking, leaving the operator station and manual override cancel a cycle without creating or losing soil',()=>{
 const {sim,actors,player,board,send,tick,finish}=fixture();actors.truck.position={x:30,y:0,z:17};board('excavator');send('work');tick(5);send('park');tick(30);assert.equal(sim.construction.excavation.volume,0);assert.equal(actors.excavator.construction.workCycle,undefined);
 send('work');tick(5);send('control',{axes:{boom:1}});tick(30);assert.equal(sim.construction.excavation.volume,0);
 send('work');tick(5);const elapsed=actors.excavator.construction.workCycle.elapsed;stepConstruction(sim,player.lastSeen+2000,.1);assert.equal(actors.excavator.construction.workCycle.paused,true);assert.equal(actors.excavator.construction.workCycle.elapsed,elapsed);assert.equal(sim.construction.excavation.volume,0);send('park');tick(30);assert.equal(sim.construction.excavation.volume,0);
 send('work');finish();assert.equal(actors.excavator.construction.load,2);send('work');tick(5);send('park');tick(30);assert.equal(actors.excavator.construction.load,2);assert.equal(actors.truck.construction.load,0);
 send('work');actors.truck.position.x+=30;finish();assert.equal(actors.excavator.construction.load,2);assert.equal(actors.truck.construction.load,0);
});
test('delayed input pauses a seated operator cycle without awarding work, resumes on fresh input, and expires after room presence ends',()=>{
 const {sim,actors,player,board,send,tick,finish}=fixture();board('excavator');send('work');tick(5);const elapsed=actors.excavator.construction.workCycle.elapsed;
 stepConstruction(sim,player.lastSeen+1800,.2);assert.equal(actors.excavator.construction.workCycle.elapsed,elapsed);assert.equal(actors.excavator.construction.workCycle.paused,true);assert.equal(actors.excavator.construction.load,0);assert.equal(sim.construction.excavation.volume,0);assert.equal(actors.excavator.construction.telemetry.blockedPart,'operator-link');
 player.lastSeen+=1900;finish();assert.equal(actors.excavator.construction.load,2);assert.equal(sim.construction.excavation.volume,2);
 actors.excavator.construction.load=0;send('work');tick(5);stepConstruction(sim,player.lastSeen+16000,.2);assert.equal(actors.excavator.construction.workCycle,undefined);assert.equal(sim.construction.excavation.volume,2);
});
test('shared room exposes machines and steel, enforces exclusive boarding, and preserves construction progress across reconnect',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'construction-room-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000,sequence=0;
 const roomPath=join(dir,'rooms.json'),runtime=new AuthoritativeRooms({store:new SharedRoomStore(roomPath),now:()=>now});
 const world={id:'skyscraper-construction',name:'Skyscraper Construction',proceduralLand:true,spawn:{x:-20,y:0,z:20},construction:{enabled:true},builderScene:{layout:'grand-floor',mapSize:160,objects:[machine('crane','tower-crane',-18,-4),machine('truck','site-dumptruck',25,24),machine('dozer','site-bulldozer',29,28),machine('excavator','site-excavator',25,17)].map(actor=>({...actor,behavior:'vehicle',asset:{buildAssetId:actor.modelId,type:'vehicles'}}))}};
 const alice={accountId:'alice',username:'Alice'},bob={accountId:'bob',username:'Bob'},send=(who,action,fields={})=>runtime.command(world.id,world,who,{action,requestId:'build-'+ ++sequence,...fields});
 let state=await send(alice,'join');assert.equal(Object.values(state.actors).filter(isConstructionMachine).length,4);assert.equal(state.construction.beams.length,6);assert.equal(state.radTox,null);await send(bob,'join');
 state=await send(alice,'map-access',{entityId:'crane'});assert.equal(state.players['account:alice'].vehicleId,'crane');await assert.rejects(send(bob,'map-access',{entityId:'crane'}),/Another player/);
 state=await send(alice,'construction-controls',{entityId:'crane',operation:'attach'});assert.ok(state.actors.crane.construction.load);
 await send(alice,'construction-controls',{operation:'aim-target'});for(let i=0;i<180;i++){now+=100;state=await send(alice,'input',{input:{}});if(!state.actors.crane.construction.assist)break;}
 state=await send(alice,'construction-controls',{operation:'release'});assert.equal(state.construction.tower.placed,1);
 await send(alice,'construction-controls',{operation:'park'});state=await send(alice,'interact');assert.equal(state.players['account:alice'].vehicleId,null);assert.equal(state.actors.crane.holderId,null);
 state=await send(alice,'join');assert.equal(state.construction.tower.placed,1);assert.equal(state.construction.beams.filter(beam=>beam.state==='placed').length,1);
 const reloaded=new AuthoritativeRooms({store:new SharedRoomStore(roomPath),now:()=>now});state=await reloaded.command(world.id,world,alice,{action:'join',requestId:'server-restart'});assert.equal(state.construction.tower.placed,1);assert.equal(state.construction.beams.filter(beam=>beam.state==='placed').length,1);
 state=await send(alice,'map-access',{entityId:'excavator'});await send(alice,'construction-controls',{operation:'control',axes:{boom:1}});now+=150;await send(alice,'input',{input:{}});await send(alice,'construction-controls',{operation:'control',axes:{}});await send(alice,'construction-controls',{operation:'work'});
 const cycleStarted=now;for(let index=0;index<100;index++){now+=100;state=await send(alice,'input',{input:{}});if(!state.actors.excavator.construction.workCycle)break;}assert.ok(now-cycleStarted>=3500&&now-cycleStarted<=10000);
 assert.equal(state.construction.excavation.volume,2);assert.equal(state.actors.excavator.construction.load,2);
});
