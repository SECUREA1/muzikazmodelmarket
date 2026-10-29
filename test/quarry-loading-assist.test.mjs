import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureConstruction,constructionCommand,stepConstruction,constructionCrewSetOperator} from '../server-construction.mjs';
import {EARTH_MATERIALS,earthCargoVolume,earthworksTake,earthworksDeposit} from '../public/js/construction-earthworks.js';

const machine=(id,modelId,x,z)=>({id,modelId,position:{x,y:0,z},rotation:{x:0,y:0,z:0},active:true,health:100,driving:{speed:0,parked:true}});
function fixture(){
 const sim={actors:{excavator:machine('excavator','site-excavator',0,0),truck:machine('truck','site-dumptruck',5,0)},players:{},events:[],sequence:1};
 ensureConstruction(sim,{construction:{enabled:true,steelEnabled:false,excavation:{x:.7,z:-3.69,width:6,depth:6,maxDepth:1},stockpile:{x:20,z:0,width:10,depth:10}}});
 const player={actorId:'operator',vehicleId:'excavator',health:100,lastSeen:1000,position:{x:0,y:0,z:0},input:{}};sim.players.operator=player;sim.actors.excavator.holderId=player.actorId;
 let now=1000;const context={};
 const send=(operation,fields={})=>constructionCommand(sim,player,{operation,...fields},now,context);
 const tick=(count=1)=>{for(let i=0;i<count;i++){now+=100;player.lastSeen=now;stepConstruction(sim,now,.1,context);}};
 return {sim,player,context,send,tick,get now(){return now;},get state(){return sim.actors.excavator.construction;}};
}
function mass(sim){let total=0;for(const patch of sim.construction.earthworks.patches)for(const key of EARTH_MATERIALS)total+=(key==='soil'||key==='gravel'?patch[key]:patch.products?.[key]||[]).reduce((a,b)=>a+b,0);for(const actor of Object.values(sim.actors))total+=earthCargoVolume(actor.construction?.cargo);return total;}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' versus '+b);
test('automatic scoop/load repeats real hydraulic transfers and stops on a depleted reachable face',()=>{
 const f=fixture(),before=mass(f.sim);f.send('repeat-work',{enabled:true});const first=f.state.workCycle;f.send('repeat-work',{enabled:true});assert.equal(f.state.workCycle,first,'idempotent enable does not restart the accepted cycle');
 for(let i=0;i<1600&&f.state.repeatWork;i++)f.tick();
 assert.equal(f.state.repeatWork,false);assert.ok(f.sim.actors.truck.construction.load>2,'more than one actual bucket reaches the real truck');assert.ok(!f.state.workCycle);close(mass(f.sim),before);
 assert.ok(f.state.repeatStatus);assert.ok(!f.sim.actors.truck.construction.cargo.sand,'raw source identity is retained');
});
test('automatic loading refuses missing/full/moving receivers and non-excavator controls',()=>{
 const f=fixture(),before=mass(f.sim);f.sim.actors.truck.position.x=30;assert.throws(()=>f.send('repeat-work',{enabled:true}),/receiving truck|within reach/);f.sim.actors.truck.position.x=5;f.sim.actors.truck.driving.speed=1;assert.throws(()=>f.send('repeat-work',{enabled:true}),/receiving truck/);f.sim.actors.truck.driving.speed=0;f.sim.actors.truck.construction.load=40;assert.throws(()=>f.send('repeat-work',{enabled:true}),/receiving truck/);f.sim.actors.truck.construction.load=0;
 f.player.vehicleId='truck';f.sim.actors.truck.holderId=f.player.actorId;f.player.position={...f.sim.actors.truck.position};assert.throws(()=>f.send('repeat-work',{enabled:true}),/available operation/);close(mass(f.sim),before);
});
for(const stop of ['park','manual','drive','exit','dead','moved-truck','inactive'])test('automatic unfinished excavation is cancelled safely by '+stop,()=>{
 const f=fixture(),before=mass(f.sim);f.send('repeat-work',{enabled:true});f.tick(5);const terrain=JSON.stringify(f.sim.construction.earthworks);
 if(stop==='park')f.send('park');
 if(stop==='manual')f.send('control',{axes:{boom:1}});
 if(stop==='drive')f.player.input={forward:1};
 if(stop==='exit'){f.sim.actors.excavator.holderId=null;f.player.vehicleId=null;}
 if(stop==='dead')f.player.health=0;
 if(stop==='moved-truck')f.sim.actors.truck.position.x=30;
 if(stop==='inactive')f.sim.actors.excavator.active=false;
 f.tick();if(stop==='manual')assert.equal(f.state.axes.boom,1,'the first manual demand immediately takes over');assert.equal(f.state.repeatWork,false);assert.equal(f.state.workCycle,undefined);assert.equal(JSON.stringify(f.sim.construction.earthworks),terrain);close(mass(f.sim),before);
});
test('real hydraulic collisions cancel auto loading with no material credited',()=>{
 const f=fixture(),before=mass(f.sim);f.sim.actors.roof={id:'blocking-roof',position:{x:.7,y:1,z:-3},rotation:{y:0},active:true,constructionStructure:{kind:'roof',size:{x:4,y:.2,z:3}}};f.send('repeat-work',{enabled:true});for(let i=0;i<100&&f.state.repeatWork;i++)f.tick();assert.equal(f.state.repeatWork,false);assert.ok(f.state.blocked);close(f.state.load,0);close(f.sim.actors.truck.construction.load,0);close(mass(f.sim),before);
});
test('explicit assist stop cancels without creating cargo and later manual Work remains available',()=>{
 const f=fixture(),before=mass(f.sim);f.send('repeat-work',{enabled:true});f.tick(5);f.send('repeat-work',{enabled:false});assert.equal(f.state.repeatWork,false);assert.equal(f.state.workCycle,undefined);f.send('work');for(let i=0;i<100&&f.state.workCycle;i++)f.tick();assert.ok(f.state.load>0);close(mass(f.sim),before);
});

test('a final real bucket fills the truck to its physical capacity and then stops automatic loading',()=>{
 const f=fixture(),e=f.sim.construction.earthworks;earthworksDeposit(e,{x:20,y:Infinity,z:0},{stone:38},{radius:4,maxHeight:2});const cargo=earthworksTake(e,{x:20,y:Infinity,z:0},38,{radius:4,looseOnly:true,materials:['stone']});f.sim.actors.truck.construction.cargo=cargo;f.sim.actors.truck.construction.load=earthCargoVolume(cargo);assert.equal(f.sim.actors.truck.construction.load,38);const before=mass(f.sim);
 f.send('repeat-work',{enabled:true});for(let i=0;i<400&&f.state.repeatWork;i++)f.tick();assert.equal(f.state.repeatWork,false);assert.equal(f.state.workCycle,undefined);close(f.sim.actors.truck.construction.load,40);close(mass(f.sim),before);assert.equal(f.sim.actors.truck.construction.cargo.stone,38);
});

test('a delayed operator heartbeat pauses armed loading without work, resumes on fresh proof, and expires after disconnect',()=>{
 const f=fixture(),before=mass(f.sim);f.send('repeat-work',{enabled:true});f.tick(5);const elapsed=f.state.workCycle.elapsed,terrain=JSON.stringify(f.sim.construction.earthworks),pose=[f.state.boom,f.state.stick,f.state.bucket,f.state.swing],staleAt=f.now+1200;
 stepConstruction(f.sim,staleAt,.1,f.context);stepConstruction(f.sim,staleAt+2000,.25,f.context);assert.equal(f.state.repeatWork,true);assert.equal(f.state.workCycle.elapsed,elapsed);assert.equal(f.state.workCycle.paused,true);assert.deepEqual([f.state.boom,f.state.stick,f.state.bucket,f.state.swing],pose);assert.match(f.state.repeatStatus,/paused.*connection/);assert.equal(JSON.stringify(f.sim.construction.earthworks),terrain);close(mass(f.sim),before);
 const freshAt=staleAt+2200;f.player.lastSeen=freshAt;stepConstruction(f.sim,freshAt,.1,f.context);assert.equal(f.state.repeatWork,true);assert.ok(f.state.workCycle.elapsed>elapsed);assert.equal(f.state.workCycle.paused,false);assert.match(f.state.repeatStatus,/resumed/);close(mass(f.sim),before);
 stepConstruction(f.sim,freshAt+16000,.25,f.context);assert.equal(f.state.repeatWork,false);assert.equal(f.state.workCycle,undefined);assert.equal(JSON.stringify(f.sim.construction.earthworks),terrain);close(mass(f.sim),before);
});
