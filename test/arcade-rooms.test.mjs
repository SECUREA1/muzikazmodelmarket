import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ArcadeRooms} from '../arcade-rooms.mjs';
import {createArcadeMatch} from '../public/js/arcade-match.js';
const env={arcade:{roundSeconds:45,basketballMode:'shooting'}},a={accountId:'a',username:'Alice'},b={accountId:'b',username:'Bob'},v={accountId:'v',username:'Viewer'};
test('join waits for start, shared scores and read-only spectators',()=>{let now=0;const rooms=new ArcadeRooms({now:()=>now});let s=rooms.command('park',env,a,{action:'join',game:2,slot:0});assert.equal(s.started,false);now=1000;rooms.tick();assert.equal(rooms.command('park',env,a,{action:'watch'}).state.remaining,45);rooms.command('park',env,b,{action:'join',game:2,slot:1});rooms.command('park',env,v,{action:'spectate',game:2});assert.throws(()=>rooms.command('park',env,v,{action:'start'}),{statusCode:403});assert.throws(()=>rooms.command('park',env,v,{action:'input',input:{x:400}}),{statusCode:403});assert.throws(()=>rooms.command('park',env,b,{action:'start'}),{statusCode:403});rooms.command('park',env,a,{action:'start'});rooms.command('park',env,a,{action:'action',input:{x:400,y:370}});now=2000;rooms.tick();now=2500;rooms.tick();s=rooms.command('park',env,v,{action:'watch'});assert.equal(s.state.score,150);assert.equal(s.role,'spectator');assert.equal(s.slots.length,2);assert.ok(s.state.remaining<45);});
test('take over AI, reject occupied slots, leave restores AI and limits one player game',()=>{const rooms=new ArcadeRooms({now:()=>0});rooms.command('one',env,a,{action:'join',game:3,slot:0});assert.throws(()=>rooms.command('one',env,b,{action:'join',game:3,slot:0}),{statusCode:409});rooms.command('one',env,b,{action:'join',game:3,slot:1});rooms.command('one',env,v,{action:'spectate',game:3});rooms.command('one',env,b,{action:'leave'});const s=rooms.command('one',env,v,{action:'join',game:3,slot:1});assert.equal(s.slots[1].actor,'account:v');rooms.command('two',env,a,{action:'join',game:2});assert.equal(rooms.rooms.get('one').slots[0].actor,null);assert.throws(()=>rooms.command('one',env,a,{action:'join',game:2}),{statusCode:409});});
test('all five games use finite shared simulation and stale players return to AI',()=>{for(let game=0;game<5;game++){const match=createArcadeMatch(game,{roundSeconds:15,difficulty:'easy',basketballMode:'shooting'});for(let i=0;i<200;i++){match.input({x:400,y:150});if(i%15===0)match.action();match.step(.1);}const s=match.snapshot();assert.equal(s.ended,true);assert.equal(s.remaining,0);assert.ok(Number.isFinite(s.score));}let now=0;const rooms=new ArcadeRooms({now:()=>now});rooms.command('one',env,a,{action:'join',game:2});rooms.command('one',env,v,{action:'spectate',game:2});now=14000;rooms.command('one',env,v,{action:'watch'});now=16000;rooms.tick();assert.equal(rooms.rooms.get('one').slots[0].actor,null);});

test('per-member input sequences preserve the latest release and ignore inputs carrying a different epoch',()=>{
 let now=1000;const rooms=new ArcadeRooms({now:()=>now}),full={arcade:{basketballMode:'full',teamSize:1,aiFill:false,periodSeconds:60}},join=rooms.command('ordered',full,a,{action:'join',game:2,slot:0});
 assert.equal(typeof join.inputEpoch,'string');assert.ok(join.inputEpoch.length>0);assert.equal(join.serverTime,now);const epoch=join.inputEpoch;
 rooms.command('ordered',full,a,{action:'start'});
 rooms.command('ordered',full,a,{action:'input',inputEpoch:epoch,inputSequence:2,input:{moveX:1,moveY:0}});
 rooms.command('ordered',full,a,{action:'input',inputEpoch:epoch,inputSequence:3,input:{moveX:0,moveY:0}});
 let state=rooms.command('ordered',full,a,{action:'input',inputEpoch:epoch,inputSequence:1,input:{moveX:1,moveY:0}});assert.equal(state.state.basketball.players[0].input.moveX,0);
 state=rooms.command('ordered',full,a,{action:'input',inputEpoch:'obsolete-epoch',inputSequence:99,input:{moveX:1}});assert.equal(state.state.basketball.players[0].input.moveX,0);
 state=rooms.command('ordered',full,a,{action:'input',inputEpoch:epoch,inputSequence:4,input:{moveX:-.5}});assert.equal(state.state.basketball.players[0].input.moveX,-.5);
 const second=rooms.command('ordered',full,b,{action:'join',game:2,slot:1});state=rooms.command('ordered',full,b,{action:'input',inputEpoch:second.inputEpoch,inputSequence:1,input:{moveX:.75}});assert.equal(state.state.basketball.players[1].input.moveX,.75);assert.equal(state.state.basketball.players[0].input.moveX,-.5);
});

test('a rejoined player receives a fresh input epoch and cannot restore movement with the old epoch',()=>{
 const rooms=new ArcadeRooms({now:()=>1234}),full={arcade:{basketballMode:'full',teamSize:1,aiFill:false}},first=rooms.command('epoch',full,a,{action:'join',game:2,slot:0});rooms.command('epoch',full,a,{action:'start'});
 rooms.command('epoch',full,a,{action:'input',inputEpoch:first.inputEpoch,inputSequence:9,input:{moveX:1}});
 rooms.command('epoch',full,a,{action:'leave'});const renewed=rooms.command('epoch',full,a,{action:'join',game:2,slot:0});assert.notEqual(renewed.inputEpoch,first.inputEpoch);
 rooms.command('epoch',full,a,{action:'input',inputEpoch:renewed.inputEpoch,inputSequence:1,input:{moveX:0}});
 const late=rooms.command('epoch',full,a,{action:'input',inputEpoch:first.inputEpoch,inputSequence:100,input:{moveX:1}});assert.equal(late.state.basketball.players[0].input.moveX,0);assert.equal(late.inputEpoch,renewed.inputEpoch);
});

test('an older captured action may shoot without restoring its obsolete movement controls',()=>{
 let now=1000;const rooms=new ArcadeRooms({now:()=>now}),full={arcade:{basketballMode:'full',teamSize:1,aiFill:false,periodSeconds:60}},joined=rooms.command('action-order',full,a,{action:'join',game:2,slot:0}),inputEpoch=joined.inputEpoch;
 rooms.command('action-order',full,a,{action:'start'});now+=500;rooms.tick();now+=300;rooms.tick();
 rooms.command('action-order',full,a,{action:'input',inputEpoch,inputSequence:3,input:{moveX:0,moveY:0}});
 const state=rooms.command('action-order',full,a,{action:'action',kind:'shoot',inputEpoch,inputSequence:2,input:{moveX:1,moveY:0,x:400,y:65}});
 assert.equal(state.state.basketball.players[0].input.moveX,0);assert.equal(state.state.attempts,1);assert.ok(state.state.basketball.shot);
});
