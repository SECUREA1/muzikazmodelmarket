import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {LocalEnemyPopulation,LocalRewardField} from '../public/js/rad-tox-local-population.js';
import {radToxWavePopulation} from '../public/js/rad-tox-wave-rules.js';

test('local enemies refill through a finite wave budget without exceeding the mobile live cap',async()=>{
  let now=0,created=0,highest=0;
  const plan=radToxWavePopulation(3,2,{mobile:true});
  const population=new LocalEnemyPopulation({now:()=>now,yieldFrame:async()=>{},spawn:kind=>{created++;return {kind,userData:{}};}});
  population.begin('phase',plan);
  await population.fill();assert.equal(population.alive,plan.concurrent.total);
  while(population.remaining){
    highest=Math.max(highest,population.alive);
    for(const slot of population.slots.filter(item=>item.state==='active'))assert.equal(population.defeat(slot.root),true);
    now+=1100;await population.fill();
  }
  assert.equal(highest,plan.concurrent.total);assert.ok(highest<=14);
  assert.equal(created,plan.budget.total);assert.equal(population.defeated,plan.budget.total);
  now+=2000;await population.fill();assert.equal(population.alive,0);assert.equal(created,plan.budget.total);
});

test('failed placements retry while successful enemies and accepted kills keep their quota',async()=>{
  let now=0,failures=4,created=0;
  const plan=radToxWavePopulation(1,1),population=new LocalEnemyPopulation({now:()=>now,yieldFrame:async()=>{},spawn:()=>{if(failures-->0)return null;created++;return {userData:{}};}});
  population.begin('phase',plan,5);await population.fill();
  assert.equal(population.defeated,5);assert.ok(population.alive<=plan.concurrent.total);
  while(population.remaining){for(const slot of population.slots.filter(item=>item.state==='active'))population.defeat(slot.root);now+=1100;await population.fill();}
  assert.equal(created,plan.budget.total-5);assert.equal(population.defeated,plan.budget.total);
});

test('changing maps cancels an outstanding enemy placement',async()=>{
  let release,disposed=0;
  const population=new LocalEnemyPopulation({spawn:()=>new Promise(resolve=>{release=resolve;}),dispose:()=>disposed++,yieldFrame:async()=>{}});
  population.begin('old',radToxWavePopulation(1,1));const filling=population.fill();population.clear();release({userData:{}});await filling;
  assert.equal(disposed,1);assert.equal(population.alive,0);assert.equal(population.slots.length,0);
});

const manifest=[
  {id:'coin',slot:0,kind:'mzk',amountMzk:5},
  {id:'health',slot:1,kind:'supply',resource:'health',amount:25},
  {id:'kill-coin',slot:2,kind:'mzk',amountMzk:2,requiresKills:2},
  {id:'boss-pack',slot:3,kind:'catalog',catalogId:'survival-pack',requiresBoss:true}
];
function rewardsFixture({floorAt=(x,z)=>({point:new THREE.Vector3(x,0,z)})}={}){
  const collected=[],group=new THREE.Group(),frames=new Map();let nextFrame=0;
  const field=new LocalRewardField({THREE,group,floorAt,createVisual:()=>new THREE.Mesh(new THREE.SphereGeometry(.1,6,4),new THREE.MeshBasicMaterial()),collect:entry=>collected.push(entry.id),scheduleFrame:callback=>{const handle=++nextFrame;frames.set(handle,callback);return handle;},cancelFrame:handle=>frames.delete(handle)});
  const next=()=>{const [handle,callback]=frames.entries().next().value||[];if(!callback)return false;frames.delete(handle);callback();return true;};
  const drain=()=>{let count=0;while(next())assert.ok(++count<500,'reward placement terminates');};
  return {field,collected,group,frames,next,drain};
}

test('each player gets a private starting reward field with immediate local collection and pending currency',()=>{
  const first=rewardsFixture(),second=rewardsFixture(),position=new THREE.Vector3();
  first.field.begin('phase',manifest);second.field.begin('phase',manifest);
  first.field.populate({position});second.field.populate({position});
  assert.equal(first.group.children.length,2);assert.equal(second.group.children.length,2);
  const coin=first.field.entries.get('coin').root;assert.ok(coin.position.z<0,'the first coin is placed in front of the player');
  const player=coin.position.clone();first.field.update(.016,1,player);first.field.update(.016,2,player);
  assert.deepEqual(first.collected,['coin','health']);assert.equal(first.field.pendingMzk,5);
  assert.equal(second.group.children.length,2,'collecting a coin cannot remove another player’s coin');
  first.field.begin('phase',manifest);assert.equal(first.field.entries.get('coin').root,null,'a repeated manifest does not respawn a pending claim');
  first.field.acknowledge(['coin']);assert.equal(first.field.pendingMzk,0);first.field.populate({position});
  assert.equal(first.field.entries.get('coin').root,null);first.field.clear();second.field.clear();
});

test('kill and boss rewards stay hidden until their server-issued requirements are met',()=>{
  const {field,group}=rewardsFixture(),position=new THREE.Vector3();field.begin('phase',manifest,['coin']);
  field.populate({position,kills:1});assert.equal(group.children.length,1);
  field.populate({position,kills:2,dropPosition:new THREE.Vector3(5,0,5)});assert.equal(group.children.length,2);assert.ok(field.entries.get('kill-coin').root);
  assert.equal(field.entries.get('boss-pack').root,null);
  field.populate({position,kills:2,bossDefeated:true});assert.ok(field.entries.get('boss-pack').root);field.clear();
});

test('six starting coins and six supplies remain collectible after manifest refresh or reload',()=>{
  const entries=Array.from({length:6},(_,slot)=>({id:`coin-${slot}`,slot,kind:'mzk',amountMzk:5})).concat(Array.from({length:6},(_,index)=>({id:`supply-${index}`,slot:6+index,kind:'supply',resource:index%2?'health':'ammo',amount:24})));
  const first=rewardsFixture(),position=new THREE.Vector3();first.field.begin('phase',entries);first.field.populate({position});
  first.drain();
  assert.equal(first.group.children.length,12);first.field.acknowledge(['coin-0','supply-0']);
  const reloaded=rewardsFixture();reloaded.field.begin('phase',entries,['coin-0','supply-0']);reloaded.field.populate({position});
  reloaded.drain();
  assert.equal(reloaded.group.children.length,10);assert.equal(reloaded.field.entries.get('coin-0').root,null);
  first.field.clear();reloaded.field.clear();
});

test('reward floor queries are limited per frame and queued work cannot cross a map change',()=>{
  let checks=0;
  const fixture=rewardsFixture({floorAt:(x,z)=>{checks++;return {point:new THREE.Vector3(x,0,z)};}}),position=new THREE.Vector3();
  const entries=Array.from({length:30},(_,slot)=>({id:`reward-${slot}`,slot,kind:'mzk',amountMzk:2}));
  fixture.field.begin('old',entries);fixture.field.populate({position});assert.equal(checks,2);assert.equal(fixture.group.children.length,2);
  fixture.field.populate({position});assert.equal(checks,2,'manifest polls share the scheduled placement job');
  fixture.next();assert.equal(checks,4);assert.equal(fixture.group.children.length,4);
  const staleCallback=fixture.frames.values().next().value;
  fixture.field.begin('new',[{id:'new-coin',slot:0,kind:'mzk',amountMzk:5}]);fixture.field.populate({position});
  assert.equal(checks,5);staleCallback();assert.equal(checks,5);assert.equal(fixture.group.children.length,1);
  assert.equal(fixture.field.entries.has('reward-0'),false);fixture.field.clear();
});

test('unplaceable rewards have a finite retry budget while rendering continues between checks',()=>{
  let checks=0;
  const fixture=rewardsFixture({floorAt:()=>{checks++;return null;}}),position=new THREE.Vector3();
  fixture.field.begin('phase',Array.from({length:8},(_,slot)=>({id:`reward-${slot}`,slot,kind:'mzk',amountMzk:2})));
  fixture.field.populate({position});assert.equal(checks,2);
  while(fixture.frames.size){const before=checks;fixture.next();assert.ok(checks-before<=2);}
  assert.equal(checks,40);assert.equal(fixture.group.children.length,0);fixture.field.clear();
});
