import test from 'node:test';
import {sharedNearbyActions} from '../public/js/gameplay-actions.js';
import {constructionAccessPoint} from '../public/js/construction-access.js';
import {stepConstructionCrew} from '../server-construction-crew.mjs';
import {memberPlotEnvironment} from '../member-plots.mjs';
import assert from 'node:assert/strict';
import {quarryWorld} from '../quarry-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {quarryCommand,stepQuarry,quarryMass,quarryDeedCommand} from '../server-quarry.mjs';
import {earthworksTake,earthworksDeposit,earthworksSurfaceAt,earthCargoVolume} from '../public/js/construction-earthworks.js';
import {constructionCommand,stepConstruction} from '../server-construction.mjs';
import {constructionGroundAt} from '../public/js/construction-collision.js';
import {stepRoadVehicle} from '../public/js/road-vehicles.js';
import {editableMapScene} from '../public/js/editable-map-import.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' versus '+b);
function fixture(){
 let now=1000;const environment=quarryWorld(),runtime=new AuthoritativeRooms({now:()=>now}),room={objects:{}},sim=runtime.initialize(room,environment).sim;
 sim.construction.crew.enabled=false;const player={actorId:'operator',id:'operator',health:100,lastSeen:now,position:{x:80,y:0,z:-25},input:{}};sim.players.operator=player;
 const context=runtime.constructionContext(sim,environment,room.objects),command=(operation,fields={})=>quarryCommand(sim,player,environment,{operation,...fields},now,{identity:{walletId:'operator'}});
 const tick=()=>{now+=250;player.lastSeen=now;stepConstruction(sim,now,.25,context);stepQuarry(sim,environment,now,.25);};
 return {environment,runtime,room,sim,player,context,command,tick,get now(){return now;}};
}
const patch=(f,id)=>f.sim.construction.earthworks.patches.find(p=>p.id===id);
const at=p=>({x:p.origin.x+p.columns*p.cellSize/2,y:Infinity,z:p.origin.z+p.rows*p.cellSize/2});
const pile=(f,id,key)=>(patch(f,id).products?.[key]||[]).reduce((sum,value)=>sum+value,0);
function ai(f){const q=f.sim.quarry;q.aiEnabled=true;const w=f.sim.construction.crew.workers.find(w=>w.id==='crew-maya');w.position={...f.environment.quarry.operatorHome};w.enabled=true;f.sim.construction.crew.enabled=true;for(const s of Object.values(q.stations))s.enabled=true;}
test('quarry is a separate editable native map with a real pit and distinct machines',async()=>{
 const f=fixture(),registry=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url)));assert.deepEqual(registry.find(e=>e.id===f.environment.id),f.environment);
 assert.equal(f.sim.construction.tower,null);assert.equal(Object.values(f.sim.actors).filter(a=>a.constructionBeam).length,0);assert.equal(f.sim.construction.crew.jobs.some(j=>j.id==='steel'),false);
 close(earthworksSurfaceAt(f.sim.construction.earthworks,{x:20,z:-15}).y,-6);close(quarryMass(f.sim),f.sim.construction.earthworks.initialVolume);
 const draft=editableMapScene(f.environment);assert.deepEqual(draft.sourceQuarry,f.environment.quarry);assert.deepEqual(draft.sourceConstruction,f.environment.construction);
 for(const id of new Set(f.environment.builderScene.objects.map(o=>o.modelId))){const root=createBuilderModel(id);assert.ok(root,id);root.traverse(node=>{node.geometry?.dispose();for(const m of [].concat(node.material||[]))m?.dispose();});}
});
test('an empty screen cannot mine surrounding ground or create free output',()=>{
 const f=fixture();ai(f);const before=quarryMass(f.sim);for(let i=0;i<100;i++)f.tick();close(f.sim.quarry.stats.screened,0);close(f.sim.quarry.stats.crushed,0);close(quarryMass(f.sim),before);
});
test('finite raw feed becomes sand, fines, stone, seed-ready topsoil and mulch, then real crushed aggregate',()=>{
 const f=fixture(),e=f.sim.construction.earthworks,soil=earthworksTake(e,{x:-95,y:0,z:-25},10,{radius:3,cutY:-2}),gravel=earthworksTake(e,{x:25,y:-3,z:-35},10,{radius:3,materials:['gravel']});assert.ok(gravel.gravel>9.99);
 earthworksDeposit(e,at(patch(f,'screen-feed')),{soil:soil.soil,gravel:gravel.gravel},{radius:6});ai(f);f.sim.quarry.conveyor=false;const before=quarryMass(f.sim);for(let i=0;i<100;i++)f.tick();
 close(f.sim.quarry.stats.screened,20);assert.ok(pile(f,'product-sand','sand')>0);assert.ok(pile(f,'product-topsoil','topsoil')>0);assert.ok(pile(f,'product-mulch','mulch')>0);assert.ok(pile(f,'product-stone','stone')>0);close(quarryMass(f.sim),before);
 const stone=earthworksTake(e,at(patch(f,'product-stone')),4,{radius:12,materials:['stone'],patchId:'product-stone'});close(stone.stone,4);earthworksDeposit(e,at(patch(f,'crusher-feed')),stone,{radius:6});for(let i=0;i<40;i++)f.tick();close(f.sim.quarry.stats.crushed,4);assert.ok(pile(f,'product-crushed','crushed')>0);close(quarryMass(f.sim),before);
 const typed=earthworksTake(e,at(patch(f,'product-sand')),1,{radius:12,materials:['sand'],patchId:'product-sand'});assert.ok(typed.sand>0);assert.equal(typed.gravel,0);
});
test('crusher refuses raw unscreened gravel, and stop preserves every feed and output volume',async()=>{
 const f=fixture(),e=f.sim.construction.earthworks,cargo=earthworksTake(e,{x:25,y:-3,z:-35},3,{radius:3,materials:['gravel']});earthworksDeposit(e,at(patch(f,'crusher-feed')),cargo,{radius:5});ai(f);const before=quarryMass(f.sim);for(let i=0;i<30;i++)f.tick();assert.equal(f.sim.quarry.stats.crushed,0);close(quarryMass(f.sim),before);await f.command('emergency-stop');for(let i=0;i<30;i++)f.tick();assert.ok(Object.values(f.sim.quarry.stations).every(s=>!s.running));close(quarryMass(f.sim),before);
});
test('manual plant operation enforces cab access, exclusive human ownership and live presence',async()=>{
 const f=fixture();await f.command('start',{stationId:'screener'});assert.equal(f.sim.quarry.stations.screener.manualOwner,'operator');const other={...f.player,actorId:'other'};f.sim.players.other=other;
 await assert.rejects(quarryCommand(f.sim,other,f.environment,{operation:'start',stationId:'screener'},f.now),/Another player/);f.player.position={x:-100,y:0,z:100};f.tick();assert.equal(f.sim.quarry.stations.screener.running,false);await assert.rejects(f.command('start',{stationId:'crusher'}),/Walk/);
});
test('warehouse reservations hold real material durably and booking retries cannot reserve it twice',async()=>{
 const f=fixture(),e=f.sim.construction.earthworks,cargo=earthworksTake(e,{x:25,y:-3,z:-35},5,{radius:3,materials:['gravel']});earthworksDeposit(e,at(patch(f,'screen-feed')),cargo,{radius:5});ai(f);for(let i=0;i<60;i++)f.tick();const before=quarryMass(f.sim);
 const reserved=await f.command('reserve-stock',{material:'sand',quantity:1});const record=f.sim.quarry.pendingExports[reserved.exportId];assert.equal(record.status,'reserved');close(quarryMass(f.sim),before);let credits=0;
 const inventory=async()=>{credits++;return {id:record.id,quantity:1};};await quarryCommand(f.sim,f.player,f.environment,{operation:'book-stock',exportId:record.id},f.now,{identity:{walletId:'operator'},inventory});await quarryCommand(f.sim,f.player,f.environment,{operation:'book-stock',exportId:record.id},f.now,{identity:{walletId:'operator'},inventory});assert.equal(credits,1);close(quarryMass(f.sim),before);
});
test('the pit ramp supports a real loaded truck down to the pit floor',()=>{
 const f=fixture(),truck=f.sim.actors['quarry-truck'];truck.position={x:0,y:.02,z:40};truck.rotation.y=0;truck.driving={speed:0};let last=40,min=0;
 for(let i=0;i<900;i++){const result=stepRoadVehicle(truck,{forward:.35,side:0},.1,{groundAt:p=>constructionGroundAt(truck,p,q=>f.runtime.collision.groundAt(f.environment,q,{actors:{},objects:{},earthworks:f.sim.construction.earthworks}))});Object.assign(truck,result);min=Math.min(min,truck.position.y);last=truck.position.z;if(last< -76)break;}
 assert.ok(last< -70,'truck must traverse the ramp, not remain above a false flat floor: '+JSON.stringify(truck.position));assert.ok(min< -5.5,'truck descends into the open pit');
});

test('a deed cut from a quarry region is a supported lot rather than an inherited mine simulation',()=>{
 const plot=memberPlotEnvironment({id:'mine-garden',name:'Mine garden',ownerId:'gardener',hostedSpace:{environmentId:'surface-mine-quarry'},lot:{size:80,mapId:'surface-mine-quarry',entry:{x:0,y:0,z:0}}},[quarryWorld()]);
 assert.equal(plot.construction,undefined);assert.equal(plot.quarry,undefined);assert.equal(plot.playableSize,80);assert.equal(plot.game,'world');assert.equal(plot.builderScene.mapSize,80);assert.deepEqual(plot.builderScene.objects,[]);
});

test('cab boarding stays the primary action when a quarry worker stands at its door',()=>{
 const f=fixture(),actor=f.sim.actors['quarry-excavator'],self={id:'operator',health:100,position:constructionAccessPoint(actor)};
 const choices=sharedNearbyActions(self,f.sim.actors,f.runtime.initialize(f.room,f.environment).manifest,null,f.sim.construction.crew);
 assert.equal(choices[0].entityId,actor.id);assert.equal(choices[0].kind,'vehicle');assert.ok(choices.some(a=>a.entityId==='crew-noor'));
});

test('the default pit excavator digs its gravel bank and loads the real truck without bypassing collisions',()=>{
 const f=fixture(),a=f.sim.actors['quarry-excavator'];f.player.position={...a.position};f.player.vehicleId=a.id;a.holderId=f.player.actorId;const before=quarryMass(f.sim);
 constructionCommand(f.sim,f.player,{operation:'work'},f.now,f.context);for(let i=0;i<30&&a.construction.workCycle;i++)f.tick();
 assert.equal(a.construction.workCycle,undefined);assert.ok(a.construction.cargo.gravel>1.9);assert.equal(a.construction.blocked,null);close(quarryMass(f.sim),before);
 constructionCommand(f.sim,f.player,{operation:'work'},f.now,f.context);for(let i=0;i<100&&a.construction.workCycle;i++)f.tick();
 assert.equal(a.construction.workCycle,undefined);assert.equal(a.construction.load,0);assert.ok(f.sim.actors['quarry-truck'].construction.cargo.gravel>1.9);close(quarryMass(f.sim),before);
});

test('the stationed quarry crew performs real digging and truck loading before hauling',()=>{
 const f=fixture();f.sim.construction.crew.enabled=true;const before=quarryMass(f.sim);let loaded=false;
 for(let i=0;i<120&&!loaded;i++){stepConstructionCrew(f.sim,f.now,.25,f.context);f.tick();loaded=f.sim.actors['quarry-truck'].construction.load>1.9;}
 assert.ok(loaded,JSON.stringify(f.sim.construction.crew.jobs));assert.equal(f.sim.construction.crew.jobs.find(j=>j.id==='dig').status,'completed');close(quarryMass(f.sim),before);
});
