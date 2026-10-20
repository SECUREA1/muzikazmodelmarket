import {BUILDING_MATERIALS,createBuildingBlock,buildingMaterial,toggleBuildingObject} from './building-materials.js';
import {OwnedItemPlacement} from './owned-item-placement.js';
import {placementBounds,placementMeshes,placementTriangles,placementFloorPoint,placementHitNormal,placementBoxes} from './placed-item-collision.js';
import {anchorServerAsset,disposeProjection} from './server-scene-projection.js';
import {projectSharedBuildings} from './authoritative-room-client.js';
import {SharedGameInventory} from './shared-game-inventory.js';
import {mountRoomBuildingToggle} from './room-building-toggle.js';

/** A shared building layer for native sports, separate from scores and match input. */
export function mountSportsRoomBuilding({THREE,scene,camera,canvas,inputCanvases=[],parent,roomId,surfaces,mode,announce=()=>{},onChange=()=>{}}){
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('../assets/sports-room-building.css',import.meta.url).href;document.head.append(style);
 const placementStage=document.createElement('div');placementStage.className='sports-building-placement';document.body.append(placementStage);
 const api=new SharedGameInventory(),layer=new THREE.Group();layer.name='ROOM_BUILDING_PIECES';scene.add(layer);
 const system={bricks:[],brickGroup:layer,buildEditor:{pending:null},toggleSharedDoor:toggleBuildingObject};
 let records={},policy={enabled:true,hostId:'local'},liveMode=null,lastPoll=0,polling=false,session=null;
 const storageKey='muzikaz.sports-building.'+roomId;
 const button=document.createElement('button');button.type='button';button.className='rad-toolbar-button sports-room-build-entry';button.textContent='Build';button.title='Bricks and building permissions';parent.append(button);
 const dialog=document.createElement('dialog');dialog.className='sports-actions-popup sports-building-menu';dialog.setAttribute('aria-label','Build in this room');
 dialog.innerHTML='<h2>Build in this room</h2><p>Choose a piece, then tap the floor to place copies. Pieces stack on existing surfaces.</p><label>Building item <select data-material></select></label><div data-permissions></div><p data-building-status></p><button type="button" data-equip>Place item</button><button type="button" data-stop>Stop building</button><button type="button" data-close>Return to game</button>';
 document.body.append(dialog);
 const select=dialog.querySelector('[data-material]');for(const material of BUILDING_MATERIALS){const option=document.createElement('option');option.value=material.id;option.textContent=material.name;select.append(option);}
 const report=message=>{dialog.querySelector('[data-building-status]').textContent=message;announce(message);};
 const toggle=mountRoomBuildingToggle({parent:dialog.querySelector('[data-permissions]'),announce:report,onChange:async enabled=>{
  if(mode().live){const room=await post('/building',{enabled});accept(room);}else{policy={enabled,hostId:'local'};saveLocal();refreshPolicy();}
 }});
 function refreshPolicy(){const current=mode();toggle.update({...policy,hostId:current.live?current.hostId: 'local'},current.live?current.selfId:'local');dialog.querySelector('[data-equip]').disabled=!policy.enabled;if(!policy.enabled)placement.cancel();}
 function accept(room){records=room.objects||{};policy=room.building||{enabled:true,hostId:mode().hostId};projectSharedBuildings({THREE,system,records,create:id=>createBuildingBlock(THREE,id)});refreshPolicy();onChange();}
 function saveLocal(){try{localStorage.setItem(storageKey,JSON.stringify({objects:records,building:policy}));}catch{}}
 async function post(path,body){session ||=await api.session();try{return await api.api('/api/rooms/'+encodeURIComponent(roomId)+path,{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify(body)});}catch(error){if(error.code==='CSRF_INVALID')session=null;throw error;}}
 const placement=new OwnedItemPlacement({THREE,scene,canvas,inputCanvases,stage:placementStage,announce:report,
  createPreview:async asset=>{const content=createBuildingBlock(THREE,asset.materialId),bounds=placementBounds(THREE,content),bottom=(bounds.isEmpty()?new THREE.Box3().setFromObject(content):bounds).min.y,root=anchorServerAsset(THREE,content);root.userData.materialOriginY=-bottom;root.userData.solid=buildingMaterial(asset.materialId).solid;return root;},
  pointAt:pointer=>{const roots=[...surfaces(),...system.bricks],meshes=roots.flatMap(placementMeshes);scene.updateMatrixWorld(true);const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(pointer.x,pointer.y),camera);const hit=ray.intersectObjects(meshes,false).find(hit=>placementHitNormal(THREE,hit)?.y>.45);if(hit)return hit.point.clone();return placementFloorPoint(THREE,camera.getWorldPosition(new THREE.Vector3()).addScaledVector(camera.getWorldDirection(new THREE.Vector3()),3),meshes);},
  surfaces:()=>placementTriangles(THREE,system.bricks),
  save:async(asset,transform,existing,preview,requestId)=>{
   if(!policy.enabled)throw Error('Building is paused by the room host.');
   const id='placement-'+requestId,object={materialId:asset.materialId,position:[transform.position[0],transform.position[1]+preview.userData.materialOriginY*transform.scale[1],transform.position[2]],rotation:transform.rotation,scale:transform.scale,paint:[],open:false};
   if(mode().live)accept(await post('/objects',{id,revision:0,object}));
   else{records[id]={id,revision:1,ownerId:'local',...object};accept({objects:records,building:policy});saveLocal();}
   return {id,revision:records[id]?.revision||1,placement:transform};
  }
 });
 button.onclick=()=>{refreshPolicy();if(!dialog.open)dialog.showModal();};
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.querySelector('[data-stop]').onclick=()=>{placement.cancel();dialog.close();};
 dialog.querySelector('[data-equip]').onclick=async()=>{if(!policy.enabled)return;dialog.close();const material=buildingMaterial(select.value);if(await placement.start({id:'material:'+material.id,materialId:material.id,name:material.name}))placement.setQuickMode(true);};
 function update(){
  const current=mode();
  if(liveMode!==current.live){liveMode=current.live;placement.reset();for(const root of system.bricks)disposeProjection(root);system.bricks=[];records={};policy={enabled:true,hostId:current.live?current.hostId:'local'};lastPoll=0;if(!current.live){try{accept(JSON.parse(localStorage.getItem(storageKey)||'{}'));}catch{refreshPolicy();}}}
  if(!placement.active)placement.editButton.hidden=true;placement.update();
  if(current.live&&!polling&&performance.now()-lastPoll>1000){polling=true;lastPoll=performance.now();void api.api('/api/rooms/'+encodeURIComponent(roomId)+'/objects').then(room=>{if(mode().live)accept(room);}).catch(error=>{if(dialog.open)report(error.message);}).finally(()=>polling=false);}
 }
 return {update,get active(){return placement.active;},confirm:()=>placement.confirm(),cancel:()=>placement.cancel(),get boxes(){return placementBoxes(THREE,system.bricks);},button,dialog};
}
