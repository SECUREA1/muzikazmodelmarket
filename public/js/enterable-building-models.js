import {ENTERABLE_BUILDINGS} from './building-districts.js';
export function createEnterableBuilding(THREE,id){
 const p=ENTERABLE_BUILDINGS[id];if(!p)return null;
 const root=new THREE.Group(),w=p.width,d=p.depth,h=p.height,floorY=.18,wood=['timber','western'].includes(p.style),industrial=p.style==='industrial',color=wood?0x8d6242:p.style==='clinical'?0xd9e9e8:p.style==='theatre'?0x34314e:industrial?0x7c8c96:p.style==='retro'?0xc4cec9:0xd8c5a4;
 const materials={wall:new THREE.MeshStandardMaterial({color,roughness:.82}),floor:new THREE.MeshStandardMaterial({color:wood?0x9c7750:0x68747c,roughness:.85}),trim:new THREE.MeshStandardMaterial({color:wood?0x382b23:0x243847,roughness:.5,metalness:.18}),glass:new THREE.MeshStandardMaterial({color:0x82c4df,transparent:true,opacity:.3,roughness:.15}),accent:new THREE.MeshStandardMaterial({color:p.style==='theatre'?0xeb68bc:0xdeb45c,roughness:.5})};
 const part=(size,at,mat='wall',name='BUILDING_WALL',parent=root)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),materials[mat]);mesh.position.set(...at);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
 part([w,.18,d],[0,.09,0],'floor','BUILDER_WALKABLE_FLOOR_'+id);
 const doorway=(span,x,z,opening,front=false)=>{
  const wing=(span-opening)/2;for(const sign of [-1,1]){const cx=x+sign*(opening/2+wing/2);if(front&&wing>3){part([wing,.85,.25],[cx,floorY+.425,z]);part([wing,h-2.6,.25],[cx,floorY+2.6+(h-2.6)/2,z]);part([wing-.4,1.75,.08],[cx,floorY+1.725,z],'glass','BUILDING_WINDOW');for(const edge of [-1,1])part([.2,h,.3],[cx+edge*(wing/2-.1),floorY+h/2,z],'trim');}
  else part([wing,h,.25],[cx,floorY+h/2,z]);}
  const passage=industrial&&front?3.6:2.9;part([opening,h-passage,.25],[x,floorY+passage+(h-passage)/2,z]);
 };
 doorway(w,0,-d/2,p.entranceWidth,true);doorway(w,0,d/2,2.8);
 for(const x of [-w/2,w/2])part([.25,h,d],[x,floorY+h/2,0]);
 for(const x of [-w/2+.2,w/2-.2])for(const z of [-d/2+.2,d/2-.2])part([.35,h,.35],[x,floorY+h/2,z],'trim');
 const roofs=new THREE.Group();roofs.name='BUILDING_ROOF_'+id;roofs.userData.buildingRoof=true;root.add(roofs);
 part([w+.7,.22,d+.7],[0,floorY+h+.11,0],'trim','ROOF_'+id,roofs);
 if(wood){const ridge=part([w+.5,.35,d*.55],[0,floorY+h+.35,-d*.22],'accent','ROOF_PITCH_'+id,roofs);ridge.rotation.x=-.12;}
 else part([w+.7,.35,.25],[0,floorY+h+.3,-d/2-.2],'accent','ROOF_FASCIA_'+id,roofs);
 if(['timber','western','cafe','retro'].includes(p.style)){
  part([w,.12,2.2],[0,.06,-d/2-1.1],'floor','BUILDER_WALKABLE_FLOOR_PORCH');
  for(const x of [-w/2+.3,w/2-.3])part([.2,2.9,.2],[x,1.45,-d/2-2],'trim');part([w,.16,2.3],[0,3,-d/2-1.1],'accent','ROOF_PORCH',roofs);
 }
 if(p.style==='civic')for(const x of [-w*.34,w*.34]){const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.24,.3,h,12),materials.wall);pillar.position.set(x,floorY+h/2,-d/2-.45);root.add(pillar);}
 if(['civic-bank','medical-clinic','district-police','boutique-hotel','roadside-motel','grand-restaurant'].includes(id)){
  doorway(w*.8,0,d*.2,3.2);if(id==='boutique-hotel'||id==='roadside-motel')part([.2,h,d*.3],[0,floorY+h/2,d*.35]);
 }
 if(['frontier-tavern','dusty-saloon','corner-bakery','roadside-diner','artisan-workshop','general-store','town-post-office'].includes(id)){
  part([w*.52,.85,.9],[-w*.12,floorY+.425,d*.32],'trim','BUILDING_COUNTER');part([w*.56,.1,1.1],[-w*.12,floorY+.9,d*.32],'accent','COUNTER_TOP');
 }
 if(id==='live-music-club')part([w*.65,.3,d*.2],[0,.33,d*.34],'trim','BUILDER_WALKABLE_FLOOR_STAGE');
 if(id==='service-station')part([w*.7,.2,5],[0,3.6,-d/2-2.2],'accent','ROOF_CANOPY',roofs);
 // Sign geometry works without fonts or a network request. SVG labels appear in the library.
 part([Math.min(w*.5,8),.55,.22],[0,floorY+(industrial?h-.5:3.2),-d/2-.25],'accent','BUILDING_SIGN');
 root.name=p.name;root.userData={builderObject:true,modelId:id,building:true,label:p.name,description:p.description,interiorBounds:{min:{x:-w/2+.5,y:floorY,z:-d/2+.5},max:{x:w/2-.5,y:floorY+h,z:d/2-.5}},entrances:[{x:0,y:floorY,z:-d/2},{x:0,y:floorY,z:d/2}],dimensions:[w+.7,h+.8,d+3]};
 return root;
}
export function setBuildingCutaway(root,enabled){root.traverse(node=>{if(node.userData.buildingRoof)node.visible=!enabled;});}
export function isBuildingRoof(object){for(let node=object;node;node=node.parent)if(node.userData.buildingRoof)return true;return false;}
