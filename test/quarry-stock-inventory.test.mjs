import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {quarryWorld} from '../quarry-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {quarryCommand,quarryMass,quarryStockInventory,seedQuarryStock} from '../server-quarry.mjs';
import {earthCargo,earthCargoVolume,earthworksTake,earthworksDeposit} from '../public/js/construction-earthworks.js';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {WorldSupplyService} from '../server-world-supply.mjs';
const OWNER='account:stockyard-owner',close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' versus '+b);
function fixture(){
 const environment=quarryWorld(),runtime=new AuthoritativeRooms({now:()=>1000}),room={objects:{}},sim=runtime.initialize(room,environment).sim;
 sim.construction.crew.enabled=false;
 const player={actorId:'stockyard-owner',id:'stockyard-owner',health:100,lastSeen:1000,position:{x:80,y:0,z:-25},input:{}};sim.players[player.actorId]=player;
 const command=(operation,fields={},context={})=>quarryCommand(sim,player,environment,{operation,...fields},1000,{identity:{walletId:OWNER},...context});
 return {environment,runtime,room,sim,player,command};
}
const patch=(f,id)=>f.sim.construction.earthworks.patches.find(p=>p.id===id);
const center=p=>({x:p.origin.x+p.columns*p.cellSize/2,y:Infinity,z:p.origin.z+p.rows*p.cellSize/2});
function takeLot(f,material,quantity){const lot=f.environment.quarry.initialStock.lots.find(l=>l.material===material),p=patch(f,lot.patchId);return earthworksTake(f.sim.construction.earthworks,center(p),quantity,{radius:32,materials:[material],patchId:p.id,looseOnly:true});}
function bookableTruck(f){const truck=Object.values(f.sim.actors).find(a=>a.modelId==='site-dumptruck');truck.position={...f.environment.quarry.loadout};truck.position={x:truck.position.x,y:truck.position.y,z:truck.position.z};truck.driving={speed:0,parked:true};truck.construction.bed=0;truck.construction.axes={};truck.holderId=f.player.actorId;f.player.vehicleId=truck.id;f.player.position={...truck.position};const sand=takeLot(f,'sand',6),stone=takeLot(f,'stone',4);truck.construction.cargo=earthCargo({...sand,stone:stone.stone});truck.construction.load=earthCargoVolume(truck.construction.cargo);return truck;}

test('opening stock adds exactly 1,200 typed cubic metres once and belongs to the finite initial ledger',()=>{
 const f=fixture(),q=f.sim.quarry,e=f.sim.construction.earthworks,inventory=quarryStockInventory(f.sim,f.environment);assert.equal(f.environment.quarry.initialStock.lots.length,8);close(inventory.initialStock.totalVolume,1200);close(Object.values(q.initialStock.lots).reduce((sum,lot)=>sum+lot.quantity,0),1200);close(quarryMass(f.sim),e.initialVolume);close(e.deposited,0);
 for(const lot of f.environment.quarry.initialStock.lots){const row=inventory.piles.find(p=>p.patchId===lot.patchId&&p.material===lot.material);assert.ok(row,lot.id);close(row.volume,lot.quantity);close(row.seededVolume,lot.quantity);}
 const saved=JSON.stringify(q.initialStock),revision=e.revision,mass=quarryMass(f.sim);seedQuarryStock(f.sim,f.environment,9999);f.runtime.initialize(f.room,f.environment);assert.equal(JSON.stringify(q.initialStock),saved);assert.equal(e.revision,revision);close(quarryMass(f.sim),mass);
});

test('worked stock remains depleted through serialization, a new runtime and seed-version changes',()=>{
 const f=fixture(),taken=takeLot(f,'sand',7),truck=Object.values(f.sim.actors).find(a=>a.modelId==='site-dumptruck');close(taken.sand,7);truck.construction.cargo=taken;truck.construction.load=7;const before=quarryStockInventory(f.sim,f.environment).piles.find(p=>p.material==='sand'&&p.seededVolume>0).volume,mass=quarryMass(f.sim),saved=JSON.parse(JSON.stringify(f.room)),environment=structuredClone(f.environment);environment.quarry.initialStock.version+=':metadata-update';environment.contentUpdatedAt+=':metadata-update';const restored=new AuthoritativeRooms({now:()=>5000}).initialize(saved,environment).sim;
 const inventory=quarryStockInventory(restored,environment);close(inventory.piles.find(p=>p.material==='sand'&&p.seededVolume>0).volume,before);close(quarryMass(restored),mass);close(inventory.initialStock.totalVolume,1200);assert.equal(Object.keys(restored.quarry.initialStock.lots).length,8);
});

test('an existing worked mine gains new stockyard patches without resetting cuts or minting opening stock twice',()=>{
 const environment=quarryWorld(),old=structuredClone(environment),ids=new Set(environment.quarry.initialStock.lots.map(l=>l.patchId));delete old.quarry.initialStock;old.construction.earthworks.patches=old.construction.earthworks.patches.filter(p=>!ids.has(p.id));old.contentUpdatedAt+=':before-stockyard';const runtime=new AuthoritativeRooms({now:()=>1000}),room={objects:{}},sim=runtime.initialize(room,old).sim;sim.construction.crew.enabled=false;const e=sim.construction.earthworks,cargo=earthworksTake(e,{x:25,y:-3,z:-35},2,{radius:3,materials:['gravel']});earthworksDeposit(e,{x:-80,y:Infinity,z:65},cargo,{radius:3});const cut=structuredClone(e.patches.find(p=>p.id==='excavation')),mass=quarryMass(sim),initial=e.initialVolume;
 runtime.initialize(room,environment);assert.deepEqual(e.patches.find(p=>p.id==='excavation'),cut);close(quarryMass(sim),mass+1200);close(e.initialVolume,initial+1200);const revision=e.revision;runtime.initialize(room,environment);close(quarryMass(sim),mass+1200);assert.equal(e.revision,revision);
});

test('selected processed pile booking reserves exactly that material while raw feed and unsigned reservations are rejected',async()=>{
 const f=fixture(),lot=f.environment.quarry.initialStock.lots.find(l=>l.material==='sand'),initial=quarryStockInventory(f.sim,f.environment).piles.find(p=>p.patchId===lot.patchId).volume,mass=quarryMass(f.sim);const result=await f.command('reserve-stock',{material:'sand',quantity:4,patchId:lot.patchId}),record=f.sim.quarry.pendingExports[result.exportId];assert.equal(record.sourcePatchId,lot.patchId);assert.equal(record.sourceVehicleId,null);assert.equal(record.status,'reserved');close(quarryStockInventory(f.sim,f.environment).piles.find(p=>p.patchId===lot.patchId).volume,initial-4);close(quarryMass(f.sim),mass);
 const records=Object.keys(f.sim.quarry.pendingExports).length;await assert.rejects(f.command('reserve-stock',{material:'gravel',quantity:1,patchId:f.environment.quarry.initialStock.lots[0].patchId}),/Choose a material/);await assert.rejects(f.command('reserve-stock',{material:'sand',quantity:1,patchId:lot.patchId},{identity:{}}),/Sign in/);assert.equal(Object.keys(f.sim.quarry.pendingExports).length,records);close(quarryMass(f.sim),mass);
});

test('truck bookings preserve mixed cargo and conserve total material while debiting only the owned parked load',async()=>{
 const f=fixture(),truck=bookableTruck(f),mass=quarryMass(f.sim),result=await f.command('reserve-stock',{source:'vehicle',material:'sand',quantity:3});assert.equal(truck.construction.cargo.sand,3);assert.equal(truck.construction.cargo.stone,4);assert.equal(truck.construction.load,7);const record=f.sim.quarry.pendingExports[result.exportId];assert.equal(record.sourceVehicleId,truck.id);assert.equal(record.sourcePatchId,null);const row=f.sim.quarry.stockInventory.vehicles.find(v=>v.id===truck.id);assert.equal(row.volume,7);assert.equal(row.atLoadout,true);assert.equal(row.parked,true);close(quarryMass(f.sim),mass);
 let credits=0;const inventory=async()=>{credits++;return {id:record.id,quantity:3};};await f.command('book-stock',{exportId:record.id},{inventory});await f.command('book-stock',{exportId:record.id},{inventory});assert.equal(credits,1);assert.equal(record.status,'booked');assert.equal(truck.construction.load,7);close(quarryMass(f.sim),mass);
});

test('loadout booking rejects other holders, moving or raised trucks, live hydraulics and trucks outside the bay',async()=>{
 const f=fixture(),truck=bookableTruck(f),mass=quarryMass(f.sim),baseline=structuredClone(truck),send=()=>f.command('reserve-stock',{source:'vehicle',material:'sand',quantity:1});
 for(const [edit,pattern]of [[()=>truck.holderId='other',/Board/],[()=>truck.driving.speed=1,/Park/],[()=>truck.construction.bed=.3,/Park/],[()=>truck.construction.axes={bed:1},/Park/],[()=>truck.position.x+=40,/weighbridge/],[()=>truck.position.y+=5,/weighbridge/]]){Object.assign(truck,structuredClone(baseline));edit();await assert.rejects(send(),pattern);close(quarryMass(f.sim),mass);assert.equal(Object.keys(f.sim.quarry.pendingExports).length,0);}
 Object.assign(truck,baseline);await assert.rejects(f.command('reserve-stock',{source:'vehicle',material:'sand',quantity:7}),/enough/);close(quarryMass(f.sim),mass);
});

test('a lost warehouse acknowledgement retries the same consumed physical reservation without crediting twice',async t=>{
 const f=fixture(),dir=await mkdtemp(join(tmpdir(),'quarry-stock-booking-'));t.after(()=>rm(dir,{recursive:true,force:true}));const database=new UserJsonDatabase(join(dir,'users.json'));await database.put(OWNER,{tokens:{MZK:100},items:[]});const service=new WorldSupplyService(database,{maps:async()=>[f.environment]}),lot=f.environment.quarry.initialStock.lots.find(l=>l.material==='sand'),mass=quarryMass(f.sim),reserved=await f.command('reserve-stock',{material:'sand',quantity:5,patchId:lot.patchId});let fail=true;const inventory=async(...args)=>{const receipt=await service.quarryInventory(...args);if(fail){fail=false;throw Error('Acknowledgement lost after saving');}return receipt;};
 await assert.rejects(f.command('book-stock',{exportId:reserved.exportId},{inventory}),/Acknowledgement/);assert.equal(f.sim.quarry.pendingExports[reserved.exportId].status,'reserved');await f.command('book-stock',{exportId:reserved.exportId},{inventory});await f.command('book-stock',{exportId:reserved.exportId},{inventory});const data=await database.read();assert.equal(data.worldSupply.maps[f.environment.id].stock['quarry:sand'],5);close(quarryMass(f.sim),mass);assert.equal(f.sim.quarry.pendingExports[reserved.exportId].quantity,5);
});
