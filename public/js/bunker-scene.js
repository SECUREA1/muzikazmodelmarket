import * as THREE from '../vendor/three/three.module.min.js';
import {applyBuilderBaseTransform} from './environments/builder-base.js';
import {BUNKER_BOUNDS,BUNKER_FLOOR_Y} from './bunker-config.js';

// Geological terrain is the exposed surface above the authored underground
// rooms. Native floor, wall, ceiling and access-tunnel pieces remain separately
// editable in builderScene.objects; there is no second copy of their physics.
export function createBunkerLand(environment={}){
 const root=new THREE.Group();root.name='NULL_SECTOR_UNDERGROUND_BUNKER';
 root.userData.proceduralLand=true;root.userData.undergroundBunker=true;
 const earth=new THREE.MeshStandardMaterial({name:'BUNKER_STRATIFIED_EARTH',color:0x46504b,roughness:1});
 const bank=(name,width,depth,x,z)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,8,depth),earth);
  mesh.name='BUILDER_WALKABLE_FLOOR_BUNKER_SURFACE_'+name;
  mesh.position.set(x,-4,z);mesh.receiveShadow=mesh.castShadow=true;
  mesh.userData.walkableFloor=true;mesh.userData.buildingRoof=true;mesh.userData.bunkerOverburden=true;
  // The editor's initial interior cutaway reveals the full component layer.
  if(environment.id==='editor-preview'&&environment.builderScene?.editorSettings?.cutaway!==false)mesh.visible=false;
  root.add(mesh);
 };
 bank('NORTH',80,72,0,-4);
 bank('WEST',36,32,-22,48);
 bank('EAST',36,32,22,48);
 // Real surface ground below the paved arrival apron also gives the initial
 // environment loader support at the authored entry before native items load.
 // The narrow transition from the ramp is supplied by the editable paving.
 bank('SOUTH',80,15,0,72.5);
 const bedrock=new THREE.Mesh(new THREE.BoxGeometry(BUNKER_BOUNDS.width,.2,BUNKER_BOUNDS.depth),new THREE.MeshStandardMaterial({name:'BUNKER_DEEP_BEDROCK',color:0x101b21,roughness:1}));
 // VFX follows the existing visual-only convention, below the real floor.
 bedrock.name='BUNKER_BEDROCK_VFX';bedrock.position.y=BUNKER_FLOOR_Y-.3;root.add(bedrock);
 root.userData.undergroundLevel=BUNKER_FLOOR_Y;root.userData.surfaceLevel=0;
 applyBuilderBaseTransform(root,environment.builderScene?.baseTransform);
 return root;
}
