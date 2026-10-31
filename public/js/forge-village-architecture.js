/** Open, authored stone and timber shells. Every part is an existing editable
 * Builder material; a roof or decorative beam is never an owned item grant. */
const PREFIX='forge-village-';
const palette={stone:'#70675b',footing:'#574e42',plaster:'#bca986',oak:'#594235',oakLight:'#92734d',iron:'#373c3e',copper:'#936b47',copperLight:'#b28b59',floor:'#9d9076',threshold:'#c1a777'};
const point=(x,z,y=.02)=>({x,y,z});
const localPoint=(site,x,z,y=0)=>({x:site.x+x*Math.cos(site.yaw)+z*Math.sin(site.yaw),y,z:site.z-x*Math.sin(site.yaw)+z*Math.cos(site.yaw)});
const sites=[
 {key:'archive',name:'The Alloy Archive',x:76,z:-10,width:24,depth:24,yaw:-Math.PI/2,height:4.5,doorWidth:6,description:'An enterable timber-framed archive of metallurgy, trade records and the craft of heat treatment.'},
 {key:'inn',name:'The Hammer & Hearth Inn',x:-76,z:-10,width:24,depth:26,yaw:Math.PI/2,height:4.5,doorWidth:6,description:'A stone and timber smiths’ inn with a copper gable roof, open windows and a welcoming hearth room.'},
 {key:'museum',name:'The Founders’ Guildhall',x:0,z:-70,width:40,depth:24,yaw:0,height:5.5,doorWidth:8,description:'A grand, enterable guild museum displaying the village’s tools, maker traditions and finished metalwork.'},
 {key:'cottage-west',name:'Copperroof House',x:-72,z:66,width:22,depth:20,yaw:Math.PI,height:4.1,doorWidth:6,description:'An explorable craftsperson’s stone cottage, framed in exposed oak with deep open windows.'},
 {key:'cottage-east',name:'Bellmaker’s House',x:72,z:66,width:22,depth:20,yaw:Math.PI,height:4.1,doorWidth:6,description:'An enterable artisan home with a copper roof, timber joinery and a quiet workroom.'}
];

export const FORGE_VILLAGE_ROOMS=Object.freeze(sites.map(site=>{
 const id=PREFIX+site.key,door=localPoint(site,0,site.depth/2,.02),approach=localPoint(site,0,site.depth/2+4,.02);
 return Object.freeze({id,anchorId:id+'-floor',name:site.name,position:point(site.x,site.z,0),width:site.width,depth:site.depth,yaw:site.yaw,door,approach,interior:point(site.x,site.z),description:site.description});
}));

export function forgeVillageArchitecture(){
 const objects=[];
 const part=(id,name,position,width,height,depth,color,{yaw=0,roll=0,roomId,roof=false}={})=>{
  const finish=[palette.oak,palette.oakLight].includes(color)?'wood':[palette.copper,palette.copperLight,palette.threshold].includes(color)?'copper':color===palette.iron?'metal':color===palette.plaster?'plaster':'stone';
  objects.push({id:PREFIX+id,modelId:'material:cube',asset:{buildAssetId:'material:cube'},name,position,rotation:{x:0,y:yaw,z:roll},scale:{x:width/1.2,y:height/1.2,z:depth/1.2},placementAnchor:'collider-base',materialSettings:{accent:color,useAccent:true},functionalSettings:{behavior:'decor',active:true,destructible:false,damage:0,forgeVillageMaterial:finish,...(/floor|threshold/.test(id)?{forgeVillageSurface:true}:{}),...(roomId?{villageRoomId:roomId}:{}),...(roof?{villageRoof:true,forgeVillageRoof:true}:{})}});
 };
 const box=(id,name,x,y,z,w,h,d,color,options)=>part(id,name,{x,y,z},w,h,d,color,options);
 // Collider-base placement locks the rotated world bounding-box minimum to
 // authored Y. Account for the full vertical run of a sloped beam or roof.
 const centred=(id,name,site,x,y,z,w,h,d,color,roll=0,options={})=>{
  const halfHeight=(Math.abs(Math.sin(roll))*w+Math.abs(Math.cos(roll))*h)/2;
  const position=localPoint(site,x+Math.sin(roll)*h/2,z,y-halfHeight);
  part(id,name,position,w,h,d,color,{yaw:site.yaw,roll,...options});
 };
 const beam=(id,name,site,a,b,thickness,color,options={})=>{
  const dx=b.x-a.x,dy=b.y-a.y,roll=Math.atan2(dy,dx);
  centred(id,name,site,(a.x+b.x)/2,(a.y+b.y)/2,a.z,Math.hypot(dx,dy),thickness,thickness,color,roll,options);
 };

 // The great smithy has a proper flush foundation and a real portal frame.
 // Its broad open front preserves the existing work, crew and courier routes.
 const hall={x:0,z:-4,yaw:0},hallId=PREFIX+'great-forge';
 box('hall-foundation','Great Forge · dressed stone foundation',0,-.5,-4,90,.46,42,palette.footing,{roomId:hallId});
 box('hall-floor','Great Forge · continuous sandstone work floor',0,-.06,-4,88,.06,40,palette.floor,{roomId:hallId});
 for(const x of [-43.7,43.7])box('hall-edge-'+x,'Great Forge · flush perimeter stone course',x,-.04,-4,.6,.04,40,palette.stone,{roomId:hallId});
 for(const z of [-23.7,15.7])box('hall-edge-z'+z,'Great Forge · flush stone threshold course',0,-.04,z,88,.04,.6,palette.stone,{roomId:hallId});
 for(const x of [-25,25]){
  box('hall-rear-stone-'+x,'Great Forge · ashlar north wall',x,0,-24,38,1.2,.8,palette.stone,{roomId:hallId});
  box('hall-rear-brick-'+x,'Great Forge · warm brick north wall',x,1.2,-24,38,4.8,.65,palette.plaster,{roomId:hallId});
  box('hall-rear-tie-'+x,'Great Forge · oak wall plate',x,5.9,-24,38,.45,.85,palette.oak,{roomId:hallId});
 }
 box('hall-north-lintel','Great Forge · north passage stone lintel',0,5.2,-24,13.8,.8,1.1,palette.stone,{roomId:hallId});
 for(const x of [-6.5,6.5])box('hall-north-jamb-'+x,'Great Forge · open north passage jamb',x,0,-24,.7,6,1.1,palette.stone,{roomId:hallId});
 for(const x of [-44,44]){
  box('hall-side-sill-'+x,'Great Forge · low stone side sill',x,0,-4,.6,.7,40,palette.stone,{roomId:hallId});
  box('hall-side-plate-'+x,'Great Forge · continuous side wall plate',x,6.5,-4,.7,.45,40,palette.oak,{roomId:hallId});
 }
 for(const x of [-43,-22,22,43])for(const z of [-23,16]){
  box('hall-post-foot-'+x+'-'+z,'Great Forge · cut-stone portal footing',x,0,z,1.25,.9,1.25,palette.stone,{roomId:hallId});
  box('hall-post-'+x+'-'+z,'Great Forge · tall hewn oak portal post',x,.9,z,.7,6.9,.7,palette.oak,{roomId:hallId});
  box('hall-post-band-'+x+'-'+z,'Great Forge · iron joinery collar',x,3.2,z,.76,.18,.76,palette.iron,{roomId:hallId});
 }
 for(const z of [-23,16])box('hall-long-plate-'+z,'Great Forge · continuous exposed eaves beam',0,7.45,z,88,.55,.75,palette.oak,{roomId:hallId});
 for(const z of [-21,-2,14]){
  box('hall-truss-tie-'+z,'Great Forge · open timber king-post tie',0,7.6,z,86,.45,.55,palette.oak,{roomId:hallId});
  beam('hall-rafter-west-'+z,'Great Forge · west pitched oak rafter',hall,{x:-44,y:8,z:z+4},{x:0,y:13.3,z:z+4},.5,palette.oak,{roomId:hallId});
  beam('hall-rafter-east-'+z,'Great Forge · east pitched oak rafter',hall,{x:0,y:13.3,z:z+4},{x:44,y:8,z:z+4},.5,palette.oak,{roomId:hallId});
  box('hall-king-post-'+z,'Great Forge · exposed king post',0,8,z,.45,4.9,.55,palette.oakLight,{roomId:hallId});
 }
 for(const x of [-42,42])for(const z of [-22,15]){
  const side=x<0?1:-1;
  beam('hall-knee-'+x+'-'+z,'Great Forge · pegged portal knee brace',hall,{x,y:5.7,z:z+4},{x:x+side*4,y:7.6,z:z+4},.38,palette.oakLight,{roomId:hallId});
 }
 const roofPitch=Math.atan2(5,42),roofWidth=Math.hypot(42,5);
 for(const side of [-1,1]){
  centred('hall-roof-'+side,'Great Forge · pitched standing-seam copper roof',hall,side*25,10.65,0,roofWidth,.22,44,palette.copper,-side*roofPitch,{roomId:hallId,roof:true});
  for(const distance of [7,14,21,28,35,42]){
   const x=side*(4+distance),y=13.15-distance*5/42;
   centred('hall-copper-seam-'+side+'-'+distance,'Great Forge · raised copper roof seam',hall,x,y+.18,0,.07,.08,44,palette.copperLight,-side*roofPitch,{roomId:hallId,roof:true});
  }
 }
 // An open clerestory releases smoke and gives the village its landmark crown.
 box('hall-clerestory-cap','Great Forge · elevated copper smoke lantern',0,13.6,-4,13,.22,46,palette.copperLight,{roomId:hallId,roof:true});
 for(const x of [-5,5])for(const z of [-23,-4,16])box('hall-clerestory-upright-'+x+'-'+z,'Great Forge · open clerestory upright',x,12.55,z,.32,1.2,.32,palette.iron,{roomId:hallId});
 for(const x of [-9,9])box('hall-entry-jamb-'+x,'Great Forge · carved front portal post',x,0,16,.8,6.5,.8,palette.oakLight,{roomId:hallId});
 box('hall-entry-lintel','Great Forge · monumental oak entry lintel',0,6.1,16,19.5,.65,.9,palette.oakLight,{roomId:hallId});
 box('hall-chimney-cowl','Great Forge · broad copper extraction cowl',-18,13.5,-18,3.2,.3,3.2,palette.copperLight,{roomId:hallId,roof:true});
 for(const x of [-19,-17])box('hall-cowl-bracket-'+x,'Great Forge · iron chimney cap bracket',x,12.9,-18,.15,.65,.15,palette.iron,{roomId:hallId,roof:true});

 for(const site of sites){
  const id=PREFIX+site.key,room={roomId:id},w=site.width,d=site.depth,h=site.height,door=site.doorWidth;
  const localBox=(suffix,name,x,y,z,width,height,depth,color,options={})=>part(site.key+'-'+suffix,site.name+' · '+name,localPoint(site,x,z,y),width,height,depth,color,{yaw:site.yaw,...room,...options});
  localBox('foundation','dressed stone foundation',0,-.45,0,w+.8,.4,d+.8,palette.footing);
  localBox('floor','flush fitted stone interior floor',0,-.05,0,w,.05,d,palette.floor);
  // The side walls have two genuinely open windows, not painted solid panes.
  const windowWidth=site.key==='museum'?5:3.8,windowZ=d*.23;
  for(const side of [-1,1]){
   const x=side*w/2;
   localBox('side-sill-'+side,'stone window sill wall',x,0,0,.55,1.05,d,palette.stone);
   localBox('side-head-'+side,'plaster wall above open windows',x,2.85,0,.5,h-2.85,d,palette.plaster);
   const intervals=[[-d/2,-windowZ-windowWidth/2],[-windowZ+windowWidth/2,windowZ-windowWidth/2],[windowZ+windowWidth/2,d/2]];
   for(const [index,[a,b]]of intervals.entries())localBox('side-pier-'+side+'-'+index,'limewashed window pier',x,1.05,(a+b)/2,.5,1.8,b-a,palette.plaster);
   for(const z of [-windowZ,windowZ])localBox('window-mullion-'+side+'-'+z,'exposed oak open-window mullion',x,1.05,z,.6,1.8,.13,palette.oakLight);
  }
  localBox('back-wall','limewashed rear wall',0,0,-d/2,w,h,.55,palette.plaster);
  const wing=(w-door)/2;
  for(const side of [-1,1])localBox('front-wall-'+side,'stone-and-plaster entry wing',side*(door/2+wing/2),0,d/2,wing,h,.55,palette.plaster);
  localBox('front-lintel','exposed door lintel',0,h-.9,d/2,door+1,.55,.8,palette.oakLight);
  for(const side of [-1,1])localBox('door-jamb-'+side,'carved oak door jamb',side*(door/2+.25),0,d/2,.5,h-.6,.8,palette.oakLight);
  for(const side of [-1,1])for(const z of [-d/2,d/2])localBox('corner-post-'+side+'-'+z,'exposed corner oak post',side*(w/2-.25),0,z,.6,h,.65,palette.oak);
  for(const z of [-d/2,d/2])localBox('wall-plate-'+z,'long exposed timber wall plate',0,h-.25,z,w+.8,.35,.7,palette.oak);
  for(const side of [-1,1])localBox('side-plate-'+side,'deep oak side eave',side*w/2,h-.25,0,.7,.35,d+.8,palette.oak);
  const half=(w+2)/2,rise=site.key==='museum'?5.2:3.3,pitch=Math.atan2(rise,half),length=Math.hypot(half,rise),ridge=h+rise;
  for(const side of [-1,1])centred(site.key+'-roof-'+side,site.name+' · pitched copper gable',site,side*half/2,h+rise/2,0,length,.2,d+2,palette.copper,-side*pitch,{...room,roof:true});
  localBox('ridge-cap','raised copper ridge cap',0,ridge,0,.6,.22,d+2.4,palette.copperLight,{roof:true});
  for(const z of [-d/2-.35,d/2+.35]){
   beam(site.key+'-gable-left-'+z,site.name+' · open oak gable rafter',site,{x:-half,y:h+.1,z},{x:0,y:ridge+.1,z},.32,palette.oakLight,room);
   beam(site.key+'-gable-right-'+z,site.name+' · open oak gable rafter',site,{x:0,y:ridge+.1,z},{x:half,y:h+.1,z},.32,palette.oakLight,room);
  }
  // High braces frame the room without crossing the player's central aisle.
  for(const side of [-1,1])beam(site.key+'-front-brace-'+side,site.name+' · pegged oak porch brace',site,{x:side*(w/2-.5),y:h-1.5,z:d/2+.4},{x:side*(w/2-3),y:h-.1,z:d/2+.4},.22,palette.oakLight,room);
  const chimneyX=w/2-3.2,chimneyZ=-d/2+3.2;
  localBox('chimney','stone fireplace chimney',chimneyX,h-.2,chimneyZ,1.7,rise+1.4,1.7,palette.stone);
  localBox('chimney-cap','copper chimney crown',chimneyX,h+rise+1.2,chimneyZ,2.2,.2,2.2,palette.copperLight,{roof:true});
  // Flush brass threshold deliberately adds no step or invisible floor lip.
  localBox('threshold','brass entry threshold',0,-.012,d/2+.3,door,.012,1.2,palette.threshold);
 }
 const rooms=FORGE_VILLAGE_ROOMS.map(room=>structuredClone(room));
 for(const room of rooms){
  const anchor=objects.find(object=>object.id===room.anchorId);
  if(anchor){anchor.name=room.name;anchor.objectType='building';anchor.building=true;anchor.deliveryDropoff={position:{...room.approach}};}
 }
 const locations=rooms.map(room=>({id:room.id,name:room.name,x:room.interior.x,y:room.interior.y,z:room.interior.z,width:Math.min(14,room.width-4),depth:Math.min(12,room.depth-4),description:room.description,villageAnchorId:room.anchorId}));
 return {objects,rooms,locations};
}
