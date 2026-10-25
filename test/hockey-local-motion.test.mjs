import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalHockeyMotion,stepLocalHockeySkater,createHockeyInputPump} from '../public/js/hockey-local-motion.js';
import {createHockey,joinHockey,hockeyInput,stepHockey} from '../public/js/hockey-rules.js';
import {HockeyRooms} from '../hockey-rooms.mjs';
const arena=()=>{const state=createHockey({aiFill:false});joinHockey(state,'pilot','Pilot');state.phase='playing';state.remaining=180;return state;};
test('controlled hockey skating uses server acceleration and bounds without stepping the puck or opponents',()=>{
 const state=arena(),self=state.players.find(p=>p.human==='pilot');self.x=0;self.z=0;let local={...self};hockeyInput(state,'pilot',{x:1,z:.3});for(let i=0;i<30;i++){local=stepLocalHockeySkater(local,{x:1,z:.3},1/60);stepHockey(state,1/60);}assert.ok(Math.abs(local.x-self.x)<.002);assert.ok(Math.abs(local.z-self.z)<.002);
 const original=arena(),before=structuredClone(original),motion=new LocalHockeyMotion();motion.accept(original,'pilot',{serverTime:1000,sentAt:0,receivedAt:100});const start=original.players.find(p=>p.human==='pilot'),first=motion.sample(116,1/60,{x:1,z:0});assert.ok(first.x>start.x,'first frame responds before any round trip');for(let i=2;i<25;i++)motion.sample(100+i*16,1/60,{x:1,z:0});assert.deepEqual(original,before,'prediction never changes authoritative snapshot');
});
test('delayed authoritative samples reconcile historical motion without pausing current skating; faceoffs reset it',()=>{
 const state=arena(),motion=new LocalHockeyMotion();motion.accept(state,'pilot',{serverTime:1000,sentAt:0,receivedAt:100});let current;for(let i=1;i<=20;i++)current=motion.sample(100+i*16,1/60,{x:1,z:0});const authoritative=structuredClone(state),historical=motion.history[5];Object.assign(authoritative.players.find(p=>p.human==='pilot'),{x:historical.x,z:historical.z,vx:historical.vx,vz:historical.vz});motion.accept(authoritative,'pilot',{serverTime:historical.time+950,sentAt:100,receivedAt:420});const after=motion.sample(436,1/60,{x:1,z:0});assert.ok(after.x>current.x,'late replies do not snap to old positions or hold movement');authoritative.phase='faceoff';const self=authoritative.players.find(p=>p.human==='pilot');self.x=-12;self.z=3;motion.accept(authoritative,'pilot',{serverTime:1500,sentAt:450,receivedAt:550});const reset=motion.sample(566,1/60,{x:1,z:0});assert.equal(reset.x,-12);assert.equal(reset.z,3);
});
test('hockey input edges send without a timer, bound pending requests and coalesce to latest intent',async()=>{
 let now=0;const requests=[],results=[];const pump=createHockeyInputPump({send:input=>new Promise(resolve=>requests.push({input,resolve})),onSnapshot:state=>results.push(state),now:()=>now});pump.push({x:1});pump.push({x:0});pump.push({x:-1});pump.push({x:.5});pump.push({x:0});await Promise.resolve();assert.equal(requests.length,3);assert.equal(pump.inFlight,3);assert.deepEqual(pump.pending,{x:0});now=200;requests[0].resolve({sequence:1});await new Promise(resolve=>setImmediate(resolve));assert.equal(requests.length,4);assert.deepEqual(requests[3].input,{x:0});pump.reset();requests[1].resolve({sequence:2});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(results,[{sequence:1}],'prior session replies cannot reset current movement');pump.stop();
});
test('hockey room ignores stale input and old-session requests without losing current controls',()=>{
 const rooms=new HockeyRooms({now:()=>1000}),identity={accountId:'pilot',username:'Pilot'},environment={hockey:{aiFill:false}},join=rooms.command('rink',environment,identity,{action:'join'}),epoch=join.inputEpoch;
 rooms.command('rink',environment,identity,{action:'input',inputEpoch:epoch,inputSequence:2,input:{x:1}});let result=rooms.command('rink',environment,identity,{action:'input',inputEpoch:epoch,inputSequence:1,input:{x:-1}});assert.equal(result.state.players.find(p=>p.human==='account:pilot').input.x,1);
 const rejoin=rooms.command('rink',environment,identity,{action:'join'});assert.notEqual(rejoin.inputEpoch,epoch);result=rooms.command('rink',environment,identity,{action:'input',inputEpoch:epoch,inputSequence:99,input:{x:-1}});assert.equal(result.state.players.find(p=>p.human==='account:pilot').input.x,0);
});
test('local hockey motion consumes elapsed time equally at 5, 10, 20, 30 and 60 FPS',()=>{
 const positions=[];for(const fps of [5,10,20,30,60]){const state=arena(),motion=new LocalHockeyMotion();motion.accept(state,'pilot',{serverTime:1000,sentAt:0,receivedAt:0});let player;for(let frame=1;frame<=fps;frame++)player=motion.sample(frame/fps*1000,1/fps,{x:1,z:0});positions.push(player.x);}for(const x of positions)assert.ok(Math.abs(x-positions.at(-1))<1e-8,'slow rendering must not drop simulation time');
});

test('fresh skating, braking and reversal stay responsive after long snapshot gaps',()=>{
 for(const age of [1600,5000,20000]){
  const state=arena(),saved=structuredClone(state),motion=new LocalHockeyMotion(),source=state.players.find(player=>player.human==='pilot');
  motion.accept(state,'pilot',{serverTime:1000,sentAt:0,receivedAt:0});
  const moving=motion.sample(age,.2,{x:1,z:0});assert.ok(moving.x>source.x+.2,'fresh input must move before another server reply');assert.ok(moving.vx>1);
  const released=motion.sample(age+200,.2,{x:0,z:0});assert.ok(released.vx<moving.vx,'released input follows the shared skate friction');
  const reversed=motion.sample(age+450,.25,{x:-1,z:0});assert.ok(reversed.vx<0,'fresh reverse input cannot be discarded as stale');
  const bounds=stepLocalHockeySkater({...reversed,x:100,z:100},{x:1,z:1},.05);assert.ok(bounds.x<31&&bounds.z<15,'the rink boards still constrain skating');
  assert.deepEqual(state,saved,'local input does not simulate opponents, puck, goals or match time');
 }
});
