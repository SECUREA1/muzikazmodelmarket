import test from 'node:test';
import assert from 'node:assert/strict';
import {stepRadToxEnemy} from '../rad-tox-campaign.mjs';

test('brain ranged attack has an authoritative tell, damage and one replayable event',()=>{
 const target={id:'alice',position:{x:0,y:0,z:5},health:100};
 const actor={id:'brain-1',kind:'brain',position:{x:0,y:0,z:0},rotation:{y:0},definition:{movement:{speed:0}}};
 const sim={events:[]};
 stepRadToxEnemy(sim,actor,[target],1000,.1);
 assert.equal(target.health,100);
 stepRadToxEnemy(sim,actor,[target],2200,.1);
 assert.equal(actor.attack.phase,'tell');assert.equal(sim.events.length,0);
 stepRadToxEnemy(sim,actor,[target],2600,.1);
 assert.ok(target.health<100);assert.equal(sim.events.length,1);
 assert.equal(sim.events[0].kind,'brain');assert.deepEqual(sim.events[0].target,target.position);
 stepRadToxEnemy(sim,actor,[target],2650,.1);assert.equal(sim.events.length,1);
});

test('walls block ranged enemy damage and events',()=>{
 const target={id:'alice',position:{x:0,y:0,z:4},health:100};
 const actor={id:'ghost',kind:'ghost',lastAttack:1,position:{x:0,y:0,z:0},rotation:{y:0},definition:{movement:{speed:0}}};
 const sim={events:[]};stepRadToxEnemy(sim,actor,[target],2000,.1,()=>true);
 assert.equal(target.health,100);assert.equal(sim.events.length,0);
 stepRadToxEnemy(sim,actor,[],2100,.1);assert.equal(actor.attack,null);
});

test('enemy movement uses server collision resolution and real player identity',()=>{
 const target={actorId:'account:alice',position:{x:0,y:0,z:10},health:100};
 const actor={id:'brain',kind:'brain',position:{x:0,y:0,z:0},rotation:{y:0},definition:{movement:{speed:2}}};
 let resolutions=0;const sim={events:[]};
 stepRadToxEnemy(sim,actor,[target],1000,.25,()=>false,(previous,next)=>{resolutions++;assert.ok(Math.hypot(next.x-previous.x,next.z-previous.z)>0);return {...previous,floorY:0};});
 assert.ok(resolutions>=1);assert.deepEqual(actor.position,{x:0,y:0,z:0});assert.equal(actor.attack.targetId,'account:alice');
});

test('projectile combat can own attacks without duplicate direct damage',()=>{
 const target={actorId:'account:alice',position:{x:0,y:0,z:4},health:100};
 const actor={id:'brain',kind:'brain',lastAttack:1,position:{x:0,y:0,z:0},rotation:{y:0},definition:{movement:{speed:0}}};
 const sim={events:[]};
 stepRadToxEnemy(sim,actor,[target],2000,.1,()=>false,(_previous,next)=>next,false);
 assert.equal(target.health,100);assert.equal(actor.lastAttack,1);assert.equal(sim.events.length,0);assert.equal(actor.attack.phase,'tell');
});

test('enemies flank an obstacle when forward and axis slides are blocked',()=>{
 const target={actorId:'account:alice',position:{x:0,y:0,z:10},health:100};
 const actor={id:'toxic-1',kind:'toxic',position:{x:0,y:0,z:0},rotation:{y:0},definition:{movement:{speed:2}}};
 stepRadToxEnemy({events:[]},actor,[target],1000,.1,()=>false,(previous,next)=>next.z>0?previous:next,false);
 assert.ok(Math.abs(actor.position.x)>.1,'steps sideways around the obstruction');
 assert.equal(actor.position.z,0,'does not move through the wall');
});

test('enemy defaults pursue actively without authored movement settings',()=>{
 for(const kind of ['toxic','snake','ghost','brain','boss']){
  const actor={id:kind,kind,position:{x:0,y:0,z:0},rotation:{y:0},definition:{}};
  stepRadToxEnemy({events:[]},actor,[{id:'alice',position:{x:0,y:0,z:10},health:100}],1000,.1,()=>false,(_previous,next)=>next,false);
  assert.ok(actor.position.z>=.19,kind+' closes distance every simulation step');
 }
});
