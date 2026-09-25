import test from 'node:test';
import assert from 'node:assert/strict';
import { BuilderGameplayRuntime, compileBuilderScene, upgradeBuilderManifest } from '../public/js/builder-gameplay-pipeline.js';

test('builder scenes compile into a gameplay manifest with an authored player spawn', () => {
  const manifest = compileBuilderScene({
    id: 'creator-arena',
    objects: [
      { id: 'start', modelId: 'hero-spawn', position: { x: 4, y: 0.5, z: -3 }, rotation: { y: 1.25 }, functionalSettings: { behavior: 'talk' } },
      { id: 'enemy', modelId: 'rad-tox', position: { x: 8, y: 0, z: 2 }, functionalSettings: { behavior: 'hostile' } },
      { id: 'tree', modelId: 'canopy-tree', position: { x: 0, y: 0, z: 0 }, functionalSettings: { behavior: 'decor' } }
    ]
  });

  assert.equal(manifest.sceneId, 'creator-arena');
  assert.equal(manifest.objectCount, 3);
  assert.equal(manifest.actorCount, 2);
  assert.deepEqual(manifest.spawn, { objectId: 'start', position: { x: 4, y: 0.5, z: -3 }, rotationY: 1.25 });
  assert.deepEqual(manifest.actors.map((actor) => actor.behavior), ['talk', 'hostile']);
});

test('invalid transform values cannot poison gameplay coordinates', () => {
  const manifest = compileBuilderScene({ objects: [{ id: 'start', modelId: 'hero-spawn', position: { x: 'bad', y: Infinity, z: null } }] });
  assert.deepEqual(manifest.spawn.position, { x: 0, y: 0, z: 0 });
});

test('complete gameplay configuration survives manifest serialization', () => {
  const scene = { id:'lossless', layout:'skyport', weather:'storm', objects:[{
    id:'plane', modelId:'corsair-aircraft', objectType:'vehicle', groundOffset:2.25,
    position:{x:1,y:2,z:3}, rotation:{x:.1,y:.2,z:.3}, scale:{x:2,y:3,z:4},
    materialSettings:{accent:'#123456',useAccent:true},
    animationState:{clip:'Propeller',idleClip:'Idle',movementClip:'Fly',interactionClip:'Start',speed:1.5,loop:false,autoplay:false},
    functionalSettings:{behavior:'vehicle',trigger:'interact',action:'fly',value:7,cooldown:4,interactionDistance:5},
    movementSettings:{speed:22,patrolRadius:8}, vehicleSettings:{mode:'fly',speed:22,pitchSpeed:1.2},
    aiSettings:{type:'pilot'}, questSettings:{id:'q1'}, dialogueSettings:{text:'Ready'}, environmentSettings:{wind:3}
  }]};
  const manifest = JSON.parse(JSON.stringify(compileBuilderScene(scene))), actor=manifest.actors[0];
  assert.equal(manifest.version, 2);
  assert.deepEqual(manifest.environment, {layout:'skyport',weather:'storm'});
  assert.deepEqual(actor.transform, {position:{x:1,y:2,z:3},rotation:{x:.1,y:.2,z:.3},scale:{x:2,y:3,z:4},groundOffset:2.25});
  assert.deepEqual(actor.vehicle, {mode:'fly',speed:22,pitchSpeed:1.2});
  assert.equal(actor.animation.clip, 'Propeller'); assert.equal(actor.animation.speed, 1.5); assert.equal(actor.animation.loop, false);
  assert.equal(actor.gameplay.interactionKey, 'f'); assert.deepEqual(actor.quest, {id:'q1'}); assert.deepEqual(actor.dialogue, {text:'Ready'});
});

test('legacy manifests upgrade and preserve playable actors', () => {
  const upgraded=upgradeBuilderManifest({version:1,actors:[{objectId:'old',modelId:'key',behavior:'pickup',position:{x:1,y:0,z:2}}]});
  assert.equal(upgraded.version,2); assert.equal(upgraded.actorCount,1); assert.equal(upgraded.actors[0].gameplay.behavior,'pickup');
});

test('interaction priority chooses one closest target and enforces cooldown', () => {
  let now=1000, messages=0;
  const manifest=compileBuilderScene({objects:[
    {id:'far',modelId:'far',position:{x:2,y:0,z:0},functionalSettings:{behavior:'pickup',cooldown:5}},
    {id:'near',modelId:'near',position:{x:1,y:0,z:0},functionalSettings:{behavior:'pickup',cooldown:5}}
  ]});
  const runtime=new BuilderGameplayRuntime({manifest,now:()=>now,feedback:()=>messages++});
  const visibility=[]; runtime.register('near',{setActive:value=>visibility.push(value)}); runtime.register('far',{});
  assert.match(runtime.prompt({x:0,y:0,z:0}),/^E/);
  assert.equal(runtime.interact('e',{x:0,y:0,z:0}).actor.objectId,'near');
  assert.deepEqual(runtime.player.inventory,['near']); assert.deepEqual(visibility,[false]); assert.equal(messages,1);
  assert.equal(runtime.interact('e',{x:0,y:0,z:0}).reason,'cooldown');
  now=7000; assert.equal(runtime.interact('e',{x:0,y:0,z:0}).handled,true);
});

test('healing, doors, dialogue, quests and generic actions execute shared state', () => {
  const objects=[
    ['heal','heal',{value:40}],['door','door',{}],['npc','talk',{value:'Hello'}],['quest','quest',{}],['switch','interact',{action:'score',value:25}]
  ].map(([id,behavior,extra],index)=>({id,modelId:id,position:{x:index*10,y:0,z:0},functionalSettings:{behavior,...extra},dialogueSettings:id==='npc'?{text:'Welcome'}:null,questSettings:id==='quest'?{id:'mission'}:null}));
  const runtime=new BuilderGameplayRuntime({manifest:compileBuilderScene({objects}),player:{health:70,maxHealth:100,score:0,inventory:[],quests:{}}});
  let door=false; runtime.register('door',{setDoorOpen:value=>door=value}); objects.forEach(item=>runtime.register(item.id,runtime.instances.get(item.id)||{}));
  runtime.interact('e',{x:0,y:0,z:0}); assert.equal(runtime.player.health,100);
  runtime.interact('e',{x:10,y:0,z:0}); assert.equal(door,true);
  assert.equal(runtime.interact('e',{x:20,y:0,z:0}).message,'Welcome');
  runtime.interact('e',{x:30,y:0,z:0}); assert.equal(runtime.player.quests.mission,'active');
  runtime.interact('e',{x:40,y:0,z:0}); assert.equal(runtime.player.score,25);
});

test('shared AI update pursues nearby players and patrols otherwise', () => {
  const manifest=compileBuilderScene({objects:[
    {id:'enemy',position:{x:0,y:0,z:0},functionalSettings:{behavior:'hostile'},movementSettings:{speed:2},aiSettings:{detectionRange:5}},
    {id:'guard',position:{x:20,y:0,z:0},functionalSettings:{behavior:'patrol'},movementSettings:{speed:1,patrolRadius:2}}
  ]});
  const moved=[]; const runtime=new BuilderGameplayRuntime({manifest});
  runtime.register('enemy',{getPosition:()=>({x:0,y:0,z:0}),moveToward:target=>moved.push(['enemy',target])});
  runtime.register('guard',{getPosition:()=>({x:20,y:0,z:0}),moveToward:target=>moved.push(['guard',target])});
  runtime.update(.5,{x:2,y:0,z:0});
  assert.deepEqual(moved[0],['enemy',{x:2,y:0,z:0}]); assert.notEqual(moved[1][1].x,20);
});

test('holdable and switch objects run their complete gameplay functions', () => {
  const objects=[
    {id:'foldable',modelId:'foldable-tool',position:{x:0,y:0,z:0},functionalSettings:{behavior:'hold',action:'use'}},
    {id:'switch',modelId:'lever',position:{x:4,y:0,z:0},functionalSettings:{behavior:'switch'}}
  ];
  const runtime=new BuilderGameplayRuntime({manifest:compileBuilderScene({objects})});
  const held=[],used=[],switched=[];
  runtime.register('foldable',{setHeld:value=>held.push(value),use:()=>used.push(true)});
  runtime.register('switch',{setSwitched:value=>switched.push(value)});
  assert.equal(runtime.interact('e',{x:0,y:0,z:0}).handled,true);
  assert.equal(runtime.player.heldObjectId,'foldable');
  assert.deepEqual(held,[true]); assert.deepEqual(used,[true]);
  assert.equal(runtime.interact('e',{x:4,y:0,z:0}).handled,true);
  assert.deepEqual(switched,[true]);
});
