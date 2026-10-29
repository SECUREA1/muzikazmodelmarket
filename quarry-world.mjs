import {QUARRY_MATERIALS,QUARRY_ID} from './public/js/quarry-config.js';
// Map a native twelve-metre conveyor's deck endpoints into world space. Deck
// height is 1.5m and root anchoring is explicit; collider-base would flatten
// tilted links and disconnect the physical intake/discharge joints.
export function quarryConveyorPlacement(from,to){
 const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,length=Math.hypot(dx,dy,dz),horizontal=Math.hypot(dx,dz);
 if(length<.01||horizontal<.01)throw Error('Quarry conveyors need distinct, nonvertical endpoints.');
 const yaw=Math.atan2(dx,dz),slope=Math.atan2(dy,horizontal),sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(slope),cp=Math.cos(slope),m13=sy*cp;
 const rotation=Math.abs(m13)<.9999999?{x:Math.atan2(-sp,cy*cp),y:Math.asin(m13),z:Math.atan2(sy*sp,cy)}:{x:Math.atan2(-cy*sp,cp),y:Math.asin(m13),z:0};
 const up={x:-sy*sp,y:cp,z:-cy*sp};
 for(const axis of ['x','y','z'])rotation[axis]||=0;
 return {position:{x:(from.x+to.x)/2-up.x*1.5,y:(from.y+to.y)/2-up.y*1.5,z:(from.z+to.z)/2-up.z*1.5},rotation,scale:{x:1,y:1,z:length/12},placementAnchor:'origin'};
}
export function quarryWorld(){
 const construction={enabled:true,steelEnabled:false,yard:{minX:-145,maxX:165,minZ:-120,maxZ:125},excavation:{x:0,z:-35,width:96,depth:128,maxDepth:12,cutDepth:6,accessRamp:{width:18,slope:.06},material:'gravel',height:4,radius:19,bankOffsetX:25,bankOffsetZ:0},stockpile:{x:-80,z:65,width:30,depth:24},earthworks:{cellSize:2,patches:[
 {id:'topsoil-strip',kind:'excavation',x:-95,z:-25,width:44,depth:54,maxDepth:2,material:'soil'},
 {id:'screen-feed',kind:'stockpile',x:68,z:-34,width:18,depth:18,maxDepth:0},
 {id:'crusher-feed',kind:'stockpile',x:117,z:-34,width:18,depth:18,maxDepth:0},
 ...['sand','fines','stone','crushed','topsoil','mulch'].map((material,index)=>({id:'product-'+material,kind:'stockpile',material,x:62+(index%3)*34,z:35+Math.floor(index/3)*38,width:22,depth:22,maxDepth:0}))]},crew:{autoStart:true,quarryRoutes:true,muster:{x:-32,y:0,z:47},jobBoard:{x:-32,y:0,z:43},staging:{x:-28,y:0,z:54},loading:{x:30,y:-6,z:-15,rotationY:0},dump:{x:68,y:0,z:-34},grade:{x:-80,y:0,z:65},walkWaypoints:[{x:-25,z:20},{x:0,z:20},{x:0,z:10},{x:0,z:-15},{x:20,z:-15}],approachWaypoints:[{x:0,z:40},{x:0,z:-78},{x:25,z:-78},{x:30,z:-35},{x:30,z:-15}],haulWaypoints:[{x:0,z:40},{x:55,z:40},{x:68,z:0}],dumpApproachWaypoints:[{x:68,z:0},{x:68,z:-34}]}};
 const quarry={enabled:true,stations:{screener:{actorId:'quarry-screen',x:85,z:-34,feedPatch:'screen-feed',rate:1.2},crusher:{actorId:'quarry-crusher',x:134,z:-34,feedPatch:'crusher-feed',rate:.9},stacker:{actorId:'quarry-stacker',x:104,y:4.2,z:-7,rate:2}},operatorHome:{x:84,y:0,z:-25},outputPatches:Object.fromEntries(['sand','fines','stone','crushed','topsoil','mulch'].map(key=>[key,'product-'+key]))};
 const stackerY=4.2,deck=1.5,tilt=.22,stackerEnd=z=>({x:104,y:stackerY+1.6+Math.cos(tilt)*deck+Math.sin(tilt)*z,z:-7-Math.sin(tilt)*deck+Math.cos(tilt)*z}),inlet=stackerEnd(-8),outlet=stackerEnd(8);
 quarry.links=[
  {id:'screen-feed',actorId:'quarry-screen-intake',name:'Raw mineral / topsoil intake',kind:'screen-feed',from:{x:77,y:1.5,z:-34},to:{x:85,y:2.4,z:-36}},
  {id:'screen-stone-takeoff',actorId:'quarry-stone-takeoff',name:'Screened stone take-off',kind:'screen-stone',material:'stone',from:{x:87.6,y:3,z:-33},to:{x:92,y:3,z:-48}},
  {id:'screen-stone-transfer',actorId:'quarry-transfer',name:'Screened stone transfer bridge',kind:'screen-stone',material:'stone',from:{x:92,y:3,z:-48},to:{x:134,y:3,z:-48}},
  {id:'screen-stone-return',actorId:'quarry-stone-return',name:'Crusher stone feed chute',kind:'screen-stone',material:'stone',from:{x:134,y:3,z:-48},to:{x:134,y:2.4,z:-36}},
  {id:'crusher-feed',actorId:'quarry-crusher-intake',name:'Sorted stone receiving-bay intake',kind:'crusher-feed',material:'stone',from:{x:126,y:1.5,z:-34},to:{x:134,y:2.4,z:-36}},
  {id:'screen-output',actorId:'quarry-screen-output',name:'Screen product elevator to distribution gantry',kind:'screen-output',from:{x:85,y:1.5,z:-27.5},to:{...inlet}},
  {id:'crusher-output',actorId:'quarry-crusher-output',name:'Crushed aggregate elevator to distribution gantry',kind:'crusher-output',from:{x:134,y:1.5,z:-27.5},to:{...inlet}},
  ...Object.keys(QUARRY_MATERIALS).map((material,index)=>({id:'output-'+material,actorId:'quarry-output-'+material,name:QUARRY_MATERIALS[material].name+' stockpile conveyor',kind:'product-output',material,from:{...outlet},to:{x:62+(index%3)*34,y:outlet.y,z:35+Math.floor(index/3)*38}}))
 ];
 const objects=[],locations=[];
 const add=(id,modelId,name,x,z,extra={})=>{const item={id,modelId,name,position:{x,y:0,z},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},placementAnchor:'collider-base',functionalSettings:{behavior:'decor',destructible:false},...extra};objects.push(item);return item;};
 const box=(id,x,z,w,h,d,color,y=0)=>add(id,'material:cube',id,x,z,{position:{x,y,z},scale:{x:w/1.2,y:h/1.2,z:d/1.2},materialSettings:{useAccent:true,accent:color}});
 const road=(id,x,z,w,d)=>add(id,'material:baseplate',id,x,z,{position:{x,y:-.07,z},scale:{x:w/4.8,y:.35,z:d/4.8},materialSettings:{useAccent:true,accent:'#8c8b7b'}});
 const sign=(id,name,x,z,text)=>add(id,'street-sign',name,x,z,{functionalSettings:{behavior:'talk',prompt:'Read '+name,interactionDistance:5,destructible:false},dialogueSettings:{text}});
 const machine=(id,modelId,name,x,y,z)=>add(id,modelId,name,x,z,{position:{x,y,z},functionalSettings:{behavior:'vehicle',interactionDistance:5,interactionKey:'f',prompt:'Operate '+name,destructible:false,health:1000}});
 machine('quarry-excavator','site-excavator','Pit EX-300 · Gravel Bank',25,-6,-15);
 machine('quarry-truck','site-dumptruck','HT-40 · Pit Haul Truck',30,-6,-15);
 machine('quarry-dozer','site-bulldozer','D9 · Topsoil & Stockpiles',-70,0,35);
 machine('quarry-excavator-soil','site-excavator','EX-300 · Topsoil Stripping',-95,0,-5);
 machine('quarry-truck-soil','site-dumptruck','HT-40 · Soil Haul Truck',-90,0,-5);
 for(const [key,model]of [['screener','quarry-screening-plant'],['crusher','quarry-jaw-crusher'],['stacker','quarry-stacker']]){const s=quarry.stations[key];add(s.actorId,model,key==='screener'?'Twin-deck screening plant':key==='crusher'?'Jaw crusher':'Radial stockpile stacker',s.x,s.z,{...(key==='stacker'?{position:{x:s.x,y:s.y,z:s.z},placementAnchor:'origin'}:{}),functionalSettings:{behavior:'interact',interactionKey:'e',interactionDistance:9,prompt:'Operate '+key,destructible:false}});locations.push({id:'quarry-'+key,name:key,x:s.x,z:s.z,width:12,depth:14,description:'Live processing machinery; use Quarry operations to control it.'});}
 for(const link of quarry.links)add(link.actorId,'quarry-conveyor',link.name,0,0,{...quarryConveyorPlacement(link.from,link.to),functionalSettings:{behavior:'interact',interactionKey:'e',interactionDistance:4,prompt:'Inspect '+link.name,destructible:false}});
 // The raised distribution plant has real support steel outside haul lanes.
 box('quarry-gantry-platform',104,-7,8,.3,11,'#506671',stackerY-.3);
 for(const x of [100.5,107.5])for(const z of [-11.5,-2.5])box('quarry-gantry-leg-'+x+'-'+z,x,z,.35,stackerY-.3,.35,'#405866');
 for(const x of [99.8,108.2])box('quarry-gantry-guard-'+x,x,-7,.12,1.1,11,'#e8b23b',stackerY+.2);
 sign('quarry-gantry-controls','STACKER · Ground-level control station',98,-11,'The gantry distributes the real processing buffers to six segregated stockpiles. Elevated conveyors leave the haul road open below. Use Quarry operations to park or start the stacker.');
 for(const [index,material]of Object.keys(QUARRY_MATERIALS).entries()){
  const x=62+(index%3)*34,z=35+Math.floor(index/3)*38;
  sign('quarry-bay-'+material,QUARRY_MATERIALS[material].name+' · m³',x-9,z+13,'This bay stores '+QUARRY_MATERIALS[material].name.toLowerCase()+'. Loose material can be scooped, pushed, graded or booked into finite warehouse inventory. Market stock counts booked material only.');
  // Corner bollards stay outside live terrain and do not create a false floor.
  for(const side of [-1,1])box('quarry-bay-marker-'+material+'-'+side,x+side*11.8,z+11.8,.2,1.1,.2,'#'+QUARRY_MATERIALS[material].color.toString(16).padStart(6,'0'));
 }
 sign('quarry-warehouse-board','QUARRY WAREHOUSE · Trading & Dispatch',-61,95,'Book processed stock after it reaches its physical stockpile. Only booked whole cubic metres are offered for deed freight. Trading Market lists the live source, availability and material uses; orders reserve stock and travel through the existing delivery system.');
 // Roads stop outside every live terrain patch; the pit ramp is actual soil.
 for(const [id,x,z,w,d]of [['south-haul',0,108,290,12],['east-haul',155,-2,12,210],['west-haul',-136,-2,12,210],['north-haul',0,-111,280,12],['pit-entry',0,38,18,18],['plant-crossroad',100,8,110,12],['pit-to-plant',30,35,60,12],['west-link',-96,21,80,12],['soil-haul',-58,-30,12,90]])road('quarry-'+id,x,z,w,d);
 for(const patch of [{id:'pit',x:0,z:-35,width:96,depth:128},...construction.earthworks.patches]){
  const w=patch.width/2,d=patch.depth/2;for(const side of [-1,1]){box('quarry-survey-x-'+patch.id+'-'+side,patch.x+side*(w+.4),patch.z,.08,.006,patch.depth+.4,'#e7c66b',.003);box('quarry-survey-z-'+patch.id+'-'+side,patch.x,patch.z+side*(d+.4),patch.width+.4,.006,.08,'#e7c66b',.003);}
  locations.push({id:patch.id,name:patch.id.replaceAll('-',' '),x:patch.x,z:patch.z,width:patch.width,depth:patch.depth,description:patch.id==='pit'?'Six-metre open pit, gravel bank and real sloping access ramp.':'Finite material work area shared by all operators.'});
 }
 for(const x of [-145,165])for(let z=-116;z<=120;z+=12)add('quarry-fence-'+x+'-'+z,'material:crowd-barrier','Boundary fence',x,z,{rotation:{x:0,y:Math.PI/2,z:0},scale:{x:5,y:1.5,z:1}});
 for(const z of [-120,125])for(let x=-140;x<=160;x+=12){if(z===125&&Math.abs(x)<18)continue;add('quarry-fence-'+x+'-'+z,'material:crowd-barrier','Boundary fence',x,z,{scale:{x:5,y:1.5,z:1}});}
 add('quarry-office','construction-site-office','Weighbridge & dispatch office',-70,95);
 add('quarry-maintenance','construction-service-canopy','Plant maintenance',-108,80);
 sign('quarry-welcome','SURFACE MINE · Mine → Screen → Crush → Ship',-25,37,'Drive down the ramp into the gravel pit. Scoop the bank, load a truck, haul to a marked feed bay and tip. The screen separates sand, fines, stone and topsoil; organic rejects become mulch. Feed screened stone through the crusher. Stack products, book them into the quarry warehouse and order real freight to your own deed.');
 sign('quarry-plant-board','QUARRY OPERATIONS · Processing & Deed Freight',80,-20,'Open Quarry operations. Start or stop each plant, route screened stone to the crusher, use the stacker, book actual stock, select your deed and order shipping. The named AI operator can run the plant while you handle digging and hauling.');
 sign('quarry-ramp-guide','PIT RAMP · Keep the centre lane clear',-12,18,'The pit is six metres deep. Follow the gently sloping centre ramp; do not drive over the banks. Raise and curl the bucket, lower the truck body and use Drive for travel.');
 sign('quarry-topsoil-guide','TOPSOIL · Strip, pile & screen',-118,8,'Strip topsoil in shallow lifts and keep it separate from the gravel bank. Tip it into the screening feed bay. Screened topsoil is seed-ready; organic oversize becomes mulch for your deed garden.');
 return {id:'surface-mine-quarry',name:'Surface Mine · Quarry & Materials',label:'Dig, screen, crush and supply your deed',description:'A working surface mine with a six-metre pit, graded access ramp, gravel bank, topsoil stripping, two excavators, two haul trucks, a dozer, twin-deck screening plant, jaw crusher, a connected conveyor network, elevated distribution gantry and six labelled live product stockpiles. Process finite sand, fines, stone, crushed aggregate, seed-ready topsoil and mulch; stock, order and ship materials to owned deeds using shared freight and delivery inventories.',category:'Construction & machinery',game:'construction',quarry,construction,worldId:'skyline-deck',permanent:true,publicDestination:true,proceduralLand:true,source:'repository',visibility:'public',playable:true,multiplayer:true,canDelete:false,canEdit:false,ownerId:'muzikaz',ownerName:'MUZIKAZ',contentUpdatedAt:'2026-10-29T20:00:00.000Z',scale:1,spaceScale:1,playableSize:512,thumbnailUrl:'/public/images/construction/surface-mine-quarry.svg',spawn:{x:-25,y:.02,z:40,rotationY:0},portalTargets:['skyscraper-construction','hormuz-shipping','public-commons'],streets:[],builderScene:{version:3,layout:'grand-floor',mapSize:512,objects,layoutMeta:{color:0x8b806a,construction,quarry,locations},gameplay:{multiplayer:true,construction:{enabled:true}}},playUrl:'model-explorer.html?environment=surface-mine-quarry&autoplay=1&mode=multiplayer'};
}
