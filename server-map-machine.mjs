import * as THREE from './public/vendor/three/three.module.min.js';
import {deviceDefinition} from './public/js/interactive-devices.js';
import {compileBuilderScene} from './public/js/builder-gameplay-pipeline.js';
import {builderBaseSpawn} from './public/js/environments/builder-base.js';
import {machineCandidates,defaultMachineObject} from './public/js/map-machine.js';
// A room fixture, never an inventory award or an edit to the customer's map.
export function populateMapMachine(sim,manifest,environment,collision,now,objects={}){
 const definitions=new Map(manifest.actors.map(actor=>[actor.objectId,actor]));
 const actors=Object.values(sim.actors),automatic=actors.filter(actor=>actor.runtimeMachine);
 const hasMachine=actors.some(actor=>!actor.runtimeMachine&&actor.active!==false&&!actor.holderId&&deviceDefinition(actor.asset?.buildAssetId||actor.modelId,actor.definition?.gameplay||definitions.get(actor.id)?.gameplay||{}));
 if(hasMachine){for(const actor of automatic){delete sim.actors[actor.id];if(sim.devices)delete sim.devices[actor.id];}return;}
 const key=(environment.contentUpdatedAt||environment.updatedAt||'')+JSON.stringify(environment.builderScene?.baseTransform||{});
 if(automatic.some(actor=>actor.active!==false&&actor.machineLayoutKey===key))return;
 for(const actor of automatic){delete sim.actors[actor.id];if(sim.devices)delete sim.devices[actor.id];}
 if(now<(sim.machineRetryAt||0))return;
 sim.machineRetryAt=now+5000;
 const center=collision.safeSpawn(environment,manifest.spawn?.position||builderBaseSpawn(environment)||environment.spawn||{x:0,y:0,z:2});
 const world=collision.world(environment),floors=[...world.floors,...collision.placedWorld(sim.actors,objects).meshes];
 for(const scale of [1,.7,.5])for(const candidate of machineCandidates(center)){
  const floor=collision.groundAt(environment,candidate,{actors:sim.actors,objects});if(!floor||Math.abs(floor.y-center.y)>1.2)continue;
  const radius=.8*scale,points=[[0,0],[-radius,-.4*scale],[-radius,.4*scale],[radius,-.4*scale],[radius,.4*scale]];
  if(points.some(([x,z])=>{const point={x:floor.x+x,y:floor.y,z:floor.z+z},ground=collision.groundAt(environment,point,{actors:sim.actors,objects});return !ground||Math.abs(ground.y-floor.y)>.2||new THREE.Raycaster(new THREE.Vector3(point.x,ground.y+.08,point.z),new THREE.Vector3(0,1,0),0,2.3*scale).intersectObjects(floors,false).length;}))continue;
  if(actors.some(actor=>!actor.runtimeMachine&&!actor.loot&&actor.active!==false&&Math.hypot(actor.position.x-floor.x,actor.position.z-floor.z)<1.6*scale))continue;
  const origin={x:center.x,y:center.y+1,z:center.z},delta=[floor.x-center.x,floor.y-center.y,floor.z-center.z],distance=Math.hypot(...delta);
  if(collision.blocksShot(environment,origin,delta.map(value=>value/distance),distance))continue;
  let id='world-default-arcade';while(sim.actors[id])id+='-commons';
  const object=defaultMachineObject(floor,scale,id),definition=compileBuilderScene({objects:[object]}).actors[0];
  sim.actors[id]={id,modelId:object.modelId,spawned:true,runtimeMachine:true,machineLayoutKey:key,asset:{buildAssetId:object.modelId,name:object.name},definition,active:true,health:100,placementRevision:1,position:object.position,rotation:object.rotation,scale:object.scale};
  sim.machineRetryAt=0;return;
 }
}
