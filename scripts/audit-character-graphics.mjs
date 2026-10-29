import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createBuilderModel,updateBuilderModels} from '../public/js/builder-models-3d.js';
import {createBasketballAIAvatar,animateBasketballAIAvatar} from '../public/js/basketball-ai-avatar.js';
import {createHeldToolModel,HELD_TOOL_DESIGN_IDS} from '../public/js/held-tool-design-finish.js';
import {seatedPilot} from '../public/js/aircraft-seat.js';
import {createConstructionScene} from '../public/js/construction-scene.js';
import {createPrisonLand} from '../public/js/prison-world.js';

export const CHARACTER_GRAPHICS_IDS=Object.freeze([
 'world-resident','hero-spawn','scout-avatar','rad-tox','rogue-bot',
 'forest-ranger','desert-merchant','clockwork-knight','moss-golem',
 'funhouse-ringmaster-avatar','funhouse-juggler-avatar','funhouse-greeter-avatar',
 'funhouse-driver-avatar','funhouse-scare-clown-avatar','basketball-ai','seated-pilot',
 'construction-worker','prison-resident','remote-player','local-player'
]);

/** Counts the actual loaded resources and a draw-call upper bound, independent
 * of camera/frustum/lighting. Hidden costume variants use memory but no draws.
 * Node transforms are deliberately separate: pivots need no GPU resources.
 */
export function characterGraphicsStats(root){
 const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
 let nodes=0,meshes=0,visibleMeshes=0,draws=0,triangles=0,lights=0;
 root.traverse(node=>{
  nodes++;if(node.isLight)lights++;if(node.skeleton)skeletons.add(node.skeleton);
  if(!node.isMesh)return;meshes++;if(node.geometry)geometries.add(node.geometry);
  for(const material of [].concat(node.material||[])){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}
 });
 root.traverseVisible(node=>{
  if(!node.isMesh||!node.geometry)return;
  const list=[].concat(node.material||[]),active=list.some(material=>material.visible!==false);if(!active)return;
  visibleMeshes++;
  const instances=node.isInstancedMesh?node.count:1,geometry=node.geometry;
  if(Array.isArray(node.material)){
   for(const group of geometry.groups)if(list[group.materialIndex]?.visible!==false){draws++;triangles+=group.count/3*instances;}
  }else{draws++;triangles+=(geometry.index?.count||geometry.attributes.position?.count||0)/3*instances;}
 });
 const buffers=new Set();let geometryBytes=0;
 for(const geometry of geometries)for(const attribute of [...Object.values(geometry.attributes),geometry.index,...Object.values(geometry.morphAttributes).flat()]){
  const array=attribute?.isInterleavedBufferAttribute?attribute.data?.array:attribute?.array;
  if(array&&!buffers.has(array)){buffers.add(array);geometryBytes+=array.byteLength;}
 }
 // This Three build stores bone matrices in a float RGBA texture with a minimum
 // side of four. Include that GPU allocation even in this DOM-free audit.
 let boneTextureBytes=0;for(const skeleton of skeletons){const side=Math.max(4,4*Math.ceil(Math.sqrt(4*skeleton.bones.length)/4));boneTextureBytes+=side*side*16;}
 return {nodes,meshes,visibleMeshes,draws,triangles,geometries:geometries.size,geometryBytes,boneTextureBytes,geometryAndBoneBytes:geometryBytes+boneTextureBytes,materials:materials.size,textures:textures.size,lights};
}

function animationStats(root,update){
 let traversals=0,visited=0;const traverse=root.traverse;
 root.traverse=function(callback){traversals++;return traverse.call(this,node=>{visited++;callback(node);});};
 // A mixed idle/walk sample also initializes lazily cached animation lists.
 for(let frame=0;frame<4;frame++)update(frame/30);
 traversals=0;visited=0;
 for(let frame=0;frame<60;frame++)update(1+frame/30);
 root.traverse=traverse;
 return {sampleFrames:60,traversals,visited};
}

export async function auditCharacterGraphics({baselinePath,legacyPlayers=false}={}){
 const baseline=baselinePath?JSON.parse(await readFile(baselinePath,'utf8')):null;
 const previous=new Map((baseline?.items||[]).map(row=>[row.id,row])),items=[],failures=[];
 const rig=legacyPlayers?null:await import('../public/js/articulated-character-rig.js');
 for(const id of [...CHARACTER_GRAPHICS_IDS,...HELD_TOOL_DESIGN_IDS.map(id=>'held:'+id)]){
  let root,customUpdate;try{
   if(id==='construction-worker'){
    const view=createConstructionScene(THREE,new THREE.Scene());view.update({construction:{crew:{workers:[{id:'budget',state:'walking',position:{x:0,y:0,z:0}}]}},actors:{}});root=view.root.getObjectByName('CONSTRUCTION_WORKER_budget');customUpdate=time=>view.animate(time);
   }else if(id==='prison-resident'){
    const world=createPrisonLand();root=world.userData.prisonNpcs.values().next().value;root.position.set(0,0,0);root.userData.state='walking';customUpdate=time=>world.userData.updatePrisonEffects(time);
   }else if(id==='remote-player'||id==='local-player'){
    if(rig){root=rig.createArticulatedPlayer(THREE);customUpdate=time=>rig.updateArticulatedCharacter(root,time,{moving:true});}
    else if(id==='remote-player'){root=new THREE.Mesh(new THREE.CapsuleGeometry(.3,1.1,4,8),new THREE.MeshStandardMaterial({color:0x63eaff}));root.position.y=.85;}
    else{root=new THREE.Group();const material=new THREE.MeshStandardMaterial(),body=new THREE.Mesh(new THREE.CapsuleGeometry(.24,.65,3,8),material),head=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),material),nose=new THREE.Mesh(new THREE.ConeGeometry(.15,.45,3),new THREE.MeshBasicMaterial());body.position.y=.8;head.position.y=1.5;nose.position.set(0,1.52,-.38);nose.rotation.x=-Math.PI/2;root.add(body,head,nose);}
   }else root=id==='basketball-ai'?createBasketballAIAvatar(THREE):id==='seated-pilot'?seatedPilot():id.startsWith('held:')?createHeldToolModel(THREE,id.slice(5)):createBuilderModel(id);
   if(!root){failures.push({id,reason:'missing factory'});continue;}
   if(id==='world-resident')root.userData.residentState={moving:true,name:'Budget sample',appearance:{hairstyle:'short'}};
   const collection=new THREE.Group();collection.add(root);
   const update=customUpdate||(id==='basketball-ai'?time=>animateBasketballAIAvatar(root,true,time):id.startsWith('held:')||id==='seated-pilot'||id.endsWith('-player')?()=>{}:time=>updateBuilderModels(collection,time));
   const animation=animationStats(root,update),row={id,...characterGraphicsStats(root),animation};
   const prior=previous.get(id);
   if(prior){
    row.delta=Object.fromEntries(['draws','triangles','geometryBytes','boneTextureBytes','geometryAndBoneBytes','materials','textures','lights'].map(key=>[key,row[key]-(prior[key]||0)]));
    for(const key of ['draws','triangles','materials','lights'])if(row[key]>prior[key]+1e-6)failures.push({id,reason:key+' exceeds baseline',before:prior[key],after:row[key]});
   }
   items.push(row);
  }catch(error){failures.push({id,reason:error.message});}
 }
 const totalGPUBytes=items.reduce((sum,row)=>sum+row.geometryAndBoneBytes,0),baselineGPUBytes=baseline?.items.reduce((sum,row)=>sum+(row.geometryAndBoneBytes??row.geometryBytes),0);
 if(baseline&&totalGPUBytes>baselineGPUBytes)failures.push({reason:'combined geometry and bone GPU budget exceeds baseline',before:baselineGPUBytes,after:totalGPUBytes});
 return {counts:{characters:CHARACTER_GRAPHICS_IDS.length,heldTools:HELD_TOOL_DESIGN_IDS.length,constructed:items.length,compared:items.filter(item=>item.delta).length},totalGPUBytes,...(baseline?{baselineGPUBytes}:{}),failures,items};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const index=process.argv.indexOf('--baseline'),report=await auditCharacterGraphics({baselinePath:index>=0?process.argv[index+1]:undefined,legacyPlayers:process.argv.includes('--legacy-players')});
 console.log(JSON.stringify(report,null,2));if(report.failures.length)process.exitCode=1;
}
