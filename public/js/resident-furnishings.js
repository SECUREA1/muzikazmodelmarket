import * as T from '../vendor/three/three.module.min.js';
import {createBuilderModel} from './builder-models-3d.js';
import {placementBounds} from './placed-item-collision.js';
import {isCleanSportsEnvironment} from './sports-worlds.js';
import {harborWaterAt} from './harbor-water.js';
import {firingRangeLocations,firingRangeLocationAt} from './firing-range.js';

// These recipes use existing native models on both the client and server.
// The planner returns additional runtime actors; it never edits map/save data.
export const RESIDENT_FURNISHING_MODELS=Object.freeze({
 armchair:{width:1,height:1.2,depth:.9,amenity:'rest'},
 'coffee-table':{width:1.3,height:.5,depth:.8,amenity:'social'},
 planter:{width:1.05,height:1.45,depth:.85,amenity:'decor'},
 bookshelf:{width:1.25,height:2.1,depth:.45,amenity:'reading'},
 'art-wall':{width:2.25,height:2.2,depth:1.4,amenity:'art'}
});
const indoor=/lobb(y|ies)|lounge|foyer|reception|terminal|club|tavern|caf[eé]|restaurant|library|museum|workshop|studio|shop|store|market hall|welcome hall/i;
const hazard=/court|rink|runway|airfield|landing|firing|range|lane|water|pond|dock|marina|harbou?r|slope|ski trail|lift|pitch|pool|rail|road|street/i;
const unsafeMap=/basketball|hockey|firing.range|airport|airfield|harbou?r|marina|ski|water|race|rail|maze|dungeon|combat/i;
const fallbackLayouts=new Set(['grand-floor','community-park','loft','suite','creator-studios','office-tower','mega-mall']);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const hash=value=>{let n=2166136261;for(const character of String(value))n=Math.imul(n^character.charCodeAt(0),16777619);return (n>>>0).toString(36);};
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const boundsFor=(point,width,depth,pad=0)=>({minX:point.x-width/2-pad,maxX:point.x+width/2+pad,minZ:point.z-depth/2-pad,maxZ:point.z+depth/2+pad});
const overlaps=(a,b)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minZ<b.maxZ&&a.maxZ>b.minZ;
const inside=(box,zone)=>box.minX>=zone.x-zone.width/2+.5&&box.maxX<=zone.x+zone.width/2-.5&&box.minZ>=zone.z-zone.depth/2+.5&&box.maxZ<=zone.z+zone.depth/2-.5;
function roadDistance(point,road){const a=road.from,b=road.to;if(!finitePoint(a)||!finitePoint(b))return Infinity;const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz);}

function interiorZones(environment){
 if(environment.game==='casino'||environment.builderScene?.layout==='casino'||isCleanSportsEnvironment(environment))return [];
 const meta=environment.builderScene?.layoutMeta||environment.layoutMeta||{},places=meta.locations||meta.commonsLocations||[];
 const transform=environment.builderScene?.baseTransform||{},transformed=['x','y','z','rotation'].some(key=>Number(transform[key])!==0&&Number.isFinite(Number(transform[key])))||transform.scale!==undefined&&Number(transform.scale)!==1;
 const native=Boolean((environment.builderScene||environment.proceduralLand)&&!environment.modelUrl&&!environment.modelUrls?.length&&!environment.builderScene?.baseEnvironment&&!environment.builderScene?.baseMapId&&!transformed);
 const zones=places.filter(place=>place.residentFurnishingZone===true||native&&indoor.test(place.name||'')&&!hazard.test(place.name||'')).map(place=>({...place,x:Number(place.x),z:Number(place.z),y:Number(place.y)||0,width:Number(place.width),depth:Number(place.depth)})).filter(place=>finitePoint(place)&&place.width>=8&&place.depth>=8&&place.width<=100&&place.depth<=100);
 if(zones.length)return zones.slice(0,2);
 const layout=environment.builderScene?.layout||environment.layout;
 if(!native||places.length||!fallbackLayouts.has(layout)||unsafeMap.test([environment.game,environment.name,environment.id,layout].join(' ')))return [];
 const size=Number(environment.builderScene?.mapSize)||0,spawn=environment.spawn?.position||environment.spawn||{};
 if(size<24||size>512)return [];
 // An unannotated open native floor receives a small peripheral welcome area;
 // the six-metre arrival circle and all authored content remain reserved.
 return [{id:'resident-welcome-lounge',name:'Welcome & social corner',x:(Number(spawn.x)||0)+8,z:(Number(spawn.z)||0)+6,y:Number(spawn.y)||0,width:10,depth:10}];
}

export function planResidentFurnishings(environment,{collision,sim={},objects={},maxProps=6}={}){
 if(!environment||!collision?.groundAt||!collision?.hasBodyClearance||!collision?.resolve)return [];
 const limit=Math.max(0,Math.min(6,Math.floor(Number(maxProps)||0)));if(limit<2)return [];
 const actors=sim.actors||{},players=Object.values(sim.players||{}),activeActors=Object.values(actors).filter(actor=>actor.active!==false);
 // Repeated joins restore the existing runtime set instead of adding a second
 // seating area in another corner of the same saved room.
 if(activeActors.some(actor=>actor.residentFurnishing||actor.definition?.gameplay?.residentFurnishing))return [];
 const places=environment.builderScene?.layoutMeta?.locations||environment.layoutMeta?.locations||[],reserved=[];
 const spawn=environment.spawn?.position||environment.spawn;if(finitePoint(spawn))reserved.push(boundsFor(spawn,12,12));
 for(const portal of environment.travelPortals||[]){const p=portal.position||portal;if(finitePoint(p))reserved.push(boundsFor(p,7,7));}
 for(const item of environment.builderScene?.objects||[]){const p=item.position;if(finitePoint(p)&&(/portal|door|spawn/.test(item.modelId||'')||item.atlasDestination))reserved.push(boundsFor(p,6,6));}
 for(const place of places)if(hazard.test(place.name||'')&&finitePoint(place))reserved.push(boundsFor(place,Number(place.width)||8,Number(place.depth)||8,2));
 for(const runway of environment.airport?.runways||[environment.airport?.runway].filter(Boolean))if(finitePoint(runway))reserved.push(boundsFor(runway,Number(runway.width)||20,Number(runway.length)||220,3));
 for(const actor of activeActors)if(finitePoint(actor.position)&&(actor.worldGateway||actor.arrivalReturn||/archway|portal-door/.test(actor.modelId||'')))reserved.push(boundsFor(actor.position,7,7));
 const ranges=firingRangeLocations(environment),roads=environment.streets||environment.builderScene?.streets||[];
 const result=[],used=[];
 const baseFloor=(point)=>{if(harborWaterAt(environment,point,0)||firingRangeLocationAt(ranges,point,1))return null;try{const floor=collision.groundAt(environment,point,{entry:false,maxRise:.45,actors,objects});return floor&&Math.abs(floor.y-point.y)<.5?{x:point.x,y:floor.y,z:point.z}:null;}catch{return null;}};
 const clear=(point,height=1.7)=>{try{if(!collision.hasBodyClearance(environment,point,.38,{actors,objects})||height>1.7&&!collision.hasBodyClearance(environment,{...point,y:point.y+height-1.7},.38,{actors,objects}))return false;if(collision.teleportPosition)collision.teleportPosition(environment,point,point,actors,objects,{localMap:true});return true;}catch{return false;}};
 const reachable=(from,to)=>{const span=distance(from,to),count=Math.max(1,Math.ceil(span/.3));let previous={...from};for(let i=1;i<=count;i++){const target=baseFloor({x:from.x+(to.x-from.x)*i/count,y:from.y,z:from.z+(to.z-from.z)*i/count});if(!target||!clear(target))return false;let resolved;try{resolved=collision.resolve(environment,previous,target,actors,objects);}catch{return false;}if(!resolved||distance(resolved,target)>.09)return false;previous=target;}return true;};
 for(const zone of interiorZones(environment)){
  if(result.length>=limit-1)break;
  const corners=[[-1,-1],[1,-1],[-1,1],[1,1]],seed=parseInt(hash(environment.id+':'+zone.id),36)%4;
  for(let trial=0;trial<4;trial++){
   const [sx,sz]=corners[(trial+seed)%4],center={x:zone.x+sx*(zone.width/2-2.25),y:zone.y,z:zone.z+sz*(zone.depth/2-2.5)};
   const heading=sz>0?0:Math.PI,cos=Math.cos(heading),sin=Math.sin(heading),at=(x,z)=>({x:center.x+x*cos+z*sin,y:center.y,z:center.z-x*sin+z*cos});
   const recipes=[{modelId:'armchair',x:-.9,z:0,behavior:'seat'},{modelId:'coffee-table',x:.7,z:.2,behavior:'decor'},{modelId:/library|museum|workshop|studio/i.test(zone.name)?'bookshelf':'planter',x:-.9,z:1.2,behavior:'decor'}];
   if(zone.width>=14&&zone.depth>=12)recipes.push({modelId:'art-wall',x:2.5,z:1.1,behavior:'decor'});
   const batch=[],boxes=[];let okay=true;
   for(const [index,recipe]of recipes.slice(0,limit-result.length).entries()){
    const dimensions=RESIDENT_FURNISHING_MODELS[recipe.modelId],raw=at(recipe.x,recipe.z),position=baseFloor(raw),box=boundsFor(raw,dimensions.width,dimensions.depth,.12);
    if(!position||!inside(box,zone)||reserved.some(area=>overlaps(box,area))||used.some(area=>overlaps(box,area))||roads.some(road=>roadDistance(raw,road)<(Number(road.width)||5)/2+1.8)||activeActors.some(actor=>finitePoint(actor.position)&&distance(raw,actor.position)<1.9)||players.some(player=>finitePoint(player.position)&&distance(raw,player.position)<2.5)){okay=false;break;}
    // Sample the whole footprint, not just its centre: a table must never
    // bridge an opening, stair edge, uneven ground, water or another object.
    for(const dx of [-.5,0,.5])for(const dz of [-.5,0,.5]){const point=baseFloor({x:raw.x+dx*(dimensions.width+.35),y:position.y,z:raw.z+dz*(dimensions.depth+.35)});if(!point||Math.abs(point.y-position.y)>.07||!clear(point,dimensions.height))okay=false;}
    if(!okay)break;
    const id='resident-furnishing-'+hash(environment.id+':'+zone.id+':'+recipe.modelId+':'+index);
    const record={id,modelId:recipe.modelId,name:(recipe.modelId==='art-wall'?'Local art display':recipe.modelId==='armchair'?'Conversation chair':recipe.modelId==='coffee-table'?'Social coffee table':recipe.modelId==='bookshelf'?'Local reading shelf':'Indoor planter')+' · '+zone.name,position,rotation:{x:0,y:heading,z:0},scale:{x:1,y:1,z:1},placementAnchor:'collider-base',residentFurnishing:true,locationId:zone.id,residentAmenity:dimensions.amenity,functionalSettings:{behavior:recipe.behavior,interactionDistance:3,destructible:false,residentFurnishing:true},dialogueSettings:{text:'Welcome to '+zone.name+'. Nearby residents can share local directions, activities and stories.'}};
    batch.push(record);boxes.push(box);
   }
   if(!okay||batch.length<2)continue;
   const starts=[[0,0],[-.22,0],[.22,0],[0,-.22],[0,.22]].map(([x,z])=>baseFloor({x:zone.x+x*zone.width,y:zone.y,z:zone.z+z*zone.depth})).filter(p=>p&&clear(p)&&!boxes.some(box=>overlaps(boundsFor(p,.7,.7),box)));if(!starts.length)continue;
   for(const [index,record]of batch.entries()){
    const approach=baseFloor({x:record.position.x-Math.sin(heading)*1.4,y:record.position.y,z:record.position.z-Math.cos(heading)*1.4});
    if(record.functionalSettings.behavior==='decor')continue;
    if(!approach||boxes.some((box,i)=>i!==index&&overlaps(boundsFor(approach,.7,.7),box))||!starts.some(start=>reachable(start,approach))){okay=false;break;}
    record.approach=approach;
   }
   if(!okay)continue;
   result.push(...batch);used.push(...boxes);break;
  }
 }
 return result;
}

export function createResidentFurnishing(record){
 if(!record?.residentFurnishing||!RESIDENT_FURNISHING_MODELS[record.modelId])return null;
 const root=createBuilderModel(record.modelId);if(!root)return null;
 root.position.set(record.position.x,record.position.y,record.position.z);root.rotation.y=record.rotation?.y||0;root.updateMatrixWorld(true);const bounds=placementBounds(T,root);if(!bounds.isEmpty())root.position.y+=record.position.y-bounds.min.y;
 root.userData.residentFurnishing=true;root.userData.builderObjectId=record.id;return root;
}
