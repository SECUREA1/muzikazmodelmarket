import {finishVehicleDesign} from './vehicle-design-system.js';
import * as THREE from '../vendor/three/three.module.min.js';
import {SHIPPING_VESSELS} from './shipping-vessel-specs.js';
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.58,metalness:.18,...extra});
const palette={hull:mat(0x153d54),red:mat(0x9d4f44),deck:mat(0x697f82),white:mat(0xe5e7dc),dark:mat(0x18282f),steel:mat(0xb1bdc2,{metalness:.7,roughness:.3}),yellow:mat(0xe1af4e),glass:mat(0x87c6cf,{transparent:true,opacity:.19,depthWrite:false,side:THREE.DoubleSide}),screen:mat(0x438c8c,{emissive:0x145b63,emissiveIntensity:.8})};
function mesh(parent,name,geometry,material,position=[0,0,0],cosmetic=false){const object=new THREE.Mesh(geometry,material);object.name=name;object.position.set(...position);object.castShadow=object.receiveShadow=true;if(cosmetic)object.userData={collisionDisabled:true,collider:false};parent.add(object);return object;}
const box=(parent,name,size,position,material,cosmetic=false)=>mesh(parent,name,new THREE.BoxGeometry(...size),material,position,cosmetic);
function tube(parent,name,a,b,r,material=palette.steel){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start),object=mesh(parent,name,new THREE.CylinderGeometry(r,r,delta.length(),6),material,start.add(end).multiplyScalar(.5).toArray(),true);object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return object;}
function freighterHull(beam,length,deck){
 const rings=[[-.5,.015],[-.44,.48],[-.32,.85],[-.16,1],[.27,1],[.46,.91],[.5,.8]],profile=[[-1,deck],[-1,.1],[-.72,-1.25],[0,-1.5],[.72,-1.25],[1,.1],[1,deck]],vertices=[],indices=[];
 for(const[z,w]of rings)for(const[x,y]of profile)vertices.push(x*beam/2*w,y,z*length);
 const n=profile.length;for(let ring=0;ring<rings.length-1;ring++)for(let p=0;p<n-1;p++){const a=ring*n+p,b=a+n;indices.push(a,a+1,b,a+1,b+1,b);}for(const offset of [0,(rings.length-1)*n])for(let p=1;p<n-1;p++)indices.push(offset,...(offset?[offset+p,offset+p+1]:[offset+p+1,offset+p]));
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function createShippingContainer({color=0xa95747,name='CORRUGATED_CARGO_CONTAINER'}={}){
 const root=new THREE.Group();root.name=name;const paint=mat(color),ribGeometry=new THREE.BoxGeometry(.035,2.35,.045);
 box(root,'CONTAINER_STEEL_BODY',[2.4,2.6,6],[0,1.3,0],paint);
 for(const side of [-1,1]){const ribs=new THREE.InstancedMesh(ribGeometry,palette.steel,24);ribs.name='CONTAINER_CORRUGATION';for(let i=0;i<24;i++)ribs.setMatrixAt(i,new THREE.Matrix4().makeTranslation(side*1.21,1.3,-2.8+i*5.6/23));ribs.userData={collisionDisabled:true,collider:false};root.add(ribs);}
 for(const x of [-.57,.57]){box(root,'CONTAINER_DOOR',[1.08,2.4,.035],[x,1.3,3.025],paint,true);tube(root,'CONTAINER_LOCKING_BAR',[x, .2,3.055],[x,2.4,3.055],.025);}
 for(const side of [-1,1])for(const z of [-2.9,2.9])box(root,'CONTAINER_CASTING',[.15,.15,.15],[side*1.12,2.53,z],palette.yellow,true);
 root.userData={builderObject:true,modelId:'shipping-container-box',dimensions:[2.4,2.6,6]};return root;
}
export function createShippingVessel(id){
 const spec=SHIPPING_VESSELS[id];if(!spec)return null;
 const root=new THREE.Group(),tanker=id==='shipping-tanker',small=id==='shipping-feeder',deck=small?1.35:2.15,half=spec.beam/2,len=spec.length,bridgeZ=spec.seat[2];root.name=id.toUpperCase().replaceAll('-','_');
 mesh(root,'SHIPPING_SHAPED_DISPLACEMENT_HULL',freighterHull(spec.beam,len,deck),tanker?palette.red:palette.hull);
 box(root,'CARGO_WORKING_DECK',[spec.beam*.82,.16,len*.81],[0,deck,0],palette.deck);
 const weatherDeck=new THREE.Shape(),deckRings=[[-.5,.015],[-.44,.48],[-.32,.85],[-.16,1],[.27,1],[.46,.91],[.5,.8]],outline=[...deckRings.map(([z,w])=>[-half*w,-z*len]),...deckRings.toReversed().map(([z,w])=>[half*w,-z*len])];
 outline.forEach(([x,z],index)=>index?weatherDeck.lineTo(x,z):weatherDeck.moveTo(x,z));weatherDeck.closePath();const deckGeometry=new THREE.ShapeGeometry(weatherDeck);deckGeometry.rotateX(-Math.PI/2);mesh(root,'SHAPED_WEATHER_DECK',deckGeometry,palette.deck,[0,deck+.085,0]);
 const fittings=new THREE.Group();fittings.name='SHIPPING_MARINE_FITTINGS';root.add(fittings);
 for(const side of [-1,1]){
  tube(fittings,'FREIGHTER_DECK_RAIL',[side*half*.86,deck+.9,-len*.31],[side*half*.86,deck+.9,len*.44],.032);
  for(let z=-len*.3;z<len*.46;z+=3){tube(fittings,'RAIL_STANCHION',[side*half*.86,deck,z],[side*half*.86,deck+.9,z],.027);}
  for(const z of [-len*.3,len*.4]){box(fittings,'MOORING_BITT_BASE',[.7,.16,.7],[side*half*.72,deck+.16,z],palette.dark,true);tube(fittings,'MOORING_BITT',[side*half*.72-.3,deck+.4,z],[side*half*.72+.3,deck+.4,z],.08);}
  const nav=mat(side<0?0xe44b4b:0x46ca83,{emissive:side<0?0xaf2828:0x17864e,emissiveIntensity:.85});box(fittings,side<0?'NAV_LIGHT_PORT':'NAV_LIGHT_STARBOARD',[.22,.2,.35],[side*half*.91,spec.seat[1]-.2,bridgeZ-1.8],nav,true);
  for(const z of [-len*.2,0,len*.24])mesh(fittings,'HANGING_DOCK_FENDER',new THREE.CapsuleGeometry(.22,.9,4,8),palette.dark,[side*half*.99,deck-.4,z],true);
 }
 box(fittings,'BOW_ANCHOR_WINDLASS',[small?.8:1.4,.45,.7],[0,deck+.31,-len*.39],palette.steel,true);for(const side of [-1,1])tube(fittings,'ANCHOR_CHAIN',[side*.25,deck+.25,-len*.39],[side*.2,deck+.12,-len*.46],.035,palette.dark);
 // The bridge has a genuine open eye line above the working cargo deck.
 const bridgeFloor=spec.seat[1]-1.55,bridgeWidth=spec.beam*.8;
 box(root,'SHIP_ACCOMMODATION_BLOCK',[bridgeWidth,bridgeFloor-deck,small?4.8:7],[0,deck+(bridgeFloor-deck)/2,bridgeZ+.2],palette.white);
 box(root,'OPEN_BRIDGE_FLOOR',[bridgeWidth+.5,.14,small?4.8:6],[0,bridgeFloor,bridgeZ],palette.deck);
 box(fittings,'BRIDGE_REAR_WALL',[bridgeWidth,2.2,.12],[0,bridgeFloor+1.1,bridgeZ+2.15],palette.white,true);
 for(const side of [-1,1]){box(fittings,'BRIDGE_CORNER_POST',[.15,2.5,.15],[side*bridgeWidth/2,bridgeFloor+1.25,bridgeZ-2.1],palette.white,true);box(fittings,'BRIDGE_SIDE_WINDOW',[.03,1.4,3.8],[side*bridgeWidth/2,bridgeFloor+1.6,bridgeZ-.1],palette.glass,true);}
 box(fittings,'BRIDGE_PANORAMIC_WINDOW',[bridgeWidth,1.4,.035],[0,bridgeFloor+1.6,bridgeZ-2.1],palette.glass,true);
 box(fittings,'BRIDGE_SUN_ROOF',[bridgeWidth+.8,.17,small?5.4:6.8],[0,bridgeFloor+2.75,bridgeZ],palette.white,true);
 box(fittings,'BRIDGE_CONTROL_CONSOLE',[bridgeWidth*.72,.7,.65],[0,bridgeFloor+.45,bridgeZ-1.05],palette.dark,true);
 for(const x of [-bridgeWidth*.22,bridgeWidth*.22]){box(fittings,'LIVE_CARGO_CHART_DISPLAY',[bridgeWidth*.27,.43,.025],[x,bridgeFloor+.95,bridgeZ-.72],palette.screen,true);for(let i=0;i<3;i++)box(fittings,'CHART_TRAFFIC_LINE',[bridgeWidth*.17-i*.09,.012,.01],[x,bridgeFloor+.83+i*.09,bridgeZ-.7],palette.yellow,true);}
 box(fittings,'CARGO_GAUGE_FRAME',[.16,.5,.03],[bridgeWidth*.41,bridgeFloor+.92,bridgeZ-.69],palette.dark,true);const cargoIndicator=box(fittings,'LIVE_CARGO_LOAD_GAUGE',[.09,.4,.035],[bridgeWidth*.41,bridgeFloor+.92,bridgeZ-.67],palette.yellow,true);
 const wheel=new THREE.Group();wheel.name='SHIPPING_HELM_WHEEL';wheel.position.set(0,bridgeFloor+.83,bridgeZ-.55);mesh(wheel,'HELM_WHEEL_RING',new THREE.TorusGeometry(.29,.027,6,24),palette.steel,[0,0,0],true);for(let i=0;i<5;i++)tube(wheel,'WHEEL_SPOKE',[0,0,0],[Math.sin(i*Math.PI*.4)*.27,Math.cos(i*Math.PI*.4)*.27,0],.015);fittings.add(wheel);
 const throttle=new THREE.Group();throttle.name='SHIPPING_ENGINE_TELEGRAPH';throttle.position.set(.7,bridgeFloor+.75,bridgeZ-.5);tube(throttle,'ENGINE_TELEGRAPH_LEVER',[0,0,0],[0,.27,-.06],.025);box(throttle,'TELEGRAPH_HANDLE',[.18,.06,.1],[0,.28,-.06],palette.red,true);fittings.add(throttle);
 const mastX=-bridgeWidth*.32,mastBase=bridgeFloor+2.9; tube(fittings,'BRIDGE_SIGNAL_MAST',[mastX,mastBase,bridgeZ+.5],[mastX,spec.height,bridgeZ+.5],.06);const radar=new THREE.Group();radar.name='ROTATING_SHIPPING_RADAR';radar.position.set(mastX,spec.height-.1,bridgeZ+.5);box(radar,'RADAR_SCANNER',[1.9,.13,.22],[0,0,0],palette.white,true);fittings.add(radar);
 const flag=new THREE.Group();flag.name='SHIPPING_COMPANY_ENSIGN';flag.position.set(mastX,spec.height-.5,bridgeZ+.5);mesh(flag,'ENSIGN_FLAG',new THREE.PlaneGeometry(.8,.43),mat(0x48b6ab,{side:THREE.DoubleSide}),[.4,0,0],true);fittings.add(flag);
 box(fittings,'EXHAUST_FUNNEL',[small?.65:1.2,small?1.6:2.4,1.1],[half*.45,bridgeFloor+2.9,bridgeZ+1.5],palette.hull,true);box(fittings,'FUNNEL_CAP',[small?.7:1.3,.2,1.2],[half*.45,bridgeFloor+(small?3.7:4.1),bridgeZ+1.5],palette.dark,true);
 const cargoSlots=[];
 if(tanker){
  for(let z=-len*.29;z<len*.19;z+=4.8){const tank=mesh(fittings,'TANKER_CARGO_TANK',new THREE.CylinderGeometry(half*.67,half*.67,4.2,16),palette.white,[0,deck+half*.67,z],true);tank.rotation.x=Math.PI/2;mesh(fittings,'TANK_ACCESS_DOME',new THREE.SphereGeometry(.5,10,6),palette.yellow,[0,deck+half*1.34,z],true);}
  for(const x of [-.6,.6])tube(fittings,'TANKER_TRANSFER_PIPE',[x,deck+.45,-len*.33],[x,deck+.45,len*.2],.15,palette.red);
  box(fittings,'TANKER_LOADING_MANIFOLD',[3.8,.4,.7],[0,deck+.65,0],palette.steel,true);
 }else{
  const rows=small?2:4;for(let row=0;row<rows;row++)for(const side of [-1,1]){const container=createShippingContainer({color:[0xa95747,0x438a9b,0xc7a052,0x538d75][row%4]});container.scale.set(small?.78:1,small?.78:1,small?.74:1);container.position.set(side*(small?1.03:1.32),deck+.1,-len*.25+row*(small?4.6:6.2));container.visible=false;container.userData.shippingSide=side<0?'port':'starboard';container.traverse(node=>{node.userData.collider=false;node.userData.collisionDisabled=true;});fittings.add(container);cargoSlots.push(container);}
  const craneZ=small?-1:2;for(const side of [-1,1])tube(fittings,'SHIP_CARGO_DERRICK',[side*half*.83,deck,craneZ],[side*half*.83,deck+(small?3.3:5.4),craneZ],.11,palette.yellow);
  tube(fittings,'CARGO_DERRICK_CROSSBEAM',[-half*.83,deck+(small?3.3:5.4),craneZ],[half*.83,deck+(small?3.3:5.4),craneZ],.12,palette.yellow);
 }
 const propeller=new THREE.Group();propeller.position.set(0,-.8,len*.5);for(let i=0;i<4;i++){const blade=box(propeller,'FREIGHTER_PROPELLER_BLADE',[.2,1,.15],[0,.3,0],palette.steel,true);blade.rotation.z=i*Math.PI/2;}root.add(propeller);
 const rudder=new THREE.Group();rudder.position.set(0,-.6,len*.49);box(rudder,'SHIP_RUDDER_BLADE',[.16,1.4,.9],[0,-.3,0],palette.red,true);root.add(rudder);
 const wake=new THREE.Group(),foam=[];wake.name='BOAT_WAKE_FOAM';for(let i=0;i<8;i++){const ripple=mesh(wake,'FREIGHTER_WAKE_RIPPLE',new THREE.RingGeometry(.6,.7,16,1,0,Math.PI),new THREE.MeshBasicMaterial({color:0xc9e8e9,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}),[0,-.165,len/2],true);ripple.rotation.x=Math.PI/2;foam.push(ripple);}root.add(wake);
 fittings.traverse(node=>{node.userData.collider=false;node.userData.collisionDisabled=true;});
 root.userData={builderObject:true,modelId:id,watercraft:true,boatModel:true,shippingVessel:true,dimensions:[spec.beam,spec.height,spec.length],helmPose:{position:[...spec.seat],lookForward:[0,0,-1],near:.025,fov:78},vehicle:{mode:'boat',seat:[...spec.seat],speed:spec.speed,turnSpeed:spec.turnRate},boatRig:{wheel,throttle,radar,flag,propeller,rudder,wake,foam,needles:[],cargoSlots,cargoIndicator},wakeDesign:{stern:len*.5,length:len*.38,width:half*.65}};
 return finishVehicleDesign(THREE,root,id);
}
export function createShippingPortCrane(){
 const root=new THREE.Group();root.name='SHIP_TO_SHORE_GANTRY_CRANE';
 for(const side of [-1,1])for(const z of [-5,5]){box(root,'GANTRY_STEEL_LEG',[.8,17,.8],[side*5,8.5,z],palette.yellow);box(root,'GANTRY_RAIL_BOGIE',[1.8,1,2.8],[side*5,.5,z],palette.dark);tube(root,'GANTRY_BRACING',[side*5,2,z],[side*5,16,-z],.18,palette.yellow);}
 box(root,'GANTRY_CROSSBEAM',[11.8,1,1.1],[0,17,-5],palette.yellow);box(root,'GANTRY_BOOM',[1.3,1.2,38],[0,19,-9],palette.yellow,true);
 for(const side of [-1,1]){tube(root,'GANTRY_BOOM_STAY',[side*5,17,5],[0,25,0],.12);tube(root,'GANTRY_BOOM_STAY',[0,25,0],[0,19,-27],.1);}
 box(root,'CRANE_OPERATOR_CAB',[2.2,2.1,2.6],[2.3,16,-8],palette.screen,true);box(root,'GANTRY_TROLLEY',[2.2,.8,2.4],[0,18,-20],palette.dark,true);
 for(const side of [-1,1])tube(root,'CRANE_LIFT_CABLE',[side*.8,17.6,-20],[side*.8,7,-20],.025,palette.dark);
 box(root,'CONTAINER_SPREADER',[2.8,.45,6.2],[0,7,-20],palette.yellow,true);
 root.userData={builderObject:true,modelId:'shipping-port-crane',dimensions:[14,26,40]};return root;
}
