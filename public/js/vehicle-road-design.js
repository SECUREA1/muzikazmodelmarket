import {ROAD_VEHICLES} from './road-vehicles.js';

// Site equipment has its own articulated industrial finishing pass.
export const VEHICLE_ROAD_DESIGN_IDS=Object.freeze([
 ...Object.entries(ROAD_VEHICLES).filter(([,config])=>!config.siteOnly).map(([id])=>id),'dune-quad'
]);

const close=(a,b)=>Math.abs(a-b)<.0001;
const dimensions=node=>{
 const p=node.geometry?.parameters;
 return p&&[p.width,p.height,p.depth].every(Number.isFinite)?[p.width,p.height,p.depth]:null;
};

// A coach-built shell keeps the original extremities and mesh transform. The
// curved shoulders and tapered ends replace the rectangular toy-car silhouette.
function coachworkGeometry(T,width,height,depth){
 const positions=[],indices=[],uvs=[],radius=Math.min(width,height)*.16;
 const profile=[[-width/2+radius,-height/2],[width/2-radius,-height/2],[width/2,-height/2+radius],[width/2,height/2-radius],[width/2-radius,height/2],[-width/2+radius,height/2],[-width/2,height/2-radius],[-width/2,-height/2+radius]];
 const inset=Math.min(depth*.14,.2),rings=[[-depth/2,.90],[-depth/2+inset,1],[depth/2-inset,1],[depth/2,.94]];
 for(const [z,taper]of rings)for(let j=0;j<profile.length;j++){
  const [x,y]=profile[j];positions.push(x*taper,y,z);uvs.push(j/profile.length,(z+depth/2)/depth);
 }
 for(let ring=0;ring<rings.length-1;ring++)for(let j=0;j<8;j++){
  const a=ring*8+j,b=ring*8+(j+1)%8,c=a+8,d=b+8;indices.push(a,b,c,b,d,c);
 }
 for(const offset of [0,24])for(let j=1;j<7;j++)indices.push(offset,offset+j+(offset?0:1),offset+j+(offset?1:0));
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 geometry.parameters={width,height,depth};geometry.name='CRAFTED_SCULPTED_COACHWORK';geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

// The rolling tyre remains the same native mesh, axis and original envelope.
// Recessed shoulders make the actual tread blocks readable instead of drawing
// decoration over a solid cylindrical side wall.
function roundedTyre(T,radius,width,segments=28){
 const half=width/2,points=[
  [radius*.30,-half],[radius*.78,-half],[radius*.93,-half*.72],
  [radius*.97,-half*.35],[radius,-half*.08],[radius,half*.08],
  [radius*.97,half*.35],[radius*.93,half*.72],[radius*.78,half],
  [radius*.30,half],[radius*.30,-half]
 ].map(([r,y])=>new T.Vector2(r,y));
 const geometry=new T.LatheGeometry(points,segments);geometry.name='CRAFTED_ROUNDED_ROAD_TYRE';return geometry;
}

function fenderGeometry(T,radius,width,depth=.028,span=1.52){
 const positions=[],indices=[],uvs=[],steps=24;
 for(let i=0;i<=steps;i++){
  const angle=-span+i/steps*span*2;
  for(const [x,r]of [[-width/2,radius-depth],[width/2,radius-depth],[-width/2,radius],[width/2,radius]]){
   positions.push(x,Math.cos(angle)*r,Math.sin(angle)*r);uvs.push(x/width+.5,i/steps);
  }
 }
 for(let i=0;i<steps;i++)for(const [a,b]of [[0,1],[1,3],[3,2],[2,0]]){
  const p=i*4+a,q=i*4+b;indices.push(p,q,p+4,q,q+4,p+4);
 }
 indices.push(0,2,1,1,2,3);const end=steps*4;indices.push(end,end+1,end+2,end+1,end+3,end+2);
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.name='CRAFTED_CURVED_WHEEL_ARCH';return geometry;
}

function finishRollingGear(T,root,kit,materials,{bike=false,quad=false}={}){
 const groups=kit.source.filter(node=>node.userData.roadWheel);
 for(const group of groups){
  const tyre=group.children.find(node=>node.isMesh&&node.geometry?.parameters?.radiusTop&&node.material?.roughness>.8);
  if(!tyre)continue;
  const p=tyre.geometry.parameters,radius=p.radiusTop,width=p.height;
  tyre.geometry=roundedTyre(T,radius,width,p.radialSegments||28);
  const tread=[];
  for(let i=0;i<28;i++)for(const side of [-1,1]){
   const angle=i/28*Math.PI*2+(side<0?.045:0),r=radius*.947;
   tread.push({size:[width*.34,radius*.068,radius*(quad?.19:.14)],position:[side*width*.28,Math.cos(angle)*r,Math.sin(angle)*r],rotation:[angle,side*.18,0]});
  }
  kit.batchBoxes(group,tread,materials.rubber,'CRAFTED_CHEVRON_SHOULDER_TREAD');
  for(const side of [-1,1]){
   const face=side*(width/2+.013);
   kit.torus(group,radius*.59,radius*.035,[face,0,0],materials.alloy,'CRAFTED_DIAMOND_CUT_RIM',[0,Math.PI/2,0]);
   // A dark recessed brake rotor adds separation behind the original spokes.
   const disc=new T.Mesh(new T.RingGeometry(radius*.22,radius*.48,24),materials.rotor);
   disc.position.set(side*(width/2+.008),0,0);disc.rotation.y=Math.PI/2;kit.add(group,disc,'CRAFTED_VENTILATED_BRAKE_ROTOR');
   const slots=[];
   for(let j=0;j<12;j++){
    const angle=j*Math.PI/6;slots.push({size:[.004,radius*.11,radius*.026],position:[side*(width/2+.011),Math.cos(angle)*radius*.36,Math.sin(angle)*radius*.36],rotation:[angle+.34,0,0]});
   }
   kit.batchBoxes(group,slots,materials.dark,'CRAFTED_BRAKE_ROTOR_SLOTS');
  }
  const fender=new T.Mesh(fenderGeometry(T,radius*(bike?1.13:quad?1.13:1.17),width*(bike?1.22:.94),bike?.024:.035,bike?1:quad?1.2:1.52),bike?materials.paint:materials.dark);
  fender.position.copy(group.position);kit.add(root,fender,bike?'CRAFTED_MOTORCYCLE_MUDGUARD':'CRAFTED_FLARED_WHEEL_ARCH');
 }
}

function tailoredSeat(T,node,kit,materials){
 const size=dimensions(node);if(!size||size[1]>.24||size[0]<.3||size[2]<.35)return;
 const rows=[];
 for(let i=0;i<5;i++)rows.push({size:[size[0]*.8,.004,.008],position:[0,size[1]/2+.001,-size[2]*.31+i*size[2]*.155]});
 kit.batchBoxes(node,rows,materials.thread,'CRAFTED_CHANNEL_STITCHED_LEATHER');
}

function finishCar(T,root,id,kit,m){
 const pickup=id==='frontier-pickup',body=kit.source.filter(node=>node.isMesh&&!node.userData.vehicleDesignDetail&&dimensions(node));
 for(const node of body){
  const [w,h,d]=dimensions(node);
  if((w>1.5&&h>=.07&&h<=.4&&d>=.8&&!node.material?.transparent)||pickup&&close(w,1.95)&&close(h,.6)&&close(d,.12)){
   node.geometry=coachworkGeometry(T,w,h,d);
  }
  if(node.material?.roughness>.78&&w<.8&&w>.35)tailoredSeat(T,node,kit,m);
 }
 const front=pickup?-2.65:-2.165;
 kit.box(root,[pickup?1.38:1.22,.235,.022],[0,.645,front],m.dark,'CRAFTED_RECESSED_FRONT_GRILLE');
 const grille=[];
 for(let i=0;i<5;i++)grille.push({size:[pickup?1.3:1.14,.012,.01],position:[0,.56+i*.042,front-.009]});
 kit.batchBoxes(root,grille,m.alloy,'CRAFTED_FLOATING_GRILLE_SLATS');
 kit.box(root,[.19,.05,.012],[0,.65,front-.011],m.brass,'CRAFTED_COACHWORK_BADGE');
 const side=pickup?.973:.898,doorLength=pickup?1.64:2.4;
 for(const sign of [-1,1]){
  kit.box(root,[.018,.14,doorLength],[sign*side,.665,.12],m.lower,'CRAFTED_RECESSED_ROCKER_PANEL');
  kit.box(root,[.022,.028,doorLength*.98],[sign*(side+.01),.775,.12],m.alloy,'CRAFTED_SHOULDER_REVEAL');
  // Shallow upright panels close the lower door beneath the existing glazing.
  kit.box(root,[.035,.19,1.55],[sign*.803,.9,.12],m.paint,'CRAFTED_SCULPTED_LOWER_DOOR');
  kit.box(root,[.009,.16,.012],[sign*(side+.012),.676,.34],m.dark,'CRAFTED_DOOR_SHUT_LINE');
  kit.box(root,[.035,.10,.36],[sign*.69,.88,pickup?-2.18:-1.86],m.lower,'CRAFTED_BONNET_SIDE_VENT');
  const vents=[];for(let i=0;i<4;i++)vents.push({size:[.04,.052,.013],position:[sign*.69,.91,(pickup?-2.3:-1.98)+i*.075]});
  kit.batchBoxes(root,vents,m.alloy,'CRAFTED_BONNET_LOUVER_BLADES');
 }
 const hoodZ=pickup?-1.88:-1.37;
 kit.box(root,[1.22,.009,pickup?.7:1.05],[0,pickup?.976:1.004,hoodZ],m.paintLight,'CRAFTED_INSET_BONNET_PANEL');
 for(const x of [-.58,.58])kit.box(root,[.018,.013,pickup?.68:1.03],[x,pickup?.983:1.01,hoodZ],m.lower,'CRAFTED_BONNET_CHARACTER_LINE');
 kit.box(root,[1.25,.012,.05],[0,1.635,-.79],m.lower,'CRAFTED_WINDSCREEN_ROOF_GASKET');
 const tailZ=pickup?2.667:2.133;
 kit.box(root,[pickup?1.58:1.5,.12,.018],[0,pickup?1.12:.655,tailZ],m.lower,'CRAFTED_REAR_FASCIA_INLAY');
 for(const x of [-.57,.57])kit.box(root,[.26,.03,.02],[x,pickup?1.12:.655,tailZ+.012],m.reflector,'CRAFTED_REAR_REFLECTOR');
 if(pickup){
  const boards=[];for(let i=0;i<7;i++)boards.push({size:[.232,.008,1.84],position:[-.72+i*.24,.904,1.6]});
  kit.batchBoxes(root,boards,m.timber,'CRAFTED_PICKUP_CARGO_BED_BOARDS');
  const slats=[];for(const sign of [-1,1])for(let i=0;i<5;i++)slats.push({size:[.015,.34,.012],position:[sign*.88,1.15,.82+i*.35]});
  kit.batchBoxes(root,slats,m.lower,'CRAFTED_BED_SIDE_RIB_SHADOWS');
 }else{
  kit.box(root,[1.25,.012,.33],[0,1.045,1.55],m.paintLight,'CRAFTED_REAR_DECK_INSET');
 }
}

function finishBikeOrQuad(T,root,id,kit,m){
 const bike=id==='touring-motorcycle';
 for(const node of kit.source){
  if(!node.isMesh)continue;const size=dimensions(node);if(!size)continue;
  if(close(size[0],bike?.35:.82)&&close(size[1],.28)&&close(size[2],.55)){
   if(bike){const geometry=new T.SphereGeometry(1,24,16);geometry.scale(size[0]/2,size[1]/2,size[2]/2);geometry.name='CRAFTED_SCULPTED_MOTORCYCLE_TANK';node.geometry=geometry;}
   else node.geometry=coachworkGeometry(T,...size);
  }else if(bike&&close(size[0],.22)&&close(size[1],.35)&&close(size[2],.45)||!bike&&close(size[0],1.25)&&close(size[1],.09))node.geometry=coachworkGeometry(T,...size);
  if(node.material?.roughness>.78)tailoredSeat(T,node,kit,m);
 }
 if(bike){
  for(const sign of [-1,1]){
   kit.box(root,[.012,.17,.31],[sign*.437,.67,.64],m.lower,'CRAFTED_TOURING_CASE_INSET');
   kit.box(root,[.018,.025,.33],[sign*.439,.8,.64],m.alloy,'CRAFTED_TOURING_CASE_LID_TRIM');
   kit.tube(root,[sign*.21,.53,-.3],[sign*.26,.42,.66],.037,m.lower,'CRAFTED_MOTORCYCLE_ENGINE_GUARD');
   kit.tube(root,[sign*.25,.41,.55],[sign*.27,.42,.91],.052,m.alloy,'CRAFTED_TWIN_EXHAUST_SILENCER');
  }
  kit.box(root,[.105,.008,.34],[0,1.124,-.23],m.paintLight,'CRAFTED_TANK_CENTRE_STRIPE');
  kit.torus(root,.047,.009,[0,1.126,-.18],m.alloy,'CRAFTED_RECESSED_FUEL_FILLER',[Math.PI/2,0,0]);
  kit.box(root,[.31,.034,.022],[0,1.2,-.746],m.lower,'CRAFTED_WINDSCREEN_GASKET');
 }else{
  for(const z of [-.7,.7]){
   kit.box(root,[.72,.10,.30],[0,.93,z],m.paintLight,'CRAFTED_QUAD_SCULPTED_RACK_POD');
   const rails=[];for(const x of [-.24,0,.24])rails.push({size:[.025,.014,.28],position:[x,.987,z]});
   kit.batchBoxes(root,rails,m.lower,'CRAFTED_QUAD_RACK_GRIP_INLAYS');
  }
  kit.box(root,[.59,.08,.025],[0,.94,-1.061],m.lower,'CRAFTED_QUAD_HEADLAMP_GUARD');
  for(const sign of [-1,1]){
   kit.tube(root,[sign*.48,.47,-.6],[sign*.48,.40,.6],.035,m.alloy,'CRAFTED_QUAD_ROCKER_PROTECTOR');
   const springs=[];for(let i=0;i<6;i++)springs.push({size:[.06,.015,.085],position:[sign*.43,.53+i*.04,-.56]});
   kit.batchBoxes(root,springs,m.brass,'CRAFTED_QUAD_SUSPENSION_SPRING');
  }
 }
}

function finishDuneQuad(T,root,kit,m){
 const sideShape=new T.Shape();sideShape.moveTo(-.67,.58);sideShape.lineTo(-.52,.97);sideShape.lineTo(.49,.82);sideShape.lineTo(.78,.55);sideShape.lineTo(.36,.51);sideShape.closePath();
 for(const sign of [-1,1]){
  const geometry=new T.ExtrudeGeometry(sideShape,{depth:.022,bevelEnabled:true,bevelSize:.008,bevelThickness:.005,bevelSegments:1,steps:1});
  const panel=new T.Mesh(geometry,m.paint);panel.position.z=sign>0?.414:-.436;kit.add(root,panel,'CRAFTED_DUNE_QUAD_INSET_FRAME_PANEL');
  kit.tube(root,[-.55,.946,sign*.444],[.49,.797,sign*.444],.013,m.brass,'CRAFTED_DUNE_QUAD_FRAME_REVEAL');
  kit.box(root,[.042,.095,.16],[-.88,.63,sign*.28],m.headlamp,'CRAFTED_DUNE_QUAD_HEADLAMP');
  kit.box(root,[.47,.008,.035],[.48,.827,sign*.18],m.alloy,'CRAFTED_DUNE_ENGINE_COVER_VENT');
 }
 for(const wheel of kit.source.filter(node=>node.userData.vehicleWheel&&node.geometry?.type==='TorusGeometry')){
  const p=wheel.geometry.parameters,treads=[];
  for(let i=0;i<28;i++)for(const side of [-1,1]){
   const a=i/28*Math.PI*2,r=p.radius+p.tube*.85;
   treads.push({size:[.075,.028,.035],position:[Math.cos(a)*r,Math.sin(a)*r,side*p.tube*.61],rotation:[0,0,a-Math.PI/2]});
  }
  kit.batchBoxes(wheel,treads,m.rubber,'CRAFTED_DUNE_ALL_TERRAIN_TREAD');
  for(const side of [-1,1]){
   kit.torus(wheel,.17,.019,[0,0,side*.11],m.alloy,'CRAFTED_DUNE_BEADLOCK_RIM');
   const spokes=[];for(let i=0;i<5;i++)spokes.push({size:[.026,.27,.035],position:[0,0,side*.093],rotation:[0,0,i*Math.PI/5]});
   kit.batchBoxes(wheel,spokes,m.alloy,'CRAFTED_DUNE_MACHINED_WHEEL_SPOKES');
  }
 }
 const engine=kit.source.find(node=>node.isMesh&&dimensions(node)?.every((n,i)=>close(n,[.58,.48,.62][i])));
 if(engine){const fins=[];for(let i=0;i<6;i++)fins.push({size:[.014,.025,.49],position:[-.294,-.17+i*.065,0]});kit.batchBoxes(engine,fins,m.alloy,'CRAFTED_DUNE_ENGINE_COOLING_FINS');}
}

/** Larger sculpted panels and functional mechanical detailing for the road
 * collection. New surfaces share the root's checked cosmetic design kit. */
export function finishVehicleRoadDesign(T,root,id,kit){
 if(!root||!VEHICLE_ROAD_DESIGN_IDS.includes(id))return root;
 const color=id==='dune-quad'?0x31545d:ROAD_VEHICLES[id].color,paintColor=new T.Color(color),light=paintColor.clone().lerp(new T.Color(0xf5e9cb),.16);
 const m={
  paint:kit.material('CRAFTED_ROAD_ENAMEL',{color,roughness:.34,metalness:.48}),
  paintLight:kit.material('CRAFTED_ROAD_SECONDARY_ENAMEL',{color:light,roughness:.42,metalness:.34}),
  lower:kit.material('CRAFTED_ROAD_GRAPHITE_INSET',{color:0x263b42,roughness:.57,metalness:.42}),
  dark:kit.material('CRAFTED_ROAD_SHADOW',{color:0x122027,roughness:.64,metalness:.20}),
  alloy:kit.material('CRAFTED_ROAD_MACHINED_ALLOY',{color:0xa7bcc3,roughness:.30,metalness:.78}),
  brass:kit.material('CRAFTED_ROAD_BRASS_HARDWARE',{color:0xc49c5d,roughness:.42,metalness:.65}),
  rubber:kit.material('CRAFTED_ROAD_TREAD_RUBBER',{color:0x273032,roughness:.94,metalness:0}),
  rotor:kit.material('CRAFTED_ROAD_BRAKE_ROTOR',{color:0x6c7c80,roughness:.48,metalness:.72,side:T.DoubleSide}),
  thread:kit.material('CRAFTED_ROAD_UPHOLSTERY_THREAD',{color:0xb1a28a,roughness:.93,metalness:0}),
  timber:kit.material('CRAFTED_ROAD_TIMBER_BED',{color:0x9f7850,roughness:.86,metalness:.02}),
  reflector:kit.material('CRAFTED_ROAD_REAR_REFLECTOR',{color:0xe86448,emissive:0x902d17,emissiveIntensity:.24,roughness:.38}),
  headlamp:kit.material('CRAFTED_ROAD_PROJECTOR_LENS',{color:0xe5e9cd,emissive:0xc9c780,emissiveIntensity:.55,roughness:.24,metalness:.16})
 };
 if(id==='dune-quad')finishDuneQuad(T,root,kit,m);
 else{
  const bike=id==='touring-motorcycle',quad=id==='alpine-quad';
  finishRollingGear(T,root,kit,m,{bike,quad});
  if(bike||quad)finishBikeOrQuad(T,root,id,kit,m);else finishCar(T,root,id,kit,m);
 }
 return root;
}
