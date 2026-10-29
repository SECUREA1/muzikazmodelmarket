import test from 'node:test';
import assert from 'node:assert/strict';
import {PING_PONG,pingPongCommand,stepPingPong,pingPongView,cancelPingPong} from '../public/js/ping-pong-rules.js';

function fixture(){
 let now=1000;
 const a={actorId:'a',username:'A',position:{x:0,y:0,z:0},yaw:0,health:100},b={actorId:'b',username:'B',position:{x:0,y:0,z:-5},yaw:Math.PI,health:100},sim={players:{a,b},actors:{}};
 const command=(player,operation,fields={},context={})=>pingPongCommand(sim,player,{operation,...fields},now,context);
 const advance=seconds=>{for(let elapsed=0;elapsed<seconds-.0001;elapsed+=.025){now+=25;stepPingPong(sim,now,.025);}};
 return {sim,a,b,command,advance,get now(){return now;}};
}
test('draw and stow preserve scene state, animate strokes, and remove a live rally',()=>{
 const f=fixture();assert.throws(()=>f.command(f.a,'serve'),/Draw your waist paddle/);
 f.command(f.a,'equip');assert.equal(f.a.pingPong.equipped,true);assert.equal(f.a.pingPong.equippedAt,f.now);
 f.command(f.a,'serve',{targetId:'ai'});assert.equal(pingPongView(f.sim).balls.length,1);assert.equal(pingPongView(f.sim).partners.length,1);
 const sequence=f.a.pingPong.sequence;assert.throws(()=>f.command(f.a,'swing'),/finish its swing/);
 f.advance(.3);assert.equal(f.command(f.a,'swing',{stroke:'backhand'}).hit,false);assert.ok(f.a.pingPong.sequence>sequence);assert.equal(f.a.pingPong.stroke,'backhand');
 f.command(f.a,'stow');assert.equal(f.a.pingPong.equipped,false);assert.equal(pingPongView(f.sim).balls.length,0);assert.equal(pingPongView(f.sim).partners.length,0);
});
test('AI practice partner physically returns balls and a human can maintain a rally',()=>{
 const f=fixture();f.command(f.a,'equip');f.command(f.a,'serve',{targetId:'ai'});
 f.advance(.95);let ball=pingPongView(f.sim).balls[0];assert.equal(ball.targetId,'a');assert.equal(ball.rally,2);
 assert.ok(pingPongView(f.sim).partners[0].pingPong.swingAt>0);
 f.advance(.7);const hit=f.command(f.a,'swing',{stroke:'backhand'});assert.equal(hit.hit,true);assert.equal(hit.rally,3);
 f.advance(.95);ball=pingPongView(f.sim).balls[0];assert.equal(ball.targetId,'a');assert.equal(ball.rally,4);assert.equal(f.a.pingPong.bestRally,4);
});
test('two equipped players control their own returns and forged position or score fields are ignored',()=>{
 const f=fixture();f.command(f.a,'equip');assert.throws(()=>f.command(f.a,'serve',{targetId:'b'}),/paddle drawn/);
 f.command(f.b,'equip');f.command(f.a,'serve',{targetId:'b',position:{x:999,y:999,z:999},rally:999});
 assert.equal(pingPongView(f.sim).balls[0].rally,1);assert.deepEqual(pingPongView(f.sim).balls[0].position,{x:0,y:1.12,z:0});
 f.advance(.75);assert.equal(f.command(f.b,'swing',{stroke:'forehand'}).hit,true);assert.equal(pingPongView(f.sim).balls[0].targetId,'a');
 f.advance(.75);assert.equal(f.command(f.a,'swing',{stroke:'backhand'}).hit,true);assert.equal(pingPongView(f.sim).balls[0].rally,3);assert.equal(pingPongView(f.sim).partners.length,0);
});
test('an early requested stroke catches the incoming ball during its bounded animation window',()=>{
 const f=fixture();f.command(f.a,'equip');f.command(f.b,'equip');f.command(f.a,'serve',{targetId:'b'});
 f.advance(.45);assert.equal(f.command(f.b,'swing',{stroke:'backhand'}).hit,false,'ball has not reached the paddle at request time');
 const sequence=f.b.pingPong.sequence;f.advance(.325);
 const ball=pingPongView(f.sim).balls[0];assert.equal(ball.rally,2);assert.equal(ball.targetId,'a');assert.equal(f.b.pingPong.lastReturnSequence,sequence);assert.equal(f.b.pingPong.stroke,'backhand');
 // An old sequence cannot make subsequent returns without a new user stroke.
 f.advance(.75);assert.equal(f.command(f.a,'swing').hit,true);f.advance(1.1);assert.equal(pingPongView(f.sim).balls[0].rally,3);
});
test('a stroke outside its contact window never returns an approaching ball automatically',()=>{
 const f=fixture();f.command(f.a,'equip');f.command(f.b,'equip');f.command(f.a,'serve',{targetId:'b'});
 f.advance(.2);assert.equal(f.command(f.b,'swing').hit,false);f.advance(1.1);assert.equal(pingPongView(f.sim).balls[0].rally,1);assert.equal(f.b.pingPong.lastReturnSequence,undefined);
 // A late request after the ball passes behind the avatar also cannot return.
 f.advance(.1);assert.equal(f.command(f.b,'swing').hit,false);f.advance(.4);assert.equal(pingPongView(f.sim).balls[0].rally,1);
});
test('contacts require reach and forward direction, and missed balls expire',()=>{
 const f=fixture();f.command(f.a,'equip');f.command(f.b,'equip');f.command(f.a,'serve',{targetId:'b'});
 assert.equal(f.command(f.b,'swing').hit,false,'cannot hit a ball five metres away');
 f.advance(.8);f.b.yaw=0;assert.equal(f.command(f.b,'swing').hit,false,'cannot reach behind the avatar');
 f.advance(2);assert.equal(pingPongView(f.sim).balls[0].status,'missed');
 f.advance(2.1);assert.equal(pingPongView(f.sim).balls.length,0);assert.match(f.a.pingPong.message,/missed/);
});
test('range, obstacles and unavailable players are enforced before starting a rally',()=>{
 const f=fixture();f.command(f.a,'equip');f.command(f.b,'equip');
 f.b.position.z=-PING_PONG.partnerReach-1;assert.throws(()=>f.command(f.a,'serve',{targetId:'b'}),/closer/);
 f.b.position.z=-5;assert.throws(()=>f.command(f.a,'serve',{targetId:'b'},{visible:()=>false}),/clear path/);
 assert.throws(()=>f.command(f.a,'serve',{targetId:'ai'},{visible:()=>false}),/open space/);
 f.command(f.a,'serve',{targetId:'b'});f.b.vehicleId='boat';f.advance(.05);assert.equal(f.b.pingPong.equipped,false);assert.equal(pingPongView(f.sim).balls.length,0);
});
test('nearby resident AI is addressed by actor id and a departed owner removes its partner',()=>{
 const f=fixture();f.command(f.a,'equip');f.sim.actors.resident={id:'resident',active:true,health:100,position:{x:0,y:0,z:-4},rotation:{y:Math.PI},resident:{name:'Kai'}};
 f.command(f.a,'serve',{targetId:'resident'});assert.equal(pingPongView(f.sim).partners[0].residentId,'resident');
 f.advance(.8);assert.equal(pingPongView(f.sim).balls[0].targetId,'a');
 f.a.replacedByRoom='elsewhere';f.advance(.05);assert.equal(pingPongView(f.sim).balls.length,0);assert.equal(pingPongView(f.sim).partners.length,0);
 cancelPingPong(f.sim,f.a);assert.equal(f.a.pingPong.equipped,false);
});
