import {ensureDoomsday,doomsdayView,doomsdayCommand} from './public/js/doomsday-rules.js';
import {forestSnakeTalk,forestSnakeView} from './server-forest-snake.mjs';
import {pingPongCommand,stepPingPong,cancelPingPong,pingPongView,pingPongCollisionContext} from './server-ping-pong.mjs';
import {worldSupplyAirCommand,stepWorldAirFreight,cancelWorldAirFreight,playerAirFreightView} from './server-world-air-freight.mjs';
import {ensureQuarry,stepQuarry,quarryCommand,quarryDeedCommand} from './server-quarry.mjs';
import {isForestHarvestEnvironment} from './public/js/forest-harvest-config.js';
import {ensureForestHarvest,stepForestHarvest,forestHarvestCommand,forestHarvestView} from './server-forest-harvest.mjs';
import {isTropicalIslandEnvironment} from './public/js/tropical-island-config.js';
import {ensureTropicalIsland,stepTropicalIsland,tropicalIslandView,playerTropicalIslandView,tropicalIslandCommand,recordTropicalIslandVisit} from './server-tropical-island.mjs';
import {PRISON_PROTOCOL,PRISON_PROTOCOL_VERSION,prisonCommandSignature} from './public/js/prison-protocol.js';
import {applyPrisonRewardState} from './server-prison-rewards.mjs';
import {isPrisonEnvironment} from './public/js/prison-config.js';
import {ensurePrison,stepPrison,prisonCommand,prisonSnapshot} from './server-prison.mjs';
import {funhouseRideActive} from './public/js/funhouse-experience-rules.js';
import {equipOwnedFunhouseItem,sprayOwnedFunhouseWater} from './server-clown-equipment.mjs';
import {isFunhouseEnvironment} from './public/js/clown-funhouse-config.js';
import {funhouseCommand,stepFunhouse,playerFunhouseView,cancelFunhouseActivities} from './server-clown-funhouse.mjs';
import {shippingCommand,stepShipping,shippingView,playerShippingView,cancelShipping,applyShippingAccount,applyShippingSettlement,shippingVesselUnlocked,shippingHandling,shippingDefense,shippingHullHealth} from './server-shipping.mjs';
import {isShippingEnvironment,SHIPPING_RULES} from './public/js/shipping-config.js';
import {ensureFreight,cargoCommand,stepCargoTrailers,freightTrailerBlocked} from './server-cargo-hauling.mjs';
import {fishingCommand,stepFishing,fishingView,playerFishingView,fishingLocked,cancelFishing,applyFishingAccount,applyFishingSettlement} from './server-fishing.mjs';
import {isFishingBoat,FISHING_GEAR} from './public/js/fishing-config.js';
import {releaseForMapTravel} from './server-map-travel.mjs';
import {worldPopulation} from './public/js/world-population.js';
import {isFitnessEnvironment} from './public/js/fitness-config.js';
import {fitnessCommand,stepFitness,fitnessView} from './server-fitness.mjs';
import {isFactoryEnvironment} from './public/js/missile-factory-config.js';
import {factoryItemSettings} from './public/js/missile-factory-items.js';
import {COMPOUND_ID,isFactoryTestingEnvironment,constrainCompoundPosition} from './public/js/factory-test-config.js';
import {factoryTestingItemSettings} from './public/js/factory-testing-items.js';
import {factoryLogisticsItemSettings} from './public/js/factory-logistics-items.js';
import {stepFactoryTesting,factoryTestingView,publicTestingState} from './server-factory-testing.mjs';
import {stepFactory,factoryView,publicFactoryState} from './server-missile-factory.mjs';
import {isFactoryLogisticsEnvironment} from './public/js/factory-logistics-config.js';
import {stepFactoryLogistics,factoryLogisticsView,publicLogisticsState} from './server-factory-logistics.mjs';
import {CASINO_ID,CASINO_LAYOUT_VERSION,isCasinoEnvironment} from './public/js/casino-config.js';
import {casinoLifeView} from './server-casino-residents.mjs';
import {residentLifeView} from './server-resident-life.mjs';
import {residentArrivalPosition} from './server-resident-arrival.mjs';
import {residentProgressView} from './server-resident-dialogue.mjs';
import {restoreResidentContinuity,saveResidentContinuity} from './server-resident-progress.mjs';
import {ensureResidentFurnishings} from './server-resident-furnishings.mjs';
import {isHockeyMap} from './public/js/hockey-rules.js';
import {isArcadeMap} from './public/js/arcade-rules.js';
import {stepCasinoTasks,casinoTaskView,casinoProgressView,recordCasinoPlayerGame} from './server-casino-tasks.mjs';
import {constructionGroundAt} from './public/js/construction-collision.js';
import {ensureConstruction,stepConstruction,constructionCommand,constructionView} from './server-construction.mjs';
import {ensureConstructionCrew,stepConstructionCrew,constructionCrewAction,releaseConstructionCrewMachine} from './server-construction-crew.mjs';
import {isConstructionMachine,constructionTravelStatus} from './public/js/construction-state.js';
import {stepWorldResidents,residentCommand} from './server-world-residents.mjs';
import {stepAIWorldActions,notePlayerAIWorldInteraction,registerAIWorldDefinitions} from './server-ai-world-actions.mjs';
import {refreshAIConversationWork} from './server-ai-interactions.mjs';
import {stepRoadActivity} from './server-road-activity.mjs';
import {roadSpeedLimit} from './public/js/road-network.js';
import {ensureRoadFleet,roadMovementBlocked,roadExitPosition} from './server-road-vehicles.mjs';
import {isRoadVehicle,roadVehicleType,stepRoadVehicle} from './public/js/road-vehicles.js';
import {questRadio} from './server-quest-radio.mjs';
import {stepJobDispatch} from './server-job-dispatch.mjs';
import {converseQuest} from './server-quest-dialogue.mjs';
import {isCombatBoat} from './public/js/patrol-combat.js';
import {firePatrolCannon} from './server-patrol-combat.mjs';
import {canEngageQuest,questTeamOffers} from './server-quest-teams.mjs';
import {stepExpandedQuests,expandedQuestAction,recordSiteQuestInteraction} from './server-expanded-quests.mjs';
import {stepTransportTraffic,vehicleMissionCommand,stepVehicleMissions} from './server-transport-activity.mjs';
import {landLotById} from './public/js/land-lots.js';
import {armedAircraft,aircraftType} from './public/js/aircraft-types.js';
import {RESORT_PRODUCTS,resortProductSettings} from './public/js/resort-products.js';
import {startSkiRace,stepSkiRace,skiCompetitionView,skiLobbyCommand,stepSkiLobby,stepSkiAI} from './server-ski-competition.mjs';
import {skiLifts,skiRuns,skiCourseStart,nearestSkiLift,startSkiLift,stepSkiLift,skiMotion,skiHeight} from './public/js/ski-resort.js';
import {aircraftRunway,runwayClearance} from './public/js/airport-navigation.js';
import {yachtGameCommand,stepYachtGames} from './server-yacht-games.mjs';
import {resolveVehicleAction} from './public/js/vehicle-actions.js';
import {startBoatAssist,boatAssistedInput,boatMovementBlocked} from './server-boat-assist.mjs';
import {startAircraftAssist,aircraftAssistedInput,aircraftExitPosition} from './server-aircraft-access.mjs';
import {stepBoatSimulation} from './public/js/boat-simulation.js';
import {harborRadio,stopBoat,boatExitPosition} from './server-harbor-operations.mjs';
import {aircraftRayDistance,aircraftGunPose,AIRCRAFT_HEALTH,AIRCRAFT_GUN_RANGE} from './public/js/aircraft-combat.js';
import {localMapLocations} from './public/js/local-map-locations.js';
import {isAircraft,stepAircraftFlight,airportRadio} from './public/js/aircraft-flight.js';
import {isWatercraft,harborWaterAt,watercraftFootprint,watercraftOverlap,watercraftInteractionPoint,watercraftInteractionReach} from './public/js/harbor-water.js';
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
import {worldTravelObjects,portalArrivalPosition,syncCommonsArrivalReturns,ensureCommonsArrivalReturn} from './server-world-travel.mjs';
import {refreshMzkCoins} from './server-mzk-coins.mjs';
import {resolveBasketballAction} from './public/js/basketball-actions.js';

import {refreshRpgLoot,dropRpgLoot} from './server-rpg-loot.mjs';
import {validateOwnedPlacement} from './owned-item-placement.mjs';
import {ENEMY_BEHAVIORS,stepEnemyCombat} from './server-enemy-combat.mjs';
import {combatStats,damagePlayer,registerParticipant,checkTeamDefeat,matchView,SPAWN_PROTECTION_MS,PLAYER_HIT_CAPACITY} from './rpg-match.mjs';
import {supportsRadTox,startRadTox,advanceRadTox,nextRadToxLevel,stepRadToxEnemy} from './rad-tox-campaign.mjs';
import {rayBoxDistance} from './server-combat-ray.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {ServerBuilderCollision} from './server-builder-collision.mjs';
import {RANGED_WEAPONS} from './public/js/game-weapons.js';
import {UTILITY_TOOLS} from './public/js/game-utilities.js';
import {compileBuilderScene,normalizeBuilderObject} from './public/js/builder-gameplay-pipeline.js';
import {buildingDimensions} from './public/js/building-materials.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const copy=value=>JSON.parse(JSON.stringify(value));
// Leaving combat must not carry a defeated, immobile state into exploration.
// Wounded players keep their health; opting out cannot be used as a free heal.
function resumeDefeatedExplorer(sim,player){
 if(player.radToxEnabled!==false||player.health>0)return;
 for(const key of ['heldId','seatedId','vehicleId']){const attached=sim.actors[player[key]];if(attached?.holderId===player.actorId)attached.holderId=null;player[key]=null;}
 player.health=100;player.velocityY=0;player.input={};player.skiLift=null;player.skiing=false;player.skiSpeed=0;
}
function clearUnavailableAttachments(sim,player,actorId=player.actorId){
 for(const key of ['heldId','seatedId','vehicleId']){
  const id=player[key],actor=sim.actors[id];
  if(id&&(!actor||actor.active===false||actor.holderId&&actor.holderId!==actorId))player[key]=null;
 }
}
const fitnessRoundSnapshot=round=>{if(!round)return null;const {rewardReceipt,...publicRound}=round;return publicRound;};
const fitnessEventSnapshot=event=>{const {fitnessReceipt,...publicEvent}=event;if(publicEvent.fitness)publicEvent.fitness=fitnessRoundSnapshot(publicEvent.fitness);return publicEvent;};
const fail=(message,statusCode=400,code)=>{throw Object.assign(new Error(message),{statusCode,code});};
const damageByTool={laser:20,bat:25,taser:8,toxin:12,dynamite:60,flamethrower:15,'pulse-rifle':18,shotgun:35,marksman:45};
const usesNativeSportsMatch=environment=>isHockeyMap(environment)||isArcadeMap(environment);
export class AuthoritativeRooms {
 constructor({store,quarryInventory=async()=>{throw Error('Quarry inventory storage unavailable.');},now=Date.now,charge=async()=>{},consumeAsset=async()=>{},resolveAsset=async()=>null,reward=async()=>{},fitnessReward=async()=>{throw Error('Fitness reward storage unavailable.');},fitnessState=async()=>null,fishingReward=async()=>{throw Error('Fishing reward storage unavailable.');},fishingState=async()=>null,shippingReward=async()=>{throw Error('Shipping reward storage unavailable.');},shippingState=async()=>null,supplyAction=async()=>{throw Error('World supply storage unavailable.');},supplyDelivery=async()=>{throw Error('World supply storage unavailable.');},supplyAirAction=async()=>{throw Error('World air freight storage unavailable.');},supplyAirDelivery=async()=>{throw Error('World air freight storage unavailable.');},shippingBind=async()=>{throw Error('Factory shipping storage unavailable.');},shippingReturn=async()=>null,factoryAction=async()=>{throw Error('Factory storage unavailable.');},factoryState=async()=>null,forestReconcile=async()=>{},forestExport=async()=>{throw Error('Forestry Backpack storage unavailable.');},prisonClaim=async()=>{throw Error('Prison Backpack storage unavailable.');},prisonState=async()=>({claimedItems:[]}),logisticsAction=async()=>{throw Error('Factory logistics storage unavailable.');},logisticsState=async()=>null,testingAction=async()=>{throw Error('Testing facility storage unavailable.');},testingState=async()=>null,testingAccess=async()=>{throw Object.assign(Error('Compound clearance storage unavailable.'),{statusCode:503});},telemetry=async()=>{},collectLoot=async()=>{throw new Error("Loot storage unavailable.");},collectCoin=async()=>{throw new Error("Coin storage unavailable.");},resolveDestination=null,capacity=32,scheduledInputs=false}){this.scheduledInputs=scheduledInputs===true;Object.assign(this,{store,quarryInventory,now,charge,consumeAsset,resolveAsset,reward,fitnessReward,fitnessState,fishingReward,fishingState,shippingReward,shippingState,supplyAction,supplyDelivery,supplyAirAction,supplyAirDelivery,shippingBind,shippingReturn,factoryAction,factoryState,forestReconcile,forestExport,prisonClaim,prisonState,logisticsAction,logisticsState,testingAction,testingState,testingAccess,telemetry,collectLoot,collectCoin,resolveDestination,capacity});this.collision=new ServerBuilderCollision();this.manifestCache=new Map();this.aiDefinitionVersions=new WeakMap();this.activeWorlds=new Map();this.ticking=false;this.telemetryPending=new Set();this.tickRetryAt=new Map();this.manifestOwners=new Map();this.preparationEpoch=randomUUID();}
 async releaseCancelledSupply(identity,sim,player,environment,now){
  const air=player?.airFreight;
  if(air?.phase==='cancelled'&&!air.releasedAt){const source=environment?.id===air.mapId?environment:this.activeWorlds.get(air.mapId)||{id:air.mapId,airport:{enabled:true}};await this.supplyAirAction(identity,sim,player,source,{operation:'release',airTaskId:air.airTaskId,reservationId:air.reservationId,reason:air.message},now);air.releasedAt=now;}
  const job=player?.shipping?.job;
  if(!job?.shipmentId||job.supplyReleasedAt||!['cancelled','expired','failed'].includes(job.phase))return;
  const source=environment?.id===job.environmentId?environment:this.activeWorlds.get(job.environmentId)||{id:job.environmentId,builderScene:{layoutMeta:{shipping:{enabled:sim.shipping?.enabled===true}}}};
  await this.supplyAction(identity,sim,player,source,{operation:'release',shipmentId:job.shipmentId,jobId:job.id,contractId:job.contractId},now);
  job.supplyReleasedAt=now;
 }
 constrainCompoundPlayer(sim,player,environment,from){
  const next=constrainCompoundPosition(player,from,player.position,environment);
  if(next.z===player.position.z)return;
  for(const key of ['vehicleId','seatedId']){const actor=sim.actors[player[key]];if(actor?.holderId===player.actorId){actor.holderId=null;actor.position={...next};if(actor.driving)Object.assign(actor.driving,{speed:0,throttle:0,parked:true});}player[key]=null;}
  player.position=next;player.floor=next.y;player.velocityY=0;player.grounded=true;player.input={};player.movementRevision=(player.movementRevision||0)+1;
 }
 constructionContext(sim,environment,objects={}){
  const context={collision:this.collision,environment,objects,earthworks:sim.construction?.earthworks};
  context.drive=(machine,worker,input,now,dt)=>{
   const before={...machine.position},lease=machine.construction?.crewOperator;
   if(machine.holderId||lease?.workerId!==worker.id||lease.expiresAt<=now)return {blocked:true,moved:0,position:before};
   const controls=constructionTravelStatus(machine).allowed?input:{forward:0,side:0,brake:true},others={...sim.actors,[machine.id]:{...machine,active:false}},options={earthworks:sim.construction.earthworks,players:sim.players,crew:sim.construction.crew};
   for(let remaining=dt;remaining>1e-8;remaining-=.05){Object.assign(machine,stepRoadVehicle(machine,controls,Math.min(.05,remaining),{speedLimit:3.5,groundAt:point=>constructionGroundAt(machine,point,p=>this.collision.groundAt(environment,p,{actors:others,objects,earthworks:options.earthworks})),blocked:(from,to,yaw)=>roadMovementBlocked(this.collision,environment,sim.actors,objects,machine,from,to,yaw,options)}));if(machine.driving?.blocked)break;}
   return {blocked:!!machine.driving?.blocked,moved:Math.hypot(machine.position.x-before.x,machine.position.z-before.z),position:machine.position};
  };
  return context;
 }
 async tickActive(){
  if(this.ticking)return;this.ticking=true;
  try{this.collision.setActiveWorlds([...this.activeWorlds.values()].map(environment=>environment.id));const ids=[...this.activeWorlds.keys()].filter(id=>this.now()>=(this.tickRetryAt.get(id)||0));if(!ids.length)return;
   const results=await this.store.updateMany(ids,(room,id)=>{const environment=this.activeWorlds.get(id);if(!environment)return;
    if(!Object.values(room.simulation?.players||{}).some(player=>!player.basketballAI&&!player.replacedByRoom&&this.now()-player.lastSeen<15000)){
     this.activeWorlds.delete(id);this.tickRetryAt.delete(id);
     // Different rooms can share one environment's collision resources.
     // Expiring one owner must not dispose the world another room still uses.
     if(![...this.activeWorlds.values()].some(active=>active.id===environment.id))this.collision.releaseWorld(environment.id);
     return;
    }
    this.step(room,environment);
   },{persist:false});
   for(const {id,error}of results)if(error){this.tickRetryAt.set(id,this.now()+1000);console.error('[Room simulation]',id,error.message);}else this.tickRetryAt.delete(id);
  }finally{this.collision.setActiveWorlds([...this.activeWorlds.values()].map(environment=>environment.id));this.pruneManifests();this.ticking=false;}

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
 clearCaches(){
  this.activeWorlds.clear();this.tickRetryAt.clear();this.manifestCache.clear();this.manifestOwners.clear();this.aiDefinitionVersions=new WeakMap();this.collision.clearWorlds();this.preparationEpoch=randomUUID();
 }
 manifestKey(environment){return (isBasketballEnvironment(environment)?'basketball-runtime-v2:':isDedicatedFiringRange(environment)?'firing-range-runtime-v1:':'')+environment.id+':'+(environment.contentUpdatedAt||environment.updatedAt||'')+':'+JSON.stringify(environment.travelPortals||[]);}
 pruneManifests(){
  const active=new Set([...this.activeWorlds.values()].map(environment=>environment.id));
  const idle=[...this.manifestCache.keys()].filter(key=>!active.has(this.manifestOwners.get(key)));
  for(const key of idle.slice(0,Math.max(0,idle.length-32))){this.manifestCache.delete(key);this.manifestOwners.delete(key);}
 }
 prepareManifest(environment){
  const manifestKey=this.manifestKey(environment);let base=this.manifestCache.get(manifestKey);const newManifest=!base;
  if(!base){
   const scene=environment.builderScene||environment.placementScene||{};
   base=compileBuilderScene({...scene,objects:[...(scene.objects||[]),...worldTravelObjects(environment,this.collision)]});
   for(const [key,id]of this.manifestOwners)if(id===environment.id){this.manifestCache.delete(key);this.manifestOwners.delete(key);}
   this.manifestOwners.set(manifestKey,environment.id);
  }else this.manifestCache.delete(manifestKey);
  this.manifestCache.set(manifestKey,base);if(newManifest)this.pruneManifests();
  return {manifestKey,manifest:{...base,objects:[...base.objects],actors:[...base.actors]}};
 }
 completeManifest(sim,environment,manifest,contentUpdatedAt){
  if(isDedicatedFiringRange(environment)||sim.basketball||sim.construction)manifest.actors=manifest.actors.filter(actor=>!['hostile','patrol','hazard'].includes(actor.gameplay?.behavior));
  if(this.aiDefinitionVersions.get(sim)!==contentUpdatedAt){registerAIWorldDefinitions(sim,manifest);this.aiDefinitionVersions.set(sim,contentUpdatedAt);}
  manifest.actors.push(...Object.values(sim.actors).filter(actor=>actor.definition&&(!sim.basketball||!['hostile','patrol','hazard'].includes(actor.definition.gameplay?.behavior))).map(actor=>actor.definition));
 }
 scheduledWalker(sim,environment,player){
  if(!player||player.health<=0||player.replacedByRoom||player.radToxEnabled!==false||player.vehicleId||player.heldId||player.seatedId||player.skiing||player.skiLift)return false;
  if(environment.game==='ski'||usesNativeSportsMatch(environment)||isCasinoEnvironment(environment)||isFunhouseEnvironment(environment)||isFitnessEnvironment(environment)||isFactoryEnvironment(environment)||isFactoryTestingEnvironment(environment)||isFactoryLogisticsEnvironment(environment)||isForestHarvestEnvironment(environment)||isPrisonEnvironment(environment)||isTropicalIslandEnvironment(environment)||isShippingEnvironment(environment)||isDedicatedFiringRange(environment)||isBasketballEnvironment(environment))return false;
  if(sim.match||sim.radTox||sim.basketball||sim.firingRange||sim.construction||sim.fitnessEnabled||sim.factoryEnabled||sim.factoryTestingEnabled||sim.factoryLogisticsEnabled||sim.shipping?.enabled||Object.keys(sim.projectiles||{}).length)return false;
  if(player.fitness||player.fishing||player.shipping||player.factory||player.testing||player.logistics||player.funhouse||player.urbanMission||player.vehicleMission?.status==='active'||player.residentTask?.status==='active'||player.casinoTask?.status==='active')return false;
  return true;
 }
 canScheduleInput(room,environment,player,receivedAt){
  const sim=room.simulation,now=this.now();
  if(!sim?.initialized||sim.preparedEpoch!==this.preparationEpoch||!this.scheduledWalker(sim,environment,player)||!Number.isFinite(sim.time)||now<sim.time||now-sim.time>250)return false;
  // A paused connection and a changed scene retain the established full path.
  // The bounded frame age also recovers safely if the external tick pauses.
  return receivedAt-player.lastSeen>=0&&receivedAt-player.lastSeen<1000&&now-player.lastSeen<1000&&sim.environmentUpdatedAt===this.manifestKey(environment)&&sim.preparedRoomRevision===(room.revision||0)&&sim.mapRevision===(environment.atlas?.revision||0)&&sim.baseAlignmentKey===JSON.stringify(environment.builderScene?.baseTransform||{});
 }
 scheduledInputFrame(room,environment){
  const sim=room.simulation,{manifestKey,manifest}=this.prepareManifest(environment);
  // Return existing runtime gates without running their expiry/migration work;
  // the normal 20 Hz background step still owns all world maintenance.
  manifest.objects.push(...(sim.commonsArrivalReturns||[]).map(entry=>structuredClone(entry.definition)));
  this.completeManifest(sim,environment,manifest,manifestKey);
  sim.sequence++;
  return {sim,manifest};
 }
 consumeScheduledJump(sim,environment,player,now){
  const pending=player.pendingJump;if(!pending)return false;delete player.pendingJump;
  return this.scheduledInputs&&pending.epoch===player.inputEpoch&&Number.isSafeInteger(pending.sequence)&&now>=pending.at&&now-pending.at<=250&&player.grounded&&this.scheduledWalker(sim,environment,player);
 }
 initialize(room,environment){
  const {manifestKey,manifest}=this.prepareManifest(environment);
  room.simulation ||= {version:1,players:{},actors:{},events:[],time:this.now(),sequence:0};
  const sim=room.simulation,contentUpdatedAt=manifestKey;
  manifest.objects.push(...syncCommonsArrivalReturns(sim,environment,manifest,this.now()));
  if(isCleanCommonsEnvironment(environment)){
   for(const [id,actor]of Object.entries(sim.actors))if(actor.radTox)delete sim.actors[id];
   sim.radTox=null;sim.match=null;sim.projectiles={};
   for(const player of Object.values(sim.players)){player.radToxEnabled=false;player.radToxReady=true;}
  }
  if(!sim.initialized||sim.environmentUpdatedAt!==contentUpdatedAt){
   const authored=new Set(manifest.objects.map(actor=>actor.objectId));for(const [id,actor]of Object.entries(sim.actors))if(!actor.spawned&&!actor.radTox&&!actor.basketballManaged&&!actor.rangeManaged&&!authored.has(id))delete sim.actors[id];

   // A visual renovation must not teleport operating machinery in the shared
   // permanent site. Owner-authored copies still apply intentional layout edits.
   for(const actor of manifest.objects){if(sim.actors[actor.objectId]){const existing=sim.actors[actor.objectId],keepConstructionPose=['skyscraper-construction','surface-mine-quarry'].includes(environment.id)&&environment.permanent===true&&isConstructionMachine(existing)&&existing.construction&&existing.modelId===actor.modelId;if(!keepConstructionPose){existing.position=copy(actor.transform.position);existing.rotation=copy(actor.transform.rotation);existing.scale=copy(actor.transform.scale);}existing.asset=copy(actor.asset);sim.actors[actor.objectId].modelId=actor.modelId;sim.actors[actor.objectId].worldGateway=actor.gameplay.action==='teleport'&&actor.gameplay.portal?.destinationType==='map'?{destination:actor.gameplay.portal.targetMapId,name:actor.gameplay.prompt||actor.gameplay.portal.targetMapId,ownerName:actor.gameplay.portal.ownerName,deedId:actor.gameplay.portal.deedId,color:actor.gameplay.portal.color}:null;}if(!sim.actors[actor.objectId])sim.actors[actor.objectId]={id:actor.objectId,modelId:actor.modelId,asset:copy(actor.asset),worldGateway:actor.gameplay.action==='teleport'&&actor.gameplay.portal?.destinationType==='map'?{destination:actor.gameplay.portal.targetMapId,name:actor.gameplay.prompt||actor.gameplay.portal.targetMapId,ownerName:actor.gameplay.portal.ownerName,deedId:actor.gameplay.portal.deedId,color:actor.gameplay.portal.color}:null,position:copy(actor.transform.position),rotation:copy(actor.transform.rotation),scale:copy(actor.transform.scale),health:actor.gameplay.health,active:true,open:false,switched:false};}
   for(const definition of manifest.objects)sim.actors[definition.objectId].destructible=definition.gameplay.destructible===true;
   sim.initialized=true;sim.environmentUpdatedAt=contentUpdatedAt;
  }
  if((isFactoryEnvironment(environment)||environment.airport?.enabled||environment.builderScene?.layoutMeta?.harbor)&&sim.radTox){for(const [key,actor]of Object.entries(sim.actors))if(actor.radTox)delete sim.actors[key];sim.radTox=null;sim.match=null;sim.projectiles={};}
  ensureDoomsday(sim,environment);
  if(environment.airport?.enabled)sim.airport ||= {runwayHolder:null,expires:0};
  for(const definition of manifest.objects){const aircraft=sim.actors[definition.objectId];if(!isAircraft(aircraft))continue;aircraft.maxHealth=AIRCRAFT_HEALTH;if(aircraft.active!==false&&aircraft.flight?.airborne&&!aircraft.holderId)aircraft.unoccupiedSince??=this.now();else delete aircraft.unoccupiedSince;if((aircraft.destroyedAt&&this.now()-aircraft.destroyedAt>=15000)||(aircraft.unoccupiedSince&&this.now()-aircraft.unoccupiedSince>=15000)){Object.assign(aircraft,{position:copy(definition.transform.position),rotation:copy(definition.transform.rotation),health:AIRCRAFT_HEALTH,active:true,holderId:null,flight:{speed:0,phase:'parked',altitude:0,airborne:false}});delete aircraft.destroyedAt;delete aircraft.unoccupiedSince;}}
  for(const definition of manifest.objects){const boat=sim.actors[definition.objectId];if(!isWatercraft(boat))continue;boat.maxHealth=shippingHullHealth(boat)??boat.maxHealth??(isCombatBoat(boat)?650:isFishingBoat(boat)?300:200);if(boat.destroyedAt&&this.now()-boat.destroyedAt>=15000){Object.assign(boat,{position:copy(definition.transform.position),rotation:copy(definition.transform.rotation),health:boat.maxHealth||200,active:true,holderId:null});stopBoat(boat);delete boat.destroyedAt;}else if(!boat.holderId&&(Math.abs(boat.boating?.speed||0)>.01||Math.abs(boat.boating?.throttleCommand||0)>.01))stopBoat(boat);}
  // Retain native identities for catalog assets, including rooms saved before
  // basketball metadata became part of authoritative actor snapshots.
  for(const actor of manifest.objects){const entity=sim.actors[actor.objectId];if(entity&&!entity.asset)entity.asset=copy(actor.asset);}
  if(isFunhouseEnvironment(environment)||isCasinoEnvironment(environment)||isFitnessEnvironment(environment)||isFactoryEnvironment(environment)||isFactoryTestingEnvironment(environment)||isForestHarvestEnvironment(environment)||isPrisonEnvironment(environment)||usesNativeSportsMatch(environment))for(const [id,actor]of Object.entries(sim.actors))if(actor.loot||actor.runtimeMachine||actor.roadFleet||actor.trafficAI&&(isFactoryEnvironment(environment)?!actor.resident?.factory:isFitnessEnvironment(environment)?!actor.resident?.fitness:isCasinoEnvironment(environment)?!actor.resident?.casino:!actor.resident)){delete sim.actors[id];if(sim.devices)delete sim.devices[id];}
  ensureForestHarvest(sim,environment,this.now());
  ensurePrison(sim,environment,this.now());
  ensureTropicalIsland(sim,environment,this.now());
  ensureConstruction(sim,environment);
  ensureConstructionCrew(sim,environment,this.now());
  ensureQuarry(sim,environment);
  ensureFiringRange(sim,environment,this.now());
  if(isDedicatedFiringRange(environment)){const hostileIds=new Set(manifest.actors.filter(actor=>['hostile','patrol','hazard'].includes(actor.gameplay?.behavior)).map(actor=>actor.objectId));sim.radTox=null;sim.match=null;sim.projectiles={};for(const [id,actor]of Object.entries(sim.actors))if(hostileIds.has(id)||actor.radTox||actor.loot||actor.runtimeMachine||['hostile','patrol','hazard'].includes(actor.definition?.gameplay?.behavior)){delete sim.actors[id];if(sim.devices)delete sim.devices[id];}manifest.actors=manifest.actors.filter(actor=>!['hostile','patrol','hazard'].includes(actor.gameplay?.behavior));}
  if(isBasketballEnvironment(environment)){
   ensureBasketballGame(sim,environment,this.now());sim.radTox=null;sim.match=null;sim.projectiles={};
   for(const [id,actor]of Object.entries(sim.actors))if(actor.radTox||actor.loot||actor.runtimeMachine){delete sim.actors[id];if(sim.devices)delete sim.devices[id];}
   manifest.actors=manifest.actors.filter(actor=>!['hostile','patrol','hazard'].includes(actor.gameplay?.behavior));
  }else{
   if(sim.basketball){delete sim.basketball;for(const [id,actor]of Object.entries(sim.actors))if(actor.basketballManaged)delete sim.actors[id];}
   if(!isDedicatedFiringRange(environment)&&!isFunhouseEnvironment(environment)&&!isFitnessEnvironment(environment)&&!isFactoryEnvironment(environment)&&!isFactoryTestingEnvironment(environment)&&!isForestHarvestEnvironment(environment)&&!isPrisonEnvironment(environment)&&!isTropicalIslandEnvironment(environment)&&!sim.construction&&!usesNativeSportsMatch(environment)){this.prepareEncounter(sim,environment);refreshRpgLoot(sim,environment,this.now(),position=>this.collision.safeSpawn(environment,position));}
  }
  const alignmentKey=JSON.stringify(environment.builderScene?.baseTransform||{});
  if(sim.baseAlignmentKey!==alignmentKey){
   for(const [id,actor]of Object.entries(sim.actors))if(actor.loot?.currency==='MZK')delete sim.actors[id];
   sim.coinSites={};sim.coinRetryAt={};
   if(sim.baseAlignmentKey!==undefined&&environment.builderScene)for(const player of Object.values(sim.players)){const entry=this.collision.safeSpawn(environment,manifest.spawn?.position||builderBaseSpawn(environment));player.position={...entry};player.floor=entry.y;player.velocityY=0;player.grounded=true;}
   sim.baseAlignmentKey=alignmentKey;
  }
  if(!isCasinoEnvironment(environment)&&!isFunhouseEnvironment(environment)&&!isFitnessEnvironment(environment)&&!isFactoryEnvironment(environment)&&!isFactoryTestingEnvironment(environment)&&!isForestHarvestEnvironment(environment)&&!isPrisonEnvironment(environment)&&!isTropicalIslandEnvironment(environment)&&!usesNativeSportsMatch(environment)&&!sim.basketball&&!sim.construction&&!isDedicatedFiringRange(environment))refreshMzkCoins(sim,environment,this.now(),(position,occupied)=>environment.builderScene||environment.proceduralLand?this.collision.safeSpawn(environment,position):this.collision.encounterSpawn(environment,position,this.collision.safeSpawn(environment,environment.spawn||{x:0,y:0,z:2}),occupied));
  if(!isCasinoEnvironment(environment)&&!isFunhouseEnvironment(environment)&&!isFitnessEnvironment(environment)&&!isFactoryEnvironment(environment)&&!isFactoryTestingEnvironment(environment)&&!isForestHarvestEnvironment(environment)&&!isPrisonEnvironment(environment)&&!isTropicalIslandEnvironment(environment)&&!usesNativeSportsMatch(environment)&&!sim.basketball&&!sim.construction&&!isDedicatedFiringRange(environment))populateMapMachine(sim,manifest,environment,this.collision,this.now(),room.objects);

  if(sim.construction){sim.radTox=null;sim.match=null;sim.projectiles={};for(const [id,actor]of Object.entries(sim.actors))if(actor.radTox||actor.loot||actor.runtimeMachine){delete sim.actors[id];if(sim.devices)delete sim.devices[id];}manifest.actors=manifest.actors.filter(actor=>!['hostile','patrol','hazard'].includes(actor.gameplay?.behavior));}
  if(!isPrisonEnvironment(environment))ensureResidentFurnishings(sim,environment,this.collision,room.objects,this.now());
  if(isCasinoEnvironment(environment)&&sim.casinoLayoutVersion!==CASINO_LAYOUT_VERSION){
   for(const player of Object.values(sim.players)){
    if(!player.position)continue;
    const point=player.position,floor=this.collision.groundAt(environment,point,{entry:true,actors:sim.actors,objects:room.objects}),inVault=Math.abs(point.x)<7.4&&point.z<-22.5&&point.z>-37.5;
    if(!inVault&&floor&&Math.abs(floor.y-point.y)<.4&&this.collision.hasBodyClearance(environment,floor,.4,{actors:sim.actors,objects:room.objects}))continue;
    const spawn=this.collision.safeSpawn(environment,environment.spawn||{x:0,y:0,z:32});
    player.position={...spawn};player.floor=spawn.y;player.floorVersion=4;player.velocityY=0;player.grounded=true;player.input={};player.movementRevision=(player.movementRevision||0)+1;
    for(const key of ['heldId','seatedId','vehicleId']){const attached=sim.actors[player[key]];if(attached?.holderId===player.actorId)attached.holderId=null;player[key]=null;}
    if(player.casinoTask?.status==='active'){player.casinoTask.status='cancelled';player.casinoTask.message='The renovated room moved this favor to a safe starting point. Ask your contact to start again.';}
   }
   sim.casinoLayoutVersion=CASINO_LAYOUT_VERSION;
  }
  if(this.aiDefinitionVersions.get(sim)!==contentUpdatedAt){registerAIWorldDefinitions(sim,manifest);this.aiDefinitionVersions.set(sim,contentUpdatedAt);}
  if(!Object.values(sim.actors).some(actor=>actor.resident))this.collision.withActorCandidates(sim.actors,()=>stepWorldResidents(sim,environment,this.now(),0,{collision:this.collision,objects:room.objects}));
  if(!isCasinoEnvironment(environment)&&!isFunhouseEnvironment(environment)&&!isFitnessEnvironment(environment)&&!isFactoryEnvironment(environment)&&!isFactoryTestingEnvironment(environment)&&!isForestHarvestEnvironment(environment)&&!isPrisonEnvironment(environment)&&!isTropicalIslandEnvironment(environment)&&!usesNativeSportsMatch(environment)){ensureRoadFleet(sim,environment,this.collision,room.objects);ensureFreight(sim,environment,this.collision,room.objects);}
  this.completeManifest(sim,environment,manifest,contentUpdatedAt);
  sim.streets=usesNativeSportsMatch(environment)?[]:environment.streets||[];sim.mapRevision=environment.atlas?.revision||0;
  // Persisted timing alone cannot establish initialization in this runtime.
  // The epoch survives detached transaction copies; failed candidates discard
  // their stamp, and a reopened or invalidated runtime always runs migrations.
  sim.preparedEpoch=this.preparationEpoch;sim.preparedAt=this.now();sim.preparedRoomRevision=room.revision||0;
  return {sim,manifest};
 }
 step(room,environment){
  let now=this.now();const prior=room.simulation;
  const fast=prior?.initialized&&prior.preparedEpoch===this.preparationEpoch&&prior.environmentUpdatedAt===this.manifestKey(environment)&&prior.preparedRoomRevision===(room.revision||0)&&prior.mapRevision===(environment.atlas?.revision||0)&&prior.baseAlignmentKey===JSON.stringify(environment.builderScene?.baseTransform||{})&&now>=prior.preparedAt&&now-prior.preparedAt<33;
  let state;
  if(fast){const {manifestKey,manifest}=this.prepareManifest(environment);manifest.objects.push(...syncCommonsArrivalReturns(prior,environment,manifest,now));this.completeManifest(prior,environment,manifest,manifestKey);state={sim:prior,manifest};}
  else {state=this.initialize(room,environment);now=this.now();}
  const {sim,manifest}=state;stepJobDispatch(sim,environment,now);advanceDevicePlayback(sim,now);stepFunhouse(sim,environment,now);stepFitness(sim,environment,now);stepFishing(sim,environment,now);stepShipping(sim,environment,now,{collision:this.collision,objects:room.objects});stepFactory(sim,environment,now);stepFactoryTesting(sim,environment,now);stepFactoryLogistics(sim,environment,now);stepForestHarvest(sim,environment,now);stepPrison(sim,environment,now,{collision:this.collision,objects:room.objects});stepTropicalIsland(sim,environment,now);if(now-sim.time<33){stepFiringRange(sim,now);if(sim.basketball)stepBasketballGame(sim,now,0);checkTeamDefeat(sim,now);advanceRadTox(sim,now,environment);sim.sequence++;return {sim,manifest};}const dt=clamp((now-sim.time)/1000,0,.25);sim.time=now;stepYachtGames(sim.actors,dt);stepPingPong(sim,now,dt,pingPongCollisionContext(this.collision,environment,sim,room.objects));this.collision.withActorCandidates(sim.actors,()=>{stepWorldResidents(sim,environment,now,dt,{collision:this.collision,objects:room.objects});stepAIWorldActions(sim,environment,now,dt,{collision:this.collision,objects:room.objects});});if((!sim.construction||(environment.construction||environment.builderScene?.layoutMeta?.construction)?.ambientActivity===true)&&!isCasinoEnvironment(environment)&&!isFunhouseEnvironment(environment)&&!isFitnessEnvironment(environment)&&!isFactoryEnvironment(environment)&&!isFactoryTestingEnvironment(environment)&&!isForestHarvestEnvironment(environment)&&!isPrisonEnvironment(environment)&&!isTropicalIslandEnvironment(environment)&&!usesNativeSportsMatch(environment))stepRoadActivity(sim,environment,now,dt,{collision:this.collision,objects:room.objects});if(!isCasinoEnvironment(environment)&&!isFunhouseEnvironment(environment)&&!isFitnessEnvironment(environment)&&!isFactoryEnvironment(environment)&&!isFactoryTestingEnvironment(environment)&&!isForestHarvestEnvironment(environment)&&!isPrisonEnvironment(environment)&&!isTropicalIslandEnvironment(environment)&&!usesNativeSportsMatch(environment))stepTransportTraffic(sim,environment,now,dt,{collision:this.collision,objects:room.objects});
  const half=clamp(environment.builderScene?.mapSize||200,20,2000)/2,flightHalf=isShippingEnvironment(environment)?SHIPPING_RULES.extent:half;const baseBounds=environment.builderScene&&(environment.builderScene.baseEnvironment||environment.builderScene.baseTransform)?this.collision.world(environment).bounds:null;
  if(environment.game==='ski')stepSkiLobby(sim,now);
  // Player movement queries share the same actor membership. Craft poses,
  // holders and activity remain live inside each collision query.
  this.collision.withActorCandidates(sim.actors,()=>{
  for(const player of Object.values(sim.players)){
   if(player.basketballAI)continue;
   const latchedJump=this.consumeScheduledJump(sim,environment,player,now);
   if(environment.game==='ski'&&stepSkiAI(sim,player,now,dt))continue;
   if(environment.game==='ski'&&player.skiRace?.status==='countdown'){stepSkiRace(sim,player,player.position,now);if(player.skiRace.status==='countdown'){player.input={};player.skiSpeed=0;continue;}}

   if(now-player.lastSeen>15000){for(const key of ['heldId','seatedId','vehicleId']){const actor=sim.actors[player[key]];if(actor?.holderId)actor.holderId=null;player[key]=null;}player.input={};}if(player.health<=0){for(const key of ['heldId','seatedId','vehicleId']){const held=sim.actors[player[key]];if(held?.holderId===player.actorId)held.holderId=null;player[key]=null;}player.input={};continue;}if(player.replacedByRoom)continue;if(environment.game==='ski'&&stepSkiLift(player,dt,now))continue;if(now-player.lastSeen>1000)continue;
   clearUnavailableAttachments(sim,player);
   if(funhouseRideActive(player,now)){const pose=player.funhouse.ride.pose;player.position={...pose.position};player.floor=pose.position.y;player.velocityY=0;player.grounded=true;player.input={};continue;}
   if(fishingLocked(player)||shippingHandling(player)){player.input={};continue;}
   const bench=sim.actors[player.seatedId];if(bench?.basketballSpectatorSeat){player.position={...bench.position};player.floor=bench.position.y;player.velocityY=0;player.grounded=true;player.input={};continue;}
   if(environment.game==='ski'&&player.skiing&&player.position.x>-101&&player.position.x<-59&&player.position.z>343&&player.position.z<377){player.skiing=false;player.skiSpeed=0;}
   const input=player.input||{},forward=clamp(input.forward,-1,1),side=clamp(input.side,-1,1),length=Math.max(1,Math.hypot(forward,side));
   const hasGeometry=Boolean(environment.builderScene||environment.proceduralLand||environment.modelUrl||environment.modelUrls?.length);
   const boundControl=(current,target)=>hasGeometry?target:clamp(target,Math.min(current,-half),Math.max(current,half));
   const aircraft=sim.actors[player.vehicleId];
   if(isAircraft(aircraft)&&aircraft.active!==false){
    const groundPoint=this.collision.groundAt(environment,aircraft.position,{actors:sim.actors,objects:room.objects,earthworks:sim.construction?.earthworks}),ground=(groundPoint?.y||0)+.4;
    const runway=aircraftRunway(environment,aircraft),lease=runwayClearance(sim.airport,runway);const onRunway=!runway||(Math.abs(aircraft.position.x-runway.x)<runway.width/2-1&&Math.abs(aircraft.position.z-runway.z)<runway.length/2);const cleared=!sim.airport||(onRunway&&lease?.runwayHolder===player.actorId&&lease.expires>now);
    const assistedInput=aircraftAssistedInput(aircraft,input,environment,now);const pose=stepAircraftFlight(aircraft,(player.fuel??100)>0?assistedInput:{...assistedInput,throttle:0},dt,{ground,ceiling:environment.airport?.ceiling||80,half:flightHalf,cleared,blocked:(from,to,yaw)=>{const delta=[to.x-from.x,to.y-from.y,to.z-from.z],span=Math.hypot(...delta);if(span<.001)return false;return [-4.8,0,4.8].some(side=>this.collision.blocksShot(environment,{x:from.x+Math.cos(yaw)*side-Math.sin(yaw)*2.8,y:from.y+.9,z:from.z-Math.sin(yaw)*side-Math.cos(yaw)*2.8},delta.map(n=>n/span),span+.1,sim.actors));}});
    Object.assign(aircraft,pose);player.fuel=Math.max(0,(player.fuel??100)-dt*pose.flight.throttle*.035);aircraft.flight.fuel=player.fuel;if(pose.flight.impactDamage>0)aircraft.health=Math.max(0,aircraft.health-pose.flight.impactDamage);if(aircraft.health<=0){aircraft.active=false;aircraft.destroyedAt=now;aircraft.holderId=null;player.vehicleId=null;player.health=0;player.input={};combatStats(player).deaths++;player.position=this.collision.safeSpawn(environment,environment.spawn||{x:0,y:0,z:0});player.floor=player.position.y;player.velocityY=0;player.grounded=true;player.movementRevision=(player.movementRevision||0)+1;continue;}player.position={...pose.position};player.yaw=pose.rotation.y;player.floor=pose.position.y;player.velocityY=0;player.grounded=!pose.flight.airborne;player.locationName=pose.flight.airborne?'Airport airspace':'Airport apron';
    if(lease?.runwayHolder===player.actorId&&((pose.flight.clearance==='takeoff'&&pose.flight.altitude>5&&pose.flight.navigationDestinationId!==runway?.id)||(pose.flight.clearance==='landing'&&!pose.flight.airborne&&!onRunway&&pose.flight.speed<.5))){lease.runwayHolder=null;lease.expires=0;}
    continue;
   }
   const boat=sim.actors[player.vehicleId];if(boat?.active===false)player.vehicleId=null;
   if(isWatercraft(boat)&&boat.active!==false){
    const blocked=boatMovementBlocked(environment,boat,sim.actors,this.collision,room.objects);
    const assistedInput=boatAssistedInput(boat,input,environment,now,sim.actors,blocked);const pose=stepBoatSimulation(boat,(boat.modelId||boat.asset?.buildAssetId)==='resort-paddle-boat'||(player.fuel??100)>0?assistedInput:{...assistedInput,throttle:0},dt,{environment,now,blocked});
    Object.assign(boat,pose);boat.maxHealth=shippingHullHealth(boat)??boat.maxHealth??(isCombatBoat(boat)?650:isFishingBoat(boat)?300:200);boat.health=Math.max(0,(boat.health??boat.maxHealth??200)-(pose.boating.impactDamage||0));if(!pose.boating.pedalDriven)player.fuel=Math.max(0,(player.fuel??100)-dt*Math.abs(pose.boating.throttle)*.02);boat.boating.fuel=player.fuel;
    if(boat.health<=0){boat.active=false;boat.destroyedAt=now;boat.holderId=null;stopBoat(boat);player.vehicleId=null;player.position=this.collision.safeSpawn(environment,environment.spawn||{x:124,y:0,z:30});player.floor=player.position.y;player.velocityY=0;player.grounded=true;player.input={};player.movementRevision=(player.movementRevision||0)+1;continue;}
    player.position={...pose.position,y:.35};player.yaw=pose.rotation.y;player.floor=.35;player.velocityY=0;player.grounded=true;player.locationName=isShippingEnvironment(environment)?(pose.boating.anchor?'Strait cargo berth':'Strait shipping channel'):(pose.boating.phase==='moored'||pose.boating.anchor?'Neon Marina berth':'Neon Harbor waterways');continue;
   }
   const road=sim.actors[player.vehicleId];if(isRoadVehicle(road)&&road.active!==false){
    // Preserve the actor ID to suppress its authored spawn collider while
    // the shared construction interlock decides whether travel is available.
    const others={...sim.actors,[road.id]:{...road,active:false},...(road.trailerId?{[road.trailerId]:{...sim.actors[road.trailerId],active:false}}:{})},roadInput=isConstructionMachine(road)&&!constructionTravelStatus(road).allowed?{brake:true}:input;
    if(isConstructionMachine(road)&&Math.abs(road.driving?.speed||0)<.001&&Math.abs(roadInput.forward||0)<.001&&Math.abs(roadInput.side||0)<.001){road.driving={...road.driving,speed:0,throttle:0,steering:0,parked:true};}
    else for(let remaining=dt;remaining>1e-8;remaining-=.05)Object.assign(road,stepRoadVehicle(road,roadInput,Math.min(.05,remaining),{groundAt:point=>constructionGroundAt(road,point,p=>this.collision.groundAt(environment,p,{actors:others,objects:room.objects,earthworks:sim.construction?.earthworks})),speedLimit:roadSpeedLimit(environment,road.position)/3.6,blocked:(from,to,yaw)=>freightTrailerBlocked(sim,road,from,to,yaw,this.collision,environment,room.objects)||harborWaterAt(environment,to)||roadMovementBlocked(this.collision,environment,sim.actors,room.objects,road,from,to,yaw,{earthworks:sim.construction?.earthworks,players:sim.players,crew:sim.construction?.crew})}));
    player.position={...road.position};player.yaw=road.rotation.y;player.floor=road.position.y;player.grounded=true;player.velocityY=0;player.locationName=roadVehicleType(road).name;continue;
   }
   let speed=player.vehicleId?12:harborWaterAt(environment,player.position)?2.8:input.sprint?6:4;
   if(player.seatedId) speed=0;
   const next={...player.position,x:boundControl(player.position.x,player.position.x+(-Math.sin(player.yaw)*forward+Math.cos(player.yaw)*side)*speed*dt/length),z:boundControl(player.position.z,player.position.z+(-Math.cos(player.yaw)*forward-Math.sin(player.yaw)*side)*speed*dt/length)};

   if(environment.game==='ski'&&player.skiing){const motion=skiMotion(player,input,dt);next.x=motion.x;next.z=motion.z;const incline=(skiHeight(next.x,next.z)-skiHeight(player.position.x,player.position.z))/Math.max(.01,Math.hypot(next.x-player.position.x,next.z-player.position.z));if(player.grounded&&motion.speed>8&&(player.skiIncline||0)>.08&&incline<-.03){player.velocityY=Math.min(9,motion.speed*(player.skiIncline||0));player.grounded=false;}player.skiIncline=incline;}
   const floor=hasGeometry?-100:Number(player.floor)||0;
   if((input.jump||latchedJump)&&player.grounded){player.velocityY=6;player.grounded=false;}
   player.velocityY=(player.velocityY||0)-18*dt;next.y=Math.max(floor,next.y+player.velocityY*dt);player.grounded=next.y<=floor;if(player.grounded)player.velocityY=0;
   // One swept resolver handles map geometry and placed solids together.
   // A wall removes only the blocked control component; it never ejects the
   // player or cancels a valid slide along its surface.
   const previousSkiPosition=environment.game==='ski'?{...player.position}:null;
   const resolved=this.collision.resolve(environment,player.position,constrainCompoundPosition(player,player.position,next,environment),sim.actors,room.objects,{earthworks:sim.construction?.earthworks});
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
   if(environment.game==='ski')stepSkiRace(sim,player,previousSkiPosition,now);
   const street=(environment.streets||[]).map(street=>{const dx=street.to.x-street.from.x,dz=street.to.z-street.from.z,t=Math.max(0,Math.min(1,((player.position.x-street.from.x)*dx+(player.position.z-street.from.z)*dz)/Math.max(.01,dx*dx+dz*dz)));return {street,distance:Math.hypot(player.position.x-street.from.x-dx*t,player.position.z-street.from.z-dz*t)};}).filter(hit=>hit.distance<=hit.street.width/2+2).sort((a,b)=>a.distance-b.distance)[0];player.locationName=street?.street.name||player.meetingName||environment.name;
   updateUrbanMission(player,now);

   if(player.vehicleId){const vehicle=sim.actors[player.vehicleId];if(vehicle){vehicle.position={...player.position,...(isWatercraft(vehicle)?{y:0}:{})};vehicle.rotation.y=player.yaw;}}
   if(player.heldId){const held=sim.actors[player.heldId];if(held)held.position={x:player.position.x-Math.sin(player.yaw),y:player.position.y+1,z:player.position.z-Math.cos(player.yaw)};}
  }
  });
  if(environment.id===COMPOUND_ID)for(const player of Object.values(sim.players))this.constrainCompoundPlayer(sim,player,environment,player.position);
  if(isCasinoEnvironment(environment))stepCasinoTasks(sim,now);
  const constructionContext=this.constructionContext(sim,environment,room.objects);
  stepConstructionCrew(sim,now,dt,constructionContext);
  stepConstruction(sim,now,dt,constructionContext);
  stepQuarry(sim,environment,now,dt);
  stepCargoTrailers(sim,environment,dt,this.collision,room.objects);
  stepWorldAirFreight(sim,environment,now);
  stepVehicleMissions(sim,now);stepExpandedQuests(sim,environment,now,dt,{collision:this.collision,objects:room.objects});refreshAIConversationWork(sim);
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
  else if(!sim.construction&&!isFunhouseEnvironment(environment)&&!isFitnessEnvironment(environment)&&!isFactoryEnvironment(environment)&&!isFactoryTestingEnvironment(environment)&&!isForestHarvestEnvironment(environment)&&!isPrisonEnvironment(environment)&&!isDedicatedFiringRange(environment))stepEnemyCombat(sim,{now,dt,environment,collision:this.collision});

  checkTeamDefeat(sim,now);advanceRadTox(sim,now,environment);
  this.prepareEncounter(sim,environment);
  sim.sequence++;return {sim,manifest};
 }
 view(room){const sim=room.simulation,now=this.now();return {authoritative:true,doomsday:doomsdayView(sim),quarry:sim.quarry||null,freightHubs:sim.freightHubs||[],freightDeliveries:sim.freightDeliveries||[],sceneVersion:sim.environmentUpdatedAt,population:worldPopulation(sim,now),residentLife:residentLifeView(sim),casinoLife:casinoLifeView(sim),forestHarvest:forestHarvestView(sim),forestSnake:forestSnakeView(sim),prison:prisonSnapshot(sim),island:tropicalIslandView(sim),fitness:fitnessView(sim,now),pingPong:pingPongView(sim),fishing:fishingView(sim),shipping:shippingView(sim),factory:factoryView(sim,now),testing:factoryTestingView(sim,now),logistics:factoryLogisticsView(sim,now),construction:constructionView(sim),questTeams:questTeamOffers(sim,now),liveDispatch:sim.liveDispatch||null,questOffers:sim.questOffers||[],questResults:sim.questResults||[],transportRadio:sim.transportRadio||[],skiCompetition:skiCompetitionView(sim),airport:sim.airport?{runwayHolder:sim.airport.runwayHolder||null,expires:sim.airport.expires||0}:null,building:buildingPolicy(room),firingRange:sim.firingRange?copy(sim.firingRange):null,basketball:sim.basketball?copy(sim.basketball):null,match:matchView(sim,now),radTox:sim.radTox?copy(sim.radTox):null,projectiles:sim.projectiles||{},streets:sim.streets||[],mapRevision:sim.mapRevision||0,serverTime:now,simulationTime:sim.time,sequence:sim.sequence,objects:room.objects,actors:sim.actors,devices:projectArcadeDevices(sim.devices||{}),players:Object.fromEntries(Object.entries(sim.players).filter(([,p])=>now-p.lastSeen<15000).map(([id,p])=>[id,{id,username:p.username,locationName:p.locationName,modelUrl:p.modelUrl,avatarBuildAssetId:p.avatarBuildAssetId||null,position:p.position,movementRevision:p.movementRevision||0,radToxReady:p.radToxReady!==false,radToxEnabled:p.radToxEnabled!==false,input:{...p.input,yaw:p.yaw},yaw:p.yaw,health:p.health,hitsRemaining:Math.round(p.health*PLAYER_HIT_CAPACITY/100),spawnProtectedUntil:p.spawnProtectedUntil||0,combat:combatStats(p),ammo:p.ammo??120,fuel:p.fuel??100,score:p.score,island:playerTropicalIslandView(p),funhouse:playerFunhouseView(p),urbanMission:p.urbanMission||null,forestHarvest:p.forestHarvest||null,fitness:fitnessRoundSnapshot(p.fitness),pingPong:p.pingPong?{...p.pingPong}:null,fishing:playerFishingView(sim,p),shipping:sim.shipping?.enabled?playerShippingView(sim,p):null,airFreight:playerAirFreightView(p),fitnessProgress:p.fitnessProgress||null,factory:p.factory?{job:p.factory.job,progress:p.factory.progress}:null,testing:publicTestingState(p.testing),logistics:publicLogisticsState(p.logistics),fitnessCoach:p.fitnessCoach||null,vehicleMission:p.vehicleMission||null,mapQuestProgress:p.mapQuestProgress||null,npcConversation:p.npcConversation||null,residentTask:p.residentTask||null,residentInvitation:p.residentInvitation||null,residentVisit:p.residentVisit||null,residentProgress:residentProgressView(p),casinoTask:casinoTaskView(p),casinoProgress:casinoProgressView(p),residentNearby:p.residentNearby||null,stats:{...p.stats,health:p.health},inventory:p.inventory,quests:p.quests,progress:p.progress||{},heldId:p.heldId,basketballAI:Boolean(p.basketballAI),basketballNumber:p.basketballNumber||null,basketballRole:p.basketballRole||'player',basketballTeam:p.basketballTeam||null,basketballJersey:p.basketballJersey||null,basketballPoints:p.basketballPoints||0,basketballStealAt:p.basketballStealAt??null,firingRangeRole:p.firingRangeRole||null,firingRangeLane:p.firingRangeLane??null,seatedId:p.seatedId,vehicleId:p.vehicleId,skiing:!!p.skiing,skiSpeed:p.skiSpeed||0,skiHeading:p.skiHeading??p.yaw,skiAssist:p.skiAssist!==false,skiRace:p.skiRace||null,skiStats:p.skiStats||null,skiLift:p.skiLift||null,vehicleSeat:isAircraft(sim.actors[p.vehicleId])?'cockpit':isWatercraft(sim.actors[p.vehicleId])?(fishingLocked(p)?'fishing':'helm'):null,grounded:p.grounded}])),events:sim.events.slice(-30).map(event=>({...fitnessEventSnapshot(event),...(event.factory?{factory:publicFactoryState(event.factory)}:{}),...(event.testing?{testing:publicTestingState(event.testing)}:{}),...(event.logistics?{logistics:publicLogisticsState(event.logistics)}:{})}))};}
 snapshot(id,environment){this.activeWorlds.set(id,environment);this.collision.activateWorld(environment.id);return this.store.update(id,room=>{this.step(room,environment);return this.view(room);},{persist:false,roomOnly:true});}
 command(id,environment,identity,command,{projectResult=value=>value}={}){const receivedAt=this.now(),requestedAction=command.action,transientCommand=requestedAction==='input'||requestedAction==='construction-controls'&&command.operation==='control';this.activeWorlds.set(id,environment);this.collision.activateWorld(environment.id);return this.store.update(id,async (room,allRooms)=>{
  if(environment.id===COMPOUND_ID&&requestedAction==='join')await this.testingAccess(identity,{deep:false});
  const actorId='account:'+identity.accountId,arrivingPlayer=room.simulation?.players?.[actorId];
  const requestId=String(command.requestId||'');if(!/^[\w-]{1,100}$/.test(requestId))fail('A command request ID is required.');
  // Inputs dominate the replay window. Bound their stored key size and omit
  // empty results, while reading old saves and checking cross-action ID reuse.
  const legacyReceiptKey=actorId+':'+requestId,compactReceiptKey='input-v2:'+createHash('sha256').update(legacyReceiptKey).digest('base64url');
  const priorReceipt=()=>room.simulation?.receipts?.[legacyReceiptKey]||room.simulation?.receipts?.[compactReceiptKey];
  const currentInput=Boolean(arrivingPlayer?.inputEpoch&&command.inputEpoch===arrivingPlayer.inputEpoch&&Number.isSafeInteger(command.inputSequence)&&command.inputSequence>=0&&command.inputSequence>(arrivingPlayer.lastInputSequence??-1));
  const returningInput=currentInput&&!priorReceipt();
  const freshInput=requestedAction==='input'&&arrivingPlayer&&!arrivingPlayer.replacedByRoom&&(receivedAt-arrivingPlayer.lastSeen<15000||returningInput);
  const scheduledInput=this.scheduledInputs&&requestedAction==='input'&&currentInput&&!priorReceipt()&&this.canScheduleInput(room,environment,arrivingPlayer,receivedAt);
  // Shader compilation or a suspended tab can outlast the presence lease.
  // Fresh ordered controls for the current join resume that same player; old
  // epochs, replays and players who changed rooms still require a new join.
  if(freshInput){if(receivedAt-arrivingPlayer.lastSeen>=15000){
   cancelFishing(arrivingPlayer,room.simulation,receivedAt,'Connection paused. Cast again when ready.');
   cancelShipping(arrivingPlayer,room.simulation,receivedAt,'Connection paused. Return to port for a new freight manifest.');cancelWorldAirFreight(arrivingPlayer,receivedAt,'Connection paused. Air cargo remains at the receiving port.');
   if(arrivingPlayer.shipping?.job?.factoryManifestId)await this.shippingReturn(identity,arrivingPlayer,receivedAt);
   // Inspect the expired presence before fresh controls renew it, so an old
   // gallery round cannot settle merely because a suspended tab resumes.
   stepFunhouse(room.simulation,environment,receivedAt);
   const active=Object.entries(room.simulation.players).filter(([id,p])=>id!==actorId&&!p.basketballAI&&receivedAt-p.lastSeen<15000);
   if(active.length>=(environment.publicDestination?128:this.capacity))fail('This multiplayer room is full.',409);
   arrivingPlayer.input={};
  }arrivingPlayer.lastSeen=this.now();}
  const {sim,manifest}=scheduledInput?this.scheduledInputFrame(room,environment):this.step(room,environment),now=this.now();
  if(freshInput&&sim.players[actorId]&&!sim.players[actorId].replacedByRoom)sim.players[actorId].lastSeen=now;
  const spawnSignature=requestedAction==='spawn'?JSON.stringify([command.itemId||null,command.sku||null,command.modelId||null]):null,prisonSignature=prisonCommandSignature(command);
  sim.receipts ||= {};const receiptKey=requestedAction==='input'?compactReceiptKey:legacyReceiptKey,prior=priorReceipt();if(prior){if(prior.action!==requestedAction||spawnSignature&&prior.spawnSignature&&prior.spawnSignature!==spawnSignature)fail('Request ID already used for another item or action.',409);if(prisonSignature&&prior.prisonSignature!==prisonSignature)fail(prior.prisonSignature?'Request ID already used for another prison packet.':'This saved prison request has no packet signature. Retry with a new request id.',409);return projectResult({...this.view(room),selfId:actorId,inputEpoch:sim.players[actorId]?.inputEpoch,result:prior.action==='input'&&prior.result===undefined?{}:prior.result});}
  let player=sim.players[actorId],result={};const priorCommandPosition=player?{...player.position}:null,priorMovementRevision=player?.movementRevision||0;const basketballLateArrival=sim.basketball?.state==='live'&&(!player||player.basketballRole==='spectator'||now-player.lastSeen>=15000||player.replacedByRoom);
  const rangeWasActive=Boolean(player&&!player.replacedByRoom&&now-player.lastSeen<15000);
  await this.releaseCancelledSupply(identity,sim,player,environment,now);
  if(command.action==='join'){
   const active=Object.entries(sim.players).filter(([id,p])=>id!==actorId&&!p.basketballAI&&now-p.lastSeen<15000);if(active.length>=(environment.publicDestination?128:this.capacity))fail('This multiplayer room is full.',409);
   let travel=null,travelSource=null;
   if(command.travelToken){
    travelSource=allRooms[String(command.travelFrom||'')]?.simulation?.players[actorId];const pending=travelSource?.pendingTravel;
    if(pending?.token===command.travelToken&&pending.to===id&&pending.expiresAt>=now)travel=pending;
    else if(!(player?.lastPortalArrival?.token===command.travelToken&&player.lastPortalArrival.from===command.travelFrom&&player.lastPortalArrival.expiresAt>=now))fail('This portal trip has expired. Enter the portal again.',409,'PORTAL_TRIP_EXPIRED');
   }
   const entryCollision={actors:sim.actors,objects:room.objects,earthworks:sim.construction?.earthworks};
   const defaultEntry=manifest.spawn?.position||builderBaseSpawn(environment)||environment.spawn||{x:0,y:0,z:2};
   const meeting=command.meetingId&&(environment.meetingPoints||[]).find(point=>point.id===command.meetingId);if(command.meetingId&&!meeting)fail('Shared meeting point not found.',404);let spawn=meeting?this.collision.meetingPosition(environment,meeting.position,sim.actors,room.objects,entryCollision):!player||player.floorVersion!==4?this.collision.safeSpawn(environment,defaultEntry,entryCollision):null;
   if(travel){const reciprocal=ensureCommonsArrivalReturn(sim,environment,manifest,travel.from,this.activeWorlds.get(travel.from)?.name,this.collision,room.objects,now);if(reciprocal){manifest.objects.push(reciprocal);manifest.actors.push(reciprocal);}spawn=portalArrivalPosition(environment,manifest,travel.from,this.collision,sim.actors,room.objects);}
   if(player)clearUnavailableAttachments(sim,player,actorId);
   if(player&&player.floorVersion!==4&&!meeting){player.position={...spawn};player.floor=spawn.y;player.velocityY=0;player.floorVersion=4;player.grounded=true;player.movementRevision=(player.movementRevision||0)+1;for(const key of ['heldId','seatedId','vehicleId']){const attached=sim.actors[player[key]];if(attached?.holderId===actorId)attached.holderId=null;player[key]=null;}}
   const enteringWalkthrough=command.residentWalkthrough===true&&!player?.residentWalkthroughMode;
   if(!player&&!meeting&&!travel&&command.residentWalkthrough!==true){const count=active.length;spawn=this.collision.safeSpawn(environment,sim.basketball?{x:-5.25+(count%8)*1.5,y:0,z:7.5-Math.floor(count/8)}:{...spawn,x:spawn.x+(count%4)*1.2,z:spawn.z+Math.floor(count/4)*1.2},entryCollision);}
   if(player&&player.floorVersion===4&&!meeting&&!travel){
    const occupied=id=>{const actor=sim.actors[id];return actor&&actor.active!==false&&actor.holderId===actorId;};
    const attached=occupied(player.seatedId)||occupied(player.vehicleId)||environment.game==='ski'&&skiLifts.some(lift=>lift.id===player.skiLift?.id);
    // Preserve valid walking, jumping and occupied vehicle/seat positions. A
    // saved position can become unsafe when a room is edited while away.
    if(!attached&&(environment.builderScene||environment.proceduralLand||environment.modelUrl||environment.modelUrls?.length)){
     const point=player.position,finite=point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
     const floor=finite&&this.collision.groundAt(environment,point,entryCollision);
     const supported=floor&&point.y>=floor.y-.1&&(!player.grounded||Math.abs(point.y-floor.y)<.45);
     // Returning players use their real capsule and may slide away from a
     // nearby wall; the larger new-entry clearance would reject small rooms.
     const clear=supported&&this.collision.hasWalkingExit(environment,point,sim.actors,room.objects,{earthworks:entryCollision.earthworks});
     if(!clear){
      const recovered=this.collision.safeSpawn(environment,finite?point:defaultEntry,entryCollision);
      player.position={...recovered};player.floor=recovered.y;player.velocityY=0;player.grounded=true;player.skiLift=null;player.skiing=false;player.skiSpeed=0;
      for(const key of ['seatedId','vehicleId']){const actor=sim.actors[player[key]];if(actor?.holderId===actorId)actor.holderId=null;player[key]=null;}
      player.movementRevision=(player.movementRevision||0)+1;
     }
    }
   }
   if(!player)player=sim.players[actorId]={username:identity.username,position:{x:Number(spawn.x)||0,y:Number(spawn.y)||0,z:Number(spawn.z)||0},floor:Number(spawn.y)||0,floorVersion:4,yaw:0,velocityY:0,grounded:true,ammo:120,fuel:100,health:clamp(identity.stats?.health??100,0,100),stats:identity.stats||{},score:0,inventory:[],quests:{},cooldowns:{},lastSeen:now};
   for(const [otherId,otherRoom]of Object.entries(allRooms)){if(otherId===id)continue;const previous=otherRoom.simulation?.players[actorId];if(!previous)continue;cancelPingPong(otherRoom.simulation,previous,'World travel ended the rally.');cancelFunhouseActivities(previous,now,'World travel ended this attraction.');cancelFishing(previous,otherRoom.simulation,now,'World travel ended this fishing cast.');cancelShipping(previous,otherRoom.simulation,now,'World travel ended this freight contract.');cancelWorldAirFreight(previous,now,'World travel ended this air cargo flight.');await this.releaseCancelledSupply(identity,otherRoom.simulation,previous,this.activeWorlds.get(otherId),now);if(previous.shipping?.job?.factoryManifestId)await this.shippingReturn(identity,previous,now);previous.lastSeen=0;previous.replacedByRoom=id;if(previous.residentVisit?.status==='active'){previous.residentVisit.status='cancelled';previous.residentVisit.message='World travel ended this activity visit.';}if(previous.residentInvitation&&['offered','joined'].includes(previous.residentInvitation.status))previous.residentInvitation.status='cancelled';if(previous.residentTask?.status==='active'){previous.residentTask.status='cancelled';previous.residentTask.message='World travel ended this favor. Ask your contact to start again.';}if(previous.casinoTask?.status==='active'){previous.casinoTask.status='cancelled';previous.casinoTask.message='World travel ended this casino favor. Ask your contact to start again.';}previous.input={};for(const key of ['heldId','seatedId','vehicleId']){const held=otherRoom.simulation.actors[previous[key]];if(held)held.holderId=null;previous[key]=null;}}
   if(travel){player.lastPortalArrival=travel;delete travelSource.pendingTravel;}
   if(meeting||travel){player.position={...spawn};player.floor=spawn.y;player.velocityY=0;player.grounded=true;}player.input={};player.inputEpoch=randomUUID();player.lastInputSequence=-1;player.username=identity.username;player.modelUrl=identity.avatar?.modelUrl||null;player.avatarBuildAssetId=identity.avatar?.buildAssetId||null;player.lastSeen=now;player.replacedByRoom=null;player.walletId=identity.walletId;player.meetingName=meeting?.name||environment.name;player.locationName=player.meetingName;player.actorId=actorId;
   if(isTropicalIslandEnvironment(environment))stepTropicalIsland(sim,environment,now);
   delete player.pendingJump;
   player.residentWalkthroughMode=command.residentWalkthrough===true;
   restoreResidentContinuity(player,allRooms,actorId,id,now);
   if(environment.builderScene?.layoutMeta?.harbor)applyFishingAccount(player,await this.fishingState(identity));
   if(isShippingEnvironment(environment))applyShippingAccount(player,await this.shippingState(identity));
   if(isFitnessEnvironment(environment)){const saved=await this.fitnessState(identity);if(saved?.progress)player.fitnessProgress=saved.progress;player.radToxEnabled=false;player.radToxReady=true;}
   if(isFactoryEnvironment(environment)){player.factory=await this.factoryState(identity,now,environment,sim);player.radToxEnabled=false;player.radToxReady=true;}
   if(isForestHarvestEnvironment(environment)){player.radToxEnabled=false;player.radToxReady=true;forestHarvestCommand(sim,player,environment,{action:'forest-status'},now);await this.forestReconcile(identity,sim,player,environment);}
   if(isPrisonEnvironment(environment)){player.radToxEnabled=false;player.radToxReady=true;stepPrison(sim,environment,now,{collision:this.collision,objects:room.objects});applyPrisonRewardState(sim,player,await this.prisonState(identity));}
   if(isFactoryTestingEnvironment(environment)){player.testing=await this.testingState(identity,now,environment,sim);player.radToxEnabled=false;player.radToxReady=true;}
   if(isFactoryLogisticsEnvironment(environment)){player.logistics=await this.logisticsState(identity,now,environment,sim);result.logistics=player.logistics;}
   if(!supportsRadTox(environment)){player.radToxEnabled=false;player.radToxReady=true;}
   if(sim.basketball){player.health=100;if(basketballLateArrival||command.residentWalkthrough===true)watchBasketballGame(sim,player,now);else assignBasketballTeam(sim,player,now);}else if(supportsRadTox(environment)){if(typeof command.radToxEnabled==='boolean')player.radToxEnabled=command.radToxEnabled;player.radToxReady=player.radToxEnabled===false||command.deferRadTox!==true;if(player.radToxEnabled!==false){startRadTox(sim,environment,now,player.position);if(player.radToxReady)registerParticipant(sim,actorId,player,now);}}
   if(sim.firingRange){if(isDedicatedFiringRange(environment))player.health=100;registerFiringRangeArrival(sim,player,now,rangeWasActive);}
   resumeDefeatedExplorer(sim,player);
   if(enteringWalkthrough&&!meeting&&!travel){const arrival=residentArrivalPosition(sim,environment,this.collision,room.objects);if(arrival){player.position={...arrival};player.floor=arrival.y;player.velocityY=0;player.grounded=true;player.movementRevision=(player.movementRevision||0)+1;}if(player.residentTask?.status==='active'){player.residentTask.status='cancelled';player.residentTask.message='Entering the public walkthrough reset this favor.';}}
   room.building ||=buildingPolicy(room,environment);if(!room.building.hostId||!sim.players[room.building.hostId]||now-sim.players[room.building.hostId].lastSeen>=15000)room.building.hostId=actorId;
   result.message='Joined '+player.locationName;result.inputEpoch=player.inputEpoch;
  }else{
   if(player?.replacedByRoom)fail('This account joined another destination. Reload to rejoin this room.',409,'ROOM_SWITCHED');if(!player||now-player.lastSeen>15000)fail('Join this room before sending gameplay commands.',409,'ROOM_JOIN_REQUIRED');
   player.lastSeen=now;player.username=identity.username;player.modelUrl=identity.avatar?.modelUrl||null;player.avatarBuildAssetId=identity.avatar?.buildAssetId||null;
   if(isShippingEnvironment(environment)&&['map-access','teleport-floor','exit-vehicle','respawn'].includes(command.action))cancelShipping(player,sim,now,'Travel or leaving the vessel ended this freight contract.');
   if(fishingLocked(player)&&!['fishing','input','map-access','interact','teleport-floor','exit-vehicle','doomsday'].includes(command.action))fail('Pack away your fishing line before using other game actions.',409);
   if(fishingLocked(player)&&['map-access','interact','teleport-floor','exit-vehicle'].includes(command.action))cancelFishing(player,sim,now);
   if(player.radToxReady===false&&player.radToxEnabled!==false&&command.action==='fire')fail('Finish loading RAD-TOX before firing.',409,'GAME_NOT_READY');
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
   if(command.action==='shipping'){
    applyShippingAccount(player,await this.shippingState(identity));
    if(command.operation==='accept'&&command.shipmentId&&(command.manifestId||command.factoryManifestId||command.contractId==='atlas-export'))fail('Choose one factory cargo manifest for this voyage.',422);
    let supply=null,freight;
    try{
     if(command.operation==='accept'&&command.shipmentId){
      supply=await this.supplyAction(identity,sim,player,environment,{...command,operation:'reserve'},now);
      if(!supply?.shipmentId)fail('The factory shipment is unavailable.',409);
     }
     freight=shippingCommand(sim,player,environment,command,now);
     if(command.operation==='accept'&&player.shipping?.job?.contractId==='atlas-export'){try{await this.shippingBind(identity,player,command,now);}catch(error){cancelShipping(player,sim,now,'Atlas cargo binding failed. The staged model remains at the export desk.');throw error;}}
     if(supply){
      const job=player.shipping.job;
      Object.assign(job,{shipmentId:supply.shipmentId,supplyManifest:copy(supply.supplyManifest||[]),destinationMapId:supply.destinationMapId,...(supply.packing?{supplyPacking:copy(supply.packing)}:{}),...(supply.challenge?{supplyChallenge:copy(supply.challenge)}:{})});
      await this.supplyAction(identity,sim,player,environment,{...command,operation:'bind',shipmentId:supply.shipmentId,jobId:job.id,contractId:job.contractId},now);
     }
    }catch(error){
     if(supply)await this.supplyAction(identity,sim,player,environment,{...command,operation:'release',shipmentId:supply.shipmentId,jobId:player.shipping?.job?.id},now);
     throw error;
    }
    Object.assign(result,freight);
    if(freight.settlement){
     const job=player.shipping?.job;
     if(freight.settlement.type==='delivery'&&job?.shipmentId)result.supplyReceipt=await this.supplyDelivery(identity,{...freight.settlement,shipmentId:job.shipmentId,jobId:job.id},environment,now);
     const receipt=await this.shippingReward(identity,freight.settlement);
     Object.assign(result,applyShippingSettlement(sim,player,freight.settlement,receipt,now));delete result.settlement;
    }
    if(player.shipping?.job?.factoryManifestId){player.logistics=await this.logisticsState(identity,now,environment,sim);result.logistics=player.logistics;}
   }
   else if(command.action==='fishing'){applyFishingAccount(player,await this.fishingState(identity));const fishingResult=fishingCommand(sim,player,environment,command,now,{visible:(from,to,boatId)=>{const span=distance(from,to),actors=boatId?{...sim.actors,[boatId]:{...sim.actors[boatId],holderId:actorId}}:sim.actors;return !this.collision.blocksShot(environment,from,[(to.x-from.x)/span,(to.y-from.y)/span,(to.z-from.z)/span],span,actors);}});Object.assign(result,fishingResult);if(fishingResult.settlement){const receipt=await this.fishingReward(identity,fishingResult.settlement);Object.assign(result,applyFishingSettlement(sim,player,fishingResult.settlement,receipt,now));delete result.settlement;}}
   else if(command.action==='forest-export'){await this.forestReconcile(identity,sim,player,environment);Object.assign(result,await this.forestExport(identity,sim,player,environment,command,now));}
   else if(typeof command.action==='string'&&command.action.startsWith('forest-')){await this.forestReconcile(identity,sim,player,environment);Object.assign(result,forestHarvestCommand(sim,player,environment,command,now));}
   else if(command.action==='prison-claim-item'){Object.assign(result,await this.prisonClaim(identity,sim,player,environment,command,now));}
   else if(command.action==='prison-action'){Object.assign(result,prisonCommand(sim,player,environment,command,now,{collision:this.collision,objects:room.objects}));}
   else if(isPrisonEnvironment(environment)&&['fire','teleport-floor','map-access','building-settings'].includes(command.action))fail('Prison challenges use walking routes and prison activities. Open Prison to choose your next challenge.',409);
   else if(/^logistics-/.test(command.action)){Object.assign(result,await this.logisticsAction(identity,sim,player,environment,command,now));if(isShippingEnvironment(environment))applyShippingAccount(player,await this.shippingState(identity));}
   else if(/^proving-/.test(command.action)){
    Object.assign(result,await this.testingAction(identity,sim,player,environment,command,now));
    if(result.travel){const trip=result.travel;delete result.travel;
     if(trip.destination===environment.id){delete result.destination;const arrival=this.collision.meetingPosition(environment,trip.position,sim.actors,room.objects);releaseForMapTravel(sim,player,manifest,now);player.position=arrival;player.floor=arrival.y;player.velocityY=0;player.grounded=true;player.movementRevision=(player.movementRevision||0)+1;}
     else{if(this.resolveDestination&&!await this.resolveDestination(trip.destination))fail('The linked testing destination is unavailable.',404);result.destination=trip.destination;}
    }
   }
   else if(isFactoryTestingEnvironment(environment)&&['start-rad-tox','next-rad-tox'].includes(command.action))fail('This facility runs equipment tests. Open Test range to prepare a model.',409);
   else if(/^factory-/.test(command.action)){Object.assign(result,await this.factoryAction(identity,sim,player,environment,command,now));}
   else if(isFactoryEnvironment(environment)&&['start-rad-tox','next-rad-tox'].includes(command.action))fail('The factory runs production jobs. Open Factory to choose a project.',409);
   else if(command.action==='funhouse-equip'){const asset=await this.resolveAsset(identity,command);if(!asset)fail('Purchase this clown item before equipping it.',403);Object.assign(result,equipOwnedFunhouseItem(player,asset,command));}
   else if(command.action==='funhouse-water'){const owned=player.funhouse?.equipment?.water;if(!owned||!await this.resolveAsset(identity,owned))fail('An owned water blaster is required.',403);Object.assign(result,sprayOwnedFunhouseWater(player,command,now));}
   else if(command.action==='island-action'){Object.assign(result,tropicalIslandCommand(sim,player,environment,command,now));}
   else if(/^funhouse-/.test(command.action)){Object.assign(result,funhouseCommand(sim,player,environment,command,now));}
   else if(/^fitness-/.test(command.action)){const fitnessResult=fitnessCommand(sim,player,environment,command,now);Object.assign(result,fitnessResult);if(fitnessResult.settlement){const receipt=await this.fitnessReward(identity,fitnessResult.settlement);player.fitness.settled=true;player.fitness.payoutMzk=receipt.amountMzk;player.fitness.rewardReceipt=receipt;player.fitnessProgress=receipt.progress;player.fitness.message=receipt.message;result.message=receipt.message;result.fitnessReceipt=receipt;delete result.settlement;}}
   else if(command.action==='doomsday'){Object.assign(result,doomsdayCommand(sim,player,environment,command,now,{resolvePoint:point=>this.collision.safeSpawn(environment,point,{actors:sim.actors,objects:room.objects,earthworks:sim.construction?.earthworks})}));}
   else if(command.action==='input'){const input=command.input||{},inputSequence=command.inputSequence;if(inputSequence!==undefined&&(!Number.isSafeInteger(inputSequence)||inputSequence<0))fail('Invalid input sequence.',422);if((command.inputEpoch===undefined||command.inputEpoch===player.inputEpoch)&&(inputSequence===undefined||inputSequence>(player.lastInputSequence??-1))){const jumpPressed=input.jump===true&&player.input?.jump!==true;if(inputSequence!==undefined)player.lastInputSequence=inputSequence;if(this.scheduledInputs&&currentInput&&jumpPressed&&player.grounded&&this.scheduledWalker(sim,environment,player))player.pendingJump={epoch:player.inputEpoch,sequence:inputSequence,at:now};player.input=player.health<=0||fishingLocked(player)||shippingHandling(player)?{}:{forward:clamp(input.forward,-1,1),side:clamp(input.side,-1,1),lift:clamp(input.lift,-1,1),...(Number.isFinite(input.throttle)?{throttle:clamp(input.throttle,isWatercraft(sim.actors[player.vehicleId])?-1:0,1)}:{}),...(typeof input.gear==='boolean'?{gear:input.gear}:{}),...(Number.isFinite(input.flaps)?{flaps:clamp(input.flaps,0,1)}:{}),brake:input.brake===true,...(typeof input.anchor==='boolean'?{anchor:input.anchor}:{}),...(Number.isFinite(input.sailTrim)?{sailTrim:clamp(input.sailTrim,0,1)}:{}),rudder:clamp(input.rudder,-1,1),jump:input.jump===true,sprint:input.sprint===true};player.yaw=clamp(input.yaw,-Math.PI*100,Math.PI*100);}}
   else if(command.action==='range-ready'||isDedicatedFiringRange(environment)&&['start-rad-tox','next-rad-tox'].includes(command.action)){if(!sim.firingRange)fail('This map has no live firing range.',409);result.message='Firing range ready. Choose Quick practice, join a lane, or watch the live range.';}
   else if(command.action==='range-practice'){startFiringRangePractice(sim,player,now,command);result.message='Open practice is live. Join any free lane; training ammunition is free.';}
   else if(command.action==='range-join'){joinFiringRange(sim,player,now,command);result.message='Lane selected. Training ammunition is free.';}
   else if(command.action==='range-watch'){watchFiringRange(sim,player,now);result.message='Watching the live firing range from the safe lobby.';}
   else if(command.action==='range-settings'){configureFiringRange(sim,player,command.settings,now);result.message='Shared firing range settings updated.';}
   else if(command.action==='range-start'){startFiringRange(sim,player,now);result.message='Range tournament starting. Get ready.';}
   else if(command.action==='range-stop'){stopFiringRange(sim,player,now);result.message='Range tournament completed. Shared results are ready.';}

   else if(command.action==='ping-pong'){Object.assign(result,pingPongCommand(sim,player,command,now,pingPongCollisionContext(this.collision,environment,sim,room.objects)));}
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
   else if(command.action==='world-supply-air'){Object.assign(result,await worldSupplyAirCommand(sim,player,environment,command,now,{identity,action:this.supplyAirAction,delivery:this.supplyAirDelivery}));}
   else if(command.action==='harbor-radio'){result.message=harborRadio(sim,player,environment,command.operation);}
   else if(command.action==='vehicle-navigate'){
    const vehicle=sim.actors[player.vehicleId];if(!isAircraft(vehicle)&&!isWatercraft(vehicle))fail('Board a boat or aircraft before selecting a vehicle route.',409);
    result.message=isAircraft(vehicle)?startAircraftAssist(sim,player,environment,'navigate',now,this.collision,room.objects,command.destinationId):startBoatAssist(sim,player,environment,'navigate',now,{destinationId:command.destinationId,collision:this.collision,objects:room.objects});
   }
   else if(command.action==='vehicle-action'){
    const vehicle=sim.actors[player.vehicleId],mode=command.mode||'auto';
    if(!isAircraft(vehicle)&&!isWatercraft(vehicle))fail('Enter an aircraft or boat to use Auto.',409);
    const next=mode==='auto'?resolveVehicleAction({vehicle,environment,actors:sim.actors}):{action:mode,enabled:true};
    if(!next.enabled||!next.action)fail(next.reason||'This vehicle action is unavailable.',409);
    result.vehicleAction={mode,action:next.action,label:next.label||next.action};
    result.message=isAircraft(vehicle)?startAircraftAssist(sim,player,environment,next.action,now,this.collision,room.objects):startBoatAssist(sim,player,environment,next.action,now,{destinationId:command.destinationId,collision:this.collision,objects:room.objects});
   }
   else if(command.action==='aircraft-assist'){result.message=startAircraftAssist(sim,player,environment,command.operation,now,this.collision,room.objects,command.destinationId);}
   else if(command.action==='npc-social'){try{result.message=residentCommand(sim,player,environment,command,now,{collision:this.collision,objects:room.objects,constructionContext:this.constructionContext(sim,environment,room.objects)});result.residentId=command.entityId||player.npcConversation?.entityId;}catch(error){fail(error.message,409);}}
   else if(command.action==='vehicle-mission'){try{result.message=vehicleMissionCommand(sim,player,environment,command.operation,now,{questId:command.questId,teamId:command.teamId,role:command.role,choice:command.choice,text:command.text,entityId:command.entityId,collision:this.collision,objects:room.objects,constructionContext:this.constructionContext(sim,environment,room.objects)});}catch(error){fail(error.message,409);}}
   else if(command.action==='airport-radio'){result.message=airportRadio(sim,player,actorId,command.operation,now,environment);}
   else if(command.action==='rad-tox-toggle'){player.radToxEnabled=supportsRadTox(environment)&&command.enabled===true;resumeDefeatedExplorer(sim,player);result.message=player.radToxEnabled?'RAD-TOX enabled.':'RAD-TOX disabled.';}
   else if(command.action==='start-rad-tox'){if(startRadTox(sim,environment,now,player.position)){const loading=player.radToxReady===false;player.radToxReady=true;player.radToxEnabled=true;registerParticipant(sim,actorId,player,now);if(loading)player.spawnProtectedUntil=now+SPAWN_PROTECTION_MS;result.message='RAD-TOX encounter active.';}else result.message='Builder gameplay active.';}
   else if(command.action==='next-rad-tox'){if(sim.radTox?.transition&&now<sim.radTox.transition.at)fail('The next round starts after the results countdown.',409);if(nextRadToxLevel(sim,environment,now,command.matchId)){for(const [index,participantId] of Object.keys(sim.match.participants).entries()){const participant=sim.players[participantId],entry=environment.spawn||{x:0,y:0,z:2};participant.position=this.collision.safeSpawn(environment,{...entry,x:entry.x+(index%4)*1.2,z:entry.z+Math.floor(index/4)*1.2});participant.floor=participant.position.y;participant.velocityY=0;participant.grounded=true;participant.shieldUntil=0;participant.input={};participant.toolReady={};participant.toolUses={};}result.message='Next shared level started.';}else if(sim.match?.id===command.matchId)fail('Complete the current level before starting another.',409);}
   else if(player.radToxEnabled!==false&&sim.match?.state==='finished'&&!['input','interact','map-access','teleport-floor','respawn'].includes(command.action))fail('This level has ended. Review the results and start the next level.',409);
   else if(command.action==='respawn'){if(player.health>0)fail('Respawn is available after defeat.',409);cancelFunhouseActivities(player,now,'Respawning ended this attraction.');player.skiLift=null;player.skiing=false;player.skiSpeed=0;for(const key of ['heldId','seatedId','vehicleId']){const attached=sim.actors[player[key]];if(attached?.holderId===actorId)attached.holderId=null;player[key]=null;}player.position={...this.collision.safeSpawn(environment,manifest.spawn?.position||builderBaseSpawn(environment)||environment.spawn||{x:0,y:0,z:2},{actors:sim.actors,objects:room.objects,earthworks:sim.construction?.earthworks})};player.floor=player.position.y;player.velocityY=0;player.grounded=true;player.health=100;player.ammo=120;player.fuel=100;player.input={};player.toolReady={};player.toolUses={};player.shieldUntil=0;player.spawnProtectedUntil=now+SPAWN_PROTECTION_MS;player.contributors={};}
   else if(player.health<=0&&!['interact','map-access'].includes(command.action))fail('Respawn before acting.',409);
   else if(command.action==='map-access'){
    if(environment.id===COMPOUND_ID&&!player.testing?.clearance?.deep){const place=command.locationId&&localMapLocations(environment).find(value=>value.id===command.locationId),target=command.position||sim.actors[command.entityId]?.position||place?.arrival||place;if(target&&constrainCompoundPosition(player,player.position,target,environment).z!==target.z)fail('The deep bunker is locked. Complete the containment puzzle first.',403,'COMPOUND_DEEP_LOCKED');}
    const reopening=!!command.entityId&&command.entityId===player.vehicleId;
    if(command.entityId){
     const entity=sim.actors[command.entityId],target=manifest.actors.find(a=>a.objectId===command.entityId&&a.gameplay.behavior==='vehicle')||entity?.definition||entity;
     if(!entity||entity.active===false||(!isAircraft(entity)&&!isWatercraft(entity)&&!isRoadVehicle(entity)))fail('This craft is unavailable.',409);
     if(!shippingVesselUnlocked(player,entity))fail('Complete more shipping deliveries to unlock this vessel.',403);
     if(entity.trafficAI&&(isWatercraft(entity)||isAircraft(entity)||isRoadVehicle(entity)))fail('This craft is operated by an AI crew. Choose an available player craft.',409);
     if(isConstructionMachine(entity))releaseConstructionCrewMachine(sim,entity.id,'Player took over this machine.',now,this.constructionContext(sim,environment,room.objects));
     if(entity.holderId&&entity.holderId!==actorId)fail('Another player is using this craft.',409);
     if(isAircraft(entity)&&entity.flight?.airborne&&!reopening)fail('Wait until this aircraft has landed.',409);
     if(isAircraft(entity)&&!entity.flight?.airborne)entity.mapParkingOrigin||={position:{...entity.position},rotation:{...entity.rotation}};
     if(!reopening){cancelFunhouseActivities(player,now,'Map travel ended this attraction.');releaseForMapTravel(sim,player,manifest,now);}
     entity.holderId=actorId;player.vehicleId=entity.id;player.position={...entity.position,y:isWatercraft(entity) ? .35 : entity.position.y};player.yaw=entity.rotation?.y||0;player.floor=player.position.y;player.velocityY=0;player.grounded=true;player.input={};player.skiing=false;
     result.message='Boarded '+(target.name||'craft')+'. You are in the shared live room.';
    }else if(command.position){
     if(!['x','z'].every(axis=>Number.isFinite(command.position[axis])))fail('Choose a valid point on this map.',422);
     const floor=this.collision.groundAt(environment,{x:command.position.x,y:player.position.y,z:command.position.z},{entry:true,actors:sim.actors,objects:room.objects,earthworks:sim.construction?.earthworks});
     if(!floor||environment.builderScene?.layoutMeta?.harbor&&floor.y<-.05)fail('Choose clear land or a pier instead of water.',409);
     const arrival=this.collision.teleportPosition(environment,player.position,floor,sim.actors,room.objects,{localMap:true,earthworks:sim.construction?.earthworks});
     if(player.basketballRole==='spectator'&&basketballSpectatorRestricted(arrival,sim))fail('Choose a spectator area outside the court.',409);
     cancelFunhouseActivities(player,now,'Map travel ended this attraction.');releaseForMapTravel(sim,player,manifest,now);player.position=arrival;result.message='Teleported to the selected floor.';
    }else{
     const place=localMapLocations(environment).find(location=>location.id===command.locationId);
     if(!place)fail('Choose a listed map location.',422);
     const base={x:place.arrival?.x??place.x,y:place.arrival?.y??place.y??0,z:place.arrival?.z??place.z};
     // Some listed landmarks are solid buildings wider than the old 12 m
     // search. Reach their perimeter while retaining the same physical floor
     // and obstruction checks used for smaller destinations.
     const reach=Math.max(12,Math.min(128,Math.hypot(Number(place.width)||0,Number(place.depth)||0)/2+2));
     const radii=[];for(let radius=2;radius<reach;radius+=2)radii.push(radius);radii.push(reach);
     const candidates=[base];for(const radius of radii)for(let step=0;step<8;step++)candidates.push({...base,x:base.x+Math.cos(step*Math.PI/4)*radius,z:base.z+Math.sin(step*Math.PI/4)*radius});
     let arrival=null;for(const candidate of candidates){try{const floor=this.collision.groundAt(environment,candidate,{entry:true,actors:sim.actors,objects:room.objects,earthworks:sim.construction?.earthworks});if(floor&&(!environment.builderScene?.layoutMeta?.harbor||floor.y>=-.05)){arrival=this.collision.teleportPosition(environment,player.position,floor,sim.actors,room.objects,{localMap:true,earthworks:sim.construction?.earthworks});break;}const point=this.collision.meetingPosition(environment,candidate,sim.actors,room.objects);if(Math.hypot(point.x-base.x,point.z-base.z)>reach+.01||environment.builderScene?.layoutMeta?.harbor&&point.y<-.05)continue;arrival=this.collision.teleportPosition(environment,player.position,point,sim.actors,room.objects,{localMap:true,earthworks:sim.construction?.earthworks});break;}catch{}}if(!arrival)fail('This location has no clear landing. Choose another location.',409);if(player.basketballRole==='spectator'&&basketballSpectatorRestricted(arrival,sim))fail('Choose a spectator area outside the court.',409);cancelFunhouseActivities(player,now,'Map travel ended this attraction.');releaseForMapTravel(sim,player,manifest,now);player.position=arrival;result.message='Arrived at '+place.name+'.';
    }
    player.floor=player.position.y;player.velocityY=0;player.grounded=true;player.input={};if(!reopening)player.movementRevision=(player.movementRevision||0)+1;
   }
   else if(command.action==='teleport-floor'){if(player.skiLift)fail('Wait for automatic summit exit before travelling.',409);if(['racing','countdown'].includes(player.skiRace?.status)){player.skiRace.status='cancelled';player.skiRace.message='Travel resets a competitive run.';}
    if(player.seatedId||player.vehicleId)fail('Leave the seat or vehicle before teleporting.',409);
    if(player.basketballRole==='spectator'&&sim.basketball?.state==='live'){if(!command.position||!['x','y','z'].every(axis=>Number.isFinite(command.position[axis])))fail('Choose a valid spectator floor position.',422);const accepted=constrainBasketballSpectator(player.position,command.position,sim,player);if(basketballSpectatorRestricted(command.position,sim)||distance(accepted,command.position)>.01)fail('Spectators can teleport between the stands and benches outside the active court.',409);}
    const arrival=this.collision.teleportPosition(environment,player.position,command.position,sim.actors,room.objects,{earthworks:sim.construction?.earthworks});
    cancelFunhouseActivities(player,now,'Ground travel ended this attraction.');player.position=arrival;
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
   else if(command.action==='ski-board'||environment.game==='ski'&&command.action==='interact'&&!command.entityId&&!player.skiLift&&nearestSkiLift(player.position)){
    if(environment.game!=='ski')fail('Chairlifts are available at Pixel Peaks.',409);
    if(player.skiLift||player.vehicleId||player.seatedId)fail('Finish your current ride before boarding.',409);
    const lift=nearestSkiLift(player.position);if(!lift||command.liftId&&command.liftId!==lift.id)fail('Move onto the marked lift boarding area.',409);
    startSkiLift(player,lift,now);result.message='Boarded '+lift.name+'. Stay seated; automatic exit at the top.';
   }
   else if(command.action==='aircraft-window'){
    const craft=sim.actors[player.vehicleId];if(!isAircraft(craft)||aircraftType(craft).armed)fail('Board a DA40 or Piper Cub to use the window controls.',409);if(craft.flight?.airborne||Math.max(craft.flight?.speed||0,craft.flight?.airspeed||0)>.5)fail('Park the aircraft before opening its canopy or window.',409);craft.flight||={};craft.flight.windowOpen=!craft.flight.windowOpen;result.message=craft.flight.windowOpen?'Canopy / window open. Close it before taxiing.':'Canopy / window closed.';
   }
    else if(command.action==='quarry-controls'){if(['deed-state','apply-material','recover-storage'].includes(command.operation)){if(command.operation==='apply-material')requireBuildingAllowed(room,environment);Object.assign(result,await quarryDeedCommand(sim,player,environment,command,now,{identity,inventory:this.quarryInventory,collision:this.collision,objects:room.objects}));}else Object.assign(result,await quarryCommand(sim,player,environment,command,now,{identity,inventory:this.quarryInventory}));}
    else if(command.action==='construction-controls'){result.message=constructionCommand(sim,player,command,now,this.constructionContext(sim,environment,room.objects));}
    else if(command.action==='construction-crew'){result.message=constructionCrewAction(sim,player,command,now,this.constructionContext(sim,environment,room.objects));}
   else if(command.action==='road-controls'){const road=sim.actors[player.vehicleId];if(!isRoadVehicle(road))fail('Enter a road vehicle first.',409);road.driving||={speed:0};if(command.operation==='lights'){road.driving.lights=road.driving.lights===false;result.message=road.driving.lights?'Headlights on.':'Headlights off.';}else if(['hitch','unhitch','load','secure','unload'].includes(command.operation)){const q=player.vehicleMission;if(q?.status==='active'&&q.kind==='freight'){if(q.checkpoints[q.index]?.action!==command.operation)fail('Follow the current freight manifest objective before using this control.',409);result.message=expandedQuestAction(sim,player,now);}else result.message=cargoCommand(sim,road,command.operation,now,{count:command.count??1});}else if(command.operation==='park'){road.driving.speed=0;road.driving.parked=true;player.input={};result.message='Parked. Safe to exit.';}else fail('Choose lights or park.',422);}
   else if(command.action==='ski-assist'){
    if(environment.game!=='ski')fail('Ski steering is available at Pixel Peaks.',409);player.skiAssist=command.enabled!==false;result.message=player.skiAssist?'Easy steering on. Follow the gates and use Left / Right to carve.':'Free steering on. Look and carve to steer.';
   }
   else if(command.action?.startsWith('ski-lobby-')){
    if(environment.game!=='ski')fail('Race lobbies are available at Pixel Peaks.',409);
    const place=(racer,run,offset=0)=>{const start=skiCourseStart(run),point={x:start.x+offset,y:skiHeight(start.x+offset,start.z)+.02,z:start.z},floor=this.collision.groundAt(environment,point,{actors:sim.actors,objects:room.objects,earthworks:sim.construction?.earthworks});if(!floor||!this.collision.hasBodyClearance(environment,floor,.38,{actors:sim.actors,objects:room.objects,earthworks:sim.construction?.earthworks}))throw Error('The course start is blocked. Try again shortly.');return floor;};
    try{result.message=skiLobbyCommand(sim,player,command,now,place);}catch(error){fail(error.message,409);}
   }
   else if(command.action==='ski-race'){
    if(environment.game!=='ski')fail('Ski races are available at Pixel Peaks.',409);
    if(player.skiLift||player.vehicleId||player.seatedId)fail('Disembark before starting a race.',409);
    if(sim.skiCompetition?.lobby?.members.some(m=>m.actorId===player.actorId)&&sim.skiCompetition.lobby.status!=='finished')fail('Leave your multiplayer lobby before starting another race.',409);
    const run=skiRuns.find(run=>run.id===command.courseId);if(!run)fail('Choose a marked ski course.',422);
    const start=skiCourseStart(run),point={...start,y:skiHeight(start.x,start.z)+.02},floor=this.collision.groundAt(environment,point,{actors:sim.actors,objects:room.objects,earthworks:sim.construction?.earthworks});
    if(!floor||!this.collision.hasBodyClearance(environment,floor,.38,{actors:sim.actors,objects:room.objects,earthworks:sim.construction?.earthworks}))fail('The start is occupied. Try again in a moment.',409);
    player.position=floor;player.floor=floor.y;startSkiRace(player,run,now,{countdown:3000,mode:command.mode==='ai'?'ai':'solo'});
    for(const [id,rival]of Object.entries(sim.players))if(rival.skiAIOwner===player.actorId)delete sim.players[id];
    if(command.mode==='ai'){const id='ski-ai-'+player.actorId,bot=structuredClone(player);Object.assign(bot,{actorId:id,username:'Peak AI',skiAI:true,skiAIOwner:player.actorId,position:{...floor,x:floor.x+2},score:0,skiStats:{totalPoints:0,finishes:0},inventory:[],heldId:null,vehicleId:null,seatedId:null});sim.players[id]=bot;}
    result.message='Aligned for '+run.name+' · 3, 2, 1… Collect gold clocks for extra time.';
   }
   else if(command.action==='ski-equipment'){
    if(environment.game!=='ski')fail('Ski equipment is available at Pixel Peaks.',409);
    if(player.skiLift||player.vehicleId||player.seatedId)fail('Disembark before changing equipment.',409);
    if(player.position.x>-101&&player.position.x<-59&&player.position.z>343&&player.position.z<377)fail('Walk outside the château to equip skis.',409);
    player.skiing=!player.skiing;player.skiSpeed=0;player.skiHeading=null;if(['racing','countdown'].includes(player.skiRace?.status)){player.skiRace.status='cancelled';player.skiRace.message='Equipment change ended this run.';}result.message=player.skiing?'Skis equipped. Forward pushes, Back brakes, look to steer, Space jumps.':'Skis removed. Explore the lodge and trails on foot.';
   }
   else if(command.action==='interact'&&player.skiLift){result.message='Enjoy the chairlift ride. You will disembark safely at the summit.';}
   else if(command.action==='interact'){
    if(command.entityId&&isBasketball(sim.actors[command.entityId]))requireBasketballPlayer(sim,player);
    if(player.vehicleId){if(isAircraft(sim.actors[player.vehicleId])&&sim.actors[player.vehicleId].flight?.airborne)fail('Land the aircraft before exiting.',409);const vehicle=sim.actors[player.vehicleId];if(isConstructionMachine(vehicle)&&(vehicle.construction?.workCycle||vehicle.construction?.assist||vehicle.construction?.kind==='crane'&&vehicle.construction?.load||vehicle.construction?.kind==='truck'&&vehicle.construction?.bed>.08))fail('Park, cancel active hydraulics, secure any suspended load, and lower the dump body before exiting.',409);if(isAircraft(vehicle)){if(Math.max(vehicle.flight?.speed||0,vehicle.flight?.airspeed||0)>2.5)fail('Brake or use Land assistance before leaving the cockpit.',409);player.position=aircraftExitPosition(environment,vehicle,this.collision,sim.actors,room.objects);player.floor=player.position.y;player.velocityY=0;player.grounded=true;player.input={};player.movementRevision=(player.movementRevision||0)+1;vehicle.flight={...vehicle.flight,assist:null,assistStage:null,speed:0,airspeed:0,throttle:0,throttleCommand:0,brake:1};vehicle.rotation.x=vehicle.rotation.z=0;if(sim.airport?.runwayHolder===actorId){sim.airport.runwayHolder=null;sim.airport.expires=0;}}if(isWatercraft(vehicle)){if(Math.abs(vehicle.boating?.speed||0)>1.5)fail('Slow or anchor the boat before leaving.',409);cancelShipping(player,sim,now,'Leaving the vessel ended this freight contract.');stopBoat(vehicle);player.position=boatExitPosition(environment,vehicle,this.collision,sim.actors,room.objects);player.grounded=true;player.floor=player.position.y;player.velocityY=0;player.input={};player.movementRevision=(player.movementRevision||0)+1;}if(isRoadVehicle(vehicle)){if(Math.abs(vehicle.driving?.speed||0)>1.5)fail('Stop or park before exiting.',409);try{player.position=roadExitPosition(this.collision,environment,vehicle,sim.actors,room.objects,{earthworks:sim.construction?.earthworks});}catch(error){fail(error.message,409);}vehicle.driving={...vehicle.driving,speed:0,throttle:0,parked:true};player.floor=player.position.y;player.grounded=true;player.velocityY=0;player.input={};player.movementRevision=(player.movementRevision||0)+1;}if(isConstructionMachine(vehicle)){vehicle.construction.axes={};vehicle.construction.assist=null;vehicle.construction.working=false;delete vehicle.construction.workCycle;}vehicle.holderId=null;player.vehicleId=null;}
    else if(player.seatedId){const seat=sim.actors[player.seatedId];if((RESORT_PRODUCTS[seat?.modelId]||RESORT_PRODUCTS[seat?.asset?.buildAssetId])?.behavior==='seat'){let exit=null;for(const radius of [1.6,2.2,3])for(const side of [0,1,-1,2]){const yaw=(seat.rotation?.y||0)+side*Math.PI/2,point={x:seat.position.x+Math.sin(yaw)*radius,y:seat.position.y,z:seat.position.z+Math.cos(yaw)*radius},floor=this.collision.groundAt(environment,point,{actors:sim.actors,objects:room.objects,earthworks:sim.construction?.earthworks});if(floor&&this.collision.hasBodyClearance(environment,floor,.38,{actors:sim.actors,objects:room.objects,earthworks:sim.construction?.earthworks})){try{exit=this.collision.teleportPosition(environment,player.position,floor,sim.actors,room.objects);break;}catch{}}}if(!exit)fail('The seating exit is blocked. Clear some space beside the seat.',409);player.position=exit;player.floor=exit.y;player.velocityY=0;player.grounded=true;player.input={};player.movementRevision=(player.movementRevision||0)+1;}if(seat)seat.holderId=null;player.seatedId=null;}
    else{
     const target=manifest.actors.filter(a=>(!command.entityId||a.objectId===command.entityId)&&(!['hostile','patrol','decor'].includes(a.gameplay.behavior)||(a.gameplay.action&&a.gameplay.action!=='none'))&&sim.actors[a.objectId]?.active&&(command.entityId||!sim.actors[a.objectId].basketballSpectatorSeat||!sim.actors[a.objectId].holderId||sim.actors[a.objectId].holderId===actorId)&&distance(watercraftInteractionPoint(sim.actors[a.objectId],player.position),player.position)<=watercraftInteractionReach(sim.actors[a.objectId],player.position,a.gameplay.interactionDistance)).sort((a,b)=>distance(sim.actors[a.objectId].position,player.position)-distance(sim.actors[b.objectId].position,player.position))[0];
     if(!target)fail('No usable item is within reach.',409);const entity=sim.actors[target.objectId],config=target.gameplay;
     if(isBasketball(entity))requireBasketballPlayer(sim,player);
     if(config.action!=='teleport'||config.portal?.destinationType!=='map'){if(player.radToxEnabled!==false&&sim.match?.state==='finished')fail('This level has ended.',409);if(player.health<=0)fail('Respawn before acting.',409);}
     if(!shippingVesselUnlocked(player,entity))fail('Complete more shipping deliveries to unlock this vessel.',403);
     if(entity.trafficAI&&(isWatercraft(entity)||isAircraft(entity)||isRoadVehicle(entity)))fail('This craft is operated by an AI crew. Choose an available player craft.',409);
     if(isConstructionMachine(entity))releaseConstructionCrewMachine(sim,entity.id,'Player took over this machine.',now,this.constructionContext(sim,environment,room.objects));
     if(entity.holderId&&entity.holderId!==actorId)fail('Another player is using this item.',409);
     if(now-(player.cooldowns[target.objectId]||0)<config.cooldown*1000)fail('Item is cooling down.',429);player.cooldowns[target.objectId]=now;
     if(isTropicalIslandEnvironment(environment)&&config.islandStation){const visit=recordTropicalIslandVisit(sim,player,environment,config.islandStation,now);if(visit){result.islandVisit=visit;result.islandStationId=visit.stationId;}}
     const skiLift=environment.game==='ski'&&skiLifts.find(lift=>target.objectId==='ski-'+lift.id+'-base');
     if(skiLift){startSkiLift(player,skiLift,now);result.message='Boarded '+skiLift.name+'. Automatic summit arrival.';}
     else if(environment.game==='ski'&&(target.objectId==='ski-rental'||target.modelId==='alpine-ski-service'||target.asset?.buildAssetId==='alpine-ski-service')){player.skiing=!player.skiing;player.skiSpeed=0;player.skiHeading=null;if(['racing','countdown'].includes(player.skiRace?.status)){player.skiRace.status='cancelled';player.skiRace.message='Equipment change ended this run.';}result.message=player.skiing?'Skis equipped. Forward pushes, Back brakes, look to steer.':'Skis returned. Explore the château on foot.';}
     else if(config.action==='land-sale'){const lot=landLotById(config.landLotId);if(!lot||lot.mapId!==environment.id)fail('This sale sign is not attached to a registered land lot.',409);result.landLotId=lot.id;result.message=lot.name+' · '+lot.priceMzk+' MZK · Review the deed before purchase.';}
     else if(config.funhouseCostume||config.funhouseTool){const reference={itemId:entity.asset?.id,sku:'native:'+(entity.asset?.buildAssetId||target.modelId)},asset=await this.resolveAsset(identity,reference);if(!asset)fail('Purchase this clown item before equipping it.',403);const slot=config.funhouseCostume,enabled=slot?!player.funhouse?.costume?.[slot]:player.funhouse?.tool!=='water';Object.assign(result,equipOwnedFunhouseItem(player,asset,{...reference,enabled}));}
     else if(config.forestSnake&&isForestHarvestEnvironment(environment)){Object.assign(result,forestSnakeTalk(sim,player,environment,now));}
     else if(deviceDefinition(target.modelId,config)){Object.assign(result,deviceCommand(sim,manifest,player,actorId,{entityId:entity.id,operation:'open'},now));}
     else if(basketballJerseyTeam(entity)||basketballJerseyTeam(target)){const team=basketballJerseyTeam(entity)||basketballJerseyTeam(target);if(sim.basketball)assignBasketballTeam(sim,player,now,team);player.basketballJersey=team;result.message=(team==='home'?'Home':'Away')+' basketball jersey equipped.';}

     else if(config.behavior==='door')entity.open=!entity.open;
     else if(config.behavior==='switch')entity.switched=!entity.switched;
     else if(['pickup','hold'].includes(config.behavior)){if(player.heldId)fail('Drop the held item first.',409);player.heldId=entity.id;entity.holderId=actorId;delete entity.ballVelocity;touchBasketball(sim,entity,player,now);if(!player.inventory.includes(target.modelId))player.inventory.push(target.modelId);result.pickup={id:entity.id+':'+now,kind:'item'};const collected=combatStats(player).itemsCollected ||= [];if(!collected.includes(target.modelId))collected.push(target.modelId);}
     else if(config.behavior==='vehicle'){if(entity.trafficAI)fail('This craft is operated by an AI crew.',409);if(player.basketballRole==='spectator'&&sim.basketball?.state==='live')fail('Spectators can use the stands and benches while the court is active.',409);if(isAircraft(entity)&&entity.flight?.airborne)fail('Wait until this aircraft has landed before boarding.',409);player.vehicleId=entity.id;entity.holderId=actorId;if(isAircraft(entity)||isRoadVehicle(entity)){player.position={...entity.position};player.movementRevision=(player.movementRevision||0)+1;}if(isWatercraft(entity)){player.position={...entity.position,y:.35};player.floor=.35;player.velocityY=0;player.grounded=true;player.movementRevision=(player.movementRevision||0)+1;}}
     else if(config.behavior==='seat'){if(player.basketballRole==='spectator'&&basketballSpectatorRestricted(entity.position,sim))fail('Spectators can sit on benches outside the active court.',409);player.seatedId=entity.id;entity.holderId=actorId;player.position={...entity.position};}
     else if(config.behavior==='heal')player.health=Math.min(100,player.health+clamp(config.value||25,0,100));
     else if(config.behavior==='hazard')entity.active=false;
     else if(config.urbanMission)result.message=startUrbanMission(player,{...config.urbanMission,checkpoints:(config.urbanMission.checkpoints||[]).map(point=>point.objectId?{...point,x:sim.actors[point.objectId]?.position.x,z:sim.actors[point.objectId]?.position.z}:point)},now);
     else if(entity.resident){try{result.message=residentCommand(sim,player,environment,{entityId:entity.id,choice:'day'},now,{collision:this.collision,objects:room.objects,constructionContext:this.constructionContext(sim,environment,room.objects)});result.residentId=entity.id;}catch(error){fail(error.message,409);}}
     else if(entity.questRole==='contact'){try{result.message=converseQuest(sim,player,now,{entityId:entity.id,environment,collision:this.collision,objects:room.objects,constructionContext:this.constructionContext(sim,environment,room.objects)});}catch(error){fail(error.message,409);}}
     else if(entity.questRole==='cargo'){if(entity.questOwner!==actorId&&!player.vehicleMission?.teamLeader)fail('This cargo belongs to another assignment.',409);try{result.message=expandedQuestAction(sim,player,now);}catch(error){fail(error.message,409);}}
     else if(config.behavior==='quest')result.message=questInteraction(player,config.quest||target.quest,entity.id);
     result.message=result.message||target.dialogue?.text||config.prompt||'Item activated';if(!entity.resident&&!entity.questRole&&(['talk','quest'].includes(config.behavior)||config.urbanMission)){const name=entity.name||target.name||'Quest contact',instanceId='interaction:'+entity.id,call=questRadio(sim,now,name,result.message,{conversation:true,interaction:true,questInstance:instanceId,recipients:[actorId],speakerId:entity.id,role:'Quest contact',voice:name});player.npcConversation={instanceId,status:'completed',contact:{name,role:'Local contact',channel:'Local conversation',color:'#a5dfbd'},conversation:[call]};}
     if(config.action==='toggle')entity.switched=!entity.switched;if(config.action==='use')entity.lastUsedAt=now;
     if(config.action==='damage'&&config.value>0)damagePlayer(player,now);
     if(config.action==='score')player.score+=clamp(config.value,0,100);
     if(config.action==='teleport'){const portal=config.portal;if(!portal?.enabled)fail('Portal is locked.',409);if(portal.destinationType==='map'){if(this.resolveDestination&&!await this.resolveDestination(portal.targetMapId))fail('This destination is no longer listed in the shared world.',404,'DESTINATION_UNAVAILABLE');result.destination=portal.targetMapId;const travel=player.pendingTravel?.to===portal.targetMapId&&player.pendingTravel.expiresAt>=now?player.pendingTravel:{from:id,to:portal.targetMapId,token:randomUUID(),expiresAt:now+120000};player.pendingTravel=travel;result.travel=travel;}else{const destination=sim.actors[portal.targetObjectId];if(!destination)fail('Destination is unavailable.');player.position={...destination.position};}}
     notePlayerAIWorldInteraction(entity,player,now);recordSiteQuestInteraction(sim,player,entity,now,environment.id);
    }
   }
   else if(command.action==='yacht-game'){result=yachtGameCommand(sim,player,command);}
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
    if(asset.consumable&&asset.petId&&!Object.values(sim.actors).some(actor=>actor.asset?.id===asset.petId&&actor.active))fail('Deploy your pet in this room before feeding it.',409);if(asset.sku)await this.charge(identity,asset.sku,createHash('sha256').update(id+actorId+sim.sequence).digest('hex'),environment);else if(asset.modelUrl||asset.buildAssetId||asset.renderKind==='image')await this.consumeAsset(identity,asset,requestId,environment);
    if(asset.consumable&&asset.petId){const pet=Object.values(sim.actors).find(actor=>actor.asset?.id===asset.petId&&actor.active);if(!pet)fail('Deploy your pet in this room before feeding it.',409);pet.boostUntil=now+10000;result.message=pet.asset.name+' received a treat.';}else{
    const entityId='spawn-'+requestId,position=chosenPlacement?.position||{x:player.position.x-Math.sin(player.yaw)*2,y:player.position.y,z:player.position.z-Math.cos(player.yaw)*2},rotation=chosenPlacement?.rotation||{x:0,y:player.yaw,z:0},scale=chosenPlacement?.scale||{x:1,y:1,z:1};
    if(!chosenPlacement&&!isBasketball({asset}))Object.assign(position,this.collision.stackAsset(environment,asset,position,rotation,scale,sim.actors,room.objects));
    // Deploy the same authored contract as the editor. Canonical server assets
    // carry native seats, quests, devices and vehicle settings through purchase;
    // replacing them with generic interactions makes the market copy inert.
    const modelId=asset.buildAssetId||asset.id,device=deviceDefinition(modelId,asset.function_data||{});
    const settings={damage:0,interactionDistance:3,cooldown:1,...factoryItemSettings(modelId),...factoryTestingItemSettings(modelId),...factoryLogisticsItemSettings(modelId),...(RESORT_PRODUCTS[modelId]?resortProductSettings(RESORT_PRODUCTS[modelId]):{}),...asset.function_data,...asset.interaction_data,...asset.configuration};
    const behavior=settings.behavior||asset.behavior||(device?'interact':['vehicle','vehicles'].includes(asset.assetType)?'vehicle':asset.assetType==='pets'?'patrol':'interact');
    const spawnHealth=shippingHullHealth({asset})??(isAircraft({asset})?AIRCRAFT_HEALTH:isCombatBoat({asset})?650:isFishingBoat({asset})?300:isWatercraft({asset})?200:clamp(settings.health||100,1,100000));
    const definition=normalizeBuilderObject({id:entityId,modelId,objectType:asset.assetType||asset.type,position,rotation,scale,asset,functionalSettings:{...settings,behavior,health:spawnHealth,...(device?{device:settings.device||modelId}:{})},vehicleSettings:asset.vehicleSettings,movementSettings:{speed:1,...settings.movement,...asset.movementSettings},aiSettings:asset.aiSettings,questSettings:asset.questSettings||settings.quest,dialogueSettings:asset.dialogueSettings||settings.dialogue||{text:settings.prompt||''},environmentSettings:asset.environmentSettings,animationState:asset.animationState||{clip:asset.animation},metadata:asset.metadata});
    definition.position={...position};
    sim.actors[entityId]={id:entityId,modelId,position,rotation,scale,placementRevision:1,active:true,health:spawnHealth,...(typeof settings.destructible==='boolean'?{destructible:settings.destructible}:{}),...(isAircraft({asset})?{maxHealth:AIRCRAFT_HEALTH,destructible:true}:isWatercraft({asset})?{maxHealth:shippingHullHealth({asset})??(isCombatBoat({asset})?650:isFishingBoat({asset})?300:200),destructible:true}:{}),spawned:true,ownerId:actorId,asset,definition};
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
   else if(command.action==='fire'&&isShippingEnvironment(environment)&&!UTILITY_TOOLS[command.tool]){Object.assign(result,await shippingDefense(sim,player,environment,command,now,{collision:this.collision,charge:sku=>this.charge(identity,sku,createHash('sha256').update('shipping-shot:'+id+':'+actorId+':'+requestId).digest('hex'))}));}
   else if(command.action==='fire'&&RANGED_WEAPONS[command.tool||'laser']&&rangeHandlesFire(sim,player)){result=fireFiringRange(sim,player,command,now,{blocksShot:(origin,ray,distance)=>this.collision.blocksShot(environment,origin,ray,distance,sim.actors)});}
   else if(command.action==='fire'&&isCombatBoat(sim.actors[player.vehicleId])&&(command.tool||'laser')==='laser'){try{result.message=firePatrolCannon(sim,player,command,environment,now,{collision:this.collision,objects:room.objects});}catch(error){fail(error.message,409);}}
   else if(command.action==='fire'){
    if(FISHING_GEAR.some(item=>item.id===command.tool))fail('Use the Fishing panel to cast and reel with fishing gear.',422);
    if(isAircraft(sim.actors[player.vehicleId])&&!armedAircraft(sim.actors[player.vehicleId]))fail('This civilian aircraft is unarmed.',409);
    const tool=String(command.tool||'laser'),gunAircraft=isAircraft(sim.actors[player.vehicleId])&&sim.actors[player.vehicleId].active!==false&&tool==='laser'?sim.actors[player.vehicleId]:null,utility=UTILITY_TOOLS[tool],profile=RANGED_WEAPONS[tool],cooldown=tool==='laser'?0:sim.radTox&&!utility&&(profile||['bat','taser','toxin','flamethrower'].includes(tool))?RAD_TOX_SHOT_INTERVAL_MS:utility?utility.cooldown*1000:profile?profile.interval*1000:tool==='dynamite'?1200:250;if(!utility&&!profile&&!['bat','taser','toxin','dynamite','flamethrower','spray','jetpack'].includes(tool))fail('This tool has no server action.',422);
    player.toolReady ||= {};if(now<(player.toolReady[tool]||0))fail('Tool is cooling down.',429);if(utility?.charges&&(player.toolUses?.[tool]||0)>=utility.charges)fail('Utility depleted until respawn.',409);
    if(tool==='flamethrower'&&(player.fuel??100)<5)fail('Refill your igniter fuel.',409);if(profile&&(player.ammo??120)<=0)fail('Refill ammunition.',409);if(tool==='medkit'&&player.health>=100)fail('Health is already full.',409);
    if(['repair-tool','recycler'].includes(tool)&&!Object.values(room.objects).some(object=>!object.deleted&&object.ownerId===actorId&&(tool==='recycler'||object.hits>0)&&distance({x:object.position[0],y:object.position[1],z:object.position[2]},player.position)<8))fail('No eligible building piece is within reach.',409);
    const direction=command.direction;if(!Array.isArray(direction)||direction.length!==3||!direction.every(Number.isFinite))fail('Invalid aim direction.');const length=Math.hypot(...direction);if(length<.1)fail('Invalid aim direction.');const ray=gunAircraft?aircraftGunPose(gunAircraft).direction:direction.map(n=>n/length);
    if(!gunAircraft)await this.charge(identity,'tool:'+tool,createHash('sha256').update('shot:'+id+':'+actorId+':'+requestId).digest('hex'));if(tool==='flamethrower')player.fuel=(player.fuel??100)-5;if(profile)player.ammo=(player.ammo??120)-1;player.lastShot=now;player.toolReady[tool]=now+cooldown;player.toolUses ||= {};player.toolUses[tool]=(player.toolUses[tool]||0)+1;
    const origin=gunAircraft?aircraftGunPose(gunAircraft).origin:{...player.position,y:player.position.y+1.5},targets=[];
    for(const entity of Object.values(sim.actors)){if(entity.forestSnakeManaged)continue;if(entity.questOwner&&(!canEngageQuest(sim,actorId,entity)))continue;if(entity.basketballManaged||entity.basketballMatchBall||entity.rangeManaged||isAircraft(entity)||entity.destructible||entity.loot||entity.rangeTarget||!entity.active||entity.pendingSpawn||entity.health<=0)continue;const offset=[entity.position.x-origin.x,entity.position.y+1-origin.y,entity.position.z-origin.z],along=offset.reduce((sum,n,i)=>sum+n*ray[i],0),perpendicular=Math.sqrt(Math.max(0,offset.reduce((sum,n)=>sum+n*n,0)-along*along));if(along>0&&along<(tool==='bat'?3:40)&&perpendicular<1)targets.push({entity,along});}
    const range=gunAircraft?AIRCRAFT_GUN_RANGE:tool==='bat'?3:tool==='taser'?4:tool==='toxin'?9:tool==='flamethrower'?12:Math.min(40,profile?.range||40);
    for(const entity of Object.values(sim.actors)){if(entity.questOwner&&(!canEngageQuest(sim,actorId,entity)))continue;if(!isAircraft(entity)||entity.id===player.vehicleId||entity.active===false||entity.health<=0)continue;const along=aircraftRayDistance(entity,origin,ray);if(along!==null&&along<range)targets.push({entity,along,aircraft:true});}
    const structureHit=this.collision.destructibleHit(environment,origin,ray,range,sim.actors);if(structureHit)targets.push(structureHit);
    for(const [targetId,target]of Object.entries(sim.players)){
     if(isAircraft(sim.actors[target.vehicleId])||targetId===actorId||target.radToxReady===false||target.health<=0||target.replacedByRoom||now-target.lastSeen>15000||firingRangeLocationAt(sim.firingRange?.locations,target.position))continue;
     const along=rayBoxDistance(origin,ray,{x:target.position.x-.35,y:target.position.y,z:target.position.z-.35},{x:target.position.x+.35,y:target.position.y+1.8,z:target.position.z+.35});
     if(along!==null&&along<range)targets.push({entity:target,along,playerId:targetId});
    }
    const blocks=[];for(const object of Object.values(room.objects)){if(object.deleted||object.open)continue;const offset=object.position.map((n,i)=>n-[origin.x,origin.y,origin.z][i]),along=offset.reduce((sum,n,i)=>sum+n*ray[i],0),perpendicular=Math.sqrt(Math.max(0,offset.reduce((sum,n)=>sum+n*n,0)-along*along)),size=buildingDimensions(object.materialId).map((n,i)=>n*object.scale[i]);if(along>0&&along<range&&perpendicular<Math.max(...size)/2)blocks.push({object,along});}
    const blocker=blocks.sort((a,b)=>a.along-b.along)[0];let hit=targets.filter(target=>target.along<range).sort((a,b)=>a.along-b.along)[0];
    if(hit?.entity?.questOwner&&(!canEngageQuest(sim,actorId,hit.entity)))hit=null;
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
  await this.releaseCancelledSupply(identity,sim,player,environment,now);
  this.constrainCompoundPlayer(sim,player,environment,priorCommandPosition||player.position);
  player.position=constrainFiringRangePlayer(player.position,player.position,sim,player);
  stepFiringRange(sim,now);
  if(player.basketballRole==='spectator'&&basketballSpectatorRestricted(player.position,sim)){player.position=constrainBasketballSpectator(player.position,player.position,sim,player);player.input={};player.movementRevision=(player.movementRevision||0)+1;}
  if(player.pingPong?.equipped&&(['map-access','teleport-floor','respawn'].includes(requestedAction)||player.vehicleId||player.seatedId||player.heldId||player.health<=0))cancelPingPong(sim,player,'Travel or another activity ended the rally.');
  if(priorCommandPosition&&requestedAction!=='input'&&distance(priorCommandPosition,player.position)>.001&&(player.movementRevision||0)===priorMovementRevision)player.movementRevision=priorMovementRevision+1;
  stepWorldAirFreight(sim,environment,now);
  await this.releaseCancelledSupply(identity,sim,player,environment,now);

  if(requestedAction!=='join'&&(player.movementRevision||0)!==priorMovementRevision){player.input={};player.inputEpoch=randomUUID();player.lastInputSequence=-1;delete player.pendingJump;result.inputEpoch=player.inputEpoch;}
  if(player.pendingJump&&(requestedAction==='respawn'||!this.scheduledInputs||!this.scheduledWalker(sim,environment,player)))delete player.pendingJump;

  if(command.action==='input'&&player.health>0)await this.collectNearbyLoot(sim,player,identity,id,now,null,result);
  if(player.shipping?.job?.factoryManifestId&&['cancelled','expired'].includes(player.shipping.job.phase)){await this.shippingReturn(identity,player,now);player.logistics=await this.logisticsState(identity,now,environment,sim);result.logistics=player.logistics;}
  if(isTropicalIslandEnvironment(environment))stepTropicalIsland(sim,environment,now);
  this.prepareEncounter(sim,environment);
  checkTeamDefeat(sim,now);
  if(now-(player.lastTelemetry||0)>5000&&!this.telemetryPending.has(identity.walletId)){const sample={health:player.health,world:id};player.lastTelemetry=now;this.telemetryPending.add(identity.walletId);Promise.resolve().then(()=>this.telemetry(identity.walletId,sample)).catch(error=>console.error('Gameplay telemetry failed:',error.message)).finally(()=>this.telemetryPending.delete(identity.walletId));}
  if(prisonSignature){sim.prison.revision=(Number.isSafeInteger(sim.prison.revision)?sim.prison.revision:0)+1;result.prisonPacket={protocol:PRISON_PROTOCOL,version:PRISON_PROTOCOL_VERSION,revision:sim.prison.revision,requestId};if(result.prison)result.prison.revision=sim.prison.revision;}
  if(!transientCommand){const publicResult={...fitnessEventSnapshot(result),...(result.factory?{factory:publicFactoryState(result.factory)}:{}),...(result.testing?{testing:publicTestingState(result.testing)}:{}),...(result.logistics?{logistics:publicLogisticsState(result.logistics)}:{})};sim.events.push({id:requestId,actorId,action:requestedAction,...publicResult,at:now});sim.events=sim.events.slice(-100);}
  sim.receipts[receiptKey]={action:requestedAction,...(requestedAction==='input'&&Object.keys(result).length===0?{}:{result}),...(spawnSignature?{spawnSignature}:{}),...(prisonSignature?{prisonSignature}:{})};const keys=Object.keys(sim.receipts);if(keys.length>500)for(const key of keys.slice(0,keys.length-500))delete sim.receipts[key];
  if(result.spawnedId){stepFactory(sim,environment,now);stepFactoryTesting(sim,environment,now);stepFactoryLogistics(sim,environment,now);}
  if(['join','npc-social'].includes(requestedAction)||result.residentId)saveResidentContinuity(player,id,now,actorId);
  return projectResult({...this.view(room),selfId:actorId,inputEpoch:player.inputEpoch,result});
 },{persist:!transientCommand,roomOnly:requestedAction!=='join',...(requestedAction==='join'?{playerScope:{playerId:'account:'+identity.accountId,roomIds:command.travelFrom?[String(command.travelFrom)]:[]}}:{})});}

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
 async casinoActivity(actorId,round){if(round?.phase!=='complete')return false;return this.store.update(CASINO_ID,room=>{const sim=room.simulation,player=sim?.players?.[actorId];if(!player)return false;return recordCasinoPlayerGame(sim,player,round,this.now());});}
 async player(id,actorId){return (await this.store.get(id)).simulation?.players[actorId];}
 async care(actorId,receipt){const rooms=await this.store.read();for(const [id,room] of Object.entries(rooms)){if(!room.simulation?.players[actorId])continue;await this.store.update(id,current=>{const player=current.simulation.players[actorId];player.careReceipts ||= [];if(player.careReceipts.includes(receipt.id))return;const effect=receipt.effect;player.stats ||= {};if(effect?.stat==='all')for(const key of Object.keys(player.stats))player.stats[key]=key==='toxicity'?0:100;else if(effect?.stat&&effect.stat!=='health')player.stats[effect.stat]=Math.max(0,Math.min(100,(player.stats[effect.stat]||0)+Number(effect.amount||0)));if(effect?.stat==='health'||effect?.stat==='all')player.health=effect.stat==='all'?100:Math.min(100,player.health+Number(effect.amount||0));player.careReceipts.push(receipt.id);player.careReceipts=player.careReceipts.slice(-100);});}}
}
