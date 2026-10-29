import * as THREE from '../vendor/three/three.module.min.js';
import {FOREST_TREES,FOREST_SPECIES,FOREST_PLOTS,FOREST_STATIONS,FOREST_GROWTH_MS} from './forest-harvest-config.js';

// Instanced stands keep a fully harvested forest as cheap to draw as a mature
// one. Tree identity stays in the shared simulation rather than mesh ordering.
export function createForestHarvestLand(environment={}){
 const root=new THREE.Group();root.name='TIMBERLAND_FOREST_HARVEST';root.userData.proceduralLand=true;root.userData.forestHarvest=true;
 const materials=new Map(),geometries=new Map();
 const material=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.9}));return materials.get(color);};
 const geometry=(w,h,d)=>{const key=[w,h,d].join(':');if(!geometries.has(key))geometries.set(key,new THREE.BoxGeometry(w,h,d));return geometries.get(key);};
 const box=(name,x,y,z,w,h,d,color,decor=false)=>{const mesh=new THREE.Mesh(geometry(w,h,d),material(color));mesh.name=name;mesh.position.set(x,y+h/2,z);mesh.receiveShadow=true;mesh.castShadow=h>.5;mesh.userData.collisionDisabled=decor||h<.1;root.add(mesh);return mesh;};
 const slab=(name,x,z,w,d,color)=>box(name,x,0,z,w,.026,d,color,true);
 const label=(name,text,x,y,z,width=13)=>{
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=176;const context=canvas.getContext('2d');if(!context)return;
  context.fillStyle='#18342b';context.fillRect(0,0,1024,176);context.strokeStyle='#b9c787';context.lineWidth=5;context.strokeRect(5,5,1014,166);context.fillStyle='#f3ead0';context.font='bold 48px sans-serif';context.textAlign='center';context.fillText(text,512,106,970);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width*176/1024),new THREE.MeshBasicMaterial({map:texture}));mesh.name=name;mesh.position.set(x,y,z);mesh.userData.collisionDisabled=true;root.add(mesh);
 };
 box('BUILDER_WALKABLE_FLOOR_forest-harvest',0,-.2,0,288,.2,288,0x536444);
 slab('FOREST_TIMBER_YARD',22,35,174,70,0x8c8268);
 slab('FOREST_NURSERY_SOIL',-42,41,24,25,0x705138);
 slab('FOREST_SAWMILL_FOUNDATION',39,18,39,24,0xa9a291);
 slab('FOREST_WORKSHOP_FOUNDATION',50,39,25,18,0xa9a291);
 slab('FOREST_LOG_RECEIVING',79,20,25,25,0x756b52);
 slab('FOREST_RESTORATION_GROUND',78,88,42,30,0x6d7850);
 for(const plot of FOREST_PLOTS){
  const soil=slab('FOREST_PLOT_SOIL_'+plot.id,plot.center.x,plot.center.z,plot.width,plot.depth,0x4c593b);soil.material=soil.material.clone();
  label('FOREST_STAND_SIGN_'+plot.id,plot.name.toUpperCase(),plot.center.x,3.1,plot.center.z+plot.depth/2+2,15);
  for(const side of [-1,1])box('FOREST_BOUNDARY_MARKER_'+plot.id,plot.center.x+side*(plot.width/2+1),0,plot.center.z+plot.depth/2+2,.22,1.2,.22,0xd7aa5d,true);
 }
 // Open timber canopies keep operator approaches and hauling lanes visible.
 for(const [id,x,z,w,d]of [['mill',39,17,43,25],['workshop',50,38,27,19]]){
  for(const side of [-1,1])for(const end of [-1,1])box('FOREST_'+id+'_CANOPY_POST',x+side*w/2,0,z+end*d/2,.42,6,.42,0x664d36,true);
  box('FOREST_'+id+'_ROOF',x,6,z,w+1,.25,d+1,0x365048,true);
  box('FOREST_'+id+'_RIDGE',x,6.25,z,w+1,.45,.55,0x537267,true);
 }
 for(const station of FOREST_STATIONS)label('FOREST_STATION_SIGN_'+station.id,station.name.toUpperCase(),station.position.x,4.4,station.position.z-5,station.kind==='mill'?17:13);
 for(let row=0;row<3;row++){
  box('FOREST_NURSERY_RAISED_BED',-48+row*6,0,33,4,.35,9,0x986945,true);
  box('FOREST_NURSERY_BED_SOIL',-48+row*6,.35,33,3.7,.05,8.7,0x3f3e29,true);
  for(let i=0;i<4;i++){
   const stem=new THREE.Mesh(new THREE.CylinderGeometry(.035,.055,.7,5),material(0x846244));stem.position.set(-48+row*6,.72,30+i*2);stem.userData.collisionDisabled=true;root.add(stem);
   const leaves=new THREE.Mesh(new THREE.ConeGeometry(.4,.9,6),material(0x72934e));leaves.position.copy(stem.position).y+=.55;leaves.userData.collisionDisabled=true;root.add(leaves);
  }
 }
 for(let row=0;row<4;row++)for(let col=0;col<3;col++)box('FOREST_FINISHED_LUMBER',69+col*3.2,.18+row*.28,40,2.8,.2,6,0xc09b66,true);
 for(let i=0;i<7;i++)box('FOREST_PARKING_LINE',-72+i*10.5,.04,24,.12,.02,14,0xdccc97,true);
 label('FOREST_WELCOME','TIMBERLAND  /  FOREST TO FURNITURE',0,4.8,52,22);
 label('FOREST_RECEIVING_SIGN','LOG RECEIVING  →  SELECT • MILL • DRY',79,3.3,11,18);
 label('FOREST_RESTORATION_SIGN','RECLAIM LAND  /  REPLANT THE FUTURE',78,3.6,75,22);
 // Perimeter landforms never intrude into the working forest's flat routes.
 const hillGeometry=new THREE.IcosahedronGeometry(1,1);
 for(let i=0;i<28;i++){
  const angle=i/28*Math.PI*2,x=Math.sin(angle)*134,z=Math.cos(angle)*134;
  const mesh=new THREE.Mesh(hillGeometry,material(i%2?0x65725a:0x747b63));mesh.name='FOREST_RIDGE_'+i;mesh.position.set(x,-4,z);mesh.scale.set(12+(i%4)*2,8+(i%5)*2,12);mesh.userData.collisionDisabled=true;mesh.receiveShadow=true;root.add(mesh);
 }
 const treeDefs=environment.forestHarvest?.trees||environment.builderScene?.layoutMeta?.forestHarvest?.trees||FOREST_TREES;
 const states=new Map(treeDefs.map(tree=>[tree.id,{...tree,phase:'standing'}]));
 const dummy=new THREE.Object3D(),batches=[];
 for(const [speciesId,species]of Object.entries(FOREST_SPECIES)){
  const defs=treeDefs;if(!defs.length)continue;
  const conifer=['pine','cedar','spruce'].includes(speciesId),height=species.height;
  const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.4,height*.68,7),material(speciesId==='birch'?0xd6d2b6:0x73513b),defs.length);
  const crown=new THREE.InstancedMesh(conifer?new THREE.ConeGeometry(3.25,height*.62,7):new THREE.IcosahedronGeometry(3.6,1),material(species.color),defs.length);
  const upper=new THREE.InstancedMesh(conifer?new THREE.ConeGeometry(2.3,height*.46,7):new THREE.IcosahedronGeometry(2.7,1),material(speciesId==='birch'?0xa4bc66:species.color),defs.length);
  const stump=new THREE.InstancedMesh(new THREE.CylinderGeometry(.37,.48,.5,8),material(species.woodColor),defs.length);
  const fallen=new THREE.InstancedMesh(new THREE.CylinderGeometry(.29,.43,height*.62,8),material(species.woodColor),defs.length);
  for(const [name,mesh]of Object.entries({trunk,crown,upper,stump,fallen})){mesh.name='FOREST_'+speciesId+'_'+name;mesh.userData.collisionDisabled=true;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(mesh);}
  batches.push({defs,species,height,conifer,trunk,crown,upper,stump,fallen});
 }
 const logsMesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.22,.28,2.7,8),material(0xbd9969),Math.max(256,treeDefs.length*6));logsMesh.name='FOREST_BUCKED_LOGS';logsMesh.userData.collisionDisabled=true;logsMesh.frustumCulled=false;logsMesh.castShadow=true;logsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(logsMesh);
 let logs=[],lastGrowthFrame=-1;
 const set=(mesh,index,position,scale,rotationZ=0)=>{dummy.position.copy(position);dummy.scale.setScalar(scale);dummy.rotation.set(0,0,rotationZ);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);};
 const draw=(now=Date.now())=>{
  for(const batch of batches){
   batch.defs.forEach((definition,index)=>{
    const state=states.get(definition.id)||definition,position=state.position||definition.position,p=state.phase||'standing';
    const growth=p==='growing'?Math.min(1,Math.max(.12,1-((Number(state.growthEndsAt)||now+FOREST_GROWTH_MS)-now)/FOREST_GROWTH_MS)):1;
    const matches=state.speciesId===batch.species.id,standing=p==='standing'||p==='growing',treeScale=standing&&matches?growth:0;
    set(batch.trunk,index,new THREE.Vector3(position.x,batch.height*.34*growth,position.z),treeScale);
    set(batch.crown,index,new THREE.Vector3(position.x,batch.height*(batch.conifer?.55:.67)*growth,position.z),treeScale);
    set(batch.upper,index,new THREE.Vector3(position.x+.4*growth,batch.height*(batch.conifer?.78:.86)*growth,position.z),treeScale);
    set(batch.stump,index,new THREE.Vector3(position.x,.25,position.z),matches&&['felled','stump'].includes(p)?1:0);
    set(batch.fallen,index,new THREE.Vector3(position.x+batch.height*.26,.55,position.z),matches&&p==='felled'?1:0,Math.PI/2);
   });
   for(const mesh of [batch.trunk,batch.crown,batch.upper,batch.stump,batch.fallen])mesh.instanceMatrix.needsUpdate=true;
  }
  for(let index=0;index<logsMesh.instanceMatrix.count;index++){
   const log=logs[index],position=log?.position;
   set(logsMesh,index,new THREE.Vector3(position?.x||0,.3+(index%3)*.03,position?.z||0),position?1:0,Math.PI/2);
  }
  logsMesh.instanceMatrix.needsUpdate=true;
 };
 root.userData.setForestHarvestState=state=>{
  if(!state)return;
  for(const plot of FOREST_PLOTS){const soil=root.getObjectByName('FOREST_PLOT_SOIL_'+plot.id);if(soil)soil.material.color.setHex(state.clearedPlots?.includes(plot.id)?0x8a7652:0x4c593b);}
  const trees=Array.isArray(state.trees)?state.trees:Object.values(state.trees||{});
  for(const tree of trees)if(tree?.id)states.set(tree.id,tree);
  logs=(Array.isArray(state.logs)?state.logs:Object.values(state.logs||{})).slice(0,logsMesh.instanceMatrix.count);
  draw();
 };
 root.userData.updateForestEffects=(elapsed,reducedMotion,serverTime=Date.now())=>{
  const frame=Math.floor(serverTime/1000);if(frame===lastGrowthFrame)return;lastGrowthFrame=frame;
  if([...states.values()].some(tree=>tree.phase==='growing'))draw(serverTime);
 };
 root.userData.forestTreeCount=treeDefs.length;root.userData.forestDrawBatches=batches.length*5+1;
 draw();return root;
}
