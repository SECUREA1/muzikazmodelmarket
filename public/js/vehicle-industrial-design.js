// Vehicle-specific bodywork is fitted to the original moving assemblies. The
// caller's kit enforces the original envelope and supplies isolated materials.
export const VEHICLE_INDUSTRIAL_DESIGN_IDS=Object.freeze([
 'site-dumptruck','site-bulldozer','site-excavator','tower-crane',
 'utility-cargo-trailer','wooden-cart','camp-canoe-rack','funhouse-clown-car',
 'arcade-part-train','arcade-part-coaster','arcade-part-train-engine',
 'arcade-part-train-carriage','arcade-part-coaster-car',
 'factory-training-missile','factory-cargo-rocket'
]);
const supported=new Set(VEHICLE_INDUSTRIAL_DESIGN_IDS);
const parameters=node=>node?.geometry?.parameters||{};
const boxSize=node=>{const p=parameters(node);return [p.width,p.height,p.depth].every(Number.isFinite)?[p.width,p.height,p.depth]:null;};

function palette(kit){
 const painted={roughness:.43,metalness:.35,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1};
 return {
  dark:kit.material('INDUSTRIAL_GRAPHITE_GASKET',{color:0x192b33,roughness:.76,metalness:.2}),
  steel:kit.material('INDUSTRIAL_SATIN_ALLOY',{color:0x9db4bc,roughness:.34,metalness:.78}),
  safety:kit.material('INDUSTRIAL_SAFETY_OCHRE',{...painted,color:0xeac14f}),
  stencil:kit.material('INDUSTRIAL_CHARCOAL_LIVERY',{...painted,color:0x20323a}),
  cream:kit.material('INDUSTRIAL_IVORY_LIVERY',{...painted,color:0xeee4c3}),
  red:kit.material('INDUSTRIAL_RED_REFLECTOR',{color:0xd95748,roughness:.25,metalness:.18,emissive:0x582019,emissiveIntensity:.3}),
  cyan:kit.material('RIDE_ENAMEL_TURQUOISE',{...painted,color:0x6ac6cb,roughness:.3}),
  timber:kit.material('CART_BOUND_TIMBER',{color:0x704e35,roughness:.83,metalness:.05})
 };
}

function shell(T,kit,parent,points,depth,position,rotation,material,name){
 const shape=new T.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
 const geometry=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:Math.min(.009,depth*.2),bevelSize:Math.min(.018,depth*.3),bevelSegments:2,curveSegments:12});
 geometry.translate(0,0,-depth/2);const mesh=new T.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.set(...rotation);return kit.add(parent,mesh,name);
}

function windowGaskets(kit,source,mat){
 for(const pane of source){
  if(!pane.isMesh||!(pane.userData.constructionCabGlass||/CLOWN_CAR_WINDSCREEN$/.test(pane.name)))continue;
  const size=boxSize(pane);if(!size)continue;
  const [w,h,d]=size,axis=w<d?'x':'z',span=axis==='x'?d:w,thickness=axis==='x'?w:d;
  const parts=[],border=Math.min(.035,span*.025,h*.03),at=(x,y)=>axis==='x'?[thickness/2+.001,y,x]:[x,y,thickness/2+.001];
  for(const side of [-1,1]){
   parts.push({size:axis==='x'?[.012,h*.96,border]:[border,h*.96,.012],position:at(side*(span/2-border*.7),0)});
   parts.push({size:axis==='x'?[.012,border,span*.96]:[span*.96,border,.012],position:at(0,side*(h/2-border*.7))});
  }
  kit.batchBoxes(pane,parts,mat,'INDUSTRIAL_GLAZING_SEAL');
 }
}

function sideGraphic(kit,node,mat,{height=.16,length=.8,count=7,face='x',low=0}={}){
 const size=boxSize(node);if(!size)return;
 const [w,h,d]=size,span=face==='x'?d:w,parts=[];
 for(const side of [-1,1])for(let i=0;i<count;i++){
  const along=(i-(count-1)/2)*span*length/count,y=low*h;
  parts.push({size:face==='x'?[.007,h*height,span*length/count*.58]:[span*length/count*.58,h*height,.007],
   position:face==='x'?[side*(w/2-.0025),y,along]:[along,y,side*(d/2-.0025)],
   rotation:face==='x'?[.5,0,0]:[0,0,.5]});
 }
 kit.batchBoxes(node,parts,mat,'INDUSTRIAL_BROAD_SAFETY_LIVERY');
}

function cabAndMechanisms(T,root,kit,materials){
 const refs=root.userData.constructionParts||{};
 windowGaskets(kit,kit.source,materials.dark);
 // The seals follow the live ram barrel's scaling and orientation. Rods, eyes,
 // endpoint descriptors and hose articulation remain exactly the native rig.
 for(const ram of refs.hydraulics||[]){
  const radius=parameters(ram.body).radiusTop||.105;
  for(const y of [-.39,.39])kit.torus(ram.body,radius*1.035,radius*.12,[0,y,0],materials.steel,'INDUSTRIAL_HYDRAULIC_END_CAP',[Math.PI/2,0,0]);
 }
 for(const {shoes}of refs.tracks||[]){
  // Sparse alternating worn shoe faces keep the animation's existing tread
  // count and pivots. The outer faces are flush and polygon-offset, not larger
  // colliders or static geometry left behind when the crawler moves.
  for(let i=0;i<shoes.length;i+=7){
   const shoe=shoes[i],size=boxSize(shoe);if(!size)continue;
   const [w,h,d]=size,parts=[];
   for(const side of [-1,1])parts.push({size:[.001,h*.65,d*.72],position:[side*(w/2-.0005),0,0]});
   kit.batchBoxes(shoe,parts,materials.cream,'INDUSTRIAL_SEGMENTED_TRACK_WEAR_FACE');
  }
 }
 for(const wheel of refs.wheels||[]){
  const tyre=wheel.children.find(n=>n.isMesh&&parameters(n).radiusTop&&n.material?.roughness>.8);if(!tyre)continue;
  const radius=parameters(tyre).radiusTop;
  for(const side of [-1,1])kit.torus(wheel,radius*.44,radius*.028,[side*.284,0,0],materials.steel,'INDUSTRIAL_MACHINED_DRIVE_HUB',[0,Math.PI/2,0]);
 }
 const paintBoxes=kit.source.filter(node=>node.isMesh&&boxSize(node)&&node.material?.metalness>.3&&!node.userData.nativeDesignDetail&&!node.userData.collisionOnly&&!node.material?.transparent&&!/DASH|DECAL|GLASS|COLLIDER/.test(node.name||''));
 const hood=paintBoxes.find(node=>{const [w,h,d]=boxSize(node);return w>1.1&&w<3&&h>.5&&h<1.25&&d>.6&&d<2.2&&node.position.y>1;});
 if(hood){
  const [w,h,d]=boxSize(hood),vents=[];
  for(let i=0;i<9;i++)vents.push({size:[w*.035,h*.6,.012],position:[(i-4)*w*.078,0,-d/2-.003],rotation:[0,0,-.12]});
  kit.batchBoxes(hood,vents,materials.dark,'INDUSTRIAL_DEEP_HOOD_LOUVERS');
  sideGraphic(kit,hood,materials.cream,{height:.17,length:.8,count:5,low:-.26});
 }
}

function construction(T,root,id,kit,m){
 cabAndMechanisms(T,root,kit,m);
 const refs=root.userData.constructionParts||{};
 if(id==='site-dumptruck'&&refs.bed){
  const plates=[];for(const side of [-1,1]){
   plates.push({size:[.035,.18,4.7],position:[side*1.588,.9,-2.3]});
   for(let i=0;i<8;i++)plates.push({size:[.037,.26,.16],position:[side*1.589,.9,-4.3+i*.56],rotation:[.6,0,0]});
  }
  kit.batchBoxes(refs.bed,plates,m.cream,'HAULER_RAISED_SIDE_LIVERY');
  if(refs.tailgate){
   const gate=refs.tailgate.children.find(node=>boxSize(node)?.[0]>2);if(gate)sideGraphic(kit,gate,m.stencil,{face:'z',height:.43,count:9,length:.92,low:-.05});
  }
 }else if(id==='site-bulldozer'&&refs.blade){
  const blade=refs.blade.children.find(n=>boxSize(n)?.[0]>4&&boxSize(n)?.[1]>.7);
  if(blade)sideGraphic(kit,blade,m.stencil,{face:'z',height:.22,length:.92,count:12,low:.28});
 }else if(id==='site-excavator'&&refs.swing){
  const rear=refs.swing.children.find(n=>{const p=boxSize(n);return p&&p[0]>2.5&&p[1]>.9&&p[2]<.9;});
  if(rear)sideGraphic(kit,rear,m.stencil,{face:'z',height:.23,count:9,length:.9,low:-.24});
  if(refs.boom){
   const strips=[{size:[.04,2.65,.07],position:[.35,1.95,-.12]},{size:[.04,2.65,.07],position:[-.35,1.95,-.12]}];
   kit.batchBoxes(refs.boom,strips,m.cream,'EXCAVATOR_BOOM_DIVISION_STRIPES');
  }
 }else if(id==='tower-crane'){
  const bands=[];for(const y of [7,19,31,43,55,67])for(const side of [-1,1])bands.push({size:[2.05,.075,.025],position:[0,y,side*1.18]});
  kit.batchBoxes(root,bands,m.cream,'CRANE_HIGH_VISIBILITY_MAST_BANDS');
  if(refs.hook){
   const hooks=refs.hook.children.find(n=>boxSize(n)?.[0]>.7&&boxSize(n)?.[1]>.5);if(hooks)sideGraphic(kit,hooks,m.stencil,{face:'z',height:.64,count:5,length:.95});
  }
 }
}

function freight(T,root,kit,m){
 const rails=[],reflectors=[];
 for(const side of [-1,1]){
  rails.push({size:[.018,.105,3.45],position:[side*1.039,.97,.3]});
  for(let i=0;i<8;i++)reflectors.push({size:[.022,.075,.19],position:[side*1.04,.97,-1.12+i*.41]});
 }
 kit.batchBoxes(root,rails,m.cream,'FREIGHT_TRAILER_SIDE_LIVERY');kit.batchBoxes(root,reflectors,m.safety,'FREIGHT_TRAILER_REFLECTIVE_PANELS');
 const deck=kit.source.find(n=>{const p=boxSize(n);return p&&p[0]>1.7&&p[0]<2&&p[1]<.1&&p[2]>3;});
 if(deck){const [w,h,d]=boxSize(deck),seams=[];for(let i=1;i<7;i++)seams.push({size:[.012,.006,d*.94],position:[-w/2+w*i/7,h/2-.002,0]});kit.batchBoxes(deck,seams,m.timber,'FREIGHT_FITTED_TIMBER_DECK');}
 for(const wheel of kit.source.filter(n=>n.isMesh&&n.geometry?.type==='CylinderGeometry'&&Math.abs(parameters(n).radiusTop-.34)<.001)){
  for(const side of [-1,1])kit.torus(wheel,.2,.014,[0,side*.105,0],m.steel,'FREIGHT_TRAILER_WHEEL_RIM',[Math.PI/2,0,0]);
 }
}

function cart(T,root,kit,m){
 for(const wheel of kit.source.filter(n=>n.name==='IRON_WHEEL_TYRE'))for(const side of [-1,1])kit.torus(wheel,.38,.01,[0,0,side*.038],m.steel,'CART_FORGED_TYRE_LIP');
 const bands=[];for(const side of [-1,1]){
  for(const x of [-.52,.91])bands.push({size:[.045,.62,.012],position:[x,1.03,side*.493]});
  for(const x of [-.46,.85])for(const y of [.83,1.2])bands.push({size:[.11,.022,.014],position:[x,y,side*.496]});
 }
 kit.batchBoxes(root,bands,m.cream,'CART_HAND_FITTED_IRON_BINDINGS');
}

function clownCar(T,root,kit,m){
 const car=kit.source.find(n=>n.name==='FUNHOUSE_TINY_CLOWN_CAR');if(!car)return;
 for(const side of [-1,1])for(const z of [-1.25,1.25]){
  const shape=new T.Shape(),outer=.69,inner=.585;shape.moveTo(-outer,0);shape.absarc(0,0,outer,Math.PI,0,true);shape.lineTo(inner,0);shape.absarc(0,0,inner,0,Math.PI,false);shape.closePath();
  const geometry=new T.ExtrudeGeometry(shape,{depth:.28,bevelEnabled:true,bevelSize:.035,bevelThickness:.025,bevelSegments:2,curveSegments:12});geometry.translate(0,0,-.14);
  const mesh=new T.Mesh(geometry,z<0?m.safety:m.cyan);mesh.position.set(side*1.3,.55,z);mesh.rotation.y=Math.PI/2;kit.add(car,mesh,'CLOWN_CAR_FORMED_FENDER');
 }
 const stripes=[];for(const side of [-1,1])for(let i=0;i<5;i++)stripes.push({size:[.02,.17,.34],position:[side*1.239,1.07,-.65+i*.35],rotation:[.22,0,0]});
 kit.batchBoxes(car,stripes,m.cream,'CLOWN_CAR_CANDY_SIDE_SWEEP');windowGaskets(kit,kit.source,m.dark);
 for(const pane of kit.source.filter(n=>n.name==='FUNHOUSE_CLOWN_CAR_SEAT_BACK')){
  const p=boxSize(pane);if(!p)continue;const seams=[];for(const x of [-p[0]*.36,0,p[0]*.36])seams.push({size:[.016,p[1]*.78,.01],position:[x,0,-p[2]/2-.002]});kit.batchBoxes(pane,seams,m.cream,'CLOWN_CAR_PADDED_SEAT_PIPING');
 }
}

function trainAndCoaster(T,root,kit,m){
 const faceOptions={roughness:.4,metalness:.36,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2};
 const boiler=kit.material('PARK_TRAIN_SMOKEBOX_FACE',{...faceOptions,color:0x203b45});
 const faceTrim=kit.material('PARK_RIDE_FRONT_IVORY_INLAY',{...faceOptions,color:0xeee4c3,polygonOffsetFactor:-8,polygonOffsetUnits:-8,depthWrite:false});
 const coach=kit.material('PARK_TRAIN_TWO_TONE_APRON',{...faceOptions,color:0x2e7469});
 const glass=kit.material('PARK_TRAIN_CAB_GLAZING',{color:0x84b6c7,roughness:.19,metalness:.08,transparent:true,opacity:.53,depthWrite:false});
 const lamp=kit.material('PARK_RIDE_HEADLAMP',{...faceOptions,color:0xffeab1,emissive:0xffce6f,emissiveIntensity:.6,polygonOffsetFactor:-12,polygonOffsetUnits:-12,depthWrite:false});
 function disc(parent,radius,position,material,name,inner=0){
  const geometry=inner?new T.RingGeometry(inner,radius,32):new T.CircleGeometry(radius,32),node=new T.Mesh(geometry,material);
  node.position.set(...position);node.rotation.y=Math.PI;node.renderOrder=/HEADLAMP/.test(name)?30:inner?20:10;return kit.add(parent,node,name);
 }
 function frontApron(parent,points,z,material,name){
  const shape=new T.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
  const node=new T.Mesh(new T.ShapeGeometry(shape),material);node.position.z=z;node.rotation.y=Math.PI;node.renderOrder=10;return kit.add(parent,node,name);
 }
 const trains=kit.source.filter(n=>/^ARCADE_TRAIN_(?:ENGINE|CARRIAGE_\d+)$/.test(n.name||''));
 for(const train of trains){
  const engine=train.name==='ARCADE_TRAIN_ENGINE';
  const apron=[];for(const side of [-1,1])apron.push({size:[.018,.32,1.68],position:[side*.558,.44,0]});
  kit.batchBoxes(train,apron,coach,'PARK_TRAIN_TWO_TONE_COACH_APRON');
  const bands=[];for(const side of [-1,1]){
   bands.push({size:[.018,.12,1.57],position:[side*.557,.87,0]});
   for(let i=0;i<5;i++)bands.push({size:[.019,.2,.09],position:[side*.558,.62,-.58+i*.29],rotation:[.35,0,0]});
  }
  kit.batchBoxes(train,bands,m.cream,'PARK_TRAIN_COACH_LIVERY');
  if(engine){
   // The circular front is a true flat overlay on the existing nose face. It
   // adds a recognisable locomotive smokebox without extending the vehicle.
   disc(train,.355,[0,.65,-.900001],boiler,'PARK_TRAIN_CIRCULAR_SMOKEBOX');
   disc(train,.344,[0,.65,-.900002],faceTrim,'PARK_TRAIN_SMOKEBOX_RIM',.305);
   disc(train,.072,[0,.925,-.900003],lamp,'PARK_TRAIN_FRONT_HEADLAMP');
   // A glazed rear cab fits below the existing chimney height and inside the
   // original wheel/roof footprint. The original ride seats and controls stay.
   const frame=[];for(const x of [-.53,.53])for(const z of [.02,.84])frame.push({size:[.045,.42,.045],position:[x,1.42,z]});
   for(const y of [1.23,1.61])frame.push({size:[1.08,.04,.045],position:[0,y,.01]});
   kit.batchBoxes(train,frame,m.cream,'PARK_TRAIN_GLAZED_CAB_FRAME');
   kit.box(train,[1.17,.055,.93],[0,1.615,.43],coach,'PARK_TRAIN_FORMED_CAB_ROOF');
   kit.batchBoxes(train,[{size:[1.005,.32,.009],position:[0,1.42,.012]},{size:[.009,.32,.73],position:[-.53,1.42,.43]},{size:[.009,.32,.73],position:[.53,1.42,.43]}],glass,'PARK_TRAIN_CAB_WINDOWS');
  }else{
   const posts=[];for(const x of [-.525,.525])for(const z of [-.55,.55])posts.push({size:[.045,.6,.045],position:[x,1.46,z]});
   for(const side of [-1,1])posts.push({size:[.018,.11,1.44],position:[side*.55,1.66,.2]});
   kit.batchBoxes(train,posts,m.cream,'PARK_TRAIN_PASSENGER_CANOPY_JOINERY');
   frontApron(train,[[-.5,.23],[.5,.23],[.5,.51],[-.5,.51]],-.900001,coach,'PARK_TRAIN_PASSENGER_END_APRON');
  }
  for(const x of [-.6,.6])for(const z of [-.55,.55]){
   kit.torus(train,.115,.016,[x+Math.sign(x)*.203,.25,z],m.steel,'PARK_TRAIN_SPOKED_WHEEL_RIM',[0,Math.PI/2,0]);
   const spokes=[];for(let i=0;i<6;i++)spokes.push({size:[.012,.19,.018],position:[x+Math.sign(x)*.211,.25,z],rotation:[i*Math.PI/3,0,0]});
   kit.batchBoxes(train,spokes,m.safety,'PARK_TRAIN_WHEEL_SPOKES');
  }
 }
 for(const car of kit.source.filter(n=>n.name==='ARCADE_COASTER_CAR')){
  for(const side of [-1,1])shell(T,kit,car,[[-.76,.06],[-.76,.29],[-.58,.53],[.56,.43],[.76,.2],[.73,.06]],.02,[side*.505,0,0],[0,Math.PI/2,0],m.cyan,'COASTER_FORMED_SIDE_SHELL');
  const trim=[];for(const side of [-1,1])for(let i=0;i<5;i++)trim.push({size:[.018,.06,.13],position:[side*.523,.24,-.57+i*.28],rotation:[.18,0,0]});
  kit.batchBoxes(car,trim,m.cream,'COASTER_SIDE_LIVERY');
  frontApron(car,[[-.46,.045],[.46,.045],[.46,.28],[.24,.48],[-.24,.48],[-.46,.28]],-.800001,m.cyan,'COASTER_SWEPT_RACING_NOSE_APRON');
  for(const side of [-1,1]){
   const chevron=new T.Mesh(new T.PlaneGeometry(.36,.052),faceTrim);chevron.position.set(side*.16,.25,-.800004);chevron.rotation.set(0,Math.PI,side*.35);chevron.renderOrder=20;kit.add(car,chevron,'COASTER_FRONT_RACING_CHEVRON');
  }
  for(const x of [-.34,.34])disc(car,.044,[x,.17,-.800003],lamp,'COASTER_FRONT_HEADLAMP');
  kit.batchBoxes(car,[{size:[.72,.018,.022],position:[0,.78,-.632]},{size:[.72,.018,.022],position:[0,.22,-.632]}],m.cream,'COASTER_PADDED_BACK_SEAMS');
 }
}

function canoes(T,root,kit,m){
 for(const hull of kit.source.filter(n=>n.isMesh&&n.geometry?.type==='ExtrudeGeometry')){
  const points=[];for(let i=0;i<=24;i++){
   const t=i/24,x=-2.4+4.8*t,y=-3*t*(1-t);points.push(new T.Vector3(x*.97,y*.97,-.012));
  }
  for(let i=1;i<=24;i++){
   const t=i/24,x=2.4-4.8*t,y=3*t*(1-t);points.push(new T.Vector3(x*.97,y*.97,-.012));
  }
  const geometry=new T.TubeGeometry(new T.CatmullRomCurve3(points,true),64,.024,5,true);kit.add(hull,new T.Mesh(geometry,m.cream),'CANOE_BOUND_GUNWALE');
  const cockpit=new T.Shape();cockpit.moveTo(-2.02,0);cockpit.quadraticCurveTo(0,-1.15,2.02,0);cockpit.quadraticCurveTo(0,1.15,-2.02,0);cockpit.closePath();
  const inset=new T.Mesh(new T.ShapeGeometry(cockpit,24),m.dark);inset.position.z=-.004;inset.rotation.y=Math.PI;kit.add(hull,inset,'CANOE_RECESSED_INTERIOR');
  const seats=[];for(const x of [-.85,.85])seats.push({size:[.14,1.03,.05],position:[x,0,-.025]});kit.batchBoxes(hull,seats,m.timber,'CANOE_FITTED_TIMBER_SEATS');
 }
}

function flightCollectible(T,root,kit,m){
 const body=kit.source.find(n=>n.name==='FACTORY_SEGMENTED_SHELL');if(!body)return;
 const radius=parameters(body).radiusTop||1,height=parameters(body).height||1;
 for(const y of [-.31,-.07,.25])kit.torus(body,radius*1.012,.02,[0,y*height,0],m.steel,'CRAFT_FLIGHT_SEGMENT_LOCK_RING',[Math.PI/2,0,0]);
 const bands=[];for(const side of [-1,1])for(let i=0;i<4;i++)bands.push({size:[.015,height*.035,radius*.22],position:[side*radius*.996,(-.2+i*.13)*height,0]});
 kit.batchBoxes(body,bands,m.safety,'CRAFT_FLIGHT_THERMAL_SERVICE_BANDS');
 const nozzle=kit.source.find(n=>n.name==='FACTORY_INERT_NOZZLE');if(nozzle){const p=parameters(nozzle);kit.torus(nozzle,(p.radiusTop||1)*.79,.035,[0,(p.height||1)*.42,0],m.steel,'CRAFT_FLIGHT_NOZZLE_LINER',[Math.PI/2,0,0]);}
}

export function finishVehicleIndustrialDesign(T,root,id,kit){
 if(!root||!supported.has(id)||root.userData.vehicleIndustrialDesign)return root;
 // A builder wrapper can contain the already-finished world ride assembly.
 // Reuse that finish instead of decorating the same moving car a second time.
 let finishedChild=false;
 root.traverse(node=>{if(node!==root&&node.userData.vehicleIndustrialDesign&&node.userData.vehicleDesign?.id===id)finishedChild=true;});
 if(finishedChild){root.userData.vehicleIndustrialDesign='crafted-industrial-vehicles-1';return root;}
 const m=palette(kit);
 if(['site-dumptruck','site-bulldozer','site-excavator','tower-crane'].includes(id))construction(T,root,id,kit,m);
 else if(id==='utility-cargo-trailer')freight(T,root,kit,m);
 else if(id==='wooden-cart')cart(T,root,kit,m);
 else if(id==='camp-canoe-rack')canoes(T,root,kit,m);
 else if(id==='funhouse-clown-car')clownCar(T,root,kit,m);
 else if(id.startsWith('arcade-part-'))trainAndCoaster(T,root,kit,m);
 else flightCollectible(T,root,kit,m);
 root.userData.vehicleIndustrialDesign='crafted-industrial-vehicles-1';
 return root;
}
