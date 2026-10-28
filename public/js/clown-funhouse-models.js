import {finishVehicleDesign} from './vehicle-design-system.js';
import * as THREE from '../vendor/three/three.module.min.js';
import {FUNHOUSE_ITEMS,FUNHOUSE_MODEL_INFO} from './clown-funhouse-items.js';
import {createClownFunhouseLand} from './environments/clown-funhouse-land.js';

// Authored pivots keep editable placements aligned with the permanent map.
// The house lip intentionally extends below the floor; ground by physical
// surfaces, rather than lifting that decorative mouth above its native entry.
export const FUNHOUSE_MODEL_ORIGINS=Object.freeze({
 'funhouse-horror-house':[0,0,-28],
 'funhouse-mirror-wall':[-15,0,-24],
 'funhouse-maze-bell':[-18,0,-41.8],
 'funhouse-water-gallery':[-30,0,3],
 'funhouse-water-gun':[0,-.01,0],
 'funhouse-clown-target':[-37.5,.7,3],
 'funhouse-clown-car':[28,0,25],
 'funhouse-dizzy-spinner':[28,0,-4],
 'funhouse-dressing-room':[-28,0,29],
 'funhouse-propeller-hat':[0,-.04,0],
 'funhouse-clown-shoes':[0,.03,0],
 'funhouse-ball-pit':[14,0,-23.5],
 'funhouse-jack-box':[16,0,-38],
 'funhouse-popcorn-stall':[-45,0,29],
 'funhouse-ticket-booth':[45,0,39],
 'funhouse-candy-stall':[45,0,14],
 'funhouse-circus-tent':[0,0,0],
 'funhouse-fence':[0,0,0],
 'funhouse-balloon-bunch':[0,0,0],
 'funhouse-bunting':[0,-.4,0],
 'funhouse-lamp':[0,0,0],
 'funhouse-welcome-board':[-8,0,40],
 'funhouse-midway-floor':[0,-.4,0],
 'funhouse-ringmaster-avatar':[0,0,0],
 'funhouse-juggler-avatar':[0,0,0],
 'funhouse-greeter-avatar':[0,0,0],
 'funhouse-driver-avatar':[0,0,0],
 'funhouse-scare-clown-avatar':[0,0,0]
});
const stationIds={'funhouse-horror-house':'funhouse-mirror-maze','funhouse-maze-bell':'funhouse-maze-finish','funhouse-dizzy-spinner':'funhouse-spinner','funhouse-dressing-room':'funhouse-dressup'};

export function createFunhouseModel(id){
 const item=FUNHOUSE_ITEMS[id];if(!item)return null;
 // This path builds only the requested assembly. Gallery targets, costumes and
 // figures never allocate the rest of the 120-metre carnival for a thumbnail.
 const content=createClownFunhouseLand({funhouseAssetId:id}),root=new THREE.Group();
 root.name=item.name;
 const origin=FUNHOUSE_MODEL_ORIGINS[id]||[0,0,0];content.position.set(-origin[0],-origin[1],-origin[2]);root.add(content);
 if(item.type==='avatar'){
  const bounds=new THREE.Box3().setFromObject(content),height=bounds.max.y-bounds.min.y;
  if(height>0){const scale=1.8/height;content.scale.setScalar(scale);content.position.y=-bounds.min.y*scale;}
 }
 root.userData={builderObject:true,modelId:id,funhouseModel:true,label:item.name,description:item.description,dimensions:[...item.dimensions],animated:true};
 root.userData.updateFunhouseEffects=(elapsed,reducedMotion=false,serverTime)=>content.userData.updateFunhouseEffects?.(elapsed,reducedMotion,serverTime);
 root.userData.animateFunhouseStation=(station=stationIds[id]||id,result={})=>content.userData.animateFunhouseStation?.(station,result);
 root.userData.playFunhouse=(result={})=>content.userData.animateFunhouseStation?.(stationIds[id]||id,result);
 root.userData.setFunhouseState=(state,serverTime)=>content.userData.setFunhouseState?.(state,serverTime);
 root.userData.funhouseInteractionTargets=content.userData.funhouseInteractionTargets||[];
 root.userData.funhouseRideAnchors=content.userData.funhouseRideAnchors||{};
 root.userData.funhouseBallTargets=content.userData.funhouseBallTargets||[];
 root.userData.funhouseTargets=(content.userData.funhouseTargets||[]).map(target=>({...target,position:{x:target.position.x-origin[0],y:target.position.y-origin[1],z:target.position.z-origin[2]}}));
 root.traverse(node=>{if(node.isMesh){node.userData.builderRoot=root;node.receiveShadow=true;}});
 return finishVehicleDesign(THREE,root,id);
}

export function updateFunhouseModel(root,elapsed,reducedMotion=false){
 if(!root?.userData.funhouseModel)return;
 const state=root.userData,lastUsed=state.lastUsedAt??state.serverLastUsedAt;
 if(lastUsed!==undefined&&lastUsed!==state.funhouseLastUsedAt){state.funhouseLastUsedAt=lastUsed;state.playFunhouse?.();}
 const animation=state.animationState||{},speed=Number.isFinite(animation.speed)?Math.max(0,animation.speed):1;
 state.updateFunhouseEffects?.((Number.isFinite(elapsed)?elapsed:0)*speed,reducedMotion||state.animationEnabled===false||animation.enabled===false);
}
export {FUNHOUSE_MODEL_INFO};
