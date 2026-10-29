import {isForestHarvestEnvironment} from './forest-harvest-config.js';

// Keep the explicit low-power preset. Hardware-rendered forestry gets a tighter
// player-follow shadow volume and finer rasterization instead of a world-wide
// increase in shadow/light count.
export function forestryRenderPreset(environment,preset,{maxTextureSize=4096}={}){
 if(!isForestHarvestEnvironment(environment)||!preset.shadows||maxTextureSize<4096)return {...preset};
 return {...preset,pixelRatio:Math.max(preset.pixelRatio,2),shadowSize:Math.max(preset.shadowSize,2048)};
}
export function applyForestryRenderQuality(environment,sun,renderer,baseline){
 const forest=isForestHarvestEnvironment(environment),next=forestryRenderPreset(environment,baseline,renderer.capabilities),extent=forest?32:45;
 const camera=sun.shadow.camera;camera.left=camera.bottom=-extent;camera.right=camera.top=extent;camera.updateProjectionMatrix();
 sun.shadow.bias=forest?-.00015:0;sun.shadow.normalBias=forest?.035:0;
 if(sun.shadow.mapSize.x!==next.shadowSize||sun.shadow.mapSize.y!==next.shadowSize){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(next.shadowSize,next.shadowSize);}
 sun.castShadow=next.shadows;renderer.shadowMap.enabled=next.shadows;renderer.shadowMap.needsUpdate=true;
 return next;
}
