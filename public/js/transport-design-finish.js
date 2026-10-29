import {ROAD_VEHICLES} from './road-vehicles.js';
import {SHIPPING_VESSELS} from './shipping-vessel-specs.js';
import {AIRCRAFT_TYPES} from './aircraft-types.js';

export const TRANSPORT_DESIGN_VERSION=1;
export const TRANSPORT_DESIGN_IDS=Object.freeze([...new Set([
 ...Object.keys(ROAD_VEHICLES),...Object.keys(AIRCRAFT_TYPES),...Object.keys(SHIPPING_VESSELS),
 'dune-quad','construction-steel-beam','harbor-skiff','harbor-sailboat','harbor-yacht',
 'harbor-patrol','harbor-fishing-boat','resort-paddle-boat','resort-pontoon',
 'utility-cargo-trailer','freight-loading-bay','shipping-container-box','shipping-port-crane'
])]);
const supported=new Set(TRANSPORT_DESIGN_IDS);
export const supportsTransportDesign=id=>supported.has(id);

const protectedName=/SCREEN|DISPLAY|DASH|GAUGE|INSTRUMENT|LABEL|DECAL|NAMEPLATE|WINDOW|GLASS|LIGHT|LAMP|LIVERY|FLAG|PENNANT|WAKE|FOAM|BLUR|FLASH|CARGO_LOAD_GAUGE/i;
const cushionName=/CUSHION|PADDED|BENCH_BACK|SEAT_BACK|PADDLE_SEAT|PONTOON_BENCH/i;
const serviceName=/BODY|COWLING|COWL|ENGINE|ACCOMMODATION|CONSOLE|PEDESTAL|FUNNEL|CONTAINER_DOOR|DECK|BOGIE|SPREADER|CABIN_FLOOR|LOWER_CABIN_DOOR/i;

/**
 * A mechanical finishing pass over the existing vehicle, not a replacement rig.
 * Stitches follow cushions; hub detailing follows moving wheels; panel fittings
 * follow the panel's own local transform. No root pose, collider or rig references
 * change, and the original precise bounds contain every new cosmetic surface.
 */
export function finishTransportDesign(THREE,root,id){
 if(!root||!supported.has(id)||root.userData.transportDesignVersion===TRANSPORT_DESIGN_VERSION&&root.userData.transportDesign?.id===id)return root;
 root.updateWorldMatrix(true,true);
 const bounds=new THREE.Box3().setFromObject(root,true),source=[];
 root.traverse(node=>{
  if(node.userData.nativeDesignDetail)return;
  // A patrol or fishing launch can wrap an already-finished skiff. Finish the
  // new outer assembly without repeating hardware on its original child hull.
  for(let parent=node.parent;parent&&parent!==root;parent=parent.parent)if(parent.userData.transportDesignVersion===TRANSPORT_DESIGN_VERSION)return;
  source.push(node);
 });
 const metal=new THREE.MeshStandardMaterial({name:'CRAFTED_TRANSPORT_BRUSHED_ALLOY',color:0x9caeb5,roughness:.36,metalness:.78});
 const graphite=new THREE.MeshStandardMaterial({name:'CRAFTED_TRANSPORT_GRAPHITE_FASTENER',color:0x26353e,roughness:.48,metalness:.66});
 const materialCopies=new Map();let details=0,finishedMaterials=0;

 // Several factories share palette materials between instances. Material edits
 // are intentionally local, so repainting or tuning one owned vehicle is safe.
 for(const node of source){
  if(!node.isMesh||node.userData.collisionOnly||protectedName.test(node.name||''))continue;
  const copy=original=>{
   if(!original?.isMeshStandardMaterial||original.transparent||original.map||original.vertexColors)return original;
   if(materialCopies.has(original))return materialCopies.get(original);
   const m=original.clone(),hsl={};m.color.getHSL(hsl);
   const rubber=m.roughness>.83&&hsl.l<.14,upholstery=cushionName.test(node.name||'');
   if(rubber){m.name=m.name||'CRAFTED_TRANSPORT_RUBBER';m.roughness=.91;m.metalness=0;}
   else if(upholstery){m.name=m.name||'CRAFTED_TRANSPORT_UPHOLSTERY';m.roughness=.87;m.metalness=Math.min(.08,m.metalness);}
   else if(m.metalness>.5){m.name=m.name||'CRAFTED_TRANSPORT_COATED_ALLOY';m.roughness=Math.max(.28,Math.min(.5,m.roughness));m.metalness=Math.min(.82,m.metalness);}
   else{m.name=m.name||'CRAFTED_TRANSPORT_FINISHED_SURFACE';m.roughness=Math.max(.35,Math.min(.86,m.roughness));}
   materialCopies.set(original,m);finishedMaterials++;return m;
  };
  node.material=Array.isArray(node.material)?node.material.map(copy):copy(node.material);
 }

 function attach(parent,node,name){
  if(details>=30){node.geometry?.dispose();return false;}
  node.name=name;node.userData={nativeDesignDetail:true,transportDesignDetail:true,collisionDisabled:true,collider:false,builderRoot:root};
  node.castShadow=false;node.receiveShadow=true;parent.add(node);parent.updateWorldMatrix(true,false);
  const fitted=new THREE.Box3().setFromObject(node,true);
  const tolerance=.00001;
  if(bounds.isEmpty()||!Number.isFinite(fitted.min.x)||['x','y','z'].some(axis=>fitted.min[axis]<bounds.min[axis]-tolerance||fitted.max[axis]>bounds.max[axis]+tolerance)){
   node.removeFromParent();node.geometry?.dispose();return false;
  }
  details++;return true;
 }
 function ring(parent,radius,tube,position,rotation,name,mat=metal){
  const node=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,6,24),mat);node.position.set(...position);node.rotation.set(...rotation);return attach(parent,node,name);
 }
 function bolts(parent,positions,radius,name,mat=graphite){
  const node=new THREE.InstancedMesh(new THREE.SphereGeometry(radius,6,4),mat,positions.length),matrix=new THREE.Matrix4();
  positions.forEach((p,index)=>node.setMatrixAt(index,matrix.makeTranslation(...p)));node.instanceMatrix.needsUpdate=true;node.computeBoundingBox();node.computeBoundingSphere();
  return attach(parent,node,name);
 }

 // Wheel groups are explicit authoring anchors in road/construction vehicles.
 // The caps and bolts therefore rotate with the authored wheel, never the chassis.
 const wheelGroups=source.filter(node=>node.userData.roadWheel||node.name==='CONSTRUCTION_WHEEL');
 for(const group of wheelGroups){
  const tyre=group.children.find(node=>node.isMesh&&node.geometry?.parameters?.radiusTop&&node.material?.roughness>.8);
  if(!tyre)continue;
  const p=tyre.geometry.parameters,r=Math.max(p.radiusTop,p.radiusBottom),half=p.height/2;
  for(const side of [-1,1]){
   const face=side*(half+.008);
   ring(group,r*.44,r*.025,[face,0,0],[0,Math.PI/2,0],'CRAFTED_MACHINED_WHEEL_HUB');
   const points=Array.from({length:6},(_,i)=>[face,Math.sin(i*Math.PI/3)*r*.29,Math.cos(i*Math.PI/3)*r*.29]);
   if(details<24)bolts(group,points,r*.028,'CRAFTED_WHEEL_LUG_FASTENERS');
  }
 }
 // Aircraft wheels and the open-frame quad are native meshes, not wheel groups.
 for(const wheel of source.filter(node=>node.isMesh&&(node.userData.vehicleWheel||/^MAIN_WHEEL/.test(node.name||'')))){
  const p=wheel.geometry?.parameters||{};
  if(p.radiusTop){
   const r=Math.max(p.radiusTop,p.radiusBottom),half=p.height/2;
   for(const side of [-1,1])ring(wheel,r*.42,r*.027,[0,side*half*.9,0],[Math.PI/2,0,0],'CRAFTED_LANDING_GEAR_HUB');
  }else if(wheel.geometry?.type==='TorusGeometry'&&p.radius){
   ring(wheel,p.radius*.57,p.tube*.18,[0,0,0],[0,0,0],'CRAFTED_OPEN_FRAME_WHEEL_RIM');
  }
 }

 function boxSize(node){
  const p=node.geometry?.parameters;
  if(!p||![p.width,p.height,p.depth].every(n=>Number.isFinite(n)&&n>0))return null;
  return [p.width,p.height,p.depth];
 }
 function stitchedCushion(node,size){
  const axis=size.indexOf(Math.min(...size)),a=(axis+1)%3,b=(axis+2)%3;
  if(size[a]<.18||size[b]<.15)return;
  const inset=Math.min(size[a],size[b])*.1,face=(axis===2?-1:1)*(size[axis]/2+.0005),points=[];
  for(const [sa,sb]of [[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]){const p=[0,0,0];p[axis]=face;p[a]=sa*(size[a]/2-inset);p[b]=sb*(size[b]/2-inset);points.push(new THREE.Vector3(...p));}
  const geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,false,'centripetal'),28,Math.max(.001,Math.min(size[a],size[b])*.005),4,false);
  const color=node.material?.color?.clone()||new THREE.Color(0xcbbca3);color.lerp(new THREE.Color(0xf4e8ce),.27);
  const thread=new THREE.MeshStandardMaterial({name:'CRAFTED_UPHOLSTERY_PIPING',color,roughness:.92,metalness:0});
  if(!attach(node,new THREE.Mesh(geometry,thread),'CRAFTED_UPHOLSTERY_SEAM'))thread.dispose();
 }
 let cushions=0,panels=0;
 for(const node of source){
  if(!node.isMesh||node.isInstancedMesh||node.userData.collisionOnly||protectedName.test(node.name||'')||node.material?.transparent)continue;
  const size=boxSize(node);if(!size)continue;
  const hsl={};node.material?.color?.getHSL(hsl);
  const inferredSeat=!node.name&&node.material?.roughness>.78&&hsl.h>.035&&hsl.h<.12&&size[0]>.3&&size[0]<.8&&size[2]>.1&&size[2]<.8;
  if(cushions<5&&(cushionName.test(node.name||'')||inferredSeat)){stitchedCushion(node,size);cushions++;continue;}
  const panelMatch=serviceName.test(node.name||'')||(!node.name&&node.material?.metalness>.45&&size.every(n=>n>.055)&&Math.max(...size)>.42);
  if(!panelMatch||panels>=5||details>=28)continue;
  const axis=size.indexOf(Math.min(...size)),a=(axis+1)%3,b=(axis+2)%3;
  if(size[a]<.28||size[b]<.23||size[axis]>.8)continue;
  const r=Math.min(.018,Math.min(size[a],size[b])*.025),inset=Math.max(r*3,Math.min(size[a],size[b])*.12),face=(axis===2?-1:1)*(size[axis]/2-r*.25),points=[];
  for(const sa of [-1,1])for(const sb of [-1,1]){const p=[0,0,0];p[axis]=face;p[a]=sa*(size[a]/2-inset);p[b]=sb*(size[b]/2-inset);points.push(p);}
  if(bolts(node,points,r,'CRAFTED_RECESSED_PANEL_FASTENERS',metal))panels++;
 }

 // An engraved lid ring follows marine deck fittings. It is deliberately fitted
 // to existing horizontal plates rather than a generic stripe around every hull.
 if(root.userData.watercraft){
  const plates=source.filter(node=>node.isMesh&&/MOORING_BITT_BASE|BOW_WINDLASS|COCKPIT_TEAK_SOLE|PONTOON_TEAK_DECK|BOW_SEAT_CUSHION/i.test(node.name||''));
  for(const node of plates.slice(0,3)){
   const size=boxSize(node);if(!size)continue;
   const r=Math.min(size[0],size[2])*.18;
   ring(node,r,Math.max(.003,r*.04),[0,size[1]/2+.001,0],[Math.PI/2,0,0],'CRAFTED_MARINE_ACCESS_FITTING',metal);
  }
 }
 if(!details){
  // Some authored hulls are fully curved or extremely compact. Their material
  // refinement still applies; the best fitting structural box gets one inset
  // service fastener set instead of inventing a new protruding fixture.
  for(const node of source){
   const size=node.isMesh&&!protectedName.test(node.name||'')&&!node.material?.transparent?boxSize(node):null;
   if(!size||size[0]<.2||size[1]<.04||size[2]<.2)continue;
   const r=Math.min(.012,size[0]*.03,size[2]*.03),y=size[1]/2-r*.3;
   if(bolts(node,[[-size[0]*.3,y,-size[2]*.3],[size[0]*.3,y,size[2]*.3]],r,'CRAFTED_STRUCTURAL_SERVICE_FASTENERS',metal))break;
  }
 }
 root.userData.transportDesignVersion=TRANSPORT_DESIGN_VERSION;
 root.userData.transportDesign={version:TRANSPORT_DESIGN_VERSION,id,details,materials:finishedMaterials};
 root.updateMatrixWorld(true);return root;
}
