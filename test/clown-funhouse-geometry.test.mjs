import test from 'node:test';
import assert from 'node:assert/strict';
import {createClownFunhouseLand} from '../public/js/environments/clown-funhouse-land.js';
import {FUNHOUSE_WALLS} from '../public/js/clown-funhouse-config.js';

function scene(t){
 const root=createClownFunhouseLand();
 t.after(()=>{
  const resources=new Set();
  root.traverse(node=>{
   if(node.geometry)resources.add(node.geometry);
   for(const material of [].concat(node.material||[])){
    resources.add(material);
    for(const value of Object.values(material))if(value?.isTexture)resources.add(value);
   }
  });
  for(const resource of resources)resource.dispose();
  root.clear();
 });
 return root;
}

function named(root,name){const nodes=[];root.traverse(node=>{if(node.name===name)nodes.push(node);});return nodes;}

test('batched funhouse keeps six addressable gallery targets and their active-round highlight',t=>{
 const root=scene(t),api=root.userData,targets=api.funhouseTargets;
 assert.deepEqual(targets.map(target=>target.id),[0,1,2,3,4,5]);
 for(const target of targets){assert.ok(target.root.parent);assert.ok(target.highlight.parent);}
 api.setFunhouseState({round:{status:'active',targetId:4}});api.updateFunhouseEffects(10);
 assert.deepEqual(targets.filter(target=>target.highlight.visible).map(target=>target.id),[4]);
 api.setFunhouseState({funhouse:{round:{status:'active',targetId:1}}});api.updateFunhouseEffects(11);
 assert.deepEqual(targets.filter(target=>target.highlight.visible).map(target=>target.id),[1]);
 api.setFunhouseState({round:{status:'complete',targetId:1}});api.updateFunhouseEffects(12);
 assert.equal(targets.filter(target=>target.highlight.visible).length,1,'idle attraction still advertises a target');
});

test('a gallery squirt animates its water and chosen clown, then recovers both',t=>{
 const root=scene(t),api=root.userData,target=api.funhouseTargets[3],jets=named(root,'FUNHOUSE_WATER_JET');
 assert.ok(jets.length>0);assert.ok(jets.every(jet=>!jet.visible));
 api.updateFunhouseEffects(20);
 api.animateFunhouseStation('funhouse-water-gallery',{kind:'squirt',targetId:3,hit:true});
 api.updateFunhouseEffects(20.15);
 assert.ok(jets.every(jet=>jet.visible));assert.ok(target.root.rotation.z<0);
 assert.ok(target.root.position.y<target.root.userData.baseY,'hit clown ducks beneath its rail');
 assert.equal(api.funhouseTargets[2].root.rotation.z,0,'other clowns remain upright');
 assert.ok(jets.some(jet=>Math.abs(jet.position.x)>1),'water travels toward the selected off-centre clown');
 api.updateFunhouseEffects(21.5,true);
 assert.ok(jets.every(jet=>!jet.visible));assert.equal(target.root.rotation.z,0);
 assert.equal(target.root.position.y,target.root.userData.baseY);
 api.animateFunhouseStation('funhouse-water-gallery',{kind:'squirt',targetId:4,hit:false});
 api.updateFunhouseEffects(21.6,true);
 assert.ok(jets.every(jet=>jet.visible),'a missed shot still sprays water');
 assert.ok(api.funhouseTargets.every(target=>target.root.rotation.z===0),'a backend miss does not knock over a target');
});

test('car, spinner, jackbox and ball pit retain their effects through decoration batching',t=>{
 const root=scene(t),api=root.userData,car=root.getObjectByName('FUNHOUSE_TINY_CLOWN_CAR');
 const passengers=[];for(let index=0;index<5;index++)passengers.push(root.getObjectByName('FUNHOUSE_CAR_SURPRISE_CLOWN_'+index));
 const spinner=root.getObjectByName('FUNHOUSE_SPINNER_TURNTABLE'),propeller=root.getObjectByName('FUNHOUSE_GIANT_HAT_PROPELLER');
 const lids=named(root,'FUNHOUSE_JACK_LID'),springs=named(root,'FUNHOUSE_JACK_SPRING');
 const balls=named(root,'FUNHOUSE_BALL_PIT_BALL');assert.ok(balls.length>0);
 api.updateFunhouseEffects(30);
 for(const id of ['clown-car','spinner','jack-box','ball-pit'])api.animateFunhouseStation('funhouse-'+id);
 api.updateFunhouseEffects(30.3);
 assert.ok(passengers.every(passenger=>passenger.visible));assert.notEqual(car.rotation.z,0);
 assert.ok(spinner.rotation.y>30*.08,'active ride rotates faster than its idle animation');
 assert.ok(lids.every(lid=>lid.rotation.x<0));assert.ok(springs.every(spring=>spring.visible));
 assert.ok(balls.some(ball=>ball.position.y>ball.userData.baseY+.2));
 const priorPropeller=propeller.rotation.y;
 api.updateFunhouseEffects(30.5,true);
 assert.equal(spinner.rotation.y,0);assert.equal(car.rotation.z,0);assert.equal(car.position.y,0);
 assert.equal(propeller.rotation.y,priorPropeller,'reduced motion keeps decorative hats stationary');
 assert.ok(balls.every(ball=>ball.position.y===ball.userData.baseY));
 api.updateFunhouseEffects(39,true);
 assert.ok(passengers.every(passenger=>!passenger.visible));assert.ok(springs.every(spring=>!spring.visible));
 assert.ok(lids.every(lid=>lid.rotation.x===0));
});

test('old saved shows stay quiet, live effects play once, and every physical wall survives batching',t=>{
 const root=scene(t),api=root.userData,now=Date.now(),passenger=root.getObjectByName('FUNHOUSE_CAR_SURPRISE_CLOWN_0');
 api.updateFunhouseEffects(40);
 api.setFunhouseState({effects:{'funhouse-clown-car':{at:now-5000,until:now-1000}}});
 api.updateFunhouseEffects(40.1);assert.equal(passenger.visible,false,'revisiting does not replay an expired show');
 const live={effects:{'funhouse-clown-car':{at:now,until:now+4000}}};
 api.setFunhouseState(live);api.updateFunhouseEffects(40.2);assert.equal(passenger.visible,true);
 api.updateFunhouseEffects(49);api.setFunhouseState(live);api.updateFunhouseEffects(49.1);
 assert.equal(passenger.visible,false,'repeated snapshots do not restart an already-seen show');
 for(const wall of FUNHOUSE_WALLS){
  const mesh=root.getObjectByName('FUNHOUSE_WALL_'+wall.id);
  assert.ok(mesh?.isMesh,wall.id+' remains a separate physical mesh');assert.notEqual(mesh.userData.collisionDisabled,true);
  assert.deepEqual([mesh.position.x,mesh.position.y,mesh.position.z],[wall.x,wall.height/2,wall.z]);
  assert.deepEqual([mesh.geometry.parameters.width,mesh.geometry.parameters.height,mesh.geometry.parameters.depth],[wall.width,wall.height,wall.depth]);
 }
 let meshes=0,batches=0;root.traverse(node=>{if(node.isMesh)meshes++;if(node.name==='FUNHOUSE_BATCHED_DECORATION')batches++;});
 assert.ok(batches>0);assert.ok(meshes<1200,'static decoration batching keeps the scene within its mesh budget');
});
