import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {ensureCommonsArrivalReturn,syncCommonsArrivalReturns} from '../server-world-travel.mjs';

async function setup(t){
 const dir=await mkdtemp(join(tmpdir(),'connected-portals-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(dir,'atlas.json')),base={id:'builder-game',name:'Builder game',worldId:'volt-city',source:'custom-builder',visibility:'public',multiplayer:false,builderScene:{layout:'grand-floor',mapSize:80,objects:[]}},deed={id:'deed-volt-city',name:'Owned location',worldId:'volt-city',ownerId:'alice',hostedSpace:{environmentId:'builder-game'}};
 let directory=await synchronizeWorldDirectory(atlas,[base],[deed]),byId=new Map(directory.environments.map(map=>[map.id,map])),now=100000,sequence=0;
 const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now,resolveDestination:async id=>byId.has(id)}),identity={accountId:'alice',walletId:'alice',username:'Alice'};
 const command=(id,action,extra={},who=identity)=>runtime.command(id,byId.get(id),who,{action,requestId:'command-'+ ++sequence,...extra});
 async function aim(id,destination){const snapshot=await runtime.snapshot(id,byId.get(id)),gateway=Object.values(snapshot.actors).find(actor=>actor.worldGateway?.destination===destination);assert.ok(gateway,id+' has an actual portal to '+destination);await store.update(id,room=>{room.simulation.players['account:alice'].position={...gateway.position,z:gateway.position.z-4};});return gateway;}
 return {atlas,base,deed,store,runtime,command,aim,get:id=>byId.get(id),tick:value=>{now+=value;},publish:async maps=>{directory=await synchronizeWorldDirectory(atlas,maps,[deed]);byId=new Map(directory.environments.map(map=>[map.id,map]));return directory;}};
}

test('Commons, districts, published games and purchased deeds have reciprocal physical portals with validated arrivals',async t=>{
 const world=await setup(t),district=world.get('builder-game').districtId,plot='plot-deed-volt-city';
 await world.command('public-commons','join');
 for(const [from,to]of [['public-commons',district],[district,plot],[plot,district],[district,'builder-game'],['builder-game','public-commons'],['public-commons','world-district-echo-gardens'],['world-district-echo-gardens',district]]){
  const gateway=await world.aim(from,to),state=await world.command(from,'interact',{entityId:gateway.id});assert.equal(state.result.destination,to);
  const arrival=state.result.travel;const duplicate=await world.command(from,'interact',{entityId:gateway.id});assert.equal(duplicate.result.travel.token,arrival.token,'duplicate taps reuse the confirmed trip');assert.equal(arrival.from,from);assert.equal(arrival.to,to);
  const joined=await world.command(to,'join',{travelFrom:from,travelToken:arrival.token});assert.equal(joined.selfId,'account:alice');
  const reciprocal=Object.values(joined.actors).find(actor=>actor.worldGateway?.destination===from);assert.ok(reciprocal,'destination offers a real return portal');
  const position=joined.players['account:alice'].position;assert.ok(Math.hypot(position.x-reciprocal.position.x,position.z-reciprocal.position.z)<=6,'arrives near the matching entrance');
  await world.command(to,'join',{travelFrom:from,travelToken:arrival.token});assert.deepEqual((await world.store.get(to)).simulation.players['account:alice'].position,position,'lost join responses can be retried safely');
 }
 assert.equal(world.get('builder-game').multiplayer,true);assert.equal(world.get('builder-game').sharedWorld,true);assert.deepEqual(world.get('builder-game').builderScene.objects,[],'return portals do not rewrite authored layouts');
});

test('portal arrival proof cannot be forged, borrowed by another player, or reused after expiry',async t=>{
 const world=await setup(t),district=world.get('builder-game').districtId;
 await world.command('public-commons','join');const gateway=await world.aim('public-commons',district),state=await world.command('public-commons','interact',{entityId:gateway.id}),travel=state.result.travel;
 await assert.rejects(world.command(district,'join',{travelFrom:'public-commons',travelToken:'invented'}),{code:'PORTAL_TRIP_EXPIRED'});
 await assert.rejects(world.command(district,'join',{travelFrom:'public-commons',travelToken:travel.token},{accountId:'bob',walletId:'bob',username:'Bob'}),{code:'PORTAL_TRIP_EXPIRED'});
 world.tick(120001);await assert.rejects(world.command(district,'join',{travelFrom:'public-commons',travelToken:travel.token}),{code:'PORTAL_TRIP_EXPIRED'});
});

test('new builder publications add live portal actors without moving the current player; unlisted doors disappear',async t=>{
 const world=await setup(t),district=world.get('builder-game').districtId;
 await world.command(district,'join');const before=await world.runtime.snapshot(district,world.get(district)),position=before.players['account:alice'].position;
 const published={...world.base,id:'new-builder-game',name:'New published game'};await world.publish([world.base,published]);
 const updated=await world.runtime.snapshot(district,world.get(district));assert.deepEqual(updated.players['account:alice'].position,position);assert.ok(Object.values(updated.actors).some(actor=>actor.worldGateway?.destination===published.id));
 const gateway=await world.aim(district,published.id),trip=await world.command(district,'interact',{entityId:gateway.id});assert.equal(trip.result.destination,published.id);
 await world.publish([world.base]);const removed=await world.runtime.snapshot(district,world.get(district));assert.ok(!Object.values(removed.actors).some(actor=>actor.worldGateway?.destination===published.id));
 await assert.rejects(world.command(district,'interact',{entityId:gateway.id}),{statusCode:409});
});

test('the selected entrance is honored when two different world portals are within reach',async t=>{
 const world=await setup(t),id='builder-game';await world.command(id,'join');
 const snapshot=await world.runtime.snapshot(id,world.get(id)),exits=Object.values(snapshot.actors).filter(actor=>actor.worldGateway),commons=exits.find(actor=>actor.worldGateway.destination==='public-commons');
 const center={x:(exits[0].position.x+exits[1].position.x)/2,y:exits[0].position.y,z:(exits[0].position.z+exits[1].position.z)/2};
 await world.store.update(id,room=>{room.simulation.players['account:alice'].position=center;});
 const result=await world.command(id,'interact',{entityId:commons.id});assert.equal(result.result.destination,'public-commons');
 await world.store.update(id,room=>{room.simulation.players['account:alice'].position={x:30,y:0,z:30};});
 await assert.rejects(world.command(id,'interact',{entityId:commons.id}),{statusCode:409});
});

test('finishing a game does not lock its physical exit portals',async t=>{
 const world=await setup(t),id='builder-game';await world.command(id,'join');const gateway=await world.aim(id,'public-commons');
 await world.store.update(id,room=>{room.simulation.match={id:'finished-game',state:'finished',results:[],participants:{}};});
 const result=await world.command(id,'interact',{entityId:gateway.id});assert.equal(result.result.destination,'public-commons');
 await assert.rejects(world.command(id,'fire',{tool:'laser',direction:[0,0,-1]}),{statusCode:409});
});

test('large Commons directories create a validated runtime return gate, preserve its retry and reload, and prune expired arrivals',async t=>{
 const world=await setup(t);
 await world.publish([world.base,...Array.from({length:20},(_,index)=>({...world.base,id:'additional-world-'+index,name:'Additional world '+index}))]);
 const commons=world.get('public-commons'),authored=JSON.stringify(commons.builderScene.objects);
 assert.ok(!commons.portalTargets.includes('builder-game'),'large directories keep the district catalogue instead of adding every map');
 await world.command('builder-game','join');
 await assert.rejects(world.command('public-commons','join',{travelFrom:'builder-game',travelToken:'invented'}),{code:'PORTAL_TRIP_EXPIRED'});
 assert.equal((await world.store.get('public-commons')).simulation?.commonsArrivalReturns?.length||0,0,'forged arrival creates no shared fixture');
 const gateway=await world.aim('builder-game','public-commons'),trip=await world.command('builder-game','interact',{entityId:gateway.id});
 const joined=await world.command('public-commons','join',{travelFrom:'builder-game',travelToken:trip.result.travel.token});
 const entry=Object.values(joined.actors).find(actor=>actor.worldGateway?.destination==='builder-game');
 assert.ok(entry?.arrivalReturn);assert.match(entry.id,/^commons-arrival-return-/);assert.ok(Math.hypot(joined.players['account:alice'].position.x-entry.position.x,joined.players['account:alice'].position.z-entry.position.z)<=6);
 assert.equal(JSON.stringify(commons.builderScene.objects),authored,'authored environment is unchanged');
 assert.ok([...world.runtime.manifestCache.values()].every(manifest=>manifest.objects.every(object=>object.objectId!==entry.id)),'cached manifest is unchanged');
 const repeated=await world.command('public-commons','join',{travelFrom:'builder-game',travelToken:trip.result.travel.token});
 assert.equal(Object.values(repeated.actors).filter(actor=>actor.arrivalReturn).length,1);assert.deepEqual(repeated.players['account:alice'].position,joined.players['account:alice'].position);
 let now=joined.serverTime;
 const reloaded=new AuthoritativeRooms({store:new SharedRoomStore(world.store.file),now:()=>now}),saved=await reloaded.snapshot('public-commons',commons);
 assert.deepEqual(saved.actors[entry.id].position,entry.position);assert.equal(saved.actors[entry.id].worldGateway.destination,'builder-game');
 const identity={accountId:'alice',walletId:'alice',username:'Alice'};
 const back=await reloaded.command('public-commons',commons,identity,{action:'interact',entityId:entry.id,requestId:'use-saved-return'});
 assert.equal(back.result.destination,'builder-game','persisted return gate remains usable');
 await reloaded.command('builder-game',world.get('builder-game'),identity,{action:'join',travelFrom:'public-commons',travelToken:back.result.travel.token,requestId:'return-after-reload'});
 now+=900001;const cleaned=await reloaded.snapshot('public-commons',commons);
 assert.equal(cleaned.actors[entry.id],undefined);assert.equal((await reloaded.store.get('public-commons')).simulation.commonsArrivalReturns.length,0);
});

test('runtime Commons gates reserve clear approaches, retain active origins and remain bounded by room capacity',()=>{
 const sim={actors:{},players:{}},environment={id:'public-commons',spawn:{x:0,y:0,z:0}},manifest={objects:[],actors:[]},now=100000;
 const collision={safeSpawn:()=>({x:0,y:0,z:0}),meetingPosition:(_environment,point)=>({...point,y:0}),hasBodyClearance:()=>true,blocksShot:()=>false};
 for(let index=0;index<128;index++){
  const source='source-'+index,definition=ensureCommonsArrivalReturn(sim,environment,manifest,source,source,collision,{},now);
  manifest.objects.push(definition);manifest.actors.push(definition);sim.players['player-'+index]={position:{x:0,y:0,z:0},lastSeen:now,lastPortalArrival:{from:source}};
 }
 assert.equal(sim.commonsArrivalReturns.length,128);
 const positions=Object.values(sim.actors).map(actor=>actor.position);
 for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++)assert.ok(Math.hypot(positions[i].x-positions[j].x,positions[i].z-positions[j].z)>=6,'compact return approaches remain separated');
 assert.throws(()=>ensureCommonsArrivalReturn(sim,environment,manifest,'overflow','Overflow',collision,{},now),/arrival gates are busy/);assert.equal(sim.commonsArrivalReturns.length,128);
 const base={objects:[],actors:[]};for(const player of Object.values(sim.players))player.lastSeen=now+900001;
 assert.equal(syncCommonsArrivalReturns(sim,environment,base,now+900001).length,128,'active origins remain available after their ordinary TTL');
 sim.players={};assert.equal(syncCommonsArrivalReturns(sim,environment,base,now+900002).length,0);assert.equal(Object.keys(sim.actors).length,0);
 const blocked={...collision,hasBodyClearance:()=>false};assert.throws(()=>ensureCommonsArrivalReturn(sim,environment,base,'blocked','Blocked',blocked,{},now),/No clear Commons return-gate/);assert.equal(sim.commonsArrivalReturns.length,0);
});
