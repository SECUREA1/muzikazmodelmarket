import {ENTERABLE_BUILDINGS} from './building-districts.js';
import {INTERACTIVE_DEVICES} from './interactive-devices.js';

// Deterministic room layouts are editable map objects, shared by all players.
export function buildingDevices(id){
 if(id==='civic-bank')return ['market-atm','community-noticeboard'];
 if(['frontier-tavern','dusty-saloon','live-music-club'].includes(id))return ['shared-jukebox','video-poker-table','arcade-slot-machine','trivia-terminal'];
 if(id==='picture-house')return ['cinema-screen','video-projector','item-vending-machine'];
 if(id==='neighborhood-center')return ['shared-video-player','trivia-terminal','video-poker-table','arcade-slot-machine'];
 const profile=ENTERABLE_BUILDINGS[id];
 return profile?.category==='Commerce'?['market-atm','item-vending-machine','digital-photo-frame']:['community-noticeboard','media-boombox'];
}
export function furnishBuildings(scene,{models=[],backpack=false}={}){
 const existing=scene.objects||[],added=[];
 for(const building of existing){
  const profile=ENTERABLE_BUILDINGS[building.modelId]||ENTERABLE_BUILDINGS[models.find(model=>model.id===building.modelId)?.buildAssetId];if(!profile)continue;
  // Tilted shells need hand furnishing; avoid depositing objects through walls.
  if(Math.abs(Number(building.rotation?.x)||0)>.01||Math.abs(Number(building.rotation?.z)||0)>.01)continue;
  const sx=Number(building.scale?.x)||1,sy=Number(building.scale?.y)||1,sz=Number(building.scale?.z)||1;if(Math.min(sx,sy,sz)<.5)continue;
  const ids=buildingDevices(profile.id);
  const candidates=backpack?models.filter(model=>model.category==='backpack'&&(INTERACTIVE_DEVICES[model.buildAssetId]||INTERACTIVE_DEVICES[model.id])):ids.map(id=>({id,buildAssetId:id}));
  const yaw=Number(building.rotation?.y)||0,cos=Math.cos(yaw),sin=Math.sin(yaw);
  const slots=[[-profile.width/2+3,-profile.depth/2+3],[profile.width/2-3,-profile.depth/2+3],[-profile.width/2+3,0],[profile.width/2-3,0]];
  for(const [index,model]of candidates.slice(0,slots.length).entries()){
   const device=model.buildAssetId||model.id,id=building.id+'-interior-'+device;
   if(existing.some(item=>item.id===id||item.furnishedBuildingId===building.id&&item.modelId===model.id))continue;
   const [x,z]=slots[index],position={x:(Number(building.position?.x)||0)+x*sx*cos+z*sz*sin,y:(Number(building.position?.y)||0)+.18*sy,z:(Number(building.position?.z)||0)-x*sx*sin+z*sz*cos};
   // Reserve the cell when manually placed furniture already occupies it.
   if([...existing,...added].some(item=>item!==building&&Math.hypot((item.position?.x??Infinity)-position.x,(item.position?.z??Infinity)-position.z)<2.3))continue;
   added.push({id,modelId:model.id,name:INTERACTIVE_DEVICES[device].name,position,groundOffset:position.y,rotation:{x:0,y:yaw+(x>0?-Math.PI/2:Math.PI/2),z:0},scale:{x:1,y:1,z:1},furnishedBuildingId:building.id,functionalSettings:{behavior:'interact',device,interactionDistance:5,prompt:'Use '+INTERACTIVE_DEVICES[device].name}});
  }
 }
 return added;
}
