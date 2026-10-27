import {AIRCRAFT_TYPES} from './aircraft-types.js';
import {HARBOR_BOATS} from './harbor-water.js';
import {SHIPPING_VESSELS} from './shipping-vessel-specs.js';

export const VEHICLE_AIR_MARINE_DESIGN_IDS=Object.freeze([...Object.keys(AIRCRAFT_TYPES),...HARBOR_BOATS]);
const supported=new Set(VEHICLE_AIR_MARINE_DESIGN_IDS);

// The kit owns material caching, precise bounds checks and the shared draw budget.
// All coordinates below are authored in metres. Original meshes, live material
// references, animation pivots and waterline/collision geometry remain untouched.
export function finishVehicleAirMarineDesign(T,root,id,kit){
 if(!root||!kit||!supported.has(id)||(root.userData.vehicleAirMarineDesign?.version===1&&root.userData.vehicleAirMarineDesign.id===id))return root;
 const source=kit.source||[],named=name=>source.find(n=>n.name===name),all=pattern=>source.filter(n=>n.isMesh&&pattern.test(n.name||''));
 const alloy=kit.material('AIR_MARINE_SATIN_ALLOY',{color:0xb9c9ce,metalness:.78,roughness:.28,side:T.DoubleSide});
 const graphite=kit.material('AIR_MARINE_GRAPHITE',{color:0x243c47,metalness:.42,roughness:.49,side:T.DoubleSide});
 const caulk=kit.material('AIR_MARINE_CAULKING',{color:0x443b31,metalness:0,roughness:.91});
 const teak=kit.material('AIR_MARINE_HONEY_TEAK',{color:0xac845a,metalness:.02,roughness:.72});
 const cream=kit.material('AIR_MARINE_WARM_IVORY',{color:0xece8d6,metalness:.12,roughness:.52,side:T.DoubleSide});
 const brass=kit.material('AIR_MARINE_BRASS',{color:0xc9ae76,metalness:.67,roughness:.3});
 const orange=kit.material('AIR_MARINE_SAFETY_ORANGE',{color:0xea8d43,metalness:.08,roughness:.57});
 const yellow=kit.material('AIR_MARINE_DECK_MARKING',{color:0xe8c05e,metalness:.08,roughness:.7});
 const boxSize=node=>{const p=node?.geometry?.parameters;return p&&[p.width,p.height,p.depth].every(n=>Number.isFinite(n)&&n>0)?[p.width,p.height,p.depth]:null;};
 const box=(p,s,v,m,n,r)=>kit.box(p,s,v,m,'CRAFTED_'+n,r);
 const batch=(p,b,m,n)=>{if(b.length)kit.batchBoxes(p,b,m,'CRAFTED_'+n);};
 const tube=(p,a,b,r,m,n)=>kit.tube(p,a,b,r,m,'CRAFTED_'+n);
 const torus=(p,r,t,v,m,n,q)=>kit.torus(p,r,t,v,m,'CRAFTED_'+n,q);
 function skin(points,material,name,parent=root){
  const positions=[],uv=[],indices=[];
  for(const row of points)for(const [i,p]of row.entries()){positions.push(...p);uv.push(i/(row.length-1),points.indexOf(row)/(points.length-1));}
  const width=points[0].length;
  for(let y=0;y<points.length-1;y++)for(let x=0;x<width-1;x++){const a=y*width+x,b=a+width;indices.push(a,b,a+1,b,b+1,a+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  // Thin surface skins need both sides because port/starboard winding differs.
  const mesh=new T.Mesh(g,material);kit.add(parent,mesh,'CRAFTED_'+name);
 }
 function strips(strips,material,name,parent=root){
  const positions=[],uv=[],indices=[];
  for(const corners of strips){const offset=positions.length/3;corners.forEach((p,i)=>{positions.push(...p);uv.push(i%2,Math.floor(i/2));});indices.push(offset,offset+1,offset+2,offset+1,offset+3,offset+2);}
  if(!positions.length)return;
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();kit.add(parent,new T.Mesh(g,material),'CRAFTED_'+name);
 }
 function frame(node,material=alloy,axis=1,inset=.07){
  const s=boxSize(node);if(!s)return;
  const a=(axis+1)%3,b=(axis+2)%3,face=s[axis]/2+.001,edge=Math.min(.025,s[a]*.045,s[b]*.045),parts=[];
  for(const side of [-1,1]){const size=[0,0,0],position=[0,0,0];size[axis]=.006;size[a]=s[a]-inset*2;size[b]=edge;position[axis]=face;position[b]=side*(s[b]/2-inset);parts.push({size,position});}
  for(const side of [-1,1]){const size=[0,0,0],position=[0,0,0];size[axis]=.006;size[a]=edge;size[b]=s[b]-inset*2;position[axis]=face;position[a]=side*(s[a]/2-inset);parts.push({size,position});}
  batch(node,parts,material,'RECESSED_SERVICE_PANEL_FRAME');
 }
 function lifeRing(parent,position,radius,rotation=[0,0,0]){
  torus(parent,radius,radius*.22,position,orange,'RESCUE_LIFERING',rotation);
  const fitting=new T.Group();fitting.position.set(...position);fitting.rotation.set(...rotation);
  // The four pale tapes are a single fitted batch in the ring's own plane.
  const tapes=[];for(let i=0;i<4;i++){const a=i*Math.PI/2;tapes.push({size:[radius*.25,radius*.43,radius*.46],position:[Math.sin(a)*radius,Math.cos(a)*radius,0],rotation:[0,0,-a]});}
  // Avoid a separate scene group: apply the local frame to the batch's boxes.
  const transform=new T.Matrix4().compose(fitting.position,fitting.quaternion,new T.Vector3(1,1,1));
  for(const tape of tapes){const p=new T.Vector3(...tape.position).applyMatrix4(transform),q=new T.Quaternion().setFromEuler(new T.Euler(...tape.rotation));q.premultiply(fitting.quaternion);tape.position=p.toArray();tape.rotation=new T.Euler().setFromQuaternion(q).toArray().slice(0,3);}
  batch(parent,tapes,cream,'LIFERING_REFLECTIVE_TAPES');
 }
 function ropeCoil(parent,position,r=.12){
  for(const ratio of [1,.72])torus(parent,r*ratio,.012,position,teak,'COILED_MOORING_ROPE',[Math.PI/2,0,0]);
 }

 if(AIRCRAFT_TYPES[id]){
  const cub=id==='piper-cub',corsair=id==='corsair-aircraft',spec=AIRCRAFT_TYPES[id],rig=root.userData.aircraftRig||{},span=spec.dimensions[0];
  const wingSections=corsair?[[0,.76,-1.35,1.12],[1.55,.32,-1.07,1.01],[2.1,.39,-.98,.91],[4.75,.78,-.47,.49],[5.25,.83,-.27,.31]]:null;
  function wingPoint(x,t,side){
   if(corsair){let j=0;while(j<wingSections.length-2&&x>wingSections[j+1][0])j++;const a=wingSections[j],b=wingSections[j+1],f=(x-a[0])/(b[0]-a[0]),lerp=k=>a[k]+(b[k]-a[k])*f,y=lerp(1),front=lerp(2),chord=lerp(3)-front;return [side*x,y+(.075*Math.sqrt(Math.max(0,Math.sin(Math.PI*t)))+.012)*chord+.002,front+t*chord];}
   const f=(x-.45)/(span/2-.45),taper=cub?1-f*.08:1-f*.35,chord=(cub?1.5:1.35)*taper,thickness=(cub?.075:.085)*(1-f*.65);return [side*x,(cub?2.15:.65)+(cub?f*.04:f*.22)+Math.sin(Math.acos(1-2*t))*thickness+.002,-.45+(t-.5)*chord];
  }
  for(const side of [-1,1]){
   const start=corsair?1.85:.7,end=span/2-.22;
   const leading=Array.from({length:13},(_,i)=>{const x=start+(end-start)*i/12;return [.045,.12,.19].map(t=>wingPoint(x,t,side));});
   skin(leading,corsair?graphite:alloy,'AIRFOIL_LEADING_EDGE',root);
   const spar=Array.from({length:13},(_,i)=>{const x=start+(end-start)*i/12;return [.63,.642].map(t=>wingPoint(x,t,side));});skin(spar,graphite,'WING_SPAR_PANEL_SEAM');
   const ribs=[];
   for(let x=start+.2;x<end-.1;x+=cub?.56:.8)for(let t=.20;t<.75;t+=.075)ribs.push([wingPoint(x-.008,t,side),wingPoint(x+.008,t,side),wingPoint(x-.008,Math.min(.79,t+.075),side),wingPoint(x+.008,Math.min(.79,t+.075),side)]);
   strips(ribs,cub?cream:graphite,'AIRFOIL_RIB_AND_PANEL_JOINTS');
   // Inspection lids sit on the wing's upper camber, away from moving edges.
   const x=corsair?2.65:2.4,lid=Array.from({length:5},(_,i)=>[.34,.47].map(t=>wingPoint(x-.15+i*.075,t,side)));skin(lid,corsair?alloy:graphite,'WING_INSPECTION_LID');
  }
  for(const surface of [...(rig.ailerons||[]),...(rig.flaps||[]),rig.elevator].filter(Boolean)){
   const panel=surface.isMesh?surface:surface.children.find(n=>n.isMesh&&boxSize(n)),s=boxSize(panel);if(!s)continue;
   box(panel,[s[0]*.92,.008,s[2]*.48],[0,s[1]/2+.001,0],corsair?alloy:graphite,'MOVING_CONTROL_SURFACE_INSERT');
   const ribs=[];for(let x=-s[0]*.38;x<s[0]*.4;x+=.21)ribs.push({size:[.008,.006,s[2]*.72],position:[x,s[1]/2+.006,0]});batch(panel,ribs,cream,'CONTROL_SURFACE_RIB_TAPES');
  }
  const rudder=rig.rudder,rd=rudder?.isMesh?rudder:rudder?.children.find(n=>n.isMesh&&boxSize(n)),rs=boxSize(rd);
  if(rs)for(const side of [-1,1])box(rd,[.006,rs[1]*.72,rs[2]*.48],[side*(rs[0]/2+.001),0,0],alloy,'RUDDER_BALANCE_PANEL');
  const fuselage=corsair?[[-3.42,.98,.61,.61],[-2.8,.98,.64,.66],[-2.1,.97,.63,.65],[-1.3,.98,.57,.59],[-.45,1,.52,.54]]:cub?[[-3.35,.87,.22,.27],[-2.8,.94,.38,.43],[-1.2,.9,.43,.38]]:[[-4,.95,.12,.2],[-3.5,.97,.43,.42],[-2.2,.92,.58,.47],[-.8,.84,.65,.4]];
  function shell(z,angle,offset=.002){let j=0;while(j<fuselage.length-2&&z>fuselage[j+1][0])j++;const a=fuselage[j],b=fuselage[j+1],f=(z-a[0])/(b[0]-a[0]);return [Math.cos(angle)*(a[2]+(b[2]-a[2])*f+offset),a[1]+(b[1]-a[1])*f+Math.sin(angle)*(a[3]+(b[3]-a[3])*f+offset),z];}
  for(const side of [-1,1]){
   const angle=side===1?0:Math.PI,z0=corsair?-2.35:cub?-2.7:-3.25,z1=z0+(corsair?.65:.49);
   skin(Array.from({length:8},(_,i)=>[-.2,.2].map(a=>shell(z0+(z1-z0)*i/7,angle+a))),corsair?graphite:alloy,'ENGINE_SERVICE_COWL_PANEL');
   const vents=[];for(let i=0;i<6;i++){const z=(corsair?-3.05:cub?-2.65:-3.15)+i*.07;vents.push([shell(z,angle-.09,.004),shell(z+.025,angle-.09,.004),shell(z,angle+.09,.004),shell(z+.025,angle+.09,.004)]);}strips(vents,graphite,'ENGINE_COOLING_LOUVERS');
  }
  // Hub brake discs and torque links stay children of the actual animated gear.
  for(const leg of rig.gear||[]){
   const wheel=[];leg.traverse(n=>{if(n.isMesh&&n.geometry?.type==='CylinderGeometry'&&(n.userData.vehicleWheel||/WHEEL/.test(n.name)||n.material?.roughness>.8))wheel.push(n);});
   for(const tyre of wheel.slice(0,1)){const p=tyre.geometry.parameters,r=p.radiusTop;
    for(const side of [-1,1])torus(tyre,r*.58,.012,[0,side*(p.height/2-.008),0],alloy,'LANDING_GEAR_BRAKE_DISC',[Math.PI/2,0,0]);
    const bolts=[];for(let i=0;i<6;i++){const a=i*Math.PI/3;bolts.push({size:[.018,.009,.018],position:[Math.cos(a)*r*.32,p.height/2-.006,Math.sin(a)*r*.32]});}batch(tyre,bolts,brass,'HUB_BOLT_CIRCLE');
   }
  }
  const panel=named('INSTRUMENT_PANEL')||named('COCKPIT_INSTRUMENT_PANEL')?.children.find(n=>boxSize(n));
  if(panel){const s=boxSize(panel);if(s){box(panel,[s[0]*.92,.018,.018],[0,-s[1]*.4,s[2]/2+.002],alloy,'COCKPIT_SWITCH_RAIL');const switches=[];for(let i=0;i<7;i++)switches.push({size:[.018,.025,.026],position:[(i-3)*s[0]*.1,-s[1]*.4,s[2]/2+.014]});batch(panel,switches,cream,'COCKPIT_SWITCH_BANK');}}
  if(rig.stick)torus(rig.stick,.032,.009,[0,.30,-.028],alloy,'CONTROL_STICK_COLLAR',[Math.PI/2,0,0]);
 }else{
  const yacht=id==='harbor-yacht',shipping=SHIPPING_VESSELS[id],pontoon=id==='resort-pontoon',paddle=id==='resort-paddle-boat',sail=id==='harbor-sailboat',rig=root.userData.boatRig||{};
  // Inset weatherproof lids and deck panel edges retain their authored parents.
  for(const node of all(/COCKPIT_TEAK_SOLE|PONTOON_TEAK_DECK|OPEN_ANGLED_CASTING_DECK|LIVEWELL_LID|ONBOARD_TACKLE_LOCKER/))frame(node,brass);
  for(const node of all(/MAIN_DECK_SAFETY_RAIL|UPPER_DECK_SAFETY_RAIL|AFT_DECK_SAFETY_RAIL|UPPER_FORWARD_SAFETY_RAIL|UPPER_AFT_SAFETY_RAIL/)){
   const s=boxSize(node);if(s)box(node,[s[0],.025,s[2]],[0,s[1]/2-.015,0],alloy,'POLISHED_SAFETY_RAIL_CAP');
  }
  for(const node of all(/SHAPED_WEATHER_DECK/)){
   // Flat paint follows the existing deck, leaving the physical slab unchanged.
   const spec=shipping;if(!spec)continue;const deck=spec===SHIPPING_VESSELS['shipping-feeder']?1.35:2.15,lanes=[];
   for(const side of [-1,1])lanes.push({size:[.10,.004,spec.length*.65],position:[side*spec.beam*.35,deck+.089,-spec.length*.03]});
   for(let z=-spec.length*.3;z<spec.length*.27;z+=2)for(const side of [-1,1])lanes.push({size:[.32,.004,.10],position:[side*spec.beam*.35,deck+.091,z]});
   batch(root,lanes,yellow,'CARGO_DECK_SAFE_WALKWAY_PAINT');
  }
  if(shipping){
   const small=id==='shipping-feeder',deck=small?1.35:2.15,half=shipping.beam/2;
   const hatchMarks=[];for(let z=-shipping.length*.27;z<shipping.length*.14;z+=small?4:6)for(const side of [-1,1])for(let i=0;i<5;i++)hatchMarks.push({size:[.4,.004,.10],position:[side*half*.6,deck+.093,z+i*.22],rotation:[0,side*.6,0]});batch(root,hatchMarks,cream,'CARGO_WORKING_ZONE_CHEVRONS');
   for(const tank of all(/TANKER_CARGO_TANK/))for(const side of [-1,1])torus(tank,tank.geometry.parameters.radiusTop+.007,.025,[0,side*1.5,0],alloy,'TANKER_REINFORCING_BAND',[Math.PI/2,0,0]);
   const bridge=named('BRIDGE_PANORAMIC_WINDOW'),bs=boxSize(bridge);
   if(bs){const mullions=[];for(const x of [-bs[0]*.29,bs[0]*.29])mullions.push({size:[.04,bs[1],.045],position:[x,0,0]});for(const side of [-1,1])mullions.push({size:[bs[0],.04,.045],position:[0,side*bs[1]*.48,0]});batch(bridge,mullions,alloy,'BRIDGE_GLAZING_MULLIONS');}
   const z=small?-1:2,h=small?3.3:5.4;
   if(!id.includes('tanker')){
    for(const side of [-1,1])tube(root,[side*half*.65,deck+h-.12,z],[0,deck+h-1.3,z],.016,graphite,'CARGO_DERRICK_RUNNING_WIRE');
    torus(root,.18,.035,[0,deck+h-1.44,z],alloy,'CARGO_LIFT_HOOK');
    const hazard=[];for(const side of [-1,1])for(let i=0;i<7;i++)hazard.push({size:[.20,.004,.45],position:[side*half*.83,deck+.095,z-.7+i*.2],rotation:[0,.65,0]});batch(root,hazard,yellow,'DERRICK_BASE_EXCLUSION_PAINT');
   }
   for(const side of [-1,1]){
    ropeCoil(root,[side*half*.72,deck+.27,shipping.length*.39],small?.18:.25);
    lifeRing(root,[side*(shipping.beam*.4-.08),shipping.seat[1]-.58,shipping.seat[2]+1.95],small?.25:.34,[0,Math.PI/2,0]);
   }
   const funnel=named('EXHAUST_FUNNEL'),fs=boxSize(funnel);if(fs){const louvers=[];for(let y=-fs[1]*.2;y<fs[1]*.4;y+=.17)for(const side of [-1,1])louvers.push({size:[.01,.055,fs[2]*.62],position:[side*(fs[0]/2+.001),y,0]});batch(funnel,louvers,graphite,'FUNNEL_VENTILATION_LOUVERS');}
   for(const container of source.filter(n=>n.userData.shippingSide)){
    const body=container.getObjectByName('CONTAINER_STEEL_BODY');if(body)box(body,[2.1,.06,.008],[0,.98,3.004],cream,'CARGO_CONTAINER_IDENTIFICATION_BAND');
   }
  }else if(yacht){
   // These metre-scale decks are viewed from a distant chase/catalog camera.
   // Millimetre skins alone lose depth precision over the white walkable slab.
   // Caulking is mipmapped on the skin: subpixel geometric strips otherwise
   // produce a diagonal coverage lattice at catalog/chase-camera distances.
   function plankMap(width,depth){
    const pixels=256,data=new Uint8Array(pixels*pixels*4),clamp=v=>Math.max(0,Math.min(1,v));
    const line=(value,period,thickness,pixel)=>{const f=((value/period)%1+1)%1,d=Math.min(f,1-f)*period;return clamp(((thickness+pixel)/2-d)/pixel);};
    for(let y=0;y<pixels;y++)for(let x=0;x<pixels;x++){
     const u=(x+.5)/pixels*width,v=(y+.5)/pixels*depth,plank=Math.floor(u/.24);
     const caulking=Math.max(line(u,.24,.012,width/pixels),line(v+(plank%2)*.85,1.7,.008,depth/pixels));
     const grain=Math.sin(u*110+Math.sin(v*.8)*.4)*.006,shade=Math.round((.98+grain-caulking*.66)*255),offset=(y*pixels+x)*4;
     data.set([shade,shade,shade,255],offset);
    }
    const map=new T.DataTexture(data,pixels,pixels,T.RGBAFormat);map.name='CRAFTED_FLYBRIDGE_TEAK_PLANKS';map.colorSpace=T.SRGBColorSpace;map.magFilter=T.LinearFilter;map.minFilter=T.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;return map;
   }
   for(const deck of all(/^FLYBRIDGE_WALKABLE_DECK/)){
    const s=boxSize(deck);if(!s)continue;
    const deckTeak=kit.material('AIR_MARINE_FLYBRIDGE_TEAK_'+deck.name,{color:0xac845a,metalness:.02,roughness:.72,map:plankMap(s[0]-.16,s[2]-.18),polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
    box(deck,[s[0]-.16,.004,s[2]-.18],[0,s[1]/2+.002,0],deckTeak,'FLYBRIDGE_INSET_TEAK');
   }
   for(const tread of all(/^FLYBRIDGE_STAIR$/)){const s=boxSize(tread);if(s)box(tread,[s[0]-.08,.012,.035],[0,s[1]/2-.005,-s[2]/2+.04],brass,'STAIR_TREAD_NONSLIP_NOSING');}
   for(const side of [-1,1]){ropeCoil(root,[side*4.62,2.08,-11.4],.22);lifeRing(root,[side*4.83,5.52,2],.33,[0,Math.PI/2,0]);}
   const helm=named('FLYBRIDGE_HELM');if(helm)frame(helm,brass,2,.08);
  }else if(pontoon){
   const deck=named('PONTOON_TEAK_DECK');if(deck){box(deck,[3.25,.045,.045],[0,.11,-2.94],alloy,'PONTOON_BOW_DECK_EDGE');box(deck,[3.25,.045,.045],[0,.11,2.94],alloy,'PONTOON_AFT_DECK_EDGE');}
   const canopy=named('STRIPED_SUN_CANOPY');if(canopy){const trims=[];for(const side of [-1,1])trims.push({size:[.035,.035,6.32],position:[side*1.79,-.055,0]});for(const z of [-3.17,3.17])trims.push({size:[3.58,.035,.035],position:[0,-.055,z]});batch(canopy,trims,cream,'CANOPY_BOUND_EDGE_PIPING');}
   for(const side of [-1,1]){lifeRing(root,[side*1.48,1.07,.55],.22,[0,Math.PI/2,0]);ropeCoil(root,[side*1.35,.635,-2.55],.13);}
   const motor=named('QUIET_ELECTRIC_OUTBOARD');if(motor){frame(motor,alloy,2,.07);const vents=[];for(let i=0;i<5;i++)vents.push({size:[.33,.025,.009],position:[0,-.15+i*.07,.202]});batch(motor,vents,graphite,'ELECTRIC_MOTOR_COOLING_GRILLE');}
  }else if(paddle){
   const bow=named('PADDLE_BOAT_BOW');if(bow){frame(bow,brass);box(bow,[1.52,.006,.4],[0,.119,0],cream,'PEDAL_BOAT_BOW_INSET');const strips=[];for(let x=-.65;x<.7;x+=.16)strips.push({size:[.015,.005,.32],position:[x,.125,0]});batch(bow,strips,teak,'PEDAL_BOAT_BOW_DECK_FLUTES');}
   for(const seat of all(/^PADDLE_SEAT$/))frame(seat,teak);
   for(const side of [-1,1])lifeRing(root,[side*.89,.55,.72],.13,[0,Math.PI/2,0]);
   if(rig.paddleWheel){torus(rig.paddleWheel,.25,.022,[-.71,0,0],alloy,'PADDLE_WHEEL_END_HOOP',[0,Math.PI/2,0]);torus(rig.paddleWheel,.25,.022,[.71,0,0],alloy,'PADDLE_WHEEL_END_HOOP',[0,Math.PI/2,0]);}
  }else{
   // Teak insets follow the open foredeck outline and leave the cabin/coaming
   // opening intact. Patrol/angler launches keep their scaled parent hull.
   const deck=named('OPEN_COAMING_DECK'),parent=deck?.parent;
   if(deck&&parent){
    const end=sail?-1.68:-.85,points=[[0,-2.18],[.25,-1.97],[sail?.46:.69,end],[-(sail?.46:.69),end],[-.25,-1.97]],shape=new T.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();const g=new T.ShapeGeometry(shape);g.rotateX(-Math.PI/2);const mesh=new T.Mesh(g,teak);mesh.position.y=.363;kit.add(parent,mesh,'CRAFTED_INSET_TEAK_FOREDECK');
    const seams=[];for(let z=-2.03;z<end-.06;z+=.14){const width=.18+(z+2.03)/(end+2.03)*(sail?.65:1.13);seams.push({size:[width,.004,.009],position:[0,.366,z]});}batch(parent,seams,caulk,'FOREDECK_PLANK_END_SEAMS');
    const trim=alloy;for(const side of [-1,1]){tube(parent,[side*.24,.38,-1.98],[side*(sail?.43:.66),.38,end],.012,trim,'FOREDECK_INLAY_BORDER');ropeCoil(parent,[side*.48,.407,1.69],.10);}
    lifeRing(parent,[.72,.69,1.28],.16,[0,Math.PI/2,0]);
   }
   if(sail&&rig.boom){const seams=[];for(let y=.45;y<2.55;y+=.4){const width=(1-y/3)*1.85;seams.push([[.045,y,0],[.045,y+.009,0],[.045,y,width],[.045,y+.009,width]]);}strips(seams,graphite,'MAINSAIL_REINFORCING_BATTENS',rig.boom);}
   if(id==='harbor-patrol'){
    for(const armor of all(/^ARMOR_GUNWALE$/)){const s=boxSize(armor);if(s){const joints=[];for(let z=-s[2]*.4;z<s[2]*.45;z+=.7)joints.push({size:[s[0]+.004,.42,.018],position:[0,0,z]});batch(armor,joints,alloy,'PATROL_MODULAR_ARMOR_JOINTS');}}
    const shield=named('TURRET_SHIELD');if(shield)frame(shield,alloy,2,.09);
   }
   if(id==='harbor-fishing-boat'){
    const canopy=named('ANGLER_SUN_CANOPY');if(canopy)frame(canopy,alloy);
    const locker=named('ONBOARD_TACKLE_LOCKER');if(locker){const louvres=[];for(let y=-.055;y<.09;y+=.045)louvres.push({size:[.29,.018,.008],position:[0,y,.143]});batch(locker,louvres,alloy,'TACKLE_LOCKER_VENTILATION');}
   }
  }
  // Mechanical highlight edges follow the actual wheel and throttle pivots.
  if(rig.wheel){const radius=shipping?.29:yacht?.32:pontoon?.23:paddle?.12:.17;torus(rig.wheel,radius*.68,.008,[0,0,.012],brass,'HELM_INNER_GRIP_TRIM');}
  if(rig.throttle)box(rig.throttle,[.075,.055,.065],[0,.16,-.05],alloy,'THROTTLE_GRIP_FITTING');
 }
 root.userData.vehicleAirMarineDesign={version:1,id};
 return root;
}
