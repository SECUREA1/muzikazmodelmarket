import test from 'node:test';
import assert from 'node:assert/strict';
import {FUNHOUSE_ID,FUNHOUSE_STATIONS,funhouseStations} from '../public/js/clown-funhouse-config.js';
import {FUNHOUSE_EXPERIENCE_RULES as RULES,funhouseEquipmentPoint,funhouseGalleryTargets,funhouseBallTargets,funhouseAimedTarget,funhouseRidePose,funhouseRideActive,funhouseRideCue} from '../public/js/funhouse-experience-rules.js';
import {funhouseCommand,stepFunhouse,cancelFunhouseActivities,playerFunhouseView} from '../server-clown-funhouse.mjs';

const world={id:FUNHOUSE_ID,game:'funhouse'},station=kind=>funhouseStations(world).find(value=>value.kind===kind);
function fixture(kind='car',environment=world){
 const initial=environment===world?station(kind):funhouseStations(environment).find(value=>value.kind===kind),player={actorId:'guest',health:100,grounded:true,position:{...initial.position},lastSeen:100000,score:0,input:{}},sim={players:{guest:player},actors:{}};let now=100000;
 const send=(action,fields={},at)=>{now=at??now+500;player.lastSeen=now;return funhouseCommand(sim,player,environment,{action,...fields},now,{integer:()=>0});};
 return {environment,player,sim,send,get now(){return now;},step:at=>{now=at;player.lastSeen=at;stepFunhouse(sim,environment,at);},move:kind=>{player.position={...(environment===world?station(kind):funhouseStations(environment).find(value=>value.kind===kind)).position};}};
}
const direction=(origin,target)=>[target.x-origin.x,target.y-origin.y,target.z-origin.z];

test('ride cues advance from the shared clock even between delayed snapshots',()=>{
 const ride={kind:'car',startedAt:100000,nextCueAt:104000,cueIndex:0};
 assert.deepEqual(funhouseRideCue(ride,108200),{cueIndex:1,nextCueAt:108000,cueUntil:109500});
 assert.deepEqual(funhouseRideCue(ride,110000),{cueIndex:2,nextCueAt:112000,cueUntil:113500});
 assert.deepEqual(funhouseRideCue({...ride,kind:'spinner'},109200),{cueIndex:3,targetId:1,nextCueAt:109000,cueUntil:112000});
 assert.equal(ride.nextCueAt,104000,'presentation never mutates a received server snapshot');
});

test('clown-car cockpit uses four server-clock horn cues, settles once and steps back to a safe approach',()=>{
 const f=fixture(),car=station('car'),ride=f.send('funhouse-ride',{stationId:car.id}).funhouse.ride;
 assert.equal(ride.kind,'car');assert.equal(ride.durationMs,RULES.carMs);assert.ok(funhouseRideActive(f.player,f.now));
 assert.deepEqual(f.player.position,ride.pose.position);assert.equal(f.player.score,0);assert.equal(ride.gentle,true);
 f.send('funhouse-action',{stationId:car.id,operation:'honk'},ride.startedAt+1000);assert.equal(ride.score,0,'early honks are harmless show actions');
 for(let cue=1;cue<=4;cue++){
  f.send('funhouse-action',{stationId:car.id,operation:'honk',score:999999},ride.startedAt+cue*RULES.hornIntervalMs);
  assert.equal(ride.score,cue*10);f.send('funhouse-action',{stationId:car.id,operation:'honk'},f.now+500);assert.equal(ride.score,cue*10,'one score per cue');
 }
 f.step(ride.endsAt);assert.equal(ride.status,'complete');assert.equal(f.player.score,40);assert.equal(f.player.funhouse.bestScores.car,40);assert.deepEqual(f.player.position,car.position);assert.equal(f.player.input.forward,undefined);assert.ok(f.player.funhouse.stamps.includes(car.id));
 f.step(ride.endsAt+1000);assert.equal(f.player.score,40);
 const view=playerFunhouseView(f.player);view.ride.pose.position.x=999;assert.notEqual(ride.pose.position.x,999,'seat projection cannot mutate the live seat');
});

test('spinner rotates the real seat, balance scores once per cue and early exit never awards a completion',()=>{
 const f=fixture('spinner'),spinner=station('spinner'),ride=f.send('funhouse-ride',{stationId:spinner.id}).funhouse.ride;
 const first={...ride.pose.position};f.step(ride.startedAt+1000);assert.ok(Math.hypot(ride.pose.position.x-first.x,ride.pose.position.z-first.z)>.5);
 const expected=funhouseRidePose(ride,spinner,f.now);assert.deepEqual(ride.pose,expected);
 f.send('funhouse-action',{stationId:spinner.id,operation:'balance',targetId:ride.targetId});assert.equal(ride.score,10);
 f.send('funhouse-action',{stationId:spinner.id,operation:'balance',targetId:ride.targetId});assert.equal(ride.score,10);
 f.send('funhouse-action',{stationId:spinner.id,operation:'gentle',enabled:false});assert.equal(ride.gentle,false);
 const before=funhouseRidePose(ride,spinner,f.now);ride.gentle=true;assert.deepEqual(funhouseRidePose(ride,spinner,f.now),before,'comfort mode never jumps the physical seat');
 f.send('funhouse-ride-exit',{rideId:ride.id});assert.equal(ride.status,'cancelled');assert.equal(f.player.score,0);assert.deepEqual(f.player.position,spinner.position);assert.equal(funhouseRideActive(f.player,f.now),false);
});

test('rides reject remote boarding, concurrent seats, stale IDs and station deletion, and cancellation releases all controls',()=>{
 const f=fixture(),car=station('car');f.move('welcome');assert.throws(()=>f.send('funhouse-ride',{stationId:car.id}),/Walk closer/);f.move('car');
 const ride=f.send('funhouse-ride',{stationId:car.id}).funhouse.ride;
 const other={actorId:'second',health:100,lastSeen:f.now,position:{...car.position},grounded:true};f.sim.players.second=other;
 assert.throws(()=>funhouseCommand(f.sim,other,world,{action:'funhouse-ride',stationId:car.id},f.now),/Another guest/);
 assert.throws(()=>f.send('funhouse-ride-exit',{rideId:'forged'}),/no longer/);
 f.player.input={forward:1};cancelFunhouseActivities(f.player,f.now,'World travel ended the ride.');assert.equal(ride.status,'cancelled');assert.deepEqual(f.player.input,{});assert.deepEqual(f.player.position,car.position);assert.equal(f.player.score,0);
 const object={id:'custom-car',modelId:'funhouse-clown-car',position:{x:5,y:0,z:6},rotation:{x:0,y:Math.PI/2,z:0},scale:{x:2,y:1,z:2},functionalSettings:{funhouseStation:'car',funhouseApproach:{x:-4,y:0,z:3}}},environment={id:'copied-room',builderScene:{objects:[object]}};
 const g=fixture('car',environment),placed=funhouseStations(environment)[0],ownedRide=g.send('funhouse-ride',{stationId:placed.id}).funhouse.ride;
 assert.deepEqual(ownedRide.pose.position,funhouseEquipmentPoint(placed,{x:-.65,y:.6,z:.55}));environment.builderScene.objects=[];g.step(g.now+500);assert.equal(ownedRide.status,'cancelled');assert.deepEqual(g.player.position,placed.position);
});

test('fright box requires steady winding and a real timed catch; late catches and cancellation cannot mint points',()=>{
 const f=fixture('jackbox'),box=station('jackbox'),challenge=f.send('funhouse-challenge',{stationId:box.id}).funhouse.challenge;
 assert.equal(challenge.phase,'winding');
 f.send('funhouse-action',{stationId:box.id,operation:'wind'});assert.equal(challenge.windCount,1);
 assert.throws(()=>f.send('funhouse-action',{stationId:box.id,operation:'wind'},f.now+100),/steadily/);assert.equal(challenge.windCount,1);
 f.send('funhouse-action',{stationId:box.id,operation:'wind'},f.now+400);f.send('funhouse-action',{stationId:box.id,operation:'wind'},f.now+400);
 assert.equal(challenge.phase,'ready');assert.equal(challenge.windCount,3);
 assert.throws(()=>f.send('funhouse-action',{stationId:box.id,operation:'catch'},challenge.readyAt-1),/Wait until/);
 f.send('funhouse-action',{stationId:box.id,operation:'catch',score:9999},challenge.readyAt);assert.equal(challenge.status,'complete');assert.equal(challenge.score,50);assert.equal(f.player.score,50);assert.ok(f.player.funhouse.stamps.includes(box.id));
 assert.throws(()=>f.send('funhouse-action',{stationId:box.id,operation:'catch'}),/Start this attraction/);assert.equal(f.player.score,50);
 const missed=f.send('funhouse-challenge',{stationId:box.id}).funhouse.challenge;for(let i=0;i<3;i++)f.send('funhouse-action',{stationId:box.id,operation:'wind'});f.step(missed.catchUntil+1);assert.equal(missed.status,'complete');assert.equal(missed.score,0);assert.equal(f.player.score,50);
 const cancelled=f.send('funhouse-challenge',{stationId:box.id}).funhouse.challenge;f.send('funhouse-action',{stationId:box.id,operation:'stop'});assert.equal(cancelled.status,'cancelled');assert.equal(f.player.score,50);
});

test('ball-pit target tossing and first-person gallery rays use real targets and one settlement',()=>{
 const f=fixture('ballpit'),pit=station('ballpit'),challenge=f.send('funhouse-challenge',{stationId:pit.id}).funhouse.challenge;
 f.send('funhouse-action',{stationId:pit.id,operation:'toss',targetId:-1});assert.equal(challenge.shots,1);assert.equal(challenge.score,0);
 const origin={x:f.player.position.x,y:f.player.position.y+1.4,z:f.player.position.z},target=funhouseBallTargets(pit)[challenge.targetId];
 f.send('funhouse-action',{stationId:pit.id,operation:'toss',targetId:(challenge.targetId+1)%4,origin,direction:direction(origin,target)});assert.equal(challenge.score,10,'actual ray overrides a forged claimed target');
 f.step(challenge.endsAt);assert.equal(f.player.score,10);f.step(challenge.endsAt+1000);assert.equal(f.player.score,10);
 f.move('water');const gallery=station('water'),round=f.send('funhouse-start',{stationId:gallery.id}).funhouse.round,eye={x:f.player.position.x,y:f.player.position.y+1.65,z:f.player.position.z},clown=funhouseGalleryTargets(gallery)[round.targetId];
 assert.throws(()=>f.send('funhouse-squirt',{roundId:round.id,targetId:round.targetId,origin:{x:100,y:1,z:100},direction:[0,0,-1]}),/near your player/);
 f.send('funhouse-squirt',{roundId:round.id,targetId:5,origin:eye,direction:direction(eye,clown)});assert.equal(round.score,10);assert.equal(round.hits,1);
 f.send('funhouse-squirt',{roundId:round.id,targetId:-1,origin:eye,direction:[0,1,0]});assert.equal(round.shots,2);assert.equal(round.hits,1);assert.equal(round.score,10);
 const blocked=funhouseGalleryTargets(gallery)[round.targetId];
 f.send('funhouse-squirt',{roundId:round.id,targetId:-1,origin:eye,direction:direction(eye,blocked)});assert.equal(round.hits,1,'a wall-blocked client miss cannot become a hit behind the wall');assert.equal(round.score,10);
});

test('timed mirror maze checks every ordered passage before the bell and stops cleanly on travel',()=>{
 const f=fixture('mirrors'),maze=station('mirrors'),bell=station('maze-finish'),challenge=f.send('funhouse-challenge',{stationId:maze.id}).funhouse.challenge;
 f.player.position={...bell.position};assert.throws(()=>f.send('funhouse-use',{stationId:bell.id},f.now+5000),/every marked mirror passage/);
 assert.equal(challenge.checkpointIndex,0);
 for(const point of challenge.checkpoints){f.player.position={...point};f.step(f.now+1000);}
 assert.equal(challenge.phase,'bell');assert.equal(challenge.checkpointIndex,4);f.player.position={...bell.position};f.send('funhouse-use',{stationId:bell.id});
 assert.equal(challenge.status,'complete');assert.ok(challenge.score>=100&&challenge.score<=200);assert.equal(f.player.score,challenge.score);
 const awarded=f.player.score;f.send('funhouse-use',{stationId:bell.id},f.now+5000);assert.equal(f.player.score,awarded);
 f.move('mirrors');const cancelled=f.send('funhouse-challenge',{stationId:maze.id}).funhouse.challenge;cancelFunhouseActivities(f.player,f.now,'Travel ended the maze.');assert.equal(cancelled.status,'cancelled');assert.equal(f.player.score,awarded);
});

test('pure target transforms and ray intersection follow placed scaled and rotated equipment',()=>{
 const station={kind:'water',source:'placed',objectTransform:{position:{x:30,y:2,z:20},rotation:{x:0,y:Math.PI/2,z:0},scale:{x:2,y:2,z:2}}},target=funhouseGalleryTargets(station)[0],origin={x:40,y:5,z:35};
 assert.ok(Math.abs(target.x-30)<1e-8);assert.ok(Math.abs(target.z-35)<1e-8);assert.equal(target.y,7.1);
 assert.equal(funhouseAimedTarget(station,origin,direction(origin,target)),0);assert.equal(funhouseAimedTarget(station,origin,[0,1,0]),-1);
});
