import {WORLD_DISTRICTS,districtFor,districtMapId} from './world-districts.mjs';
import {SHIPPING_ID,SHIPPING_PORTS,SHIPPING_ROUTES} from './public/js/shipping-config.js';
import {STRAIT_FREIGHT_CONNECTIONS,STRAIT_AIR_ROUTES,INTERNATIONAL_AIRPORT_FREIGHT} from './public/js/strait-freight-network.js';
import {airportRunways} from './public/js/airport-navigation.js';
import {harborForEnvironment} from './public/js/harbor-water.js';
export {planWorldJourney} from './public/js/world-connectivity.js';

const coordinate=value=>Number.isFinite(Number(value))?Number(value):0;
const point=value=>({x:coordinate(value?.x),y:coordinate(value?.y),z:coordinate(value?.z)});
const validPoint=value=>value&&Number.isFinite(Number(value.x))&&Number.isFinite(Number(value.z));
const publicMap=map=>map?.id&&map.visibility!=='private'&&map.playable!==false;
const label=value=>String(value||'').slice(0,200);
function roads(map){return [...new Map([...(map.streets||[]),...(map.builderScene?.streets||[])].filter(road=>validPoint(road.from)&&validPoint(road.to)).map(road=>[road.id||JSON.stringify([road.from,road.to]),road])).values()];}
function regionFor(map){return WORLD_DISTRICTS.find(region=>map.districtId===districtMapId(region.id)||map.districtId?.startsWith(districtMapId(region.id)+'-')||map.atlasDistrict?.id===region.id)||districtFor(map);}
function localPlaces(map){
 const meta=map.builderScene?.layoutMeta||{},places=(meta.locations||meta.commonsLocations||[]).filter(place=>place&&place.hidden!==true&&place.visibility!=='private'&&validPoint(place.position||place));
 const result=places.map((place,index)=>({id:String(place.id||'location-'+index),name:label(place.name||place.label||'Local destination'),kind:label(place.kind||'landmark'),position:point(place.position||place),modes:Array.isArray(place.modes)?place.modes.filter(mode=>['foot','road','boat','plane','map-transfer'].includes(mode)):['foot']}));
 const add=(id,name,kind,position,modes,extra={})=>{const value={id,name:label(name),kind,position:point(position),modes,...extra},existing=result.findIndex(place=>place.id===id);if(existing<0)result.push(value);else result[existing]={...result[existing],...value};};
 if(map.id===SHIPPING_ID)for(const row of STRAIT_FREIGHT_CONNECTIONS){
  add('port:'+row.portId,row.name,'port',row.dock,['foot','boat'],{portId:row.portId});
  add('bay:'+row.portId,row.name.split(' · ')[0]+' shore freight bay','freight-bay',row.bay,['foot','road'],{portId:row.portId});
  if(row.airfield)add(row.airfield.id,row.airfield.name,'airfield',row.airfield.cargoApron,['foot','road','plane'],{portId:row.portId,runwayId:row.airfield.runwayId});
 }
 else for(const runway of airportRunways(map))add(runway.id,runway.name||runway.id,'airfield',{x:runway.x,z:runway.z},['plane'],{runwayId:runway.id});
 const harbor=harborForEnvironment(map);
 if(map.id!==SHIPPING_ID)for(const dock of harbor?.docks||[])if(validPoint(dock))add(dock.id,dock.name||dock.id,'dock',dock,['foot','boat']);
 if(map.id==='muzikaz-airport'){
  add(INTERNATIONAL_AIRPORT_FREIGHT.bayId,'International Airport counted freight terminal','freight-bay',INTERNATIONAL_AIRPORT_FREIGHT.bay,['foot','road']);
  add('airport-cargo-truck-bay','International Airport air cargo truck bay','freight-bay',INTERNATIONAL_AIRPORT_FREIGHT.truckBay,['foot','road']);
  add('airport-cargo-apron','International Airport air cargo apron','apron',INTERNATIONAL_AIRPORT_FREIGHT.cargoApron,['foot','plane']);
 }
 if(!result.length)add('arrival',(map.name||map.id)+' arrival','arrival',map.spawn?.position||map.spawn,['foot']);
 return result;
}
function followsRoads(mapRoads,waypoints){
 const onRoad=(road,position)=>{const a=road.from,b=road.to,dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz,t=length?((position.x-a.x)*dx+(position.z-a.z)*dz)/length:0;return t>=-.001&&t<=1.001&&Math.hypot(position.x-a.x-dx*t,position.z-a.z-dz*t)<.05;};
 return waypoints.slice(1).every((to,index)=>mapRoads.some(road=>onRoad(road,waypoints[index])&&onRoad(road,to)));
}
function localLinks(maps){
 const result=[],byId=new Map(maps.map(map=>[map.id,map])),add=(id,mapId,from,to,mode,waypoints,name,extra={})=>result.push({id,mapId,fromLocationId:from,toLocationId:to,mode,waypoints:waypoints.map(point),name:label(name),...extra});
 if(byId.has(SHIPPING_ID)){
  for(const row of STRAIT_FREIGHT_CONNECTIONS){
   add('dock-road:'+row.portId,SHIPPING_ID,'port:'+row.portId,'bay:'+row.portId,'road',row.roadWaypoints,row.name.split(' · ')[0]+' shore road',{bidirectional:true});
   if(row.airfield)add('air-road:'+row.portId,SHIPPING_ID,'bay:'+row.portId,row.airfield.id,'road',row.airRoadWaypoints,row.airfield.name+' access road',{bidirectional:true});
  }
  for(const route of SHIPPING_ROUTES){const origin=SHIPPING_PORTS.find(port=>port.id===route.from);add('sea:'+route.id,SHIPPING_ID,'port:'+route.from,'port:'+route.to,'boat',[origin.berth,...route.waypoints],route.name,{routeId:route.id,verifiedCargo:true});}
  for(const route of STRAIT_AIR_ROUTES)add('flight:'+route.id,SHIPPING_ID,route.origin.id,route.destination.id,'plane',[route.origin.cargoApron,...route.waypoints,route.destination.cargoApron],route.name,{routeId:route.id,verifiedCargo:true});
 }
 if(byId.has('muzikaz-airport'))add('international-airport-cargo-road','muzikaz-airport',INTERNATIONAL_AIRPORT_FREIGHT.bayId,'airport-cargo-truck-bay','road',INTERNATIONAL_AIRPORT_FREIGHT.roadWaypoints,'International air cargo access',{bidirectional:true});
 for(const map of maps){
  const regionId=map.atlasDistrict?.id;if(!regionId)continue;
  const places=localPlaces(map),bay=places.find(place=>place.id===regionId+'-courier-bay'),junction=places.find(place=>place.id===regionId+'-courier-junction'),dispatch=places.find(place=>place.id===regionId+'-route-dispatch');
  if(bay&&junction){const waypoints=[bay.position,{x:bay.position.x,y:0,z:junction.position.z},junction.position];if(followsRoads(roads(map),waypoints))add('regional-courier:'+map.id,map.id,bay.id,junction.id,'road',waypoints,'Regional Courier Road',{bidirectional:true});}
  if(dispatch&&junction&&dispatch.position.x===-10&&dispatch.position.z===-44&&junction.position.x===0&&junction.position.z===-44)add('regional-dispatch-walk:'+map.id,map.id,dispatch.id,junction.id,'foot',[dispatch.position,junction.position],'Regional dispatch paved walk',{bidirectional:true});
 }
 return result;
}
/** A read-only public travel catalogue. Private rooms, account ids and cargo
 * reservations never enter the graph. Local coordinates stay inside their
 * map: cross-room gateways are always explicit map-transfer edges. */
export function buildWorldConnectivity(environments=[],atlas={}){
 const maps=environments.filter(publicMap),ids=new Set(maps.map(map=>map.id)),cells=new Map(Object.values(atlas.cells||{}).map(cell=>[cell.mapId,cell]));
 const locations=maps.map(map=>{
  const region=regionFor(map),cell=cells.get(map.id),mapRoads=roads(map),modes=['foot'];
  if(mapRoads.length)modes.push('road');if(map.id===SHIPPING_ID||harborForEnvironment(map))modes.push('boat');if(airportRunways(map).length)modes.push('plane');
  return {id:map.id,mapId:map.id,name:label(map.name||map.id),kind:map.memberPlot||map.deedId?'deed':map.atlasDistrict?'district':map.id==='public-commons'?'hub':'map',regionId:region.id,regionName:region.name,modes,playUrl:map.playUrl||'',deedId:map.deedId||null,ownerName:label(map.ownerName||'MUZIKAZ community'),position:{x:(cell?.column||0)*256,y:0,z:(cell?.row||0)*256},localPlaces:localPlaces(map),roadCount:mapRoads.length};
 });
 const links=[];
 for(const map of maps){
  const authored=(map.builderScene?.objects||map.placementScene?.objects||[]).filter(object=>object.active!==false&&object.hidden!==true&&object.functionalSettings?.portal?.enabled!==false).map(object=>object.functionalSettings?.portal?.targetMapId).filter(Boolean);
  const targets=new Set([...(map.portalTargets||[]),...(map.travelPortals||[]).map(portal=>portal.mapId),...authored]);
  for(const target of targets)if(target!==map.id&&ids.has(target))links.push({id:'gateway:'+encodeURIComponent(map.id)+':'+encodeURIComponent(target),from:map.id,to:target,fromMapId:map.id,toMapId:target,mode:'map-transfer',kind:'gateway',name:'Map gateway'});
 }
 const regions=WORLD_DISTRICTS.map(region=>{
  const members=locations.filter(place=>place.regionId===region.id);
  return {id:region.id,name:region.name,color:region.color,description:region.description,hubLabel:region.hubLabel,hubMapId:ids.has(districtMapId(region.id))?districtMapId(region.id):null,mapIds:members.map(place=>place.mapId),locationIds:members.map(place=>place.id),gateways:members.filter(place=>place.modes.includes('boat')||place.modes.includes('plane')||place.mapId==='world-item-factory').map(place=>({mapId:place.mapId,name:place.name,modes:place.modes}))};
 });
 return {version:1,revision:Number(atlas.revision)||0,regions,locations,links,localLinks:localLinks(maps)};
}
