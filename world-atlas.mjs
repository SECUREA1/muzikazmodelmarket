import {isBunkerEnvironment} from './public/js/bunker-config.js';
import {NEON_MARINA_VERSION} from './neon-marina.mjs';
import {COMMONS_NEIGHBORHOOD_VERSION} from './commons-neighborhood.mjs';
import {generatedExperience,GENERATED_EXPERIENCE_VERSION} from './generated-world-experiences.mjs';
import {WORLD_DISTRICTS,DISTRICT_PAGE_SIZE,districtMapId,districtFor} from './world-districts.mjs';
import {isHockeyMap} from './public/js/hockey-rules.js';
import {isArcadeMap} from './public/js/arcade-rules.js';
import {isTropicalIslandMap,tropicalIslandPlayUrl} from './public/js/tropical-island-destination.js';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const ATLAS_CELL_SIZE=256;
const names=['Cedar','Willow','Harbor','Maple','Aurora','Garden','Orchard','Juniper','Meadow','Copper','River','Summit','Lantern','Silver','Sunrise','Oak'];
const hash=value=>createHash('sha256').update(String(value)).digest().readUInt32BE();
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
function mapPlayUrl(map){
 if(isTropicalIslandMap(map))return tropicalIslandPlayUrl(map,{mode:map.source==='custom-builder'&&map.builderScene?.gameplay?.multiplayer===false?'solo':'multiplayer'});
 if(map.playUrl)return map.playUrl;
 const page=isHockeyMap(map)?'hockey.html':isArcadeMap(map)?'arcade.html':'model-explorer.html';
 const solo=map.source==='custom-builder'&&map.builderScene?.gameplay?.multiplayer===false;
 return page+'?environment='+encodeURIComponent(map.id)+'&house='+encodeURIComponent(map.roomId||map.id)+'&mode='+(solo?'solo':'multiplayer')+'&autoplay=1';
}
function cellPlayUrl(cell,meeting){
 const url=new URL(cell.playUrl||'model-explorer.html','https://world.invalid/');
 url.searchParams.set('environment',cell.mapId);url.searchParams.set('house',cell.roomId||cell.mapId);url.searchParams.set('autoplay','1');
 if(!url.searchParams.has('mode'))url.searchParams.set('mode','multiplayer');
 if(meeting)url.searchParams.set('meet',meeting.id);else url.searchParams.delete('meet');
 return url.pathname.replace(/^\//,'')+url.search+url.hash;
}
function savePin(data,cell,meeting,identity,point){
 if(!identity?.accountId)fail('A game session is required to save atlas pins.',401);
 const id=cell.mapId+':'+(meeting?.id||'entry'),ownerId='account:'+identity.accountId;
 const existing=data.pins?.[ownerId]?.[id];
 const pin={id,mapId:cell.mapId,meetingId:meeting?.id||null,place:cell.name,owner:identity.username||'Player',ownerId,x:point?.x??existing?.x??50+cell.column*256/163.84,y:point?.y??existing?.y??50+cell.row*256/163.84,playUrl:cellPlayUrl(cell,meeting)};
 data.pins ||= {};data.pins[ownerId] ||= {};if(JSON.stringify(data.pins[ownerId][id])!==JSON.stringify(pin)){data.pins[ownerId][id]=pin;data.revision++;}return pin;
}
export function generatedStreet(mapId,index,from,to,width=5){return {id:'street-'+index,name:names[(hash(mapId)+index)%names.length]+' '+(Math.abs(to.x-from.x)>=Math.abs(to.z-from.z)?'Road':'Avenue')+(index>=names.length?' '+(Math.floor(index/names.length)+1):''),from,to,width};}
export function defaultStreets(id,size){const edge=size/2-2;return [-size/4,0,size/4].flatMap((offset,index)=>[generatedStreet(id,index*2,{x:-edge,z:offset},{x:edge,z:offset}),generatedStreet(id,index*2+1,{x:offset,z:-edge},{x:offset,z:edge})]);}
// Activity maps reserve physical working areas. Their roads are authored around
// those areas, including when the map has been copied into a Builder draft.
const dedicatedStreetLayout=map=>Boolean(isBunkerEnvironment(map)||isTropicalIslandMap(map)||map.game==='prison'||map.prison?.enabled||map.builderScene?.layout==='prison'||map.builderScene?.sourceLayout==='prison'||map.builderScene?.layoutMeta?.prison?.enabled||['factory-proving','mountain-compound'].includes(map.game)||map.factoryTesting?.enabled||map.builderScene?.sourceFactoryTesting?.enabled||map.builderScene?.layoutMeta?.factoryTesting?.enabled||map.game==='funhouse'||map.builderScene?.layout==='clown-funhouse'||map.builderScene?.sourceLayout==='clown-funhouse'||map.game==='shipping'||map.builderScene?.layoutMeta?.shipping?.enabled||['factory','missile-factory'].includes(map.game)||map.factory?.enabled||map.builderScene?.layout==='missile-factory'||map.builderScene?.sourceLayout==='missile-factory'||map.builderScene?.layoutMeta?.factory?.enabled||map.airport?.enabled||map.game==='casino'||map.builderScene?.layout==='casino'||map.game==='fitness'||map.builderScene?.layout==='fitness-centre'||map.builderScene?.sourceLayout==='fitness-centre'||map.builderScene?.sourceFitness?.enabled||map.builderScene?.layoutMeta?.fitness?.enabled||map.game==='ski'||map.game==='construction'||map.construction?.enabled||map.builderScene?.layoutMeta?.construction?.enabled||map.builderScene?.sourceConstruction?.enabled);
const authoredStreets=map=>map.builderScene?.streets||map.streets||[];
const activityStreets=(map,existing=[])=>structuredClone([...new Map([...authoredStreets(map),...existing.filter(street=>street.createdBy)].map(street=>[street.id,street])).values()]);
function publicPlazaObjects(){
 const specs=[['pond',-18,-18],['market-stall',18,-18],['market-stall',24,-18],['flower-bed',-24,18],['flower-bed',24,18],...[-24,24].flatMap(x=>[-24,24].map(z=>['lamp-post',x,z]))];
 return specs.map(([modelId,x,z],index)=>({id:'public-plaza-'+index,modelId,position:{x,y:0,z},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor'}}));
}
function upgradePublicPlazas(data){
 for(const cell of Object.values(data.cells)){
  if(!cell.generated||!cell.environment?.builderScene)continue;
  const scene=cell.environment.builderScene;let changed=false;
  if(scene.publicPlazaVersion!==1){scene.objects.push(...publicPlazaObjects());scene.publicPlazaVersion=1;changed=true;}
  if(scene.publicExperienceVersion!==GENERATED_EXPERIENCE_VERSION||cell.mapId==='public-commons'&&scene.commonsNeighborhoodVersion!==COMMONS_NEIGHBORHOOD_VERSION||cell.environment.atlasDistrict?.id==='neon-docks'&&!cell.environment.atlasDistrict.page&&scene.layoutMeta?.harbor?.version!==NEON_MARINA_VERSION){
   const experience=generatedExperience(cell.environment);
   scene.objects=scene.objects.filter(object=>!object.id.startsWith('public-experience-'));scene.objects.push(...experience.objects);
   // Replace only our own courier roads. Member-authored streets and all
   // existing district corridors retain their identities and positions.
   cell.streets=[...cell.streets.filter(street=>street.createdBy||!String(street.id).startsWith('regional-courier-')),...experience.streets];
   scene.streets=structuredClone(cell.streets);
   scene.layoutMeta={...scene.layoutMeta,...experience.layoutMeta};if(experience.layoutMeta.harbor)scene.mapSize=experience.layoutMeta.harbor.extent*2;scene.publicExperienceVersion=GENERATED_EXPERIENCE_VERSION;scene.experienceName=experience.name;if(cell.mapId==='public-commons')scene.commonsNeighborhoodVersion=COMMONS_NEIGHBORHOOD_VERSION;cell.environment.description=experience.description;
   changed=true;
  }
  if(changed){cell.environment.updatedAt=new Date().toISOString();cell.updatedAt=cell.environment.updatedAt;cell.environment.contentUpdatedAt=(cell.environment.contentUpdatedAt||'')+':experience-'+GENERATED_EXPERIENCE_VERSION+(cell.mapId==='public-commons'?':commons-'+COMMONS_NEIGHBORHOOD_VERSION:'');data.revision++;}
 }
}
export function landscapedEnvironment(id,name,ownerName='MUZIKAZ community'){
 const objects=[];
 for(let i=0;i<24;i++){const x=[-110,-86,-38,38,86,110][i%6],z=[-108,-88,88,108][Math.floor(i/6)];objects.push({id:'landscape-tree-'+i,modelId:i%2?'pine-tree':'canopy-tree',position:{x,y:0,z},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'decor'}});}
 for(let i=0;i<4;i++)objects.push({id:'public-seat-'+i,modelId:'pillow-ring',position:{x:-12+i*8,y:0,z:14},scale:{x:1,y:1,z:1},functionalSettings:{behavior:'seat',interactionDistance:3}});
 return {id,name,ownerName,source:'community-atlas',community:true,publicDestination:true,roomId:id,visibility:'public',playable:true,multiplayer:true,category:'Public community',modelUrl:'',modelUrls:[],proceduralLand:true,scale:1,spaceScale:1,spawn:{x:5,y:0,z:5,rotationY:0},rotation:{x:0,y:0,z:0},collisionMode:'auto',builderScene:{id,name,version:3,layout:'community-park',mapSize:256,objects,gameplay:{multiplayer:true}},canEdit:false,canDelete:false};
}
function gatewayObject(target,index,total){
 const models=target.deedId?['timber-cabin','stone-tower']:target.kind==='district'?['sci-fi-bunker','stone-tower']:['stone-tower','timber-cabin','sci-fi-bunker'];
 const columns=total>36?[-108,-90,-72,-54,-36,-18,18,36,54,72,90,108]:[-96,-64,-32,32,64,96],rowCount=Math.ceil(total/columns.length),row=Math.floor(index/columns.length),z=rowCount<=6?[-90,-62,-34,34,62,90][row]:(row-(rowCount-1)/2)*22;
 return {id:'atlas-gateway-'+createHash('sha256').update(target.mapId).digest('hex').slice(0,20),modelId:models[index%models.length],name:target.name,atlasDestination:target.mapId,atlasOwnerName:target.ownerName,atlasDeedId:target.deedId||null,atlasDistrictId:target.districtId||null,position:{x:columns[index%columns.length],y:0,z},scale:{x:1,y:1,z:1},materialSettings:{useAccent:true,accent:target.mapColor||target.districtColor||'#caff69'},functionalSettings:{behavior:'interact',action:'teleport',interactionDistance:6,prompt:'Enter '+target.name,portal:{enabled:true,destinationType:'map',targetMapId:target.mapId,ownerName:target.ownerName,deedId:target.deedId||null,color:target.mapColor||target.districtColor||'#caff69'}}};
}
export function connectAtlasDestinations(data){
 const destinations=Object.values(data.cells).sort((a,b)=>a.mapId.localeCompare(b.mapId));
 const signature=destinations.map(cell=>[cell.mapId,cell.name,cell.ownerId,cell.ownerName,cell.deedId,cell.districtId,cell.mapColor,cell.portalTargets]).map(JSON.stringify).join('|');
 if(data.gatewayDirectorySignature===signature)return;data.gatewayDirectorySignature=signature;data.revision++;
 const byId=new Map(destinations.map(cell=>[cell.mapId,cell]));
 for(const cell of destinations){
  if(!cell.generated||!cell.environment?.builderScene)continue;
  const scene=cell.environment.builderScene;
  const targets=(cell.portalTargets||[]).map(id=>byId.get(id)).filter(Boolean);
  const slots=scene.atlasGatewaySlots||{};for(const id of Object.keys(slots))if(!targets.some(target=>target.mapId===id))delete slots[id];const occupied=new Set(Object.values(slots));for(const target of targets)if(slots[target.mapId]===undefined){let slot=0;while(occupied.has(slot))slot++;slots[target.mapId]=slot;occupied.add(slot);}scene.atlasGatewaySlots=slots;
  const gatewaySignature=JSON.stringify(targets.map(target=>[target.mapId,target.name,target.ownerName,target.deedId,target.districtColor,target.mapColor,slots[target.mapId]]));
  if(scene.atlasGatewaySignature===gatewaySignature)continue;
  scene.objects=scene.objects.filter(object=>!object.atlasDestination);
  targets.forEach(target=>scene.objects.push(gatewayObject(target,slots[target.mapId],cell.mapId==='public-commons'?Math.max(37,...Object.values(slots).map(slot=>slot+1)):36)));
  scene.atlasGatewaySignature=gatewaySignature;cell.environment.contentUpdatedAt='atlas-'+hash(gatewaySignature);cell.environment.updatedAt=new Date().toISOString();cell.updatedAt=cell.environment.updatedAt;data.revision++;
 }
}
function allocateCell(atlas,data,map,generated=false){
 const neighbor=map.adjacentTo&&Object.values(data.cells).find(cell=>cell.mapId===map.adjacentTo);
 if(neighbor){
  // Prefer an adjoining lot without relocating an existing destination or pin.
  for(let radius=1;radius<=32;radius++){
   const offsets=[[radius,0],[0,radius],[-radius,0],[0,-radius]];
   for(let x=1;x<radius;x++)for(const sx of [-1,1])for(const sz of [-1,1])offsets.push([sx*x,sz*(radius-x)]);
   for(const [dx,dz]of offsets){const column=neighbor.column+dx,row=neighbor.row+dz;if(Math.abs(column)>32||Math.abs(row)>32||data.cells[column+','+row])continue;return atlas.add(data,column,row,map,generated);}
  }
 }
 for(let radius=1;radius<=32;radius++)for(let row=-radius;row<=radius;row++)for(let column=-radius;column<=radius;column++)if((Math.abs(column)===radius||Math.abs(row)===radius)&&!data.cells[column+','+row])return atlas.add(data,column,row,map,generated);
 fail('The public atlas has reached its district limit.',409);
}
function buildDistrictDirectory(atlas,data){
 const locations=Object.values(data.cells).filter(cell=>cell.mapId!=='public-commons'&&!cell.environment?.atlasDistrict);
 const districts=[];data.destinationDistrictSlots ||= {};const liveIds=new Set(locations.map(cell=>cell.mapId));for(const id of Object.keys(data.destinationDistrictSlots))if(!liveIds.has(id))delete data.destinationDistrictSlots[id];
 for(const region of WORLD_DISTRICTS){
  const members=locations.filter(cell=>districtFor(cell).id===region.id).sort((a,b)=>a.mapId.localeCompare(b.mapId));
  const used=new Set();for(const member of members){const slot=data.destinationDistrictSlots[member.mapId];if(slot?.region===region.id&&!used.has(slot.index))used.add(slot.index);else delete data.destinationDistrictSlots[member.mapId];}
  for(const member of members)if(!data.destinationDistrictSlots[member.mapId]){let index=0;while(used.has(index))index++;used.add(index);data.destinationDistrictSlots[member.mapId]={region:region.id,index};}
  const pages=Math.max(1,...members.map(member=>Math.floor(data.destinationDistrictSlots[member.mapId].index/DISTRICT_PAGE_SIZE)+1));
  for(let page=0;page<pages;page++){
   const id=districtMapId(region.id,page);let cell=Object.values(data.cells).find(cell=>cell.mapId===id);
   if(!cell){const map=landscapedEnvironment(id,region.name+(page?' · Block '+(page+1):''));map.atlasDistrict={...region,page};map.builderScene.layoutMeta={color:region.ground};for(const object of map.builderScene.objects)if(object.id.startsWith('landscape-tree-'))object.modelId=region.scenery;map.category='World districts';map.description=region.name+' public district · building portals to saved maps and member deeds';map.label='District portal map';cell=allocateCell(atlas,data,map,true);}
   cell.kind='district';cell.districtId=id;cell.districtName=region.name;cell.districtColor=region.color;
   const slice=members.filter(member=>Math.floor(data.destinationDistrictSlots[member.mapId].index/DISTRICT_PAGE_SIZE)===page).sort((a,b)=>data.destinationDistrictSlots[a.mapId].index-data.destinationDistrictSlots[b.mapId].index);
   for(const member of slice){member.districtId=id;member.districtName=region.name;member.districtColor=region.color;}
   cell.portalTargets=[...new Set(['public-commons',...slice.map(member=>member.mapId),...(page?[districtMapId(region.id),districtMapId(region.id,page-1)]:WORLD_DISTRICTS.filter(other=>other.id!==region.id).map(other=>districtMapId(other.id))),...(page+1<pages?[districtMapId(region.id,page+1)]:[])])];districts.push(cell);
  }
 }
 const active=new Set(districts.map(cell=>cell.mapId));for(const [key,cell]of Object.entries(data.cells))if(cell.environment?.atlasDistrict&&!active.has(cell.mapId)){delete data.cells[key];data.revision++;}
 const commons=data.cells['0,0'];commons.kind='hub';commons.districtName='Public Commons';commons.districtColor='#caff69';
 // Every destination is a building in a district, with small directories also
 // offering direct shortcuts in the Commons. No destination is silently capped.
 commons.portalTargets=[...districts.map(cell=>cell.mapId),...(locations.length<=16?locations.map(cell=>cell.mapId):[])];
 for(const cell of locations)if(cell.generated)cell.portalTargets=['public-commons',cell.districtId];
 upgradePublicPlazas(data);
 connectAtlasDestinations(data);
}
export class WorldAtlas {
 constructor(file){this.file=file;this.queue=Promise.resolve();this.data=null;}
 async read(){if(!this.data){try{this.data=JSON.parse(await readFile(this.file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;this.data={version:1,revision:0,cells:{}};}}return structuredClone(this.data);}
 transaction(change){const operation=this.queue.then(async()=>{const data=await this.read(),before=data.revision,result=await change(data);if(data.revision!==before){await mkdir(dirname(this.file),{recursive:true});const temporary=this.file+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(data));await rename(temporary,this.file);this.data=structuredClone(data);}return result;});this.queue=operation.catch(()=>{});return operation;}
 add(data,column,row,map,generated=false){const now=new Date().toISOString(),size=Math.max(40,Math.min(512,Number(map.builderScene?.mapSize)||40));const cell={column,row,mapId:map.id,name:map.name,playUrl:mapPlayUrl(map),roomId:map.roomId||map.id,ownerId:map.ownerId||'community',ownerName:map.ownerName||'MUZIKAZ community',publicDestination:map.memberPlot?false:!!map.publicDestination,permanent:map.permanent===true,generated,environment:generated?map:undefined,size,streets:dedicatedStreetLayout(map)?activityStreets(map):defaultStreets(map.id,size),meetings:structuredClone(map.landLots?map.meetingPoints||[]:[]),kind:map.memberPlot?'deed':generated?'district':map.source==='custom-builder'?'saved-map':'map',deedId:map.deedId||null,worldId:map.worldId||null,baseEnvironmentId:map.baseEnvironmentId||null,mapColor:map.mapColor||null,mapTheme:map.mapTheme||null,description:map.description||'',createdAt:now,updatedAt:now};data.cells[column+','+row]=cell;data.revision++;return cell;}
 async synchronize(maps=[],{complete=false}={}){return this.transaction(data=>{
  if(!data.cells['0,0'])this.add(data,0,0,landscapedEnvironment('public-commons','Public Commons'),true);
  const listed=maps.filter(map=>map.visibility!=='private'&&map.playable!==false),ids=new Set(listed.map(map=>map.id));
  const hidden=new Set(maps.filter(map=>map.visibility==='private'||map.playable===false).map(map=>map.id));
  for(const [key,cell]of Object.entries(data.cells))if(!cell.generated&&(hidden.has(cell.mapId)||complete&&!ids.has(cell.mapId))){delete data.cells[key];data.revision++;}
  for(const map of listed){
   let existing=Object.values(data.cells).find(cell=>cell.mapId===map.id);if(!existing){allocateCell(this,data,map);continue;}
   const size=Math.max(40,Math.min(512,Number(map.builderScene?.mapSize)||40));
   const metadata={name:map.name,playUrl:mapPlayUrl(map),roomId:map.roomId||map.id,ownerId:map.ownerId||existing.ownerId,ownerName:map.ownerName||existing.ownerName,kind:map.memberPlot?'deed':map.source==='custom-builder'?'saved-map':'map',deedId:map.deedId||null,worldId:map.worldId||null,baseEnvironmentId:map.baseEnvironmentId||null,mapColor:map.mapColor||null,mapTheme:map.mapTheme||null,description:map.description||'',permanent:map.permanent===true,publicDestination:map.memberPlot?false:!!map.publicDestination,size};
   if(Object.entries(metadata).some(([key,value])=>existing[key]!==value)){
    if(existing.size!==size){const ratio=size/existing.size;for(const street of existing.streets)for(const point of [street.from,street.to]){point.x*=ratio;point.z*=ratio;}}
    Object.assign(existing,metadata);existing.updatedAt=new Date().toISOString();data.revision++;
   }
   if(dedicatedStreetLayout(map)){
    const streets=activityStreets(map,existing.streets);
    if(JSON.stringify(existing.streets)!==JSON.stringify(streets)){existing.streets=streets;existing.updatedAt=new Date().toISOString();data.revision++;}
   }
  }
  buildDistrictDirectory(this,data);return structuredClone(data);
 });}
 async pins(identity){const data=await this.read();const live=new Set(Object.values(data.cells).map(cell=>cell.mapId));return Object.values(data.pins?.['account:'+identity.accountId]||{}).filter(pin=>live.has(pin.mapId));}
 async pin(mapId,meetingId,identity,point){return this.transaction(data=>{const cell=Object.values(data.cells).find(cell=>cell.mapId===mapId);if(!cell)fail('This saved map is no longer listed in the atlas.',404);const meeting=meetingId?cell.meetings.find(meeting=>meeting.id===meetingId):null;if(meetingId&&!meeting)fail('This saved map point no longer exists.',404);if(point&&!['x','y'].every(axis=>Number.isFinite(point[axis])&&point[axis]>=0&&point[axis]<=100))fail('Choose map coordinates between 0 and 100.');return structuredClone(savePin(data,cell,meeting,identity,point));});}
 async resolve(x,z,identity){await this.synchronize();if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>8192||Math.abs(z)>8192)fail('Choose finite world coordinates between -8192 and 8192.');return this.transaction(data=>{const column=Math.floor((x+128)/256),row=Math.floor((z+128)/256),key=column+','+row;let cell=data.cells[key],created=false;if(!cell){if(Object.keys(data.cells).length>=2048)fail('The public atlas has reached its district limit.',409);const code=n=>n<0?'m'+Math.abs(n):'p'+n,id='district-'+code(column)+'-'+code(row),map=landscapedEnvironment(id,names[hash(key)%names.length]+' Community '+column+','+row,identity.username);map.ownerId='account:'+identity.accountId;cell=this.add(data,column,row,map,true);created=true;}
 const local={x:Math.round((x-column*256)*cell.size/256/2)*2,y:0,z:Math.round((z-row*256)*cell.size/256/2)*2},id='meet-'+local.x+'-'+local.z;let meeting=cell.meetings.find(point=>point.id===id);if(!meeting){if(cell.meetings.length>=256)fail('This district has too many meeting points. Choose an existing point.',409);const nearest=cell.streets.slice().sort((a,b)=>Math.hypot(local.x-a.from.x,local.z-a.from.z)-Math.hypot(local.x-b.from.x,local.z-b.from.z))[0];meeting={id,name:(nearest?.name||cell.name)+' meeting point',position:local};cell.meetings.push(meeting);data.revision++;cell.updatedAt=new Date().toISOString();}
 buildDistrictDirectory(this,data);const pin=savePin(data,cell,meeting,identity,{x:50+x/163.84,y:50+z/163.84});return {created,pin,cell:structuredClone(cell),meeting:structuredClone(meeting),revision:data.revision,playUrl:cellPlayUrl(cell,meeting)};});}
 async addStreet(mapId,body,identity){return this.transaction(data=>{const cell=Object.values(data.cells).find(cell=>cell.mapId===mapId);if(!cell)fail('Published atlas destination not found.',404);if(!cell.publicDestination&&cell.ownerId!=='account:'+identity.accountId&&cell.ownerId!==identity.walletId)fail('Only the map builder can add streets to this destination.',403);if(cell.streets.length>=64)fail('This destination has reached its street limit.',409);const coordinates=[body.from?.x,body.from?.z,body.to?.x,body.to?.z];if(!coordinates.every(n=>Number.isFinite(n)&&Math.abs(n)<=cell.size/2))fail('Street endpoints must lie inside the destination.');if(Math.hypot(body.to.x-body.from.x,body.to.z-body.from.z)<2)fail('Streets must be at least two metres long.');const width=body.width===undefined?5:Number(body.width);if(!Number.isFinite(width)||width<2||width>10)fail('Street width must be between 2 and 10 metres.');const street=generatedStreet(mapId,cell.streets.length,{x:body.from.x,z:body.from.z},{x:body.to.x,z:body.to.z},width);street.createdBy=identity.username;cell.streets.push(street);cell.updatedAt=new Date().toISOString();data.revision++;return {street,revision:data.revision,mapId};});}
}
export function attachAtlas(environment,atlas){const cell=Object.values(atlas.cells).find(cell=>cell.mapId===environment.id);if(!cell)return environment;const isolated=Boolean((environment.builderScene||environment.placementScene||environment.memberPlot)&&!environment.publicDestination&&!cell.generated);const generated=new Set(cell.streets.filter(street=>!street.createdBy).map(street=>JSON.stringify(street)));const authored=authoredStreets(environment).filter(street=>!generated.has(JSON.stringify(street)));const streets=dedicatedStreetLayout(environment)?activityStreets(environment,cell.streets):isolated?[...new Map([...authored,...cell.streets.filter(street=>street.createdBy)].map(street=>[street.id,street])).values()]:cell.streets;return {...environment,districtId:cell.districtId,districtName:cell.districtName,districtColor:cell.districtColor,portalTargets:cell.portalTargets||['public-commons'],atlas:{column:cell.column,row:cell.row,position:{x:cell.column*256,y:0,z:cell.row*256},cellSize:256,revision:atlas.revision},streets,meetingPoints:cell.meetings,publicDestination:cell.publicDestination,contentUpdatedAt:environment.contentUpdatedAt||environment.updatedAt||cell.createdAt,updatedAt:[environment.updatedAt,cell.updatedAt].filter(Boolean).sort().at(-1),builderScene:environment.builderScene?{...environment.builderScene,streets}:undefined};}
