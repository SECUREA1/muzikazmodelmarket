import * as THREE from '../vendor/three/three.module.min.js';
import {WORLD_ITEM_FACTORY_STATIONS} from './world-item-factory-config.js';
export function createWorldItemFactoryLand(){
 const root=new THREE.Group();root.name='WORLD_ITEM_FACTORY_CAMPUS';root.userData.proceduralLand=true;root.userData.worldItemFactory=true;
 const box=(name,w,h,d,x,y,z,color)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.82}));mesh.name=name;mesh.position.set(x,y,z);mesh.receiveShadow=true;mesh.castShadow=h>.5;if(h<.1)mesh.userData.collisionDisabled=true;root.add(mesh);return mesh;};
 box('BUILDER_WALKABLE_FLOOR_world-item-factory',160,.2,160,0,-.1,0,0x27383e);
 box('FACTORY_PEDESTRIAN_AVENUE',9,.014,122,0,.008,0,0x536c70);
 box('FACTORY_STATION_WALKWAY',112,.016,8,0,.01,-10,0x536c70);
 for(const station of WORLD_ITEM_FACTORY_STATIONS){
  box('FACTORY_BAY_'+station.stageId,21,.018,29,station.position.x,.012,-25,0x36575b);
  for(const x of [-10,10])box('FACTORY_SAFETY_LINE',.14,.02,29,station.position.x+x,.024,-25,0xffcc78);
  box('FACTORY_STATION_SIGN',19,3,.3,station.position.x,7,-41,0x112c34);
  if(typeof document!=='undefined'){
   const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=256;const context=canvas.getContext('2d');
   if(context){context.fillStyle='#112c34';context.fillRect(0,0,1536,256);context.fillStyle='#8cebd2';context.font='bold 62px sans-serif';context.textAlign='center';context.fillText(station.name,768,105);context.fillStyle='#e4f4ef';context.font='36px sans-serif';context.fillText('E / Use · live batches, operations and stock',768,183);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sign=new THREE.Mesh(new THREE.PlaneGeometry(18.8,2.9),new THREE.MeshBasicMaterial({map:texture}));sign.position.set(station.position.x,7,-40.83);root.add(sign);}
  }
 }
 for(const x of [-49,-24,0,24,49])box('FACTORY_GANTRY_COLUMN',.7,9,.7,x,4.5,-44,0x68848a);
 box('FACTORY_GANTRY_BEAM',100,.65,.8,0,9,-44,0x68848a);
 for(const x of [-76,76])box('FACTORY_BOUNDARY',.6,1.4,152,x,.7,0,0x4d656a);
 box('FACTORY_BACK_BOUNDARY',152,1.4,.6,0,.7,-76,0x4d656a);
 root.userData.setWorldFactoryProductionState=jobs=>{
  for(const station of WORLD_ITEM_FACTORY_STATIONS){const bay=root.getObjectByName('FACTORY_BAY_'+station.stageId),active=(jobs||[]).filter(job=>job.stageId===station.stageId&&['building','paused'].includes(job.phase));if(!bay)continue;bay.material.color.setHex(active.some(job=>job.phase==='building')?0x397f70:active.length?0x8b713f:0x36575b);bay.material.needsUpdate=true;}
 };
 return root;
}
