import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createArcadeMatch} from '../public/js/arcade-match.js';
import {LocalArcadeMotion,createArcadeInputStream} from '../public/js/arcade-local-motion.js';

const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} should be within ${tolerance} of ${expected}`);
function roomFixture(game=2,slot=0){
 const match=createArcadeMatch(game,{basketballMode:'full',teamSize:2,periodSeconds:60,roundSeconds:60,difficulty:'easy',aiFill:false}),slots=Array.from({length:game===2?4:2},(_,index)=>({actor:index===slot?'account:self':'account:other-'+index,name:'Player '+index}));
 match.setRoster?.(slots);const state=match.snapshot();
 if(state.basketball){state.basketball.stoppage=0;state.basketball.players[slot].x=300;state.basketball.players[slot].y=220;}
 return {state,selfId:'account:self',role:'player',slots,started:true,inputEpoch:'epoch-1',serverTime:1000,sequence:1};
}
const acknowledge=(motion,room,sentAt,receivedAt)=>motion.reconcile(room,{sentAt,receivedAt});
async function drain(){for(let turn=0;turn<25;turn++)await Promise.resolve();}

test('owned basketball movement is immediate and stops or reverses on the first frame at 10, 20, 30, 60 and 120 FPS',()=>{
 for(const fps of [10,20,30,60,120]){
  const room=roomFixture(),before=structuredClone(room),motion=new LocalArcadeMotion();acknowledge(motion,room,0,0);let shown;
  for(let frame=1;frame<=fps/5;frame++){
   shown=motion.sample(room,{moveX:1,moveY:0},1/fps,frame*1000/fps);near(shown.basketball.players[0].x,300+frame*140/fps);near(shown.basketball.players[0].y,220);
  }
  near(shown.basketball.players[0].x,328);shown=motion.sample(room,{moveX:0,moveY:0},1/fps,220);near(shown.basketball.players[0].x,328);
  shown=motion.sample(room,{moveX:-1,moveY:0},1/fps,240);near(shown.basketball.players[0].x,328-140/fps);
  assert.deepEqual(room,before,'presentation must never mutate the authoritative room');assert.deepEqual(shown.basketball.players.slice(1),before.state.basketball.players.slice(1));
  for(const key of ['ball','teamScore','shotClock','owner','shot'])assert.deepEqual(shown.basketball[key],before.state.basketball[key]);
  for(const key of ['score','remaining','gameElapsed','pointer','opponent','attempts'])assert.deepEqual(shown[key],before.state[key]);
 }
});

test('owned movement remains continuous under 120, 200 and 600 ms snapshot cadence',()=>{
 for(const cadence of [120,200,600])for(const fps of [10,20,30,60,120]){
  const room=roomFixture(),motion=new LocalArcadeMotion();acknowledge(motion,room,0,0);let previous=300,nextArrival=cadence;
  for(let frame=1;frame<=fps;frame++){
   const now=frame*1000/fps;
   while(now+1e-7>=nextArrival){const source=nextArrival-cadence/2;room.serverTime=1000+source;room.sequence++;room.state.basketball.players[0].x=300+source*.14;acknowledge(motion,room,2*source-nextArrival,nextArrival);nextArrival+=cadence;}
   const before=structuredClone(room),shown=motion.sample(room,{moveX:1,moveY:0},1/fps,now),x=shown.basketball.players[0].x;
   near(x-previous,140/fps,.15);assert.ok(x>previous,'holding input cannot pause at the network request cadence');assert.deepEqual(room,before);previous=x;
  }
  near(previous,440,.3);
 }
});

test('a single slow render frame consumes its full elapsed movement time',()=>{
 const room=roomFixture(),motion=new LocalArcadeMotion();acknowledge(motion,room,0,0);
 const shown=motion.sample(room,{moveX:1,moveY:0},.2,200);near(shown.basketball.players[0].x,328);near(shown.basketball.players[0].y,220);near(room.state.basketball.players[0].x,300);
});

test('basketball bounds normalize diagonals and a new input epoch discards old presentation movement',()=>{
 const room=roomFixture(),motion=new LocalArcadeMotion();acknowledge(motion,room,0,0);
 let shown=motion.sample(room,{moveX:1,moveY:1},1/60,1000/60);near(shown.basketball.players[0].x-300,140/Math.sqrt(2)/60);near(shown.basketball.players[0].y-220,140/Math.sqrt(2)/60);
 room.inputEpoch='epoch-2';room.serverTime=1100;room.state.basketball.players[0].x=684;room.state.basketball.players[0].y=387;acknowledge(motion,room,100,100);
 shown=motion.sample(room,{moveX:1,moveY:1},1/60,120);near(shown.basketball.players[0].x,685);near(shown.basketball.players[0].y,388);
 shown=motion.sample(room,{moveX:-1,moveY:-1},1/60,140);near(shown.basketball.players[0].x,685-140/Math.sqrt(2)/60);near(shown.basketball.players[0].y,388-140/Math.sqrt(2)/60);
});

test('air hockey presents the owned mallet immediately with player-specific bounds and untouched opponent physics',()=>{
 for(const slot of [0,1]){
  const room=roomFixture(3,slot),motion=new LocalArcadeMotion();room.state.opponent={x:420,y:95};const before=structuredClone(room);acknowledge(motion,room,0,0);
  let shown=motion.sample(room,{x:900,y:1000},1/60,16);
  if(slot===0){assert.deepEqual(shown.pointer,{x:685,y:400});assert.deepEqual(shown.opponent,before.state.opponent);}
  else {assert.deepEqual(shown.opponent,{x:685,y:60});assert.deepEqual(shown.pointer,before.state.pointer);}
  shown=motion.sample(room,{x:-200,y:-200},1/60,32);
  if(slot===0)assert.deepEqual(shown.pointer,{x:115,y:250});else assert.deepEqual(shown.opponent,{x:115,y:210});
  assert.deepEqual(shown.puck,before.state.puck);assert.equal(shown.score,before.state.score);assert.equal(shown.remaining,before.state.remaining);assert.deepEqual(room,before);
 }
});

test('spectators, unstarted games and ended rounds keep only authoritative presentation',()=>{
 for(const change of [room=>{room.role='spectator';},room=>{room.started=false;},room=>{room.state.ended=true;room.state.basketball.ended=true;},room=>{room.slots[0].actor='account:another';}]){
  const room=roomFixture(),motion=new LocalArcadeMotion();change(room);acknowledge(motion,room,0,0);const before=structuredClone(room),shown=motion.sample(room,{moveX:1,moveY:1,x:600,y:300},.05,50),presentation=structuredClone(shown);delete presentation.basketball.selfSlot;assert.deepEqual(presentation,room.state);assert.deepEqual(room,before);
 }
});

test('the arcade input stream sends press and release while a heartbeat is unresolved and coalesces a burst to its latest state',async()=>{
 const pending=[],states=[],errors=[];let moveX=0,clock=100;
 const stream=createArcadeInputStream({send:controls=>new Promise((resolve,reject)=>pending.push({controls,resolve,reject})),readInput:()=>({moveX}),ready:()=>true,now:()=>clock,onState:state=>states.push(state),onError:error=>errors.push(error)});
 stream.poll(clock);await drain();assert.equal(pending.length,1);assert.equal(pending[0].controls.moveX,0);
 moveX=1;stream.request();moveX=0;stream.request();await drain();assert.deepEqual(pending.map(request=>request.controls.moveX),[0,1,0]);
 for(let edge=0;edge<100;edge++){moveX=edge===99?-.25:edge%2?1:-1;stream.request();}
 await drain();assert.equal(pending.length,3);clock=500;stream.poll(clock);await drain();assert.equal(pending.length,3,'a heartbeat cannot add a fourth request while controls are pending');
 pending[0].resolve({sequence:1});await drain();assert.equal(pending.length,4);assert.equal(pending[3].controls.moveX,-.25,'one slot flushes only the final coalesced state');
 pending[1].resolve({sequence:2});pending[2].resolve({sequence:3});pending[3].resolve({sequence:4});await drain();assert.equal(pending.length,4);assert.equal(errors.length,0);assert.ok(states.length>0);
 stream.reset();
});

test('stream reset drops queued input and ignores stale successes or errors',async()=>{
 const pending=[],states=[],errors=[];let moveX=0,ready=true;
 const stream=createArcadeInputStream({send:controls=>new Promise((resolve,reject)=>pending.push({controls,resolve,reject})),readInput:()=>({moveX}),ready:()=>ready,now:()=>100,onState:state=>states.push(state),onError:error=>errors.push(error)});
 for(const value of [1,-1,0,.5]){moveX=value;stream.request();}
 await drain();assert.equal(pending.length,3);stream.reset();pending[0].resolve({sequence:1});pending[1].reject(Error('obsolete connection'));pending[2].resolve({sequence:3});await drain();assert.equal(pending.length,3);assert.deepEqual(states,[]);assert.deepEqual(errors,[]);
 ready=false;stream.request();stream.poll(1000);await drain();assert.equal(pending.length,3);
});

test('idle stream polling honors the fifty millisecond keepalive interval',async()=>{
 const sent=[];let clock=100;
 const stream=createArcadeInputStream({send:async controls=>{sent.push(controls);return {sequence:sent.length};},readInput:()=>({moveX:0}),ready:()=>true,now:()=>clock,onState:()=>{},onError:error=>{throw error;}});
 stream.poll(clock);await drain();assert.equal(sent.length,1);clock=149;stream.poll(clock);await drain();assert.equal(sent.length,1);clock=150;stream.poll(clock);await drain();assert.equal(sent.length,2);stream.reset();
});
