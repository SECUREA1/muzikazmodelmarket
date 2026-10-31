import {localMapLocations} from './local-map-locations.js';
import {builderBaseSpawn} from './environments/builder-base.js';
import {harborLandPatches} from './harbor-water.js';
import {isTropicalIslandEnvironment} from './tropical-island-config.js';

const cache=new WeakMap();
const finitePoint=point=>point&&Number.isFinite(Number(point.x))&&Number.isFinite(Number(point.z));
const position=point=>({x:Number(point.x),y:Number(point.y)||0,z:Number(point.z)});
const separation=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const name=value=>String(value||'Local site').trim().slice(0,100);

function harborWalkingArea(environment,origin){
 const harbor=environment.builderScene?.layoutMeta?.harbor;
 if(!harbor)return {allows:()=>true,survey:()=>true};
 const contains=(point,patch)=>Math.abs(point.x-patch.x)<=patch.width/2&&Math.abs(point.z-patch.z)<=patch.depth/2;
 const patches=harborLandPatches(harbor);
 const patch=patches.find(patch=>contains(origin,patch)),connected=patch?[patch]:[];
 // A quay may overlap the coast in several authored floor rectangles. Keep
 // their connected component so dock offices remain reachable on foot.
 const touches=(a,b)=>{const x=Math.min(a.x+a.width/2,b.x+b.width/2)-Math.max(a.x-a.width/2,b.x-b.width/2),z=Math.min(a.z+a.depth/2,b.z+b.depth/2)-Math.max(a.z-a.depth/2,b.z-b.depth/2);return x>=-.01&&z>=-.01&&Math.max(x,z)>=.8;};
 for(let index=0;index<connected.length;index++)for(const candidate of patches)if(!connected.includes(candidate)&&touches(connected[index],candidate))connected.push(candidate);
 const onLake=point=>(harbor.lakes||[]).some(lake=>contains(point,lake));
 // A walking assignment cannot require boarding a boat to reach another
 // island. Named stops must share the arrival's connected authored land.
 // Unclassified pier arrivals get only nearby floor surveys; the live room
 // checks their real deck floors instead of assuming a connection to shore.
 const allows=point=>connected.some(patch=>contains(point,patch))&&!onLake(point);
 return {allows,survey:point=>patch?allows(point):separation(point,origin)<=4&&!patches.some(patch=>contains(point,patch))&&!onLake(point),localDeck:!patch};
}

function mapTheme(environment){
 if(environment.game==='forge'||environment.forge?.enabled||environment.builderScene?.sourceForge?.enabled)return {tour:'Emberfall forge apprenticeship',challenge:'Smithy metallurgy station challenge',service:'Forge work order & equipment briefing'};
 if(isTropicalIslandEnvironment(environment))return {tour:'Palm Coast resort discovery',challenge:'Island passport route',service:'Resort welcome and activity briefing'};
 if(environment.airport?.enabled||environment.game==='airport')return {tour:'Airport ground discovery',challenge:'Airport ground route challenge',service:'Airport ground-service briefing'};
 if(environment.game==='shipping'||environment.builderScene?.layoutMeta?.shipping)return {tour:'Cargo terminal orientation',challenge:'Dock checkpoint challenge',service:'Shipping crew briefing'};
 if(environment.builderScene?.layoutMeta?.harbor)return {tour:'Waterfront discovery walk',challenge:'Waterfront checkpoint challenge',service:'Harbor services briefing'};
 if(environment.game==='missile-factory'||environment.factory?.enabled)return {tour:'Factory floor orientation',challenge:'Factory checkpoint challenge',service:'Factory crew briefing'};
 if(environment.game==='construction')return {tour:'Construction site orientation',challenge:'Construction checkpoint challenge',service:'Construction safety briefing'};
 if(environment.game==='fitness')return {tour:'Fitness centre orientation',challenge:'Fitness centre discovery challenge',service:'Training equipment orientation'};
 if(environment.game==='casino'||environment.builderScene?.layout==='casino')return {tour:'Casino public-floor tour',challenge:'Casino discovery challenge',service:'Casino visitor orientation'};
 if(environment.game==='ski')return {tour:'Resort discovery walk',challenge:'Resort checkpoint challenge',service:'Resort services briefing'};
 return {tour:'Discover '+name(environment.name||environment.id||'this world'),challenge:'Local checkpoint challenge',service:'Local facilities check'};
}

function arrival(environment){
 const places=localMapLocations(environment),fallback=places.find(finitePoint)||{x:0,y:0,z:0};
 const explicit=environment.builderScene?builderBaseSpawn(environment):environment.spawn?.position||environment.spawn;
 return {id:'map-arrival',name:'Arrival',...position(finitePoint(explicit)?explicit:fallback),action:'check-in'};
}

function interactionSite(object,origin){
 const config=object?.functionalSettings||object?.gameplay||{},behavior=config.behavior;
 if(!object?.id||!finitePoint(object.position)||config.enabled===false)return null;
 if(config.action&&config.action!=='none'||config.portal?.enabled||config.device)return null;
 const station=behavior==='interact'&&(config.forgeStation||config.fitnessStation||['host','vault'].includes(config.casinoStation));
 if(!['talk','switch','door','heal'].includes(behavior)&&!station)return null;
 // Do not assign a floor-level player to an elevated prop without an authored
 // location on that level; ground resolution still validates every chosen site.
 if(Math.abs((Number(object.position.y)||0)-origin.y)>2)return null;
 const label=name(object.name||object.id.replaceAll('-',' '));
 const verb=behavior==='talk'?'Read or speak at ':behavior==='switch'?'Test ':behavior==='door'?'Open or close ':behavior==='heal'?'Inspect the recovery point: ':'Learn about ';
 return {id:String(object.id),entityId:String(object.id),name:label,...position(object.position),behavior,action:'interact',interactionDistance:Math.max(1,Math.min(8,Number(config.interactionDistance)||3)),prompt:verb+label};
}

function buildOffers(environment){
 const origin=arrival(environment),theme=mapTheme(environment),mapId=String(environment.id||'local-world');
 const walkingArea=harborWalkingArea(environment,origin);
 const prefix='map:'+encodeURIComponent(mapId)+':';
 const scene=environment.builderScene||environment.placementScene;
 const objects=Array.isArray(scene?.objects)?scene.objects:[];
 const interactions=objects.map(object=>interactionSite(object,origin)).filter(site=>site&&walkingArea.allows(site)).sort((a,b)=>separation(a,origin)-separation(b,origin));
 const authoredPlaces=!environment.builderScene&&scene?.layoutMeta?(scene.layoutMeta.locations||scene.layoutMeta.commonsLocations||localMapLocations(environment)):localMapLocations(environment);
 // Ambient road hubs can be useful transport map entries without having a
 // floor inside an imported model. Keep its foot orientation on authored
 // places or measured entrance surveys; explicit loading bays remain eligible.
 const importedModel=!environment.builderScene&&(environment.modelUrl||environment.modelUrls?.length),authoredIds=new Set([...(scene?.layoutMeta?.locations||scene?.layoutMeta?.commonsLocations||[]).map(place=>String(place.id)),...objects.filter(object=>(object.modelId||object.asset?.buildAssetId)==='freight-loading-bay').map(object=>String(object.id))]);
 const walkingPlaces=importedModel?authoredPlaces.filter(place=>!(place.kind==='freight'&&/^freight-hub-\d+$/.test(String(place.id))&&!authoredIds.has(String(place.id)))):authoredPlaces;
 const locations=walkingPlaces.filter(finitePoint).map((place,index)=>({id:String(place.id||'location-'+index),name:name(place.name||place.id),...position(place),action:'check-in'})).filter(walkingArea.allows);
 if(locations.length<3)for(const site of interactions){locations.push({id:site.id,name:site.name,x:site.x,y:site.y,z:site.z,action:'check-in'});}
 const candidates=locations.filter(point=>separation(point,origin)>=5).sort((a,b)=>separation(a,origin)-separation(b,origin));
 const unique=[origin];for(const point of candidates){if(unique.every(other=>separation(point,other)>=5&&point.name!==other.name))unique.push(point);if(unique.length>=5)break;}
 if(unique.length<3){
  // Sparse model-only maps have no invented shops or NPCs. The live room must
  // find a real clear floor near these proposed survey points before accepting.
  const mapSize=Number(environment.builderScene?.mapSize||environment.playableSize)||64;
  const step=walkingArea.localDeck?4:Math.max(4,Math.min(10,mapSize/8));
  for(const [index,[dx,dz]]of [[step,0],[0,-step],[-step,0],[0,step]].entries()){
   const point={id:'floor-survey-'+index,name:'Nearby floor survey '+(index+1),x:origin.x+dx,y:origin.y,z:origin.z+dz,action:'check-in',survey:true};
   if(walkingArea.survey(point)&&unique.every(other=>separation(point,other)>=4))unique.push(point);if(unique.length>=3)break;
  }
 }
 const tourSites=unique.slice(0,4),tourNames=tourSites.slice(1).map(site=>site.name).join(', ');
 const common={mode:'foot',siteQuest:true,mapId};
 const tour={...common,id:prefix+'tour',title:theme.tour,kind:'site-tour',description:'Explore '+name(environment.name||mapId)+' on foot. Visit '+tourNames+' and pause at each marker to check in.',reward:250,timeLimit:900,sites:tourSites};
 const challengeSites=[...unique.slice(1,5),origin];
 const routeLength=challengeSites.reduce((sum,site,index)=>sum+separation(site,index?challengeSites[index-1]:origin),0);
 const challenge={...common,id:prefix+'challenge',title:theme.challenge,kind:'site-tour',challenge:true,description:'Walk the marked '+name(environment.name||mapId)+' checkpoints in order, confirm each stop, and return to Arrival before time runs out.',reward:350,timeLimit:Math.max(90,Math.min(1800,Math.ceil(routeLength/1.6)+45)),sites:challengeSites};
 const serviceSites=interactions.slice(0,3);
 const offers=[tour,challenge];
 if(serviceSites.length){offers.push({...common,id:prefix+'service',title:theme.service,kind:'site-job',description:'Visit '+serviceSites.map(site=>site.name).join(', ')+'. Use each marked item to read its guidance, inspect the facility, or operate its control. Confirmed interactions complete the job.',reward:300,timeLimit:900,sites:serviceSites});}
 return offers;
}

/** Map definitions are replaced on save; revision fields also invalidate edits. */
export function mapQuestOffers(environment){
 if(!environment||typeof environment!=='object')return [];
 const scene=environment.builderScene||environment.placementScene,meta=scene?.layoutMeta;
 const signature=[environment.id,environment.name,environment.updatedAt,environment.contentUpdatedAt,environment.spawn,scene,scene?.version,scene?.updatedAt,scene?.objects,scene?.objects?.length,meta,meta?.locations,meta?.commonsLocations,meta?.harbor,meta?.harbor?.islands,meta?.harbor?.lakes];
 const previous=cache.get(environment);if(previous&&signature.every((value,index)=>value===previous.signature[index]))return previous.offers;
 const offers=buildOffers(environment);cache.set(environment,{signature,offers});return offers;
}
