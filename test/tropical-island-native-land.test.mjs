import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createBuilderLand} from '../public/js/environments/builder-land.js';
import {EnvironmentLoader} from '../public/js/environments/environment-loader.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {ISLAND_EXPERIENCES,ISLAND_BALLS} from '../public/js/tropical-island-config.js';

const environment=()=>({id:'tropical-island',game:'tropical-island',proceduralLand:true,scale:1,spaceScale:1,playableSize:126,spawn:{x:0,y:.38,z:24,rotationY:0},builderScene:{layout:'tropical-island',mapSize:126,objects:[],streets:[]},streets:[]});
function dispose(root){const resources=new Set();root.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const m of [].concat(node.material||[])){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}if(node.isInstancedMesh)node.dispose();});for(const resource of resources)resource.dispose();}

test('the shared native loader preserves authored metres, island scenery, collision and effects hooks',async()=>{
  const scene=new T.Scene(),renderer={extensions:{has:()=>false},capabilities:{isWebGL2:true,getMaxAnisotropy:()=>1}},loader=new EnvironmentLoader({scene,renderer,serverAuthoritative:()=>true});
  try{
    const result=await loader.load(environment());
    assert.equal(result.scale,1,'the distant decorative ocean cannot shrink the metre-based resort');
    assert.ok(Math.abs(result.spawn.position.x)<1e-6&&Math.abs(result.spawn.position.z-24)<1e-6);
    assert.ok(Math.abs(result.spawn.position.y-.38)<1e-5);
    assert.equal(loader.floorSlime,null);
    assert.equal(typeof result.world.userData.setIslandState,'function');
    assert.equal(typeof result.world.userData.updateIslandEffects,'function');
    const water=result.world.getObjectByName('CARIBBEAN_SEA');
    assert.ok(water&&water.visible,'the authored ocean remains visible');
    assert.ok(!result.collision.collisionMeshes.includes(water),'visual ocean is never a walkable floor');
    assert.ok(result.collision.collisionMeshes.some(node=>node.name.startsWith('BUILDER_WALKABLE_FLOOR_ISLAND_PEARL_BEACH')));
    assert.equal(result.world.getObjectByName('PONTOON'),undefined,'only the native room owns movable boat models');
    assert.equal(result.world.getObjectByName('TIKI_BARTENDER'),undefined,'native residents replace decorative staff copies');
    for(const point of ISLAND_EXPERIENCES)assert.ok(result.world.getObjectByName('INTERACTION_ISLAND_'+point.id.toUpperCase().replaceAll('-','_')));
    loader.updateEffects(5,false,5000);
  }finally{loader.unload();}
});

test('server collision uses real island floors and solids and permits walking up both pier approaches',()=>{
  const collision=new ServerBuilderCollision(),env=environment();
  try{
    const spawn=collision.safeSpawn(env,env.spawn);
    assert.ok(Math.abs(spawn.y-.38)<1e-5);
    for(const point of ISLAND_EXPERIENCES){
      const floor=collision.groundAt(env,{x:point.x,y:.8,z:point.z});
      assert.ok(floor,point.label+' has an authored native floor');
      assert.ok(collision.hasBodyClearance(env,floor),point.label+' has visitor clearance');
    }
    assert.ok(Math.abs(collision.groundAt(env,{x:56,y:.8,z:8}).y+.63)<1e-5,'open lagoon has a bounded underwater swimming floor, below the island');
    for(const z of [10,20]){
      let feet={x:31.5,y:.38,z};
      for(let frame=0;frame<65;frame++)feet=collision.resolve(env,feet,{...feet,x:feet.x+.16,y:feet.y-.01});
      assert.ok(feet.x>41.8&&feet.x<42, 'walking reaches the pier without relocation');
      assert.ok(Math.abs(feet.y-.77)<1e-5,'walking follows the physical approach and deck height');
    }
    let feet={x:-15,y:.405,z:8};
    for(let frame=0;frame<20;frame++)feet=collision.resolve(env,feet,{...feet,z:feet.z-.2,y:feet.y-.01});
    assert.ok(feet.z>=6&&feet.z<6.1,'the tiki counter stops normal shared walking');
    assert.ok(collision.world(env).floors.every(mesh=>!mesh.isInstancedMesh),'physical solids retain individual bounds rather than decoration-wide aggregate boxes');
  }finally{for(const world of collision.cache.values())dispose(world.root);collision.clearPlacedWorlds();}
});

test('authoritative ball snapshots update native geometry and scenery animation preserves them',()=>{
  const root=createBuilderLand(environment());
  try{
    const positions=ISLAND_BALLS.map((ball,index)=>({id:ball.id,position:{x:10+index,y:1+index*.2,z:22-index},rotation:{x:.2,y:.4,z:.6}}));
    root.userData.setIslandState({balls:positions});
    root.userData.updateIslandEffects(10,false,10000);
    for(const state of positions){
      const ball=root.getObjectByName(state.id);assert.ok(ball);
      assert.deepEqual(ball.position.toArray(),[state.position.x,state.position.y,state.position.z]);
      assert.deepEqual(ball.rotation.toArray().slice(0,3),[.2,.4,.6]);
      assert.ok(!new T.Box3().setFromObject(ball).isEmpty(),'the projected ball retains its visible panels');
    }
    root.userData.setIslandState({balls:[{id:positions[0].id,position:{x:NaN,y:0,z:0}}]});
    assert.equal(root.getObjectByName(positions[0].id).position.x,10,'malformed projection never poisons scene transforms');
  }finally{dispose(root);}
});
