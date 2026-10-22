import {localMapLocations} from './local-map-locations.js';
import {isAircraft} from './aircraft-flight.js';
import {isWatercraft} from './harbor-water.js';
const styles={ski:{icon:'⛷',color:'#86cdff'},lift:{icon:'↟',color:'#ffd76b'},lodge:{icon:'⌂',color:'#ffc19d'},road:{icon:'━',color:'#c3d2d0'},landmark:{icon:'◆',color:'#bced8b'},dock:{icon:'⚓',color:'#71e4e3'},runway:{icon:'✈',color:'#8fc6ff'},portal:{icon:'↗',color:'#70dcff'},deed:{icon:'⌂',color:'#ffd581'},arrival:{icon:'◎',color:'#ff9bae'},player:{icon:'●',color:'#72defa'},self:{icon:'●',color:'#ff7f9e'},boat:{icon:'⚓',color:'#73ece3'},aircraft:{icon:'✈',color:'#9ac8ff'},basketball:{icon:'◉',color:'#ffba78'},range:{icon:'⊕',color:'#d5ef84'}};
export function localMapTagKind(place){const text=[place.id,place.name].join(' ').toLowerCase();return /chairlift|summit station/.test(text)?'lift':/château|chateau|warming hut/.test(text)?'lodge':/trail|glacier run|diamond|terrain park|ski rental/.test(text)?'ski':/runway|airfield|landing strip|aircraft/.test(text)?'runway':/dock|marina|berth|quay|harbou?r/.test(text)?'dock':/basketball|court/.test(text)?'basketball':/firing|shooting|range/.test(text)?'range':'landmark';}
export function localMapTags(environment,live={},selfId=null){
 if(!environment)return [];
 const tags=[],seen=new Set();
 const add=(id,name,kind,position,extra={})=>{if(seen.has(id)||!Number.isFinite(Number(position?.x))||!Number.isFinite(Number(position?.z)))return;seen.add(id);tags.push({id,name,kind,...styles[kind],x:Number(position.x),y:Number(position.y)||0,z:Number(position.z),...extra});};
 for(const place of localMapLocations(environment))if(place.id!=='map-arrival'&&!(environment.landLots||environment.builderScene?.layoutMeta?.landLots||[]).some(lot=>lot.id===place.id))add('location:'+place.id,place.name,localMapTagKind(place),place,{locationId:place.id,description:place.description||'',...(place.color?{color:place.color}:{}),...(place.icon?{icon:place.icon}:{})});
 for(const street of environment.streets||environment.builderScene?.streets||[])if(street.from&&street.to)add('street:'+street.id,street.name||'Road','road',{x:(street.from.x+street.to.x)/2,z:(street.from.z+street.to.z)/2});
 for(const lot of environment.landLots||environment.builderScene?.layoutMeta?.landLots||[])add('lot:'+lot.id,lot.name+(lot.claimed?' · Owned':' · '+lot.priceMzk+' MZK'),'deed',lot.position,{lotId:lot.id,deedId:lot.deedId,locationId:lot.id,description:lot.size+' × '+lot.size+' m · XYZ '+lot.position.x+', '+lot.position.y+', '+lot.position.z});
 const objects=environment.builderScene?.objects||[],actors=live?.actors||{};
 for(const object of objects){const actor=actors[object.id]||object;if(actor.active===false)continue;if(object.atlasDestination)add('portal:'+object.id,object.name||'World portal',object.atlasDeedId?'deed':'portal',actor.position,{mapId:object.atlasDestination,deedId:object.atlasDeedId});}
 const craft=new Map(objects.filter(object=>isAircraft(object)||isWatercraft(object)).map(object=>[object.id,object]));
 for(const actor of Object.values(actors))if(isAircraft(actor)||isWatercraft(actor))craft.set(actor.id,{...craft.get(actor.id),...actor});
 for(const [id,source]of craft){const actor=actors[id]||source;if(actor.active===false)continue;add('craft:'+id,actor.name||source.name||id,isAircraft(actor)?'aircraft':'boat',actor.position,{entityId:id,occupied:!!actor.holderId,description:actor.holderId?'Occupied':'Available to board'});}
 const spawn=environment.spawn?.position||environment.spawn||{x:0,y:0,z:0};add('arrival','Arrival','arrival',spawn,{arrival:true});
 for(const [id,player]of Object.entries(live?.players||{}))add('player:'+id,id===selfId?'You':player.username||'Player',id===selfId?'self':'player',player.position,{description:id===selfId?'Your live position':'Live player'});
 return tags;
}
