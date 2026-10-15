import test from 'node:test';
import assert from 'node:assert/strict';
import {UtilityKit,UTILITY_TOOLS} from '../public/js/game-utilities.js';

test('healing and shields apply effects, respect cooldowns and limited charges, and reset',()=>{
 const kit=new UtilityKit();let health=40,shield=0;
 const context={get health(){return health;},maxHealth:100,heal:amount=>health=Math.min(100,health+amount),shield:until=>shield=until};
 assert.equal(kit.use('medkit',context,0).ok,true);assert.equal(health,70);
 assert.equal(kit.use('medkit',context,1).ok,false);assert.equal(health,70);
 assert.equal(kit.use('shield-kit',context,1).ok,true);assert.equal(shield,7);
 assert.equal(kit.use('shield-kit',context,32).ok,true);
 assert.equal(kit.use('shield-kit',context,63).ok,false);
 kit.reset();assert.equal(kit.use('shield-kit',context,64).ok,true);
});

test('invalid repair and recycling do not consume cooldowns; valid targets call effects',()=>{
 const kit=new UtilityKit();let repaired=0,removed=0;
 assert.equal(kit.use('repair-tool',{target:null},0).ok,false);
 const root={userData:{brick:true,hits:2}};
 assert.equal(kit.use('repair-tool',{target:root,repair:()=>repaired++},0).ok,true);
 assert.equal(repaired,1);
 assert.equal(kit.use('recycler',{target:root,remove:()=>removed++},0).ok,true);
 assert.equal(removed,1);
});

test('scanner, supplies and beacons call their game actions and enforce limits',()=>{
 const kit=new UtilityKit();let scanRange=0,supplies=0,point=null;
 assert.equal(kit.use('scanner',{scan:range=>{scanRange=range;return 3;}},0).ok,true);
 assert.equal(scanRange,15);
 assert.equal(kit.use('supply-kit',{refill:amount=>supplies+=amount},0).ok,true);
 assert.equal(supplies,12);
 assert.equal(kit.use('beacon',{point:null},0).ok,false);
 assert.equal(kit.use('beacon',{point:{x:1},mark:value=>point=value},0).ok,true);
 assert.deepEqual(point,{x:1});
 assert.equal(Object.keys(UTILITY_TOOLS).length,7);
});
