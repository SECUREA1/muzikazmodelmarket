import {resolveVehicleAction} from './public/js/vehicle-actions.js';
import {startBoatAssist,boatAssistedInput,boatMovementBlocked} from './server-boat-assist.mjs';
import {startAircraftAssist,aircraftAssistedInput,aircraftExitPosition} from './server-aircraft-access.mjs';
import {stepBoatSimulation} from './public/js/boat-simulation.js';
import {harborRadio,stopBoat,boatExitPosition} from './server-harbor-operations.mjs';
import {aircraftRayDistance,aircraftGunPose,AIRCRAFT_HEALTH,AIRCRAFT_GUN_RANGE} from './public/js/aircraft-combat.js';
import {localMapLocations} from './public/js/local-map-locations.js';
import {isAircraft,stepAircraftFlight,airportRadio} from './public/js/aircraft-flight.js';
import {isWatercraft,harborWaterAt,watercraftFootprint,watercraftOverlap} from './public/js/harbor-water.js';
import {buildingPolicy,changeBuildingPolicy,requireBuildingAllowed} from './public/js/room-building-policy.js';
import {RAD_TOX_SHOT_INTERVAL_MS,isCleanCommonsEnvironment} from './public/js/rad-tox-rules.js';
import {ensureFiringRange,registerFiringRangeArrival,joinFiringRange,watchFiringRange,configureFiringRange,startFiringRange,startFiringRangePractice,stopFiringRange,stepFiringRange,constrainFiringRangePlayer,rangeHandlesFire,fireFiringRange} from './server-firing-range.mjs';
import {isDedicatedFiringRange,firingRangeLocationAt} from './public/js/firing-range.js';
import {isBasketball,basketballCatchPosition,basketballJerseyTeam,tossBasketball,stepBasketball,basketballLaunchOptions,basketballShotSolution} from './public/js/basketball.js';
import {isBasketballEnvironment,ensureBasketballGame,assignBasketballTeam,startBasketballGame,shootBasketball,touchBasketball,registerBasketballRelease,stepBasketballGame,configureBasketballGame,watchBasketballGame,requireBasketballPlayer,constrainBasketballSpectator,basketballSpectatorRestricted,BASKETBALL_BALL_ID,takeBasketballSpot,stealBasketball} from './public/js/basketball-rules.js';
import {populateMapMachine} from './server-map-machine.mjs';
import {builderBaseSpawn} from './public/js/environments/builder-base.js';
import {projectArcadeDevices} from './server-arcade-games.mjs';
import {deviceCommand,advanceDevicePlayback} from './server-interactive-devices.mjs';
import {deviceDefinition} from './public/js/interactive-devices.js';
import {questInteraction} from './public/js/rpg-quests.js';
import {startUrbanMission,updateUrbanMission} from './public/js/urban-missions.js';
import {worldTravelObjects,portalArrivalPosition} from './server-world-travel.mjs';
import {refreshMzkCoins} from './server-mzk-coins.mjs';
import {resolveBasketballAction} from './public/js/basketball-actions.js';

import {refreshRpgLoot,dropRpgLoot} from './server-rpg-loot.mjs';
import {validateOwnedPlacement} from './owned-item-placement.mjs';
import {ENEMY_BEHAVIORS,stepEnemyCombat} from './server-enemy-combat.mjs';
import {combatStats,damagePlayer,registerParticipant,checkTeamDefeat,matchView,SPAWN_PROTECTION_MS,PLAYER_HIT_CAPACITY} from './rpg-match.mjs';
import {startRadTox,advanceRadTox,nextRadToxLevel,stepRadToxEnemy} from './rad-tox-campaign.mjs';
import {rayBoxDistance} from './server-combat-ray.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {ServerBuilderCollision} from './server-builder-collision.mjs';
import {RANGED_WEAPONS} from './public/js/game-weapons.js';
import {UTILITY_TOOLS} from './public/js/game-utilities.js';
import {compileBuilderScene} from './public/js/builder-gameplay-pipeline.js';
import {buildingDimensions} from './public/js/building-materials.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const copy=value=>JSON.parse(JSON.stringify(value));
const fail=(message,statusCode=400,code)=>{throw Object.assign(new Error(message),{statusCode,code});};
const damageByTool={laser:20,bat:25,taser:8,toxin:12,dynamite:60,flamethrower:15,'pulse-rifle':18,shotgun:35,marksman:45};
export class AuthoritativeRooms {
 constructor({store,now=Date.now,charge=async()=>{},resolveAsset=async()=>null,reward=async()=>{},telemetry=async()=>{},collectLoot=async()=>{throw new Error("Loot storage unavailable.");},collectCoin=async()=>{throw new Error("Coin storage unavailable.");},resolveDestination=null,capacity=32}){Object.assign(this,{store,now,charge,resolveAsset,reward,telemetry,collectLoot,collectCoin,resolveDestination,capacity});this.collision=new ServerBuilderCollision();this.manifestCache=new Map();this.activeWorlds=new Map();this.ticking=false;this.telemetryPending=new Set();this.tickRetryAt=new Map();}
 async tickActive(){
  if(this.ticking)return;this.ticking=true;
  try{const ids=[...this.activeWorlds.keys()].filter(id=>this.now()>=(this.tickRetryAt.get(id)||0));if(!ids.length)return;
   const results=await this.store.updateMany(ids,(room,id)=>{const environment=this.activeWorlds.get(id);if(!environment)return;
    if(!Object.values(room.simulation?.players||{}).some(player=>!player.basketballAI&&!player.replacedByRoom&&this.now()-player.lastSeen<15000)){this.activeWorlds.delete(id);this.tickRetryAt.delete(id);return;}
    this.step(room,environment);
   },{persist:false});
   for(const {id,error}of results)if(error){this.tickRetryAt.set(id,this.now()+1000);console.error('[Room simulation]',id,error.message);}else this.tickRetryAt.delete(id);
  }finally{this.ticking=false;}

 }
 prepareEncounter(sim,environment){
  if(!sim.radTox)return;
  const player=Object.values(sim.players).find(player=>!player.basketballAI&&!player.replacedByRoom&&this.now()-player.lastSeen<15000);
  if(!player)return;
  const occupied=Object.values(sim.actors).filter(actor=>actor.radTox&&actor.spawnVersion===2).map(actor=>actor.position);
  for(const actor of Object.values(sim.actors))if(actor.radTox&&actor.active&&actor.spawnVersion!==2&&this.now()>=(actor.spawnRetryAt||0)){
   const players=Object.values(sim.players).filter(p=>!p.replacedByRoom&&this.now()-p.lastSeen<15000).map(p=>p.position);
   const position=this.collision.encounterSpawn(environment,actor.position,player.position,occupied,{enemy:true,players});
   if(!position){actor.pendingSpawn=true;actor.spawnRetryAt=this.now()+1000;continue;}
   actor.position={x:position.x,y:position.y,z:position.z};actor.pendingSpawn=false;delete actor.spawnRetryAt;
   actor.definition ||= {objectId:actor.id,gameplay:{behavior:'hostile',health:actor.maxHealth||actor.health,damage:6},ai:{detectionRange:40}};
   actor.definition.movement ||= {};actor.definition.position={...actor.position};actor.definition.movement.speed=ENEMY_BEHAVIORS[actor.kind]?.moveSpeed||.9;
   actor.spawnVersion=2;occupied.push(actor.position);
  }
 }
 initialize(room,environment){
  const manifestKey=(isBasketballEnvironment(environment)?'basketball-runtime-v2:':isDedicatedFiringRange(environment)?'firing-range-runtime-v1:':'')+environment.id+':'+(environment.contentUpdatedAt||environment.updatedAt||'')+':'+JSON.stringify(environment.travelPortals||[]);let base=this.manifestCache.get(manifestKey);if(!base){const scene=environment.builderScene||environment.placementScene||{};base=compileBuilderScene({...scene,objects:[...(scene.objects||[]),...worldTravelObjects(environment,this.collision)]});this.manifestCache.set(manifestKey,base);if(this.manifestCache.size>32)this.manifestCache.delete(this.manifestCache.keys().next().value);}const manifest={...base,actors:[...base.actors]};
  room.simulation ||= {version:1,players:{},actors:{},events:[],time:this.now(),sequence:0};
  const sim=room.simulation,contentUpdatedAt=manifestKey;
  if(isCleanCommonsEnvironment(environment)){
   for(const [id,actor]of Object.entries(sim.actors))if(actor.radTox)delete sim.actors[id];
   sim.radTox=null;sim.match=null;sim.projectiles={};
   for(const player of Object.values(sim.players)){player.radToxEnabled=false;player.radToxReady=true;}
  }
  if(!sim.initialized||sim.environmentUpdatedAt!==contentUpdatedAt){
   const authored=new Set(manifest.objects.map(actor=>actor.objectId));for(const [id,actor]of Object.entries(sim.actors))if(!actor.spawned&&!actor.radTox&&!actor.basketballManaged&&!actor.rangeManaged&&!authored.has(id))delete sim.actors[id];

   for(const actor of manifest.objects){if(sim.actors[actor.objectId]){sim.actors[actor.objectId].position=copy(actor.transform.position);sim.actors[actor.objectId].rotation=copy(actor.transform.rotation);sim.actors[actor.objectId].scale=copy(actor.transform.scale);sim.actors[actor.objectId].asset=copy(actor.asset);sim.actors[actor.objectId].modelId=actor.modelId;sim.actors[actor.objectId].worldGateway=actor.gameplay.action==='teleport'&&actor.gameplay.portal?.destinationType==='map'?{destination:actor.gameplay.portal.targetMapId,name:actor.gameplay.prompt||actor.gameplay.portal.targetMapId,ownerName:actor.gameplay.portal.ownerName,deedId:actor.gameplay.portal.deedId,color:actor.gameplay.portal.color}:null;}if(!sim.actors[actor.objectId])sim.actors[actor.objectId]={id:actor.objectId,modelId:actor.modelId,asset:copy(actor.asset),worldGateway:actor.gameplay.action==='teleport'&&actor.gameplay.portal?.destinationType==='map'?{destination:actor.gameplay.portal.targetMapId,name:actor.gameplay.prompt||actor.gameplay.portal.targetMapId,ownerName:actor.gameplay.portal.ownerName,deedId:actor.gameplay.portal.deedId,color:actor.gameplay.portal.color}:null,position:copy(actor.transform.position),rotation:copy(actor.transform.rotation),scale:copy(actor.transform.scale),health:actor.gameplay.health,active:true,open:false,switched:false};}
   for(const definition of manifest.objects)sim.actors[definition.objectId].destructible=definition.gameplay.destructible===true;
   sim.initialized=true;sim.environmentUpdatedAt=contentUpdatedAt;
  }
  if((environment.airport?.enabled||environment.builderScene?.layoutMeta?.harbor)&&sim.radTox){for(const [key,actor]of Object.entries(sim.actors))if(actor.radTox)delete sim.actors[key];sim.radTox=null;sim.match=null;sim.projectiles={};}
  if(environment.airport?.enabled)sim.airport ||= {runwayHolder:null,expires:0};
  for(const definition of manifest.objects){const aircraft=sim.actors[definition.objectId];if(!isAircraft(aircraft))continue;aircraft.maxHealth=AIRCRAFT_HEALTH;if(aircraft.active!==false&&aircraft.flight?.airborne&&!aircraft.holderId)aircraft.unoccupiedSince??=this.now();else delete aircraft.unoccupiedSince;if((aircraft.destroyedAt&&this.now()-aircraft.destroyedAt>=15000)||(aircraft.unoccupiedSince&&this.now()-aircraft.unoccupiedSince>=15000)){Object.assign(aircraft,{position:copy(definition.transform.position),rotation:copy(definition.transform.rotation),health:AIRCRAFT_HEALTH,active:true,holderId:null,flight:{speed:0,phase:'parked',altitude:0,airborne:false}});delete aircraft.destroyedAt;delete aircraft.unoccupiedSince;}}
  for(const definition of manifest.objects){const boat=sim.actors[definition.objectId];if(!isWatercraft(boat))continue;boat.maxHealth??=200;if(boat.destroyedAt&&this.now()-boat.destroyedAt>=15000){Object.assign(boat,{position:copy(definition.transform.position),rotation:copy(definition.transform.rotation),health:200,active:true,holderId:null});stopBoat(boat);delete boat.destroyedAt;}else if(!boat.holderId&&(Math.abs(boat.boating?.speed||0)>.01||Math.abs(boat.boating?.throttleCommand||0)>.01))stopBoat(boat);}
  // Retain native identities for catalog assets, including rooms saved before
  // basketball metadata became part of authoritative actor snapshots.
  for(const actor of manifest.objects){const entity=sim.actors[actor.objectId];if(entity&&!entity.asset)entity.asset=copy(actor.asset);}
  ensureFiringRange(sim,environment,this.now());
  if(isDedicatedFiringRange(environment)){const hostileIds=new Set(manifest.actors.filter(actor=>['hostile','patrol','hazard'].includes(actor.gameplay?.behavior)).map(actor=>actor.objectId));sim.radTox=null;sim.match=null;sim.projectiles={};for(const [id,actor]of Object.entries(sim.actors))if(hostileIds.has(id)||actor.radTox||actor.loot||actor.runtimeMachine||['hostile','patrol','hazard'].includes(actor.definition?.gameplay?.behavior)){delete sim.actors[id];if(sim.devices)delete sim.devices[id];}manifest.actors=manifest.actors.filter(actor=>!['hostile','patrol','hazard'].includes(actor.gameplay?.behavior));}
  if(isBasketballEnvironment(environment)){
   ensureBasketballGame(sim,environment,this.now());sim.radTox=null;sim.match=null;sim.projectiles={};
   for(const [id,actor]of Object.entries(sim.actors))if(actor.radTox||actor.loot||actor.runtimeMachine){delete sim.actors[id];if(sim.devices)delete sim.devices[id];}
   manifest.actors=manifest.actors.filter(actor=>!['hostile','patrol','hazard'].includes(actor.gameplay?.behavior));
  }else{
   if(sim.basketball){delete sim.basketball;for(const [id,actor]of Object.entries(sim.actors))if(actor.basketballManaged)delete sim.actors[id];}
   if(!isDedicatedFiringRange(environment)){this.prepareEncounter(sim,environment);refreshRpgLoot(sim,environment,this.now(),position=>this.collision.safeSpawn(environment,position));}
  }
  const alignmentKey=JSON.stringify(environment.builderScene?.baseTransform||{});
  if(sim.baseAlignmentKey!==alignmentKey){
   for(const [id,actor]of Object.entries(sim.actors))if(actor.loot?.currency==='MZK')delete sim.actors[id];
   sim.coinSites={};sim.coinRetryAt={};
   if(sim.baseAlignmentKey!==undefined&&environment.builderScene)for(const player of Object.values(sim.players)){const entry=this.collision.safeSpawn(environment,manifest.spawn?.position||builderBaseSpawn(environment));player.position={...entry};player.floor=entry.y;player.velocityY=0;player.grounded=true;}
   sim.baseAlignmentKey=alignmentKey;
  }
  if(!sim.basketball&&!isDedicatedFiringRange(environment))refreshMzkCoins(sim,environment,this.now(),(position,occupied)=>environment.builderScene||environment.proceduralLand?this.collision.safeSpawn(environment,position):this.collision.encounterSpawn(environment,position,this.collision.safeSpawn(environment,environment.spawn||{x:0,y:0,z:2}),occupied));
  if(!sim.basketball&&!isDedicatedFiringRange(environment))populateMapMachine(sim,manifest,environment,this.collision,this.now(),room.objects);

  manifest.actors.push(...Object.values(sim.actors).filter(actor=>actor.definition&&(!sim.basketball||!['hostile','patrol','hazard'].includes(actor.definition.gameplay?.behavior))).map(actor=>actor.definition));
  sim.streets=environment.streets||[];sim.mapRevision=environment.atlas?.revision||0;
  return {sim,manifest};
 }
 step(room,environment){
  const {sim,manifest}=this.initialize(room,environment),now=this.now();advanceDevicePlayback(sim,now);if(now-sim.time<33){stepFiringRange(sim,now);if(sim.basketball)stepBasketballGame(sim,now,0);checkTeamDefeat(sim,now);advanceRadTox(sim,now,environment);sim.sequence++;return {sim,manifest};}const dt=clamp((now-sim.time)/1000,0,.25);sim.time=now;
  const half=clamp(environment.builderScene?.mapSize||200,20,2000)/2;const baseBounds=environment.builderScene&&(environment.builderScene.baseEnvironment||environment.builderScene.baseTransform)?this.collision.world(environment).bounds:null;
  for(const player of Object.values(sim.players)){
   if(player.basketballAI)continue;

   if(now-player.lastSeen>15000){for(const key of ['heldId','seatedId','vehicleId']){const actor=sim.actors[player[key]];if(actor?.holderId)actor.holderId=null;player[key]=null;}player.input={};}if(player.health<=0){for(const key of ['heldId','seatedId','vehicleId']){const held=sim.actors[player[key]];if(held?.holderId===player.actorId)held.holderId=null;player[key]=null;}player.input={};continue;}if(player.replacedByRoom||now-player.lastSeen>1000)continue;
   const bench=sim.actors[player.seatedId];if(bench?.basketballSpectatorSeat){player.position={...bench.position};player.floor=bench.position.y;player.velocityY=0;player.grounded=true;player.input={};continue;}
   const input=player.input||{},forward=clamp(input.forward,-1,1),side=clamp(input.side,-1,1),length=Math.max(1,Math.hypot(forward,side));
   const hasGeometry=Boolean(environment.builderScene||environment.proceduralLand||environment.modelUrl||environment.modelUrls?.length);
   const boundControl=(current,target)=>hasGeometry?target:clamp(target,Math.min(current,-half),Math.max(current,half));
   const aircraft=sim.actors[player.vehicleId];
   if(isAircraft(aircraft)&&aircraft.active!==false){
    const groundPoint=this.collision.groundAt(environment,aircraft.position,{actors:sim.actors,objects:room.objects}),ground=(groundPoint?.y||0)+.4;
    const runway=environment.airport?.runway;const onRunway=!runway||(Math.abs(aircraft.position.x-runway.x)<runway.width/2-1&&Math.abs(aircraft.position.z-runway.z)<runway.length/2);const cleared=!sim.airport||(onRunway&&sim.airport.runwayHolder===player.actorId&&sim.airport.expires>now);
    const assistedInput=aircraftAssistedInput(aircraft,input,environment,now);const pose=stepAircraftFlight(aircraft,(player.fuel??100)>0?assistedInput:{...assistedInput,throttle:0},dt,{ground,ceiling:environment.airport?.ceiling||80,half,cleared,blocked:(from,to,yaw)=>{const delta=[to.x-from.x,to.y-from.y,to.z-from.z],span=Math.hypot(...delta);if(span<.001)return false;return [-4.8,0,4.8].some(side=>this.collision.blocksShot(environment,{x:from.x+Math.cos(yaw)*side-Math.sin(yaw)*2.8,y:from.y+.9,z:from.z-Math.sin(yaw)*side-Math.cos(yaw)*2.8},delta.map(n=>n/span),span+.1,sim.actors));}});
    Object.assign(aircraft,pose);player.fuel=Math.max(0,(player.fuel??100)-dt*pose.flight.throttle*.035);aircraft.flight.fuel=player.fuel;if(pose.flight.impactDamage>0)aircraft.health=Math.max(0,aircraft.health-pose.flight.impactDamage);if(aircraft.health<=0){aircraft.active=false;aircraft.destroyedAt=now;aircraft.holderId=null;player.vehicleId=null;player.health=0;player.input={};combatStats(player).deaths++;player.position=this.collision.safeSpawn(environment,environment.spawn||{x:0,y:0,z:0});player.floor=player.position.y;player.velocityY=0;player.grounded=true;player.movementRevision=(player.movementRevision||0)+1;continue;}player.position={...pose.position};player.yaw=pose.rotation.y;player.floor=pose.position.y;player.velocityY=0;player.grounded=!pose.flight.airborne;player.locationName=pose.flight.airborne?'Airport airspace':'Airport apron';
    if(sim.airport?.runwayHolder===player.actorId&&((pose.flight.clearance==='takeoff'&&pose.flight.altitude>5)||(pose.flight.clearance==='landing'&&!pose.flight.airborne&&!onRunway&&pose.flight.speed<.5))){sim.airport.runwayHolder=null;sim.airport.expires=0;}
    continue;
   }
   const boat=sim.actors[player.vehicleId];if(boat?.active===false)player.vehicleId=null;
   if(isWatercraft(boat)&&boat.active!==false){
    const blocked=boatMovementBlocked(environment,boat,sim.actors,this.collision,room.objects);
    const assistedInput=boatAssistedInput(boat,input,environment,now,sim.actors,blocked);const pose=stepBoatSimulation(boat,(player.fuel??100)>0?assistedInput:{...assistedInput,throttle:0},dt,{environment,now,blocked});
    Object.assign(boat,pose);boat.maxHealth??=200;boat.health=Math.max(0,(boat.health??200)-(pose.boating.impactDamage||0));player.fuel=Math.max(0,(player.fuel??100)-dt*Math.abs(pose.boating.throttle)*.02);boat.boating.fuel=player.fuel;
    if(boat.health<=0){boat.active=false;boat.destroyedAt=now;boat.holderId=null;stopBoat(boat);player.vehicleId=null;player.position=this.collision.safeSpawn(environment,environment.spawn||{x:124,y:0,z:30});player.floor=player.position.y;player.velocityY=0;player.grounded=true;player.input={};player.movementRevision=(player.movementRevision||0)+1;continue;}
    player.position={...pose.position,y:.35};player.yaw=pose.rotation.y;player.floor=.35;player.velocityY=0;player.grounded=true;player.locationName=pose.boating.phase==='moored'||pose.boating.anchor?'Neon Marina berth':'Neon Harbor waterways';continue;
   }
   let speed=player.vehicleId?12:harborWaterAt(environment,player.position)?2.8:input.sprint?6:4;
   if(player.seatedId) speed=0;
   const next={...player.position,x:boundControl(player.position.x,player.position.x+(-Math.sin(player.yaw)*forward+Math.cos(player.yaw)*side)*speed*dt/length),z:boundControl(player.position.z,player.position.z+(-Math.cos(player.yaw)*forward-Math.sin(player.yaw)*side)*speed*dt/length)};

   const floor=hasGeometry?-100:Number(player.floor)||0;
   if(input.jump&&player.grounded){player.velocityY=6;player.grounded=false;}
   player.velocityY=(player.velocityY||0)-18*dt;next.y=Math.max(floor,next.y+player.velocityY*dt);player.grounded=next.y<=floor;if(player.grounded)player.velocityY=0;
   // One swept resolver handles map geometry and placed solids together.
   // A wall removes only the blocked control component; it never ejects the
   // player or cancels a valid slide along its surface.
   const resolved=this.collision.resolve(environment,player.position,next,sim.actors,room.objects);
   // Native resolvers explicitly report missing support as null. A custom
   // horizontal-only resolver keeps the legacy flat floor until it supplies
   // its own support data; this must not pin real elevated platforms.
   const ownsSupport=Object.hasOwn(resolved,'floorY');
   const floorY=ownsSupport?resolved.floorY:Number(player.floor)||0,blockedCeiling=resolved.blockedCeiling;
   if(!ownsSupport&&resolved.y<floorY)resolved.y=floorY;
   delete resolved.floorY;delete resolved.blockedCeiling;
   player.position=constrainFiringRangePlayer(player.position,constrainBasketballSpectator(player.position,resolved,sim,player),sim,player);
   if(Number.isFinite(floorY)){
    player.floor=floorY;
    if(player.position.y<=floorY+.001&&player.velocityY<=0){player.grounded=true;player.velocityY=0;}
   }
   if(blockedCeiling&&player.velocityY>0)player.velocityY=0;
   const street=(environment.streets||[]).map(street=>{const dx=street.to.x-street.from.x,dz=street.to.z-street.from.z,t=Math.max(0,Math.min(1,((player.position.x-street.from.x)*dx+(player.position.z-street.from.z)*dz)/Math.max(.01,dx*dx+dz*dz)));return {street,distance:Math.hypot(player.position.x-street.from.x-dx*t,player.position.z-street.from.z-dz*t)};}).filter(hit=>hit.distance<=hit.street.width/2+2).sort((a,b)=>a.distance-b.distance)[0];player.locationName=street?.street.name||player.meetingName||environment.name;
   updateUrbanMission(player,now);

   if(player.vehicleId){const vehicle=sim.actors[player.vehicleId];if(vehicle){vehicle.position={...player.position,...(isWatercraft(vehicle)?{y:0}:{})};vehicle.rotation.y=player.yaw;}}
   if(player.heldId){const held=sim.actors[player.heldId];if(held)held.position={x:player.position.x-Math.sin(player.yaw),y:player.position.y+1,z:player.position.z-Math.cos(player.yaw)};}
  }
  const active=Object.values(sim.players).filter(player=>player.radToxReady!==false&&player.radToxEnabled!==false&&!player.replacedByRoom&&now-player.lastSeen<15000&&player.health>0&&now>=(player.spawnProtectedUntil||0)&&!firingRangeLocationAt(sim.firingRange?.locations,player.position));
  for(const definition of sim.match?.state==='finished'?[]:manifest.actors){const actor=sim.actors[definition.objectId];if(!actor?.active||actor.pendingSpawn||actor.health<=0||actor.holderId)continue;
   if(actor.radTox){stepRadToxEnemy(sim,actor,active,now,dt,(origin,ray,span)=>this.collision.blocksShot(environment,origin,ray,span,sim.actors),(previous,next)=>this.collision.resolve(environment,previous,next,sim.actors),false);continue;}
   const kind=definition.gameplay.behavior;
   if(kind==='hostile'||kind==='patrol'){
    const target=active.slice().sort((a,b)=>distance(actor.position,a.position)-distance(actor.position,b.position))[0];
    const chase=kind==='hostile'&&target&&distance(actor.position,target.position)<clamp(definition.ai?.detectionRange||9,1,50);
    const goal=chase?target.position:{x:definition.position.x+Math.sin(now/1000)*3,y:definition.position.y,z:definition.position.z+Math.cos(now/1000)*3};
    const span=distance(actor.position,goal),step=Math.min(1,dt*clamp(definition.movement.speed||2,0,10)/Math.max(.001,span));if(!actor.radTox||!['ghost','brain','boss'].includes(actor.kind)||span>3){const next={...actor.position,x:actor.position.x+(goal.x-actor.position.x)*step,z:actor.position.z+(goal.z-actor.position.z)*step};actor.position=this.collision.resolve(environment,actor.position,next,sim.actors);delete actor.position.floorY;}actor.rotation.y=Math.atan2(goal.x-actor.position.x,goal.z-actor.position.z);
    if(!actor.radTox&&chase&&span<1.5&&now-(actor.lastAttack||0)>1000){if(definition.gameplay.damage>0)damagePlayer(target,now);actor.lastAttack=now;}
   }
   if(kind==='hazard')for(const target of active)if(distance(target.position,actor.position)<1.5&&now-(actor.lastAttack||0)>1000){if(definition.gameplay.damage>0)damagePlayer(target,now);actor.lastAttack=now;}
  }
  for(const actor of Object.values(sim.actors)){
   if(isBasketball(actor)&&actor.holderId){const holder=sim.players[actor.holderId];if(holder)actor.position={x:holder.position.x-Math.sin(holder.yaw)*.65,y:holder.position.y+1,z:holder.position.z-Math.cos(holder.yaw)*.65};}
   if(!sim.basketball){const previous=isBasketball(actor)&&!actor.holderId&&actor.ballVelocity?{...actor.position}:null;stepBasketball(actor,dt);if(previous)actor.ballCatchSegment={from:previous,to:{...actor.position},at:now};}
  }
  stepFiringRange(sim,now);
  if(sim.basketball)stepBasketballGame(sim,now,dt);
  else if(!isDedicatedFiringRange(environment))stepEnemyCombat(sim,{now,dt,environment,collision:this.collision});

  checkTeamDefeat(sim,now);advanceRadTox(sim,now,environment);
  this.prepareEncounter(sim,environment);
  sim.sequence++;return {sim,manifest};
 }
 view(room){const sim=room.simulation,now=this.now();return {authoritative:true,airport:sim.airport?{runwayHolder:sim.airport.runwayHolder||null,expires:sim.airport.expires||0}:null,building:buildingPolicy(room),firingRange:sim.firingRange?copy(sim.firingRange):null,basketball:sim.basketball?copy(sim.basketball):null,match:matchView(sim,now),radTox:sim.radTox?copy(sim.radTox):null,projectiles:sim.projectiles||{},streets:sim.streets||[],mapRevision:sim.mapRevision||0,serverTime:now,simulationTime:sim.time,sequence:sim.sequence,objects:room.objects,actors:sim.actors,devices:projectArcadeDevices(sim.devices||{}),players:Object.fromEntries(Object.entries(sim.players).filter(([,p])=>now-p.lastSeen<15000).map(([id,p])=>[id,{id,username:p.username,locationName:p.locationName,modelUrl:p.modelUrl,position:p.position,movementRevision:p.movementRevision||0,radToxReady:p.radToxReady!==false,radToxEnabled:p.radToxEnabled!==false,input:{...p.input,yaw:p.yaw},yaw:p.yaw,health:p.health,hitsRemaining:Math.round(p.health*PLAYER_HIT_CAPACITY/100),spawnProtectedUntil:p.spawnProtectedUntil||0,combat:combatStats(p),ammo:p.ammo??120,fuel:p.fuel??100,score:p.score,urbanMission:p.urbanMission||null,stats:{...p.stats,health:p.health},inventory:p.inventory,quests:p.quests,progress:p.progress||{},heldId:p.heldId,basketballAI:Boolean(p.basketballAI),basketballNumber:p.basketballNumber||null,basketballRole:p.basketballRole||'player',basketballTeam:p.basketballTeam||null,basketballJersey:p.basketballJersey||null,basketballPoints:p.basketballPoints||0,basketballStealAt:p.basketballStealAt??null,firingRangeRole:p.firingRangeRole||null,firingRangeLane:p.firingRangeLane??null,seatedId:p.seatedId,vehicleId:p.vehicleId,vehicleSeat:isAircraft(sim.actors[p.vehicleId])?'cockpit':isWatercraft(sim.actors[p.vehicleId])?'helm':null,grounded:p.grounded}])),events:sim.events.slice(-30)};}
 snapshot(id,environment){return this.store.update(id,room=>{this.step(room,environment);return this.view(room);},{persist:false,roomOnly:true});}
 command(id,environment,identity,command){const requestedAction=command.action;this.activeWorlds.set(id,environment);return this.store.update(id,async (room,allRooms)=>{
  const {sim,manifest}=this.step(room,environment),now=this.now(),actorId='account:'+identity.accountId;
  const requestId=String(command.requestId||'');if(!/^[\w-]{1,100}$/.test(requestId))fail('A command request ID is required.');
  sim.receipts ||= {};const receiptKey=actorId+':'+requestId;if(sim.receipts[receiptKey]){if(sim.receipts[receiptKey].action!==requestedAction)fail('Request ID already used.',409);return {...this.view(room),selfId:actorId,result:sim.receipts[receiptKey].result};}
  let player=sim.players[actorId],result={};const priorCommandPosition=player?{...player.position}:null,priorMovementRevision=player?.movementRevision||0;const basketballLateArrival=sim.basketball?.state==='live'&&(!player||player.basketballRole==='spectator'||now-player.lastSeen>=15000||player.replacedByRoom);
  const rangeWasActive=Boolean(player&&!player.replacedByRoom&&now-player.lastSeen<15000);
  if(command.action==='join'){
   const active=Object.entries(sim.players).filter(([id,p])=>id!==actorId&&!p.basketballAI&&now-p.lastSeen<15000);if(active.length>=(environment.publicDestination?128:this.capacity))fail('This multiplayer room is full.',409);
   let travel=null,travelSource=null;
   if(command.travelToken){
    travelSource=allRooms[String(command.travelFrom||'')]?.simulation?.players[actorId];const pending=travelSource?.pendingTravel;
    if(pending?.token===command.travelToken&&pending.to===id&&pending.expiresAt>=now)travel=pending;
    else if(!(player?.lastPortalArrival?.token===command.travelToken&&player.lastPortalArrival.from===command.travelFrom&&player.lastPortalArrival.expiresAt>=now))fail('This portal trip has expired. Enter the portal again.',409,'PORTAL_TRIP_EXPIRED');
   }
   const meeting=command.meetingId&&(environment.meetingPoints||[]).find(point=>point.id===command.meetingId);if(command.meetingId&&!meeting)fail('Shared meeting point not found.',404);let spawn=meeting?this.collision.meetingPosition(environment,meeting.position,sim.actors,room.objects):this.collision.safeSpawn(environment,manifest.spawn?.position||builderBaseSpawn(environment)||environment.spawn||{x:0,y:0,z:2});
   if(travel)spawn=portalArrivalPosition(environment,manifest,travel.from,this.collision,sim.actors,room.objects);
   if(player&&player.floorVersion!==4&&!meeting){player.position={...spawn};player.floor=spawn.y;player.velocityY=0;player.floorVersion=4;player.grounded=true;player.movementRevision=(player.movementRevision||0)+1;for(const key of ['heldId','seatedId','vehicleId']){const attached=sim.actors[player[key]];if(attached?.holderId===actorId)attached.holderId=null;player[key]=null;}}
   if(!player&&!meeting&&!travel){const count=active.length;spawn=this.collision.safeSpawn(environment,sim.basketball?{x:-5.25+(count%8)*1.5,y:0,z:7.5-Math.floor(count/8)}:{...spawn,x:spawn.x+(count%4)*1.2,z:spawn.z+Math.floor(count/4)*1.2});}
   if(!player)player=sim.players[actorId]={username:identity.username,position:{x:Number(spawn.x)||0,y:Number(spawn.y)||0,z:Number(spawn.z)||0},floor:Number(spawn.y)||0,floorVersion:4,yaw:0,velocityY:0,grounded:true,ammo:120,fuel:100,health:clamp(identity.stats?.health??100,0,100),stats:identity.stats||{},score:0,inventory:[],quests:{},cooldowns:{},lastSeen:now};
   for(const [otherId,otherRoom]of Object.entries(allRooms)){if(otherId===id)continue;const previous=otherRoom.simulation?.players[actorId];if(!previous)continue;previous.lastSeen=0;previous.replacedByRoom=id;previous.input={};for(const key of ['heldId','seatedId','vehicleId']){const held=otherRoom.simulation.actors[previous[key]];if(held)held.holderId=null;previous[key]=null;}}
   if(travel){player.lastPortalArrival=travel;delete travelSource.pendingTravel;}
   if(meeting||travel){player.position={...spawn};player.floor=spawn.y;player.velocityY=0;player.grounded=true;}player.input={};player.inputEpoch=randomUUID();player.lastInputSequence=-1;player.username=identity.username;player.modelUrl=identity.avatar?.modelUrl||null;player.lastSeen=now;player.replacedByRoom=null;player.walletId=identity.walletId;player.meetingName=meeting?.name||environment.name;player.locationName=player.meetingName;player.actorId=actorId;
   if(environment.airport?.enabled||environment.builderScene?.layoutMeta?.harbor||isCleanCommonsEnvironment(environment)){player.radToxEnabled=false;player.radToxReady=true;}
   if(sim.basketball){player.health=100;if(basketballLateArrival)watchBasketballGame(sim,player,now);else assignBasketballTeam(sim,player,now);}else if(!isDedicatedFiringRange(environment)&&!isCleanCommonsEnvironment(environment)){player.radToxReady=command.deferRadTox!==true;if(typeof command.radToxEnabled==='boolean')player.radToxEnabled=command.radToxEnabled;if(player.radToxEnabled!==false){startRadTox(sim,environment,now,player.position);if(player.radToxReady)registerParticipant(sim,actorId,player,now);}}
   if(sim.firingRange){if(isDedicatedFiringRange(environment))player.health=100;registerFiringRangeArrival(sim,player,now,rangeWasActive);}
   room.building ||=buildingPolicy(room,environment);if(!room.building.hostId||!sim.players[room.building.hostId]||now-sim.players[room.building.hostId].lastSeen>=15000)room.building.hostId=actorId;
   result.message='Joined '+player.locationName;result.inputEpoch=player.inputEpoch;
  }else{
   if(player?.replacedByRoom)fail('This account joined another destination. Reload to rejoin this room.',409,'ROOM_SWITCHED');if(!player||now-player.lastSeen>15000)fail('Join this room before sending gameplay commands.',409,'ROOM_JOIN_REQUIRED');
   player.lastSeen=now;player.username=identity.username;player.modelUrl=identity.avatar?.modelUrl||null;
   if(player.radToxReady===false&&command.action==='fire')fail('Finish loading RAD-TOX before firing.',409,'GAME_NOT_READY');
   if(requestedAction==='basketball-auto'){
    requireBasketballPlayer(sim,player);if(player.health<=0)fail('Respawn before acting.',409);
    const options=basketballLaunchOptions(Object.fromEntries(['power','angle','mode'].filter(key=>command[key]!==undefined).map(key=>[key,command[key]])));
    const direction=command.direction===undefined?[-Math.sin(player.yaw||0),0,-Math.cos(player.yaw||0)]:command.direction;
    basketballShotSolution({x:0,y:0,z:0},null,direction,{...options,mode:'manual'});
    const selection=resolveBasketballAction({game:sim.basketball,player,players:sim.players,balls:Object.values(sim.actors),direction,options,now,visible:(from,to,target)=>{
     const span=distance(from,to),actors=isBasketball(target)?{...sim.actors,[target.id]:{...target,holderId:actorId}}:sim.actors;
     return span<.05||!this.collision.blocksShot(environment,from,[(to.x-from.x)/span,(to.y-from.y)/span,(to.z-from.z)/span],span,actors);
    }});
    result.resolvedAction=selection.action;result.actionLabel=selection.label;
    command={...command,...selection.fields,action:selection.action||'basketball-wait'};
   }
   if(command.action==='input'){const input=command.input||{},inputSequence=command.inputSequence;if(inputSequence!==undefined&&(!Number.isSafeInteger(inputSequence)||inputSequence<0))fail('Invalid input sequence.',422);if((command.inputEpoch===undefined||command.inputEpoch===player.inputEpoch)&&(inputSequence===undefined||inputSequence>(player.lastInputSequence??-1))){if(inputSequence!==undefined)player.lastInputSequence=inputSequence;player.input=player.health<=0?{}:{forward:clamp(input.forward,-1,1),side:clamp(input.side,-1,1),lift:clamp(input.lift,-1,1),...(Number.isFinite(input.throttle)?{throttle:clamp(input.throttle,isWatercraft(sim.actors[player.vehicleId])?-1:0,1)}:{}),...(typeof input.gear==='boolean'?{gear:input.gear}:{}),...(Number.isFinite(input.flaps)?{flaps:clamp(input.flaps,0,1)}:{}),brake:input.brake===true,...(typeof input.anchor==='boolean'?{anchor:input.anchor}:{}),...(Number.isFinite(input.sailTrim)?{sailTrim:clamp(input.sailTrim,0,1)}:{}),rudder:clamp(input.rudder,-1,1),jump:input.jump===true,sprint:input.sprint===true};player.yaw=clamp(input.yaw,-Math.PI*100,Math.PI*100);}}
   else if(command.action==='range-ready'||isDedicatedFiringRange(environment)&&['start-rad-tox','next-rad-tox'].includes(command.action)){if(!sim.firingRange)fail('This map has no live firing range.',409);result.message='Firing range ready. Choose Quick practice, join a lane, or watch the live range.';}
   else if(command.action==='range-practice'){startFiringRangePractice(sim,player,now,command);result.message='Open practice is live. Join any free lane; training ammunition is free.';}
   else if(command.action==='range-join'){joinFiringRange(sim,player,now,command);result.message='Lane selected. Training ammunition is free.';}
   else if(command.action==='range-watch'){watchFiringRange(sim,player,now);result.message='Watching the live firing range from the safe lobby.';}
   else if(command.action==='range-settings'){configureFiringRange(sim,player,command.settings,now);result.message='Shared firing range settings updated.';}
   else if(command.action==='range-start'){startFiringRange(sim,player,now);result.message='Range tournament starting. Get ready.';}
   else if(command.action==='range-stop'){stopFiringRange(sim,player,now);result.message='Range tournament completed. Shared results are ready.';}

   else if(command.action==='basketball-wait'){result.message=result.actionLabel||'Move closer to the basketball or its carrier.';}
   else if(command.action==='basketball-jersey'){
    if(command.team!==null&&!['home','away'].includes(command.team))fail('Choose the Home or Away jersey.',400);
    if(command.team&&sim.basketball)assignBasketballTeam(sim,player,now,command.team);player.basketballJersey=command.team;result.message=command.team?(command.team==='home'?'Home':'Away')+' jersey equipped.':'Basketball jersey removed.';
   }
   else if(command.action==='basketball-settings'){configureBasketballGame(sim,command.settings,now);result.message='Shared basketball settings updated.';}
   else if(command.action==='basketball-watch'){watchBasketballGame(sim,player,now);result.message='Watching from the sideline. Choose a side before the next game.';}
   else if(command.action==='basketball-steal'){const ball=stealBasketball(sim,player,now,{visible:(from,to)=>{const origin={...from.position,y:from.position.y+1},target={...to.position,y:to.position.y+1},span=distance(origin,target);return span<.05||!this.collision.blocksShot(environment,origin,[(target.x-origin.x)/span,(target.y-origin.y)/span,(target.z-origin.z)/span],span,sim.actors);}});result.caughtId=ball.id;result.message='Basketball stolen.';}
   else if(command.action==='basketball-join-spot'){takeBasketballSpot(sim,player,now,command.team);result.message='Player spot joined.';}

   else if(command.action==='basketball-team'){if(!sim.basketball)fail('Enter Basketball Arena to choose a team.',409);assignBasketballTeam(sim,player,now,command.team);result.message=(player.basketballTeam==='home'?'Home':'Away')+' team selected.';}
   else if(command.action==='basketball-start'){startBasketballGame(sim,now);result.message='Tip-off! The shared basketball game has started.';}
   else if(command.action==='basketball-shoot'){const ball=shootBasketball(sim,player,now,Object.fromEntries(['power','angle','mode','direction'].filter(key=>command[key]!==undefined).map(key=>[key,command[key]])));result.message=ball.basketballShot.aimMiss?'Aim miss: outside 13% hoop alignment. Line up with the net.':'Shot released!';}
   else if(sim.basketball&&['start-rad-tox','next-rad-tox'].includes(command.action))fail('Basketball Arena runs shared basketball games.',409);
   else if(command.action==='harbor-radio'){result.message=harborRadio(sim,player,environment,command.operation);}
   else if(command.action==='vehicle-action'){
    const vehicle=sim.actors[player.vehicleId],mode=command.mode||'auto';
    if(!isAircraft(vehicle)&&!isWatercraft(vehicle))fail('Enter an aircraft or boat to use Auto.',409);
    const next=mode==='auto'?resolveVehicleAction({vehicle,environment,actors:sim.actors}):{action:mode,enabled:true};
    if(!next.enabled||!next.action)fail(next.reason||'This vehicle action is unavailable.',409);
    result.vehicleAction={mode,action:next.action,label:next.label||next.action};
    result.message=isAircraft(vehicle)?startAircraftAssist(sim,player,environment,next.action,now,this.collision,room.objects):startBoatAssist(sim,player,environment,next.action,now,{destinationId:command.destinationId,collision:this.collision,objects:room.objects});
   }
   else if(command.action==='aircraft-assist'){result.message=startAircraftAssist(sim,player,environment,command.operation,now,this.collision,room.objects);}
   else if(command.action==='airport-radio'){result.message=airportRadio(sim,player,actorId,command.operation,now,environment);}
   else if(command.action==='rad-tox-toggle'){player.radToxEnabled=!isCleanCommonsEnvironment(environment)&&command.enabled===true;result.message=player.radToxEnabled?'RAD-TOX enabled.':'RAD-TOX disabled.';}
   else if(command.action==='start-rad-tox'){if(startRadTox(sim,environment,now,player.position)){const loading=player.radToxReady===false;player.radToxReady=true;player.radToxEnabled=true;registerParticipant(sim,actorId,player,now);if(loading)player.spawnProtectedUntil=now+SPAWN_PROTECTION_MS;result.message='RAD-TOX encounter active.';}else result.message='Builder gameplay active.';}
   else if(command.action==='next-rad-tox'){if(sim.radTox?.transition&&now<sim.radTox.transition.at)fail('The next round starts after the results countdown.',409);if(nextRadToxLevel(sim,environment,now,command.matchId)){for(const [index,participantId] of Object.keys(sim.match.participants).entries()){const participant=sim.players[participantId],entry=environment.spawn||{x:0,y:0,z:2};participant.position=this.collision.safeSpawn(environment,{...entry,x:entry.x+(index%4)*1.2,z:entry.z+Math.floor(index/4)*1.2});participant.floor=participant.position.y;participant.velocityY=0;participant.grounded=true;participant.shieldUntil=0;participant.input={};participant.toolReady={};participant.toolUses={};}result.message='Next shared level started.';}else if(sim.match?.id===command.matchId)fail('Complete the current level before starting another.',409);}
   else if(sim.match?.state==='finished'&&!['input','interact'].includes(command.action))fail('This level has ended. Review the results and start the next level.',409);
   else if(command.action==='respawn'){if(player.health>0)fail('Respawn is available after defeat.',409);player.position={...this.collision.safeSpawn(environment,manifest.spawn?.position||builderBaseSpawn(environment)||environment.spawn||{x:0,y:0,z:2})};player.floor=player.position.y;player.velocityY=0;player.grounded=true;player.health=100;player.ammo=120;player.fuel=100;player.input={};player.toolReady={};player.toolUses={};player.shieldUntil=0;player.spawnProtectedUntil=now+SPAWN_PROTECTION_MS;player.contributors={};}
   else if(player.health<=0&&command.action!=='interact')fail('Respawn before acting.',409);
   else if(command.action==='map-access'){
    if(player.seatedId||player.vehicleId)fail('Exit your seat or land and leave your vehicle before map travel.',409);
    if(command.entityId){
     if(!environment.airport?.enabled&&!environment.builderScene?.layoutMeta?.harbor)fail('Direct craft boarding is unavailable here.',409);
     const target=manifest.actors.find(a=>a.objectId===command.entityId&&a.gameplay.behavior==='vehicle'),entity=sim.actors[command.entityId];
     if(!target||!entity||entity.active===false||(!isAircraft(entity)&&!isWatercraft(entity)))fail('This craft is unavailable.',409);
     if(entity.holderId&&entity.holderId!==actorId)fail('Another player is using this craft.',409);
     if(isAircraft(entity)&&entity.flight?.airborne)fail('Wait until this aircraft has landed.',409);
     entity.holderId=actorId;player.vehicleId=entity.id;player.position={...entity.position,y:isWatercraft(entity) ? .35 : entity.position.y};player.yaw=entity.rotation?.y||0;
     result.message='Boarded '+(target.name||'craft')+'. You are in the shared live room.';
    }else if(command.position){
     if(!['x','z'].every(axis=>Number.isFinite(command.position[axis])))fail('Choose a valid point on this map.',422);
     const floor=this.collision.groundAt(environment,{x:command.position.x,y:player.position.y,z:command.position.z},{entry:true,actors:sim.actors,objects:room.objects});
     if(!floor||environment.builderScene?.layoutMeta?.harbor&&floor.y<-.05)fail('Choose clear land or a pier instead of water.',409);
     const arrival=this.collision.teleportPosition(environment,player.position,floor,sim.actors,room.objects,{localMap:true});
     if(player.basketballRole==='spectator'&&basketballSpectatorRestricted(arrival,sim))fail('Choose a spectator area outside the court.',409);
     player.position=arrival;result.message='Teleported to the selected floor.';
    }else{
     const place=localMapLocations(environment).find(location=>location.id===command.locationId);
     if(!place)fail('Choose a listed map location.',422);
     const base={x:place.arrival?.x??place.x,y:place.arrival?.y??place.y??0,z:place.arrival?.z??place.z};
     const candidates=[base];for(const radius of [2,4,6,8,10,12])for(let step=0;step<8;step++)candidates.push({...base,x:base.x+Math.cos(step*Math.PI/4)*radius,z:base.z+Math.sin(step*Math.PI/4)*radius});
     let arrival=null;for(const candidate of candidates){try{const point=this.collision.meetingPosition(environment,candidate,sim.actors,room.objects);if(environment.builderScene?.layoutMeta?.harbor&&point.y<-.05)continue;arrival=point;break;}catch{}}if(!arrival)fail('This location has no clear landing. Choose another location.',409);if(player.basketballRole==='spectator'&&basketballSpectatorRestricted(arrival,sim))fail('Choose a spectator area outside the court.',409);player.position=arrival;result.message='Arrived at '+place.name+'.';
    }
    player.floor=player.position.y;player.velocityY=0;player.grounded=true;player.input={};player.movementRevision=(player.movementRevision||0)+1;
   }
   else if(command.action==='teleport-floor'){
    if(player.seatedId||player.vehicleId)fail('Leave the seat or vehicle before teleporting.',409);
    if(player.basketballRole==='spectator'&&sim.basketball?.state==='live'){if(!command.position||!['x','y','z'].every(axis=>Number.isFinite(command.position[axis])))fail('Choose a valid spectator floor position.',422);const accepted=constrainBasketballSpectator(player.position,command.position,sim,player);if(basketballSpectatorRestricted(command.position,sim)||distance(accepted,command.position)>.01)fail('Spectators can teleport between the stands and benches outside the active court.',409);}
    player.position=this.collision.teleportPosition(environment,player.position,command.position,sim.actors,room.objects);
    player.floor=player.position.y;player.velocityY=0;player.grounded=true;player.input={};player.movementRevision=(player.movementRevision||0)+1;
    result.message='Teleported to the selected floor.';
   }
   else if(command.action==='toss'){
    requireBasketballPlayer(sim,player);
    const ball=sim.actors[player.heldId];if(!isBasketball(ball))fail('Hold a basketball before tossing.',409);
    const pitch=clamp(command.pitch,-1.25,1.15),direction={x:-Math.sin(player.yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(player.yaw)*Math.cos(pitch)};
    const tuning=['power','angle','mode'].some(key=>command[key]!==undefined)?Object.fromEntries(['power','angle','mode'].filter(key=>command[key]!==undefined).map(key=>[key,command[key]])):undefined;
    if(!tossBasketball(ball,player.position,command.direction||direction,tuning))fail('Choose a valid basketball aim direction.',422);registerBasketballRelease(sim,ball,player,now);player.heldId=null;result.message=requestedAction==='basketball-auto'&&/^pass\b/i.test(result.actionLabel)?'Basketball passed.':'Basketball tossed — E to catch nearby.';
   }
   else if(command.action==='catch'){
    requireBasketballPlayer(sim,player);
    if(player.heldId)fail('Release the held item before catching.',409);
    const hand={x:player.position.x,y:player.position.y+1,z:player.position.z};
    const nearby=Object.values(sim.actors).filter(actor=>!command.entityId||actor.id===command.entityId).map(ball=>({ball,catch:basketballCatchPosition(ball,player.position,{now})})).filter(hit=>hit.catch).sort((a,b)=>a.catch.distance-b.catch.distance);
    const hit=nearby.find(({ball,catch:reach})=>{const target={...reach.position,y:reach.position.y+.12},span=distance(hand,target);return span<.05||!this.collision.blocksShot(environment,hand,[(target.x-hand.x)/span,(target.y-hand.y)/span,(target.z-hand.z)/span],span,{...sim.actors,[ball.id]:{...ball,holderId:actorId}});});
    if(!hit)fail('Move within 3 metres of a visible basketball to catch it.',409);
    const ball=hit.ball;ball.holderId=actorId;delete ball.ballVelocity;delete ball.ballCatchSegment;player.heldId=ball.id;ball.position={x:player.position.x-Math.sin(player.yaw)*.65,y:player.position.y+1,z:player.position.z-Math.cos(player.yaw)*.65};touchBasketball(sim,ball,player,now);result.caughtId=ball.id;result.rewound=hit.catch.rewound;result.message='Basketball caught — T to toss.';
   }
   else if(command.action==='drop'){const held=sim.actors[player.heldId];if(held){held.holderId=null;held.position={...player.position};player.heldId=null;}}
   else if(command.action==='collect'){await this.collectNearbyLoot(sim,player,identity,id,now,command.entityId,result);}
   else if(command.action==='interact'){
    if(command.entityId&&isBasketball(sim.actors[command.entityId]))requireBasketballPlayer(sim,player);
    if(player.vehicleId){if(isAircraft(sim.actors[player.vehicleId])&&sim.actors[player.vehicleId].flight?.airborne)fail('Land the aircraft before exiting.',409);const vehicle=sim.actors[player.vehicleId];if(isAircraft(vehicle)){if(Math.max(vehicle.flight?.speed||0,vehicle.flight?.airspeed||0)>2.5)fail('Brake or use Land assistance before leaving the cockpit.',409);player.position=aircraftExitPosition(environment,vehicle,this.collision,sim.actors,room.objects);player.floor=player.position.y;player.velocityY=0;player.grounded=true;player.input={};player.movementRevision=(player.movementRevision||0)+1;vehicle.flight={...vehicle.flight,assist:null,assistStage:null,speed:0,airspeed:0,throttle:0,throttleCommand:0,brake:1};vehicle.rotation.x=vehicle.rotation.z=0;if(sim.airport?.runwayHolder===actorId){sim.airport.runwayHolder=null;sim.airport.expires=0;}}if(isWatercraft(vehicle)){if(Math.abs(vehicle.boating?.speed||0)>1.5)fail('Slow or anchor the boat before leaving.',409);player.position=boatExitPosition(environment,vehicle,this.collision,sim.actors,room.objects);player.floor=player.position.y;player.velocityY=0;player.input={};player.movementRevision=(player.movementRevision||0)+1;stopBoat(vehicle);}vehicle.holderId=null;player.vehicleId=null;}
    else if(player.seatedId){sim.actors[player.seatedId].holderId=null;player.seatedId=null;}
    else{
     const target=manifest.actors.filter(a=>(!command.entityId||a.objectId===command.entityId)&&(!['hostile','patrol','decor'].includes(a.gameplay.behavior)||(a.gameplay.action&&a.gameplay.action!=='none'))&&sim.actors[a.objectId]?.active&&(command.entityId||!sim.actors[a.objectId].basketballSpectatorSeat||!sim.actors[a.objectId].holderId||sim.actors[a.objectId].holderId===actorId)&&distance(sim.actors[a.objectId].position,player.position)<=Math.min(a.modelId==='harbor-yacht'?24:5,a.gameplay.interactionDistance)).sort((a,b)=>distance(sim.actors[a.objectId].position,player.position)-distance(sim.actors[b.objectId].position,player.position))[0];
     if(!target)fail('No usable item is within reach.',409);const entity=sim.actors[target.objectId],config=target.gameplay;
     if(isBasketball(entity))requireBasketballPlayer(sim,player);
     if(config.action!=='teleport'||config.portal?.destinationType!=='map'){if(player.radToxEnabled!==false&&sim.match?.state==='finished')fail('This level has ended.',409);if(player.health<=0)fail('Respawn before acting.',409);}
     if(entity.holderId&&entity.holderId!==actorId)fail('Another player is using this item.',409);
     if(now-(player.cooldowns[target.objectId]||0)<config.cooldown*1000)fail('Item is cooling down.',429);player.cooldowns[target.objectId]=now;
     if(deviceDefinition(target.modelId,config)){Object.assign(result,deviceCommand(sim,manifest,player,actorId,{entityId:entity.id,operation:'open'},now));}
     else if(basketballJerseyTeam(entity)||basketballJerseyTeam(target)){const team=basketballJerseyTeam(entity)||basketballJerseyTeam(target);if(sim.basketball)assignBasketballTeam(sim,player,now,team);player.basketballJersey=team;result.message=(team==='home'?'Home':'Away')+' basketball jersey equipped.';}

     else if(config.behavior==='door')entity.open=!entity.open;
     else if(config.behavior==='switch')entity.switched=!entity.switched;
     else if(['pickup','hold'].includes(config.behavior)){if(player.heldId)fail('Drop the held item first.',409);player.heldId=entity.id;entity.holderId=actorId;delete entity.ballVelocity;touchBasketball(sim,entity,player,now);if(!player.inventory.includes(target.modelId))player.inventory.push(target.modelId);result.pickup={id:entity.id+':'+now,kind:'item'};const collected=combatStats(player).itemsCollected ||= [];if(!collected.includes(target.modelId))collected.push(target.modelId);}
     else if(config.behavior==='vehicle'){if(player.basketballRole==='spectator'&&sim.basketball?.state==='live')fail('Spectators can use the stands and benches while the court is active.',409);if(isAircraft(entity)&&entity.flight?.airborne)fail('Wait until this aircraft has landed before boarding.',409);player.vehicleId=entity.id;entity.holderId=actorId;if(isAircraft(entity)){player.position={...entity.position};player.movementRevision=(player.movementRevision||0)+1;}if(isWatercraft(entity)){player.position={...entity.position,y:.35};player.floor=.35;player.velocityY=0;player.grounded=true;player.movementRevision=(player.movementRevision||0)+1;}}
     else if(config.behavior==='seat'){if(player.basketballRole==='spectator'&&basketballSpectatorRestricted(entity.position,sim))fail('Spectators can sit on benches outside the active court.',409);player.seatedId=entity.id;entity.holderId=actorId;player.position={...entity.position};}
     else if(config.behavior==='heal')player.health=Math.min(100,player.health+clamp(config.value||25,0,100));
     else if(config.behavior==='hazard')entity.active=false;
     else if(config.urbanMission)result.message=startUrbanMission(player,{...config.urbanMission,checkpoints:(config.urbanMission.checkpoints||[]).map(point=>point.objectId?{...point,x:sim.actors[point.objectId]?.position.x,z:sim.actors[point.objectId]?.position.z}:point)},now);
     else if(config.behavior==='quest')result.message=questInteraction(player,config.quest||target.quest,entity.id);
     result.message=result.message||target.dialogue?.text||config.prompt||'Item activated';
     if(config.action==='toggle')entity.switched=!entity.switched;if(config.action==='use')entity.lastUsedAt=now;
     if(config.action==='damage'&&config.value>0)damagePlayer(player,now);
     if(config.action==='score')player.score+=clamp(config.value,0,100);
     if(config.action==='teleport'){const portal=config.portal;if(!portal?.enabled)fail('Portal is locked.',409);if(portal.destinationType==='map'){if(this.resolveDestination&&!await this.resolveDestination(portal.targetMapId))fail('This destination is no longer listed in the shared world.',404,'DESTINATION_UNAVAILABLE');result.destination=portal.targetMapId;const travel=player.pendingTravel?.to===portal.targetMapId&&player.pendingTravel.expiresAt>=now?player.pendingTravel:{from:id,to:portal.targetMapId,token:randomUUID(),expiresAt:now+120000};player.pendingTravel=travel;result.travel=travel;}else{const destination=sim.actors[portal.targetObjectId];if(!destination)fail('Destination is unavailable.');player.position={...destination.position};}}
    }
   }
   else if(command.action==='device'){result=deviceCommand(sim,manifest,player,actorId,command,now);}
   else if(command.action==='building-settings'){changeBuildingPolicy(room,actorId,command.enabled);result.message=command.enabled?'Building allowed in this room.':'Building paused in this room.';}
   else if(command.action==='place-item'){
    requireBuildingAllowed(room,environment);
    const entity=sim.actors[command.entityId];
    if(!entity?.spawned||entity.ownerId!==actorId)fail('Only the owner can reposition this item.',403);
    if(entity.active===false||entity.holderId)fail('Release this item before repositioning it.',409);
    if(command.revision!==(entity.placementRevision||1))fail('This item changed. Select it again before editing.',409);
    const placement=validateOwnedPlacement(command.placement,player);
    Object.assign(entity,placement);entity.placementRevision=(entity.placementRevision||1)+1;
    entity.definition.position={...placement.position};entity.definition.transform=copy(placement);
    result={spawnedId:entity.id,placementRevision:entity.placementRevision,message:'Item locked in place for everyone in this room.'};
   }
   else if(command.action==='spawn'){
    requireBuildingAllowed(room,environment);
    const asset=await this.resolveAsset(identity,command);if(!asset)fail('Purchase and publish this asset before deploying it.',403);
    const jerseyTeam=basketballJerseyTeam({asset,modelId:asset.id});
    if(jerseyTeam){if(sim.basketball)assignBasketballTeam(sim,player,now,jerseyTeam);player.basketballJersey=jerseyTeam;result.message=(jerseyTeam==='home'?'Home':'Away')+' basketball jersey equipped.';}
    else if(sim.basketball&&(asset.buildAssetId==='basketball'||asset.id==='basketball')){result.spawnedId=sim.basketball.ballId||BASKETBALL_BALL_ID;result.message='The free game ball is ready on the court.';}
    else{
    if(Object.values(sim.actors).filter(actor=>actor.spawned).length>=250)fail('Room item limit reached.',409);
    const chosenPlacement=command.placement?validateOwnedPlacement(command.placement,player):null;
    if(asset.consumable&&asset.petId&&!Object.values(sim.actors).some(actor=>actor.asset?.id===asset.petId&&actor.active))fail('Deploy your pet in this room before feeding it.',409);if(asset.sku)await this.charge(identity,asset.sku,createHash('sha256').update(id+actorId+sim.sequence).digest('hex'));
    if(asset.consumable&&asset.petId){const pet=Object.values(sim.actors).find(actor=>actor.asset?.id===asset.petId&&actor.active);if(!pet)fail('Deploy your pet in this room before feeding it.',409);pet.boostUntil=now+10000;result.message=pet.asset.name+' received a treat.';}else{
    const entityId='spawn-'+requestId,position=chosenPlacement?.position||{x:player.position.x-Math.sin(player.yaw)*2,y:player.position.y,z:player.position.z-Math.cos(player.yaw)*2},rotation=chosenPlacement?.rotation||{x:0,y:player.yaw,z:0},scale=chosenPlacement?.scale||{x:1,y:1,z:1};
    if(!chosenPlacement&&!isBasketball({asset}))Object.assign(position,this.collision.stackAsset(environment,asset,position,rotation,scale,sim.actors,room.objects));
    const behavior=deviceDefinition(asset.buildAssetId)?'interact':asset.behavior||(asset.assetType==='vehicles'?'vehicle':asset.assetType==='pets'?'patrol':'interact');
    const spawnHealth=isAircraft({asset})?AIRCRAFT_HEALTH:isWatercraft({asset})?200:100;const definition={objectId:entityId,modelId:asset.id,position:{...position},transform:{position:{...position},rotation:{...rotation},scale:{...scale}},gameplay:{behavior,device:deviceDefinition(asset.buildAssetId)?asset.buildAssetId:undefined,health:spawnHealth,damage:0,interactionDistance:3,cooldown:1,action:'none',prompt:asset.configuration?.prompt||'',quest:asset.configuration?.quest},quest:asset.configuration?.quest,dialogue:{text:asset.configuration?.prompt||''},movement:{speed:1},asset};
    sim.actors[entityId]={id:entityId,position,rotation,scale,placementRevision:1,active:true,health:spawnHealth,...(isAircraft({asset})?{modelId:'corsair-aircraft',maxHealth:AIRCRAFT_HEALTH,destructible:true}:isWatercraft({asset})?{modelId:asset.buildAssetId,maxHealth:200,destructible:true}:{}),spawned:true,ownerId:actorId,asset,definition};
    result.message=asset.name+' deployed to the shared room.';result.spawnedId=entityId;result.placementRevision=1;}
    }
   }
   else if(command.action==='clear-paint'){
    const strokes=Object.values(sim.actors).filter(actor=>actor.ownerId===actorId&&actor.asset?.renderKind==='paint-stroke').sort((a,b)=>b.createdAt-a.createdAt);
    for(const stroke of command.lastOnly?strokes.slice(0,1):strokes)delete sim.actors[stroke.id];player.lastPaintPoint=null;result.message='Solid paint removed.';
   }
   else if(command.action==='draw-paint'){
    if(player.health<=0||sim.match?.state==='finished')fail('Join an active game before drawing.',409);
    player.toolReady ||= {};if(now<(player.toolReady.spray||0))fail('Paint tool is cooling down.',429);
    if(Object.values(sim.actors).filter(actor=>actor.asset?.renderKind==='paint-stroke').length>=300)fail('Clear old solid paint before drawing more.',409);
    const direction=command.direction;if(!Array.isArray(direction)||direction.length!==3||!direction.every(Number.isFinite)||Math.hypot(...direction)<.1)fail('Invalid paint direction.');
    const norm=Math.hypot(...direction),point=this.collision.paintPoint(environment,player.position,direction.map(value=>value/norm),sim.actors,room.objects);
    await this.charge(identity,'tool:spray',createHash('sha256').update('paint:'+id+':'+actorId+':'+requestId).digest('hex'));
    const start=player.lastPaintPoint&&now-player.lastPaintAt<1000&&distance(player.lastPaintPoint,point)<=1.6?player.lastPaintPoint:point,delta={x:point.x-start.x,y:point.y-start.y,z:point.z-start.z},entityId='paint-'+actorId+'-'+requestId;
    sim.actors[entityId]={id:entityId,spawned:true,ownerId:actorId,active:true,health:100,createdAt:now,placementRevision:1,position:{x:(start.x+point.x)/2,y:Math.min(start.y,point.y)-.18,z:(start.z+point.z)/2},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},asset:{id:entityId,name:'Solid paint',renderKind:'paint-stroke',strokeDelta:delta,color:clamp(command.color,0,0xffffff)}};
    player.lastPaintPoint={x:point.x,y:point.y,z:point.z};player.lastPaintAt=now;player.toolReady.spray=now+250;result.message='Solid paint placed for everyone.';
   }
   else if(command.action==='fire'&&RANGED_WEAPONS[command.tool||'laser']&&rangeHandlesFire(sim,player)){result=fireFiringRange(sim,player,command,now,{blocksShot:(origin,ray,distance)=>this.collision.blocksShot(environment,origin,ray,distance,sim.actors)});}
   else if(command.action==='fire'){
    if(sim.basketball&&command.tool!=='spray'&&!UTILITY_TOOLS[command.tool])fail('Basketball Arena is a sports court. Catch, pass or shoot the basketball.',409);
    const tool=String(command.tool||'laser'),gunAircraft=isAircraft(sim.actors[player.vehicleId])&&sim.actors[player.vehicleId].active!==false&&tool==='laser'?sim.actors[player.vehicleId]:null,utility=UTILITY_TOOLS[tool],profile=RANGED_WEAPONS[tool],cooldown=sim.radTox&&!utility&&(profile||['bat','taser','toxin','flamethrower'].includes(tool))?RAD_TOX_SHOT_INTERVAL_MS:utility?utility.cooldown*1000:profile?profile.interval*1000:tool==='dynamite'?1200:250;if(!utility&&!profile&&!['bat','taser','toxin','flamethrower','spray','jetpack'].includes(tool))fail('This tool has no server action.',422);
    player.toolReady ||= {};if(now<(player.toolReady[tool]||0))fail('Tool is cooling down.',429);if(utility?.charges&&(player.toolUses?.[tool]||0)>=utility.charges)fail('Utility depleted until respawn.',409);
    if(tool==='flamethrower'&&(player.fuel??100)<5)fail('Refill your igniter fuel.',409);if(profile&&(player.ammo??120)<=0)fail('Refill ammunition.',409);if(tool==='medkit'&&player.health>=100)fail('Health is already full.',409);
    if(['repair-tool','recycler'].includes(tool)&&!Object.values(room.objects).some(object=>!object.deleted&&object.ownerId===actorId&&(tool==='recycler'||object.hits>0)&&distance({x:object.position[0],y:object.position[1],z:object.position[2]},player.position)<8))fail('No eligible building piece is within reach.',409);
    const direction=command.direction;if(!Array.isArray(direction)||direction.length!==3||!direction.every(Number.isFinite))fail('Invalid aim direction.');const length=Math.hypot(...direction);if(length<.1)fail('Invalid aim direction.');const ray=gunAircraft?aircraftGunPose(gunAircraft).direction:direction.map(n=>n/length);
    if(!gunAircraft)await this.charge(identity,'tool:'+tool,createHash('sha256').update('shot:'+id+':'+actorId+':'+requestId).digest('hex'));if(tool==='flamethrower')player.fuel=(player.fuel??100)-5;if(profile)player.ammo=(player.ammo??120)-1;player.lastShot=now;player.toolReady[tool]=now+cooldown;player.toolUses ||= {};player.toolUses[tool]=(player.toolUses[tool]||0)+1;
    const origin=gunAircraft?aircraftGunPose(gunAircraft).origin:{...player.position,y:player.position.y+1.5},targets=[];
    for(const entity of Object.values(sim.actors)){if(isAircraft(entity)||entity.destructible||entity.loot||entity.rangeTarget||!entity.active||entity.pendingSpawn||entity.health<=0)continue;const offset=[entity.position.x-origin.x,entity.position.y+1-origin.y,entity.position.z-origin.z],along=offset.reduce((sum,n,i)=>sum+n*ray[i],0),perpendicular=Math.sqrt(Math.max(0,offset.reduce((sum,n)=>sum+n*n,0)-along*along));if(along>0&&along<(tool==='bat'?3:40)&&perpendicular<1)targets.push({entity,along});}
    const range=gunAircraft?AIRCRAFT_GUN_RANGE:tool==='bat'?3:tool==='taser'?4:tool==='toxin'?9:tool==='flamethrower'?12:Math.min(40,profile?.range||40);
    for(const entity of Object.values(sim.actors)){if(!isAircraft(entity)||entity.id===player.vehicleId||entity.active===false||entity.health<=0)continue;const along=aircraftRayDistance(entity,origin,ray);if(along!==null&&along<range)targets.push({entity,along,aircraft:true});}
    const structureHit=this.collision.destructibleHit(environment,origin,ray,range,sim.actors);if(structureHit)targets.push(structureHit);
    for(const [targetId,target]of Object.entries(sim.players)){
     if(isAircraft(sim.actors[target.vehicleId])||targetId===actorId||target.radToxReady===false||target.health<=0||target.replacedByRoom||now-target.lastSeen>15000||firingRangeLocationAt(sim.firingRange?.locations,target.position))continue;
     const along=rayBoxDistance(origin,ray,{x:target.position.x-.35,y:target.position.y,z:target.position.z-.35},{x:target.position.x+.35,y:target.position.y+1.8,z:target.position.z+.35});
     if(along!==null&&along<range)targets.push({entity:target,along,playerId:targetId});
    }
    const blocks=[];for(const object of Object.values(room.objects)){if(object.deleted||object.open)continue;const offset=object.position.map((n,i)=>n-[origin.x,origin.y,origin.z][i]),along=offset.reduce((sum,n,i)=>sum+n*ray[i],0),perpendicular=Math.sqrt(Math.max(0,offset.reduce((sum,n)=>sum+n*n,0)-along*along)),size=buildingDimensions(object.materialId).map((n,i)=>n*object.scale[i]);if(along>0&&along<range&&perpendicular<Math.max(...size)/2)blocks.push({object,along});}
    const blocker=blocks.sort((a,b)=>a.along-b.along)[0];let hit=targets.filter(target=>target.along<range).sort((a,b)=>a.along-b.along)[0];
    if(hit&&this.collision.blocksShot(environment,origin,ray,hit.along,hit.entity.destructible?{...sim.actors,[hit.entity.id]:{...hit.entity,active:false}}:sim.actors))hit=null;if(blocker&&(!hit||blocker.along<hit.along)){hit=null;const object=blocker.object;if(tool==='spray')object.paint=object.paint.map(()=>clamp(command.color,0,0xffffff));else if(!utility){object.hits=(object.hits||0)+1;if(object.hits>=5)object.deleted=true;}object.revision=++room.revision;}
if(utility){if(tool==='medkit')player.health=Math.min(100,player.health+30);else if(tool==='shield-kit')player.shieldUntil=now+6000;else if(tool==='scanner')result.message='Scanner: '+targets.length+' targets in your aim path';else if(tool==='recycler'||tool==='repair-tool'){const candidates=Object.values(room.objects).filter(object=>!object.deleted&&object.ownerId===actorId&&distance({x:object.position[0],y:object.position[1],z:object.position[2]},player.position)<8).sort((a,b)=>distance({x:a.position[0],y:a.position[1],z:a.position[2]},player.position)-distance({x:b.position[0],y:b.position[1],z:b.position[2]},player.position));const target=candidates[0];if(target){if(tool==='recycler')target.deleted=true;target.hits=0;target.revision=++room.revision;}}else if(tool==='beacon')result.message='Waypoint beacon shared in room events';else if(tool==='supply-kit'){player.fuel=100;player.ammo=Math.min(120,(player.ammo??120)+12);}}
    else if(tool==='jetpack'){player.velocityY=8;player.grounded=false;}
    else if(tool==='spray'){if(hit&&!hit.playerId)hit.entity.paint=clamp(command.color,0,0xffffff);}
    else if(hit){
     const before=hit.entity.health;
     if(hit.playerId)damagePlayer(hit.entity,now,player);
     else {
      hit.entity.health=hit.entity.radTox?0:Math.max(0,before-(profile?.damage||damageByTool[tool]||20));
      combatStats(player).damageDealt+=before-hit.entity.health;
      if(hit.entity.health===0){hit.entity.active=false;if(isAircraft(hit.entity)){hit.entity.destroyedAt=now;hit.entity.flight={...hit.entity.flight,speed:0,phase:'destroyed'};const pilot=sim.players[hit.entity.holderId];if(pilot){pilot.vehicleId=null;pilot.input={};pilot.health=0;combatStats(pilot).deaths++;combatStats(player).playerKills++;combatStats(player).score+=25;player.score+=25;pilot.position=this.collision.safeSpawn(environment,environment.spawn||{x:0,y:0,z:0});pilot.floor=pilot.position.y;pilot.velocityY=0;pilot.movementRevision=(pilot.movementRevision||0)+1;}hit.entity.holderId=null;result.message='Aircraft shot down. A replacement will be ready at the stand in 15 seconds.';}
if(!hit.entity.destructible){if(hit.entity.radTox||['hostile','patrol'].includes(manifest.actors.find(actor=>actor.objectId===hit.entity.id)?.gameplay.behavior))dropRpgLoot(sim,hit.entity,now);player.score+=10;const stats=combatStats(player);stats.enemyKills++;stats.score+=10;await this.reward(identity,'defeat',requestId+'-defeat');player.progress ||= {};player.progress.defeat=(player.progress.defeat||0)+1;}}
     }
     if(hit.entity.health<before){
      hit.entity.contributors ||= {};hit.entity.contributors[actorId]=true;
      if(hit.entity.health===0&&!hit.entity.destructible)for(const helperId of Object.keys(hit.entity.contributors))if(helperId!==actorId&&sim.players[helperId]){const helper=sim.players[helperId];combatStats(helper).assists++;combatStats(helper).score+=5;helper.score+=5;}
     }
    }
    if(!utility&&!['spray','jetpack'].includes(tool)){
     const stats=combatStats(player);stats.shots++;if(hit){stats.hits++;stats[hit.playerId?'playerHits':'enemyHits']++;}else stats.misses++;
    }
    player.progress ||= {};if(hit){const event=tool==='taser'?'taser-hit':tool==='dynamite'?'blast-hit':tool==='spray'?'spray':'laser-hit';await this.reward(identity,event,requestId+'-hit');player.progress[event]=(player.progress[event]||0)+1;}
    const shotDistance=hit?.along??Math.min(range,blocker?.along??range);
    const end={x:origin.x+ray[0]*shotDistance,y:origin.y+ray[1]*shotDistance,z:origin.z+ray[2]*shotDistance};
    const paint=tool==='spray'?this.collision.paintSurface(environment,player.position,ray,sim.actors,room.objects):null;
    if(paint){Object.assign(end,paint.point);result.color=clamp(command.color,0,0xffffff);result.paintNormal=paint.normal.toArray();}
    result={...result,...(gunAircraft?{aircraftId:gunAircraft.id}:{}),firedAt:now,cooldownMs:cooldown,readyAt:player.toolReady[tool],tool,origin,end,direction:ray,hitId:hit?.playerId||hit?.entity.id||null,targetType:isAircraft(hit?.entity)?'aircraft':hit?.playerId?'player':hit?.entity.destructible?'building':hit?'enemy':null};
   }else fail('This action has no server handler. It was not run locally.',422);
  }
  player.position=constrainFiringRangePlayer(player.position,player.position,sim,player);
  stepFiringRange(sim,now);
  if(player.basketballRole==='spectator'&&basketballSpectatorRestricted(player.position,sim)){player.position=constrainBasketballSpectator(player.position,player.position,sim,player);player.input={};player.movementRevision=(player.movementRevision||0)+1;}
  if(priorCommandPosition&&requestedAction!=='input'&&distance(priorCommandPosition,player.position)>.001&&(player.movementRevision||0)===priorMovementRevision)player.movementRevision=priorMovementRevision+1;

  if(command.action==='input'&&player.health>0)await this.collectNearbyLoot(sim,player,identity,id,now,null,result);
  this.prepareEncounter(sim,environment);
  checkTeamDefeat(sim,now);
  if(now-(player.lastTelemetry||0)>5000&&!this.telemetryPending.has(identity.walletId)){const sample={health:player.health,world:id};player.lastTelemetry=now;this.telemetryPending.add(identity.walletId);Promise.resolve().then(()=>this.telemetry(identity.walletId,sample)).catch(error=>console.error('Gameplay telemetry failed:',error.message)).finally(()=>this.telemetryPending.delete(identity.walletId));}
  if(requestedAction!=='input'){sim.events.push({id:requestId,actorId,action:requestedAction,...result,at:now});sim.events=sim.events.slice(-100);}
  sim.receipts[receiptKey]={action:requestedAction,result};const keys=Object.keys(sim.receipts);if(keys.length>500)for(const key of keys.slice(0,keys.length-500))delete sim.receipts[key];
  return {...this.view(room),selfId:actorId,result};
 },{persist:requestedAction!=='input',roomOnly:requestedAction!=='join'});}

 async collectNearbyLoot(sim,player,identity,roomId,now,entityId,result){
  if(player.health<=0||sim.match?.state==='finished')return;
  if(!entityId&&now<(player.lootRetryAt||0))return;
  const loot=Object.values(sim.actors).find(actor=>actor.loot&&actor.active&&(!entityId||actor.id===entityId)&&distance(actor.position,player.position)<=(actor.loot.currency?1.1:1.8));
  if(!loot){if(entityId)fail('Supply is unavailable or out of reach.',409);return;}
  let receipt;try{receipt=loot.loot.currency==='MZK'?await this.collectCoin(identity,'coin:'+loot.loot.token):await this.collectLoot(identity,loot.loot.catalogId,'loot:'+loot.loot.token);}catch(error){if(entityId)throw error;player.lootRetryAt=now+5000;result.message=error.message;return;}
  loot.active=false;loot.loot.collectedAt=now;loot.loot.collectedBy=player.actorId;
  if(receipt?.claimedByOther)return;
  if(loot.loot.currency==='MZK'){result.loot={id:loot.id,currency:'MZK',amount:1,balance:receipt.balanceAfterMzk,receiptId:receipt.id};result.message='+1 MZK · added to your wallet';return;}
  const stats=combatStats(player);stats.itemsCollected ||= [];if(!stats.itemsCollected.includes(loot.loot.catalogId))stats.itemsCollected.push(loot.loot.catalogId);
  result.loot={id:loot.id,catalogId:loot.loot.catalogId,receiptId:receipt?.id};result.message=loot.loot.name+' added to Backpack · Care supplies';
 }
 async player(id,actorId){return (await this.store.get(id)).simulation?.players[actorId];}
 async care(actorId,receipt){const rooms=await this.store.read();for(const [id,room] of Object.entries(rooms)){if(!room.simulation?.players[actorId])continue;await this.store.update(id,current=>{const player=current.simulation.players[actorId];player.careReceipts ||= [];if(player.careReceipts.includes(receipt.id))return;const effect=receipt.effect;player.stats ||= {};if(effect?.stat==='all')for(const key of Object.keys(player.stats))player.stats[key]=key==='toxicity'?0:100;else if(effect?.stat&&effect.stat!=='health')player.stats[effect.stat]=Math.max(0,Math.min(100,(player.stats[effect.stat]||0)+Number(effect.amount||0)));if(effect?.stat==='health'||effect?.stat==='all')player.health=effect.stat==='all'?100:Math.min(100,player.health+Number(effect.amount||0));player.careReceipts.push(receipt.id);player.careReceipts=player.careReceipts.slice(-100);});}}
}
