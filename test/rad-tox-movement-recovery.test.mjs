import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {finishMatch} from '../rpg-match.mjs';
import {RAD_TOX_RESULTS_PAUSE_MS} from '../public/js/rad-tox-rules.js';

async function world(run,{clean=false,health=100}={}){
 const dir=await mkdtemp(join(tmpdir(),'rad-movement-'));let now=100000,request=0;
 try{
  const store=new SharedRoomStore(join(dir,'rooms.json'));
  const runtime=new AuthoritativeRooms({store,now:()=>now});
  runtime.collision.safeSpawn=(_,point)=>({...point});runtime.collision.encounterSpawn=(_,point)=>({...point});
  runtime.collision.resolve=(_,previous,next)=>({...next,y:0,floorY:0});runtime.collision.resolvePlaced=(_,previous,next)=>next;
  runtime.collision.groundAt=(_,point)=>({...point,y:0});runtime.collision.hasWalkingExit=()=>true;
  const map={id:clean?'public-commons':'movement-house',modelUrl:'/public/models/environments/muzimakzmain.glb',spawn:{x:0,y:0,z:0}};
  const identity={accountId:'alice',walletId:'alice',username:'Alice',stats:{health}};
  const send=(action,fields={})=>runtime.command(map.id,map,identity,{action,requestId:'movement-'+ ++request,...fields});
  const arrange=mutate=>store.update(map.id,room=>mutate(room.simulation));
  const advance=ms=>{now+=ms;};
  const walk=async()=>{
   let state=await send('input',{input:{forward:1,yaw:0}});const start=state.players['account:alice'].position.z;
   advance(100);state=await send('input',{input:{forward:1,yaw:0}});
   assert.ok(state.players['account:alice'].position.z<start,'fresh controls move the recovered player');return state;
  };
  await run({runtime,store,map,send,arrange,advance,walk,now:()=>now});
 }finally{await rm(dir,{recursive:true,force:true});}
}

test('noncombat entry recovers defeated identity and saved players without healing wounded explorers',()=>world(async({send,arrange,walk})=>{
 let state=await send('join');assert.equal(state.players['account:alice'].health,100);assert.equal(state.players['account:alice'].radToxEnabled,false);
 await walk();
 await arrange(sim=>{sim.players['account:alice'].health=0;sim.players['account:alice'].velocityY=-12;});
 state=await send('join');assert.equal(state.players['account:alice'].health,100);await walk();
 await arrange(sim=>{sim.players['account:alice'].health=27;});
 state=await send('join');assert.equal(state.players['account:alice'].health,27,'returning to exploration cannot refill positive health');
},{clean:true,health:0}));

test('opting out after defeat restores walking while preserving the shared encounter and earned results',()=>world(async({send,arrange,walk})=>{
 await send('join');
 await arrange(sim=>{const player=sim.players['account:alice'];player.health=0;player.score=35;player.combat.deaths=1;player.combat.score=35;player.velocityY=-12;player.seatedId='old-seat';sim.actors['old-seat']={id:'old-seat',active:true,holderId:'account:alice',position:{...player.position}};});
 const state=await send('rad-tox-toggle',{enabled:false}),matchId=state.match.id;
 assert.equal(state.players['account:alice'].health,100);assert.equal(state.players['account:alice'].score,35);assert.equal(state.players['account:alice'].combat.deaths,1);
 assert.equal(state.players['account:alice'].seatedId,null);assert.equal(state.actors['old-seat'].holderId,null,'defeat cannot leave the explorer pinned to an old seat');
 assert.equal((await walk()).match.id,matchId,'opting out cannot restart the room encounter');
 await arrange(sim=>{sim.players['account:alice'].health=31;});
 await send('rad-tox-toggle',{enabled:true});
 assert.equal((await send('rad-tox-toggle',{enabled:false})).players['account:alice'].health,31,'toggle cannot heal a wounded player');
}));

test('joining a GLB with combat off recovers an existing defeat without restarting the encounter',()=>world(async({send,arrange,walk})=>{
 const initial=await send('join');
 await arrange(sim=>{sim.players['account:alice'].health=0;});
 const joined=await send('join',{deferRadTox:true,radToxEnabled:false});
 assert.equal(joined.match.id,initial.match.id);assert.equal(joined.players['account:alice'].health,100);await walk();
}));

test('respawning during final results restores walking and preserves countdown, frozen results and progression',()=>world(async({send,arrange,advance,walk,now})=>{
 await send('join');
 await arrange(sim=>{const player=sim.players['account:alice'];player.health=0;player.combat.deaths=1;player.score=10;finishMatch(sim,'defeat',now());});
 const defeated=await send('input',{input:{}}),frozen=JSON.stringify(defeated.match.results),matchId=defeated.match.id;
 let state=await send('respawn');assert.equal(state.players['account:alice'].health,100);assert.equal(state.players['account:alice'].combat.deaths,1);
 assert.equal(state.match.id,matchId);assert.equal(state.match.state,'finished');assert.equal(JSON.stringify(state.match.results),frozen);
 state=await walk();assert.equal(state.match.state,'finished');assert.equal(JSON.stringify(state.match.results),frozen);
 await assert.rejects(send('respawn'),{statusCode:409,message:'Respawn is available after defeat.'});
 await assert.rejects(send('next-rad-tox',{matchId}),{statusCode:409});
 advance(RAD_TOX_RESULTS_PAUSE_MS);
 state=await send('input',{input:{}});assert.notEqual(state.match.id,matchId);assert.equal(state.match.level,1);assert.equal(state.radTox.wave,1);assert.equal(state.match.state,'active');
}));

test('Begin respawns a defeated shared player even when the room already has an encounter',async()=>{
 const source=await readFile(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('  toxicBubbleSystem.begin=async()=>{')+'  toxicBubbleSystem.begin=async()=>{'.length,source.indexOf('\n  };',source.indexOf('  toxicBubbleSystem.begin=async()=>{')));
 const commands=[],game={health:0,serverEncounter:{state:'active'},initAudio(){},async ensureResources(){},updateHud(){}};
 const client={ready:true,async send(action){commands.push(action);return {radTox:{state:'active'}};}};
 const begin=new Function('worldLoadGeneration','authoritativeClient','isFiringRangeEnvironment','activeEnvironment','liveRangeSnapshot','isBasketballEnvironment','radToxEnabled','serverHostedRoom','toxicBubbleSystem','RAD_TOX_STATES',`return async function(){${body}}`)(1,client,()=>false,{id:'house'},null,()=>false,true,true,game,{ACTIVE:'active'});
 await begin();assert.deepEqual(commands,['respawn','start-rad-tox']);assert.equal(game.active,true);
 commands.length=0;game.health=40;
 await begin();assert.deepEqual(commands,['start-rad-tox'],'Begin cannot heal a living player');
});
