import test from 'node:test';
import assert from 'node:assert/strict';
import {stepRadToxEnemy} from '../rad-tox-campaign.mjs';

test('brain ranged attack has an authoritative tell, damage and one replayable event',()=>{
 const target={id:'alice',position:{x:0,y:0,z:5},health:100};
 const actor={id:'brain-1',kind:'brain',position:{x:0,y:0,z:0},rotation:{y:0},definition:{movement:{speed:0}}};
 const sim={events:[]};
 stepRadToxEnemy(sim,actor,[target],1000,.1);
 assert.equal(target.health,100);
 stepRadToxEnemy(sim,actor,[target],2000,.1);
 assert.equal(actor.attack.phase,'tell');assert.equal(sim.events.length,0);
 stepRadToxEnemy(sim,actor,[target],2450,.1);
 assert.ok(target.health<100);assert.equal(sim.events.length,1);
 assert.equal(sim.events[0].kind,'brain');assert.deepEqual(sim.events[0].target,target.position);
 stepRadToxEnemy(sim,actor,[target],2500,.1);assert.equal(sim.events.length,1);
});

test('walls block ranged enemy damage and events',()=>{
 const target={id:'alice',position:{x:0,y:0,z:4},health:100};
 const actor={id:'ghost',kind:'ghost',lastAttack:1,position:{x:0,y:0,z:0},rotation:{y:0},definition:{movement:{speed:0}}};
 const sim={events:[]};stepRadToxEnemy(sim,actor,[target],2000,.1,()=>true);
 assert.equal(target.health,100);assert.equal(sim.events.length,0);
 stepRadToxEnemy(sim,actor,[],2100,.1);assert.equal(actor.attack,null);
});
