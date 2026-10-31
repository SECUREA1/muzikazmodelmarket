const decor=()=>({behavior:'decor',active:true,destructible:false,damage:0,forgeVillageLandscape:true});
const point=(x,z)=>({x,y:0,z});
const placed=(id,modelId,name,x,z,extra={})=>({id:'forge-village-land-'+id,modelId,asset:{buildAssetId:modelId},name,position:point(x,z),rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},placementAnchor:'collider-base',functionalSettings:decor(),...extra});

/** A level village ground plan. Paving is authored at the same walking datum
 * as the forge, so a street, doorway or bridge never requires a running jump.
 * Surface tags allow the renderer to separate coplanar stone inlays visually
 * without moving their physical floor above the player's feet. */
export function forgeVillageLandscape(){
 const objects=[];
 const box=(id,name,x,y,z,width,height,depth,color,extra={})=>{
  const object=placed(id,'material:cube',name,x,z,{position:{x,y,z},scale:{x:width/1.2,y:height/1.2,z:depth/1.2},materialSettings:{accent:color,useAccent:true},...extra});objects.push(object);return object;
 };
 const floor=(id,name,x,z,width,depth,color,layer=1)=>box(id,name,x,-.12,z,width,.12,depth,color,{functionalSettings:{...decor(),forgeVillageSurface:true,forgeVillageSurfaceLayer:layer}});
 const native=(id,modelId,name,x,z,extra={})=>objects.push(placed(id,modelId,name,x,z,extra));
 const streets=[];
 const street=(id,name,x,z,width,depth,axis,from,to)=>{
  floor('road-'+id,name+' · dressed paving',x,z,width,depth,'#847660',2);
  if(axis==='z')for(const side of [-1,1])floor('edge-'+id+'-'+side,name+' · flush brass verge',x+side*(width/2-.22),z,.16,depth,'#c4a574',3);
  else for(const side of [-1,1])floor('edge-'+id+'-'+side,name+' · flush brass verge',x,z+side*(depth/2-.22),width,.16,'#c4a574',3);
  streets.push({id:'forge-village-street-'+id,name,from:point(...from),to:point(...to),width:axis==='z'?width:depth,material:'sandstone',forgeVillage:true});
 };

 // Buried bedrock supports the village without blanketing its visible earth
 // and grass. Streets, courts and every doorway stay at the zero datum.
 const foundation=floor('village-foundation','Emberfall · continuous buried stone village foundation',0,4,208,208,'#514d43',0);foundation.position.y=-.18;foundation.functionalSettings.forgeVillageFoundation=true;
 // The original guildhall and its paid work stations retain their coordinates.
 street('west','Bellows Lane',-56,5.5,8,119,'z',[-56,-54],[-56,65]);
 street('east','Makers’ Lane',56,5.5,8,119,'z',[56,-54],[56,65]);
 street('north','Guildstone Road',0,-54,192,8,'x',[-96,-54],[96,-54]);
 street('south','Coppergate Promenade',0,49,184,8,'x',[-92,49],[92,49]);
 street('arrival','Emberfall High Street',0,68,12,62,'z',[0,37],[0,99]);
 street('guild','Guild museum approach',0,-56,10,4,'z',[0,-54],[0,-58]);
 street('inn','Smiths’ inn approach',-60,-10,8,8,'x',[-56,-10],[-64,-10]);
 street('archive','Metallurgy archive approach',60,-10,8,8,'x',[56,-10],[64,-10]);
 street('west-home','West smiths’ residence approach',-72,52.5,8,7,'z',[-72,49],[-72,56]);
 street('east-home','East smiths’ residence approach',72,52.5,8,7,'z',[72,49],[72,56]);

 // Generous forecourts make room entrances legible while leaving the door axes
 // completely clear for walking, residents and future delivery drop-offs.
 for(const [id,name,x,z,w,d]of [
  ['inn','Smiths’ inn forecourt',-60,-10,12,20],['archive','Archive reading court',60,-10,12,20],
  ['guild','Museum forecourt',0,-51,38,12],['west-home','West residence doorstep',-72,51,18,10],['east-home','East residence doorstep',72,51,18,10]
 ])floor('court-'+id,name,x,z,w,d,'#9b8b70',1);
 floor('civic-square','Emberfall · founders’ civic square',0,75,50,30,'#8b806c',1);
 floor('civic-square-inset','Civic square · warm cut-stone inset',0,75,46,26,'#a39477',2);
 for(const x of [-23,-11.5,11.5,23])floor('civic-joint-x-'+x,'Civic square · flush stone joint',x,75,.09,26,'#594e41',3);
 for(const z of [63,69,81,87])floor('civic-joint-z-'+z,'Civic square · flush stone joint',0,z,46,.09,'#594e41',3);
 // Crossroad medallions are flat stonework, not raised obstacles.
 for(const x of [-56,56])for(const z of [-54,49]){
  floor('crossing-'+x+'-'+z,'Guildstone · crossroad medallion',x,z,7.6,7.6,'#b5a17b',4);
  floor('crossing-x-'+x+'-'+z,'Crossroad · copper east-west inlay',x,z,7.2,.12,'#716047',5);
  floor('crossing-z-'+x+'-'+z,'Crossroad · copper north-south inlay',x,z,.12,7.2,'#716047',5);
 }

 // A shallow, decorative millrace suggests the village's old cooling-water
 // supply. It creates no swimming hazard or paid production and never crosses
 // the main walkable streets except beneath the level Guildstone bridge.
 floor('millrace-bed','Old millrace · dark stone channel',-96,-26,4.4,76,'#303f40',1);
 floor('millrace-water','Old millrace · shallow cooling water',-96,-26,2.6,76,'#4d9694',2).functionalSettings.forgeVillageMaterial='water';
 for(const side of [-1,1]){
  box('millrace-north-curb-'+side,'Millrace · northern stone coping',-96+side*1.85,0,-61.5,.5,.18,5,'#807964');
  box('millrace-south-curb-'+side,'Millrace · southern stone coping',-96+side*1.85,0,-18.5,.5,.18,61,'#807964');
 }
 floor('millrace-bridge','Guildstone bridge · level stone deck',-96,-54,8,8,'#a4987b',5);
 for(const z of [-58.6,-49.4])box('bridge-rail-'+z,'Guildstone bridge · low stone parapet',-96,0,z,8,.65,.45,'#77715f');
 for(const x of [-98.6,-97.3,-96,-94.7,-93.4])box('sluice-grate-'+x,'Millrace · iron settling grille',x,0,9,.065,.05,2,'#3e4d48');

 const treeSites=[[-96,-82],[96,-82],[-96,-32],[96,-32],[-96,26],[96,26],[-96,87],[96,87],[-27,-97],[27,-97],[-44,-91],[44,-91],[-28,96],[28,96],[-44,85],[44,85]];
 for(const [index,[x,z]]of treeSites.entries())native('tree-'+index,index%3?'pine-tree':'canopy-tree','Emberfall · '+(index%3?'mountain pine':'copper-beech shade tree'),x,z,{rotation:{x:0,y:index*.71,z:0},scale:{x:index%3?.95:1.1,y:index%3?1.08:1.1,z:index%3?.95:1.1}});
 for(const [index,[x,z]]of [[-101,-84],[101,-84],[-101,28],[101,28],[-32,101],[32,101]].entries())native('rocks-'+index,'garden-rocks','Emberfall · weathered boundary stones',x,z,{rotation:{x:0,y:index*.63,z:0},scale:{x:1.35,y:1.1,z:1.35}});
 for(const [index,[x,z]]of [[-29,66],[29,66],[-29,84],[29,84],[-62.3,-23],[62.3,-23],[-80,54.5],[80,54.5]].entries())native('flowers-'+index,'flower-bed','Emberfall · dyers’ herbs and village flowers',x,z,{rotation:{x:0,y:index%2?Math.PI/2:0,z:0},scale:{x:1.5,y:1,z:1.2}});
 for(const [index,[x,z]]of [[-50,-47],[50,-47],[-62,-47],[62,-47],[-50,57],[50,57],[-62,43],[62,43],[-9,61],[9,61],[-9,92],[9,92],[-28,75],[28,75]].entries())native('lantern-'+index,'lamp-post','Emberfall · warm street lantern',x,z);

 const locations=[
  {id:'forge-village-square',name:'Founders’ Square',x:0,y:.02,z:75,width:44,depth:26,description:'Explore the village square, trace the stonework and continue to the smiths’ homes and open village gate.'},
  {id:'forge-village-south-gate',name:'Coppergate · Village arrival',x:0,y:.02,z:99,width:14,depth:8,description:'The southern arrival on Emberfall High Street, looking toward the great forge and its village roofs.'},
  {id:'forge-village-guild-road',name:'Guildstone Road · Northern workshops',x:32,y:.02,z:-54,width:15,depth:8,description:'A level northern walk connects the guild museum, archive and smiths’ inn.'},
  {id:'forge-village-millrace',name:'Guildstone bridge & old cooling millrace',x:-91,y:.02,z:-54,width:8,depth:8,description:'Cross the level stone bridge and inspect the village’s shallow old cooling-water channel.'}
 ];
 const walkingRoutes=[
  {id:'forge-village-grand-loop',name:'Emberfall village circuit',points:[[0,37],[0,49],[-56,49],[-56,-54],[0,-54],[56,-54],[56,49],[0,49],[0,75],[0,99]].map(([x,z])=>point(x,z))},
  {id:'forge-village-inn-walk',name:'Smiths’ inn doorway',points:[[-56,-54],[-56,-10],[-64,-10],[-70,-10]].map(([x,z])=>point(x,z))},
  {id:'forge-village-archive-walk',name:'Metallurgy archive doorway',points:[[56,-54],[56,-10],[64,-10],[70,-10]].map(([x,z])=>point(x,z))},
  {id:'forge-village-museum-walk',name:'Guild museum doorway',points:[[0,-54],[0,-58],[0,-64]].map(([x,z])=>point(x,z))},
  {id:'forge-village-home-walk',name:'Smiths’ homes',points:[[-56,49],[-72,49],[-72,56],[-72,62]].map(([x,z])=>point(x,z))},
  {id:'forge-village-east-home-walk',name:'East smiths’ home',points:[[56,49],[72,49],[72,56],[72,62]].map(([x,z])=>point(x,z))},
  {id:'forge-village-bridge-walk',name:'Old cooling-water bridge',points:[[-56,-54],[-96,-54],[-100,-54]].map(([x,z])=>point(x,z))}
 ];
 return {objects,locations,streets,walkingRoutes,waterworks:{id:'forge-village-old-millrace',position:point(-96,-26),width:4.4,length:76,shallow:true,production:false,bridge:point(-96,-54)}};
}

export const forgeVillageLandscapeObjects=()=>forgeVillageLandscape().objects;
