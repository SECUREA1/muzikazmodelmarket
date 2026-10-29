import {parentPort} from 'node:worker_threads';
import {ServerBuilderCollision} from './server-builder-collision.mjs';
import {planDeedDelivery} from './world-delivery-routing.mjs';

const collision=new ServerBuilderCollision({maxPlacedWorlds:4,maxPlacedVariants:2});
parentPort.on('message',({id,input})=>{
 try{
  const plan=planDeedDelivery({...input,collision});
  // Delivery inspection does not own every inactive world's collision meshes.
  for(const world of [...collision.cache.values()].slice(0,Math.max(0,collision.cache.size-4)))if(world.environmentId!==input.environment.id)collision.releaseWorld(world.environmentId);
  parentPort.postMessage({id,plan});
 }catch(error){parentPort.postMessage({id,error:error.message||'Delivery route calculation failed.'});}
});
