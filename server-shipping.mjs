import {randomUUID} from 'node:crypto';
import {cleanWallet} from './user-json-database.mjs';
import {ensureWorldSupply,consumeWorldStock} from './world-supply.mjs';
import {SHIPPING_ID,SHIPPING_RULES,SHIPPING_PORTS,SHIPPING_CARGO,SHIPPING_ROUTES,SHIPPING_VESSELS,SHIPPING_LANES,isShippingEnvironment} from './public/js/shipping-config.js';
import {isShippingVessel,shippingVesselType} from './public/js/shipping-vessel-specs.js';
import {SHIP_STOCK_TRADES} from './public/js/shipping-market.js';
import {economyItem,ownsEconomyItem} from './game-economy.mjs';
import {stopBoat} from './server-harbor-operations.mjs';
import {clearBoatAssist} from './public/js/boat-assist.js';
import {harborWaterAt,watercraftFootprint,watercraftOverlap,isWatercraft} from './public/js/harbor-water.js';
import {patrolRayDistance} from './public/js/patrol-combat.js';
import {RANGED_WEAPONS} from './public/js/game-weapons.js';
import {boatMovementBlocked} from './server-boat-assist.mjs';
import {questRadio} from './server-quest-radio.mjs';
import {stepShippingRivals,shippingRivalsView,shippingPortEconomyView,shippingDispatchView,recordShippingPortDelivery} from './server-shipping-ai.mjs';
import {stepShippingLeague,joinShippingLeague,shippingLeagueForManifest,recordShippingLeagueDelivery,shippingCompetitionView,playerShippingCompetitionView,claimShippingLeague,applyShippingLeagueClaim,shippingLeaguePrize,SHIPPING_LEAGUE_RULES} from './server-shipping-competition.mjs';
import {settleFactoryShipping} from './server-factory-logistics.mjs';
import {factoryShippingExportState} from './server-factory-shipping.mjs';
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clone=value=>JSON.parse(JSON.stringify(value));
const publicJob=job=>{if(!job)return null;const {factoryManifestId,...visible}=clone(job);return visible;};
const uuid=value=>/^[a-f0-9-]{36}$/.test(value||'');
const terminal=new Set(['delivered','cancelled','expired','failed']);
const active=job=>job&&!terminal.has(job.phase);
export const shippingHullHealth=actor=>isShippingVessel(actor)?((actor?.modelId||actor?.asset?.buildAssetId)==='shipping-feeder'?650:1200):null;
export const shippingHandling=player=>['loading','secured','unloading'].includes(player?.shipping?.job?.phase);
const defaults=()=>({deliveries:0,unitsDelivered:0,totalEarnedMzk:0,bestQuality:0,leaguesPlayed:0,leaguesWon:0,leagueEarnedMzk:0});
const stateFor=player=>player.shipping ||= {job:null,stats:defaults(),supplies:{},unlocks:['shipping-feeder'],message:'Board a feeder at the dock to start your shipping induction.'};
const vessel=boat=>SHIPPING_VESSELS.find(item=>item.modelId===(boat?.modelId||boat?.asset?.buildAssetId));
const portBy=id=>SHIPPING_PORTS.find(port=>port.id===id);
const routeBy=id=>SHIPPING_ROUTES.find(route=>route.id===id);
const stockFor=cargo=>cargo.stockId||(['island-provisions','relief-supplies'].includes(cargo.id)?'shipping-food-stock':cargo.id==='building-supplies'?'shipping-parts-stock':'shipping-tools-stock');
function demandBonus(sim,route){
 if(route.id==='dock-induction')return 0;
 const market=shippingPortEconomyView(sim).find(port=>port.portId===route.to),shortage=Number(market?.demand?.[route.cargoId])||0,target=Number(market?.target)||48;
 return Math.max(0,Math.min(15,Math.round(shortage/Math.max(1,target)*15)));
}
const unlocksFor=(stats,user)=>SHIPPING_VESSELS.filter(ship=>(stats?.deliveries||0)>=ship.unlockDeliveries||user?.items?.some(item=>item.buildAssetId===ship.modelId||item.modelId===ship.modelId)).map(ship=>ship.modelId);
function receivingBerth(sim,boat,route,environment){
 const destination=portBy(route.to),reservations=Object.values(sim.players||{}).filter(player=>active(player.shipping?.job)&&player.shipping.job.vesselId!==boat.id&&player.shipping.job.destinationId===route.to).map(player=>({boat:sim.actors[player.shipping.job.vesselId],point:player.shipping.job.receivingBerth})).filter(row=>row.boat&&row.point);
 for(const offset of [0,46.5,-46.5]){const target={x:destination.x+offset,z:destination.z,yaw:offset<0?-Math.PI/2:Math.PI/2};if(!watercraftFootprint(target,target.yaw,boat).every(point=>harborWaterAt(environment,point,.35)))continue;if(Object.values(sim.actors).some(other=>other.id!==boat.id&&other.active!==false&&isWatercraft(other)&&watercraftOverlap(target,target.yaw,other.position,other.rotation?.y||0,.2,boat,other)))continue;if(reservations.some(row=>watercraftOverlap(target,target.yaw,row.point,row.point.yaw||0,.2,boat,row.boat)))continue;return target;}
 fail('The receiving quay is occupied. Choose another contract or wait for a vessel to depart.');
}
const pointsFor=(route,berth)=>{const points=clone(route.waypoints),destination=portBy(route.to);if(points.length&&gap(points.at(-1),destination.berth)<1)points.pop();if(points.length&&gap(points.at(-1),destination.entry)<1)points.pop();points.push({x:berth.x+(berth.yaw<0?-100:100),z:berth.z,name:destination.name+' · align with receiving berth'},{...berth,name:destination.name+' · stop alongside'});return points;};
export function shippingVesselUnlocked(player,boat){return !isShippingVessel(boat)||(stateFor(player).unlocks||['shipping-feeder']).includes(boat.modelId||boat.asset?.buildAssetId);}
export function applyShippingAccount(player,account){if(!account)return;const state=stateFor(player);state.stats={...defaults(),...account.stats};state.supplies={...account.supplies};state.unlocks=account.unlocks||['shipping-feeder'];state.factoryExport=account.factoryExport||null;}
function cargoReadings(job,boat){
 const type=vessel(boat),portMass=job.loaded.filter(item=>item.side==='port').reduce((sum,item)=>sum+item.mass,0),starboardMass=job.loaded.filter(item=>item.side==='starboard').reduce((sum,item)=>sum+item.mass,0);
 Object.assign(job,{loadedCount:job.loaded.length,portMass,starboardMass,mass:portMass+starboardMass,capacity:type?.capacity||0,slots:type?.slots||0});
 if(boat){boat.boating ||= {};Object.assign(boat.boating,{cargoCount:job.loaded.length-job.unloaded,cargoPortCount:job.loaded.slice(job.unloaded).filter(item=>item.side==='port').length,cargoStarboardCount:job.loaded.slice(job.unloaded).filter(item=>item.side==='starboard').length,cargoCapacity:type?.slots||0,cargoMass:job.mass,loadBalance:portMass-starboardMass,cargoSecured:!!job.secured});}
}
function availableBoarding(sim,player){const state=stateFor(player);return Object.values(sim.actors||{}).filter(boat=>isShippingVessel(boat)&&boat.active!==false&&boat.health>0&&!boat.trafficAI&&!boat.holderId&&shippingVesselUnlocked(player,boat)&&Math.abs(boat.boating?.speed||0)<=.35&&gap(boat.position,player.position)<=60&&SHIPPING_PORTS.some(port=>gap(boat.position,port.berth)<=SHIPPING_RULES.dockRadius&&gap(player.position,port.position||port.berth)<=70)).sort((a,b)=>gap(a.position,player.position)-gap(b.position,player.position))[0];}
function currentBoat(sim,player){const boat=sim.actors[player.vehicleId];if(!isShippingVessel(boat)||boat.active===false||boat.health<=0||boat.holderId!==player.actorId)fail('Board your cargo vessel before operating freight.');if(!shippingVesselUnlocked(player,boat))fail('Complete more deliveries to unlock this vessel.',403);return boat;}
function atDock(boat,port,{stopped=true}={}){return !!port&&gap(boat.position,port.berth)<=SHIPPING_RULES.dockRadius&&(!stopped||Math.abs(boat.boating?.speed||0)<=SHIPPING_RULES.maxDockSpeed)&&(!stopped||!boat.boating?.assist);}
function requireDock(boat,port){if(!atDock(boat,port))fail('Approach '+port.name+' within '+SHIPPING_RULES.dockRadius+' metres, stop and cancel Auto before handling cargo.');}
function notify(sim,player,now,message){stateFor(player).message=message;if(active(player.shipping.job))player.shipping.job.message=message;questRadio(sim,now,'Strait freight control',message,{recipients:[player.actorId]});return {message};}
function releaseThreat(sim,job){if(job?.threatId){delete sim.actors[job.threatId];delete job.threatId;}if(job?.supportId){delete sim.actors[job.supportId];delete job.supportId;}}
export function cancelShipping(player,sim,now,message='Shipping contract cancelled. Return to the dock for a new manifest.'){
 const state=player.shipping,job=state?.job;if(!active(job))return;
 job.phase='cancelled';job.finishedAt=now;job.message=state.message=message;releaseThreat(sim,job);
 const boat=sim.actors[job.vesselId];if(boat){if(boat.boating?.navigationType==='shipping')stopBoat(boat);Object.assign(boat.boating ||= {},{cargoCount:0,cargoMass:0,cargoSecured:false});}player.input={};
}
function startRoute(sim,player,environment,job,now){
 const boat=currentBoat(sim,player),points=job.waypoints.slice(job.checkpointIndex);if(!points.length)fail('The route is complete. Approach the destination berth and choose Dock.');
 // Every checkpoint belongs to a server-authored contract. Clients cannot supply
 // a position, waypoint index, reward, cargo mass, or completed-stage flag.
 clearBoatAssist(boat);boat.boating ||= {};Object.assign(boat.boating,{assist:'navigate',assistSince:now,assistOrigin:{...boat.position},anchor:false,assistRoute:points.map((point,index)=>({...point,radius:index===points.length-1?1.35:8,gear:point.gear||1})),routeIndex:0,routeLength:points.length,assistStage:'departure',navigationDestinationId:job.destinationId,navigationName:job.title,navigationType:'shipping',navigationRouteId:job.id,navigationTarget:{x:points.at(-1).x,z:points.at(-1).z},remainingDistance:0});player.input={};player.inputEpoch=randomUUID();player.lastInputSequence=-1;
}
function hazardAt(job){const route=routeBy(job.contractId);return route?.hazard==='traffic'?null:Math.max(1,Math.floor(job.waypoints.length/2));}
function createThreat(sim,player,job,boat,now){
 const type=routeBy(job.contractId)?.hazard;if(!type||type==='traffic')return;
 const messages={pirates:'Pirate training launch approaching. Request Escort or disable the marked rogue launch to protect your shipment.',mines:'A simulated mine warning closes this section. Call Radio for the marked safe passage.',debris:'Floating debris ahead. Call Radio for a safe channel and slow your approach.',storm:'A squall disrupts the convoy. Call Radio for weather guidance and reduce speed.'};
 job.hazard={type,position:{x:boat.position.x,y:0,z:boat.position.z},message:messages[type]||'Heavy traffic ahead. Call Radio for passage guidance.',resolved:false,startedAt:now,nextLossAt:now+8000};
 if(type==='pirates'){
  const candidates=[{x:boat.position.x+25,y:0,z:boat.position.z-25},{x:boat.position.x-25,y:0,z:boat.position.z+25}],position=candidates.find(point=>harborWaterAt({builderScene:{layoutMeta:{harbor:sim.shipping.harbor}}},point,6));
  if(position){const id='shipping-rogue-'+job.id;sim.actors[id]={id,modelId:'harbor-patrol',asset:{buildAssetId:'harbor-patrol'},name:'Rogue training launch',position,rotation:{x:0,y:boat.rotation?.y||0,z:0},scale:{x:1,y:1,z:1},active:true,health:90,maxHealth:90,spawned:true,trafficAI:true,shippingThreat:true,shippingOwner:player.actorId,destructible:true,boating:{anchor:true,speed:0,throttle:0,phase:'pirate-training'},spawnedAt:now};job.threatId=id;}
 }
 notify(sim,player,now,job.hazard.message);
}
/** Progress is sampled from the shared vessel position and server time, never
 * reported by the client. Cargo handling and optional threats are job-scoped. */
export function stepShipping(sim,environment,now,{collision,objects={}}={}){
 if(!isShippingEnvironment(environment)){for(const player of Object.values(sim.players||{}))cancelShipping(player,sim,now,'World travel ended this freight contract.');return;}
 sim.shipping ||= {enabled:true};Object.assign(sim.shipping,{enabled:true,environmentId:environment.id,serverTime:now,harbor:environment.builderScene?.layoutMeta?.harbor});
 stepShippingLeague(sim,environment,now);
 // Named companies replace the old endless lane loops with real manifests.
 for(const actor of Object.values(sim.actors||{}))if(actor.shippingTraffic&&!actor.shippingRival)delete sim.actors[actor.id];
 stepShippingRivals(sim,environment,now,{collision,objects,onDelivery:event=>recordShippingLeagueDelivery(sim,event,{ai:true,companyId:event.companyId,name:event.companyName,now})});
 stepShippingLeague(sim,environment,now);
 for(const actor of Object.values(sim.actors||{}))if(actor.shippingSupport&&now>=actor.expiresAt)delete sim.actors[actor.id];
 for(const player of Object.values(sim.players||{})){
  const state=player.shipping,job=state?.job;if(!active(job))continue;const boat=sim.actors[job.vesselId];
  if(player.health<=0||player.replacedByRoom||now-player.lastSeen>=15000||job.environmentId!==environment.id||(player.movementRevision||0)!==job.revision||!boat||boat.active===false||boat.health<=0||boat.holderId!==player.actorId||player.vehicleId!==boat.id){cancelShipping(player,sim,now,'Freight contract ended after travel, leaving the vessel, defeat or disconnection.');continue;}
  if(now>job.deadline){cancelShipping(player,sim,now,'The freight delivery window expired. Return to port to try another contract.');job.phase='expired';continue;}
  if(['loading','secured'].includes(job.phase)&&!atDock(boat,portBy(job.originId),{stopped:false})){cancelShipping(player,sim,now,'Cargo left the loading berth before departure clearance. Reload a balanced manifest at the dock.');continue;}
  if(job.phase==='unloading'&&!atDock(boat,{...portBy(job.destinationId),berth:job.receivingBerth||portBy(job.destinationId).berth},{stopped:false})){cancelShipping(player,sim,now,'Unloading stopped after leaving the receiving dock.');continue;}
  if(job.phase!=='sailing')continue;
  const stepGap=gap(boat.position,job.lastPosition||boat.position);if(stepGap>Math.max(8,(now-(job.lastPositionAt||now))/1000*14+2)){cancelShipping(player,sim,now,'Relocation ended the shipment. Sail the marked route with the cargo vessel.');continue;}
  job.distanceSailed+=stepGap;job.lastPosition={...boat.position};job.lastPositionAt=now;
  if(now>=(job.berthCheckAt||0)&&job.checkpointIndex>=Math.max(0,job.waypoints.length-3)){
   job.berthCheckAt=now+1500;const berth=job.receivingBerth,occupied=Object.values(sim.actors).some(other=>other.id!==boat.id&&other.active!==false&&isWatercraft(other)&&watercraftOverlap(berth,berth.yaw,other.position,other.rotation?.y||0,.2,boat,other));
   if(occupied){
    try{const next=receivingBerth(sim,boat,routeBy(job.contractId),environment);if(gap(next,berth)>.5){job.receivingBerth=next;const pair=pointsFor(routeBy(job.contractId),next).slice(-2);job.waypoints.splice(-2,2,...pair);job.checkpointIndex=Math.min(job.checkpointIndex,job.waypoints.length-2);if(boat.boating?.navigationType==='shipping')startRoute(sim,player,environment,job,now);job.message=state.message='Receiving berth changed within '+portBy(job.destinationId).name+'. Follow the updated final approach.';}}
    catch{if(boat.boating?.navigationType==='shipping'){boat.boating.throttleCommand=0;boat.boating.speed=0;boat.boating.anchor=true;boat.boating.navigationWarning='Receiving quay occupied — waiting for a clear berth';}job.message=state.message='Receiving quay occupied. Wait or take the manual helm; delivery remains at the selected port.';}
   }
  }
  const point=job.waypoints[job.checkpointIndex];if(point&&gap(boat.position,point)<=Math.max(12,point.radius||0)){
   job.checkpointIndex++;job.message='Checkpoint confirmed · '+(job.checkpointIndex<job.waypoints.length?job.waypoints[job.checkpointIndex].name||'Next channel marker':'Route cleared. Stop at the destination and choose Dock.');state.message=job.message;
   if(!job.hazard&&job.checkpointIndex>=hazardAt(job)&&hazardAt(job)!==null)createThreat(sim,player,job,boat,now);
  }
  if(job.hazard&&!job.hazard.resolved){
   if(job.threatId&&sim.actors[job.threatId]?.health<=0){job.hazard.resolved=true;job.hazard.message='Rogue launch disabled. Shipment protected.';releaseThreat(sim,job);notify(sim,player,now,job.hazard.message);}
   if(!job.hazard.resolved&&now>=job.hazard.nextLossAt){const ticks=Math.min(6,1+Math.floor((now-job.hazard.nextLossAt)/8000));job.quality=Math.max(40,job.quality-ticks*3);job.hazard.nextLossAt+=ticks*8000;}
  }
  if(job.mass>0){const hullLoss=Math.max(0,job.lastHullHealth-boat.health);if(hullLoss>0)job.quality=Math.max(40,job.quality-Math.min(15,Math.ceil(hullLoss/10)));job.lastHullHealth=boat.health;}
 }
}
function contractViews(sim){return SHIPPING_ROUTES.map(route=>({...clone(route),contractId:route.id,title:route.name,baseRewardMzk:route.rewardMzk,demandBonusMzk:demandBonus(sim,route),rewardMzk:route.rewardMzk+demandBonus(sim,route),origin:clone(portBy(route.from)),destination:clone(portBy(route.to)),cargo:clone(SHIPPING_CARGO.find(cargo=>cargo.id===route.cargoId)),units:route.units||4,minimumVesselId:route.requiredVessel,minimumVesselName:SHIPPING_VESSELS.find(item=>item.modelId===route.requiredVessel)?.name}));}
export function shippingView(sim){if(!sim.shipping?.enabled)return {enabled:false};return {enabled:true,environmentId:sim.shipping.environmentId||SHIPPING_ID,ports:clone(SHIPPING_PORTS),cargo:clone(SHIPPING_CARGO),routes:clone(SHIPPING_ROUTES),contracts:contractViews(sim),competition:shippingCompetitionView(sim),rivals:shippingRivalsView(sim),portEconomy:shippingPortEconomyView(sim),dispatch:shippingDispatchView(sim),vessels:clone(SHIPPING_VESSELS),trades:clone(SHIP_STOCK_TRADES),traffic:Object.values(sim.actors||{}).filter(actor=>actor.shippingTraffic||actor.shippingRival).map(actor=>({id:actor.id,name:actor.name,position:{...actor.position},laneId:actor.shippingLane,phase:actor.boating?.phase})),hazards:Object.values(sim.players||{}).filter(player=>active(player.shipping?.job)&&player.shipping.job.hazard&&!player.shipping.job.hazard.resolved).map(player=>({jobId:player.shipping.job.id,actorId:player.actorId,...clone(player.shipping.job.hazard),position:clone(sim.actors[player.shipping.job.vesselId]?.position||player.position)}))};}
export function playerShippingView(sim,player){const state=stateFor(player),boat=sim.actors[player.vehicleId],point=boat?.position||player.position,nearbyPort=SHIPPING_PORTS.filter(port=>gap(point,boat?port.berth:port.position||port.berth)<=70).sort((a,b)=>gap(point,a.berth)-gap(point,b.berth))[0];return {competition:playerShippingCompetitionView(sim,player,sim.shipping?.serverTime??sim.time??Date.now()),job:state.job?{...publicJob(state.job),readyToDock:state.job.phase==='sailing'&&state.job.checkpointIndex>=state.job.waypoints.length}:null,stats:{...defaults(),...state.stats},supplies:{...state.supplies},unlocks:[...state.unlocks],message:state.message,boardingId:!player.vehicleId?availableBoarding(sim,player)?.id||null:null,nearbyPortId:nearbyPort?.id||null,canTrade:!!nearbyPort&&(!boat||Math.abs(boat.boating?.speed||0)<=SHIPPING_RULES.maxDockSpeed),availableContracts:SHIPPING_ROUTES.filter(route=>(!route.factoryExport||!!state.factoryExport)&&nearbyPort?.id===route.from&&(!vessel(boat)||(route.units||4)<=vessel(boat).slots&&SHIPPING_CARGO.find(item=>item.id===route.cargoId).mass*(route.units||4)<=vessel(boat).capacity)).map(route=>route.id)};}
export function shippingCommand(sim,player,environment,command,now){
 if(!isShippingEnvironment(environment))fail('Enter the Strait shipping world to operate freight.');stepShipping(sim,environment,now);const state=stateFor(player),operation=command.operation;if(player.health<=0)fail('Respawn before starting freight work.');
 if(operation==='status')return {message:state.message};
 if(operation==='join-league')return joinShippingLeague(sim,player,command.competitionId,now);
 if(operation==='claim-league')return claimShippingLeague(sim,player,command.competitionId,now);
 if(operation==='board'){
  if(player.vehicleId||player.heldId||player.seatedId||player.skiLift)fail('Leave your current seat or item before boarding a cargo vessel.');const boat=availableBoarding(sim,player);if(!boat||command.entityId&&boat.id!==command.entityId||command.modelId&&boat.modelId!==command.modelId)fail('Walk to an available unlocked cargo vessel at this dock.');
  boat.holderId=player.actorId;stopBoat(boat);player.vehicleId=boat.id;player.position={...boat.position,y:.35};player.floor=.35;player.yaw=boat.rotation?.y||0;player.velocityY=0;player.grounded=true;player.input={};player.movementRevision=(player.movementRevision||0)+1;return notify(sim,player,now,'Boarded '+(boat.name||vessel(boat).name)+'. Choose a freight manifest for this port.');
 }
 if(operation==='trade'){
  if(active(state.job))fail('Finish or cancel your current manifest before exchanging port stock.');const trade=SHIP_STOCK_TRADES.find(item=>item.id===command.tradeId);if(!trade)fail('Choose a listed dock exchange.',422);const position=sim.actors[player.vehicleId]?.position||player.position,port=SHIPPING_PORTS.find(port=>gap(position,player.vehicleId?port.berth:port.position||port.berth)<=70);if(!port||player.vehicleId&&Math.abs(sim.actors[player.vehicleId]?.boating?.speed||0)>.8)fail('Stop at a shipping dock to exchange your delivered stock.');if(!(state.supplies[trade.stockId]>=trade.cost))fail('Deliver more '+trade.stockId.replace(/^shipping-|-stock$/g,'')+' stock before making this exchange.');return {settlement:{type:'trade',tradeId:trade.id,exchangeId:randomUUID(),stockId:trade.stockId,worldId:SHIPPING_ID,environmentId:environment.id},message:'Exchanging delivered port stock.'};
 }
 if(operation==='cancel'){cancelShipping(player,sim,now);return {message:state.message};}
 if(['radio','escort'].includes(operation)&&!active(state.job))return notify(sim,player,now,'Freight control: board an available feeder at the dock, choose a manifest, alternate port and starboard loads, then Secure and Depart.');
 const boat=currentBoat(sim,player);
 if(operation==='service'){const port=SHIPPING_PORTS.find(port=>atDock(boat,port));if(!port)fail('Stop at a cargo dock and cancel Auto before requesting service.');stopBoat(boat);boat.maxHealth=shippingHullHealth(boat)??boat.maxHealth??650;boat.health=boat.maxHealth;player.fuel=100;player.ammo=120;return notify(sim,player,now,port.name+' crew: hull repaired, fuel and ammunition replenished.');}
 if(operation==='accept'){
  if(active(state.job))fail('Finish or cancel your existing freight contract first.');if(player.vehicleMission?.status==='active'||player.fishing?.session&&['waiting','bite','reeling','caught'].includes(player.fishing.session.status))fail('Finish your current game assignment before loading freight.');
  const route=routeBy(command.contractId);if(!route)fail('Choose a listed freight manifest.',422);if(route.factoryExport&&!state.factoryExport)fail('Stage a certified factory model at the Atlas export desk before accepting this voyage.');const origin=portBy(route.from),cargo=SHIPPING_CARGO.find(item=>item.id===route.cargoId),type=vessel(boat),units=route.units||4;requireDock(boat,origin);if(units>type.slots||cargo.mass*units>type.capacity)fail('This manifest exceeds the vessel capacity. Unlock a larger ship.');
  stopBoat(boat);player.input={};const berth=receivingBerth(sim,boat,route,environment),waypoints=pointsFor(route,berth),offset=boat.position.x-origin.x;
  // An arriving vessel may occupy a reserved side bay. Pull away along the
  // quay before turning, using astern gear when its bridge faces the berth.
  if(Math.abs(offset)>12){const sign=Math.sign(offset),x=origin.x+sign*130,shore=Math.sign(origin.position.z-origin.z)||1,gear=(-Math.sin(boat.rotation?.y||0))*sign>=0?1:-1;waypoints.splice(0,1,{x,z:boat.position.z,gear,name:'Pull clear of the reserved receiving bay'},{x,z:origin.z-shore*85,name:'Clear the quay before joining the channel'});}
  const length=waypoints.reduce((sum,point,index)=>sum+gap(index?waypoints[index-1]:boat.position,point),0);
  state.job={id:randomUUID(),contractId:route.id,title:route.name,cargoId:cargo.id,originId:route.from,destinationId:route.to,vesselId:boat.id,environmentId:environment.id,phase:'loading',receivingBerth:berth,demandBonusMzk:demandBonus(sim,route),competitionId:shippingLeagueForManifest(sim,player,now),units,loaded:[],unloaded:0,secured:false,quality:100,checkpointIndex:0,waypoints,startedAt:now,deadline:now+SHIPPING_RULES.contractLimitMs,revision:player.movementRevision||0,workReadyAt:now,distanceSailed:0,routeLength:length,minTransitMs:Math.floor(length/14*1000*.8),lastHullHealth:boat.health};cargoReadings(state.job,boat);return notify(sim,player,now,'Manifest accepted: '+units+' '+cargo.name+' containers. Alternate port and starboard loads, then Secure. '+cargo.lesson);
 }
 const job=state.job;if(!active(job))fail('Choose a freight manifest for your current port first.');if(command.jobId&&command.jobId!==job.id)fail('That freight manifest has expired. Refresh the shipping panel.');if(job.vesselId!==boat.id)fail('Return to the vessel assigned to this manifest.');
 const cargo=SHIPPING_CARGO.find(item=>item.id===job.cargoId),origin=portBy(job.originId),destination={...portBy(job.destinationId),berth:job.receivingBerth||portBy(job.destinationId).berth},type=vessel(boat);
 if(operation==='load'||operation==='remove'){
  if(job.phase!=='loading')fail('Cargo can only be adjusted before it is secured.');requireDock(boat,origin);if(now<job.workReadyAt)fail('The crane is handling the previous container. Wait for the hook to clear.');if(!['port','starboard'].includes(command.side))fail('Choose the port or starboard loading bay.',422);
  if(operation==='load'){
   if(job.loaded.length>=job.units)fail('The manifest is fully loaded. Secure it before departure.');if(job.loaded.length>=type.slots||job.mass+cargo.mass>type.capacity)fail('The vessel is at its safe cargo capacity.');if(job.loaded.filter(item=>item.side===command.side).length>=Math.ceil(type.slots/2))fail('This side is full. Load the other side to balance the vessel.');job.loaded.push({side:command.side,cargoId:cargo.id,mass:cargo.mass,loadedAt:now});
  }else{const index=job.loaded.findLastIndex(item=>item.side===command.side);if(index<0)fail('That side has no container to remove.');job.loaded.splice(index,1);}
  job.workReadyAt=now+SHIPPING_RULES.loadingSeconds*1000;cargoReadings(job,boat);return notify(sim,player,now,job.loaded.length+'/'+job.units+' containers loaded · port '+job.portMass+' t / starboard '+job.starboardMass+' t.');
 }
 if(operation==='secure'){
  if(job.phase!=='loading')fail('The manifest is already secured.');requireDock(boat,origin);if(now<job.workReadyAt)fail('Wait for the last container to clear the crane.');if(job.loaded.length!==job.units)fail('Load the complete manifest before securing it.');if(Math.abs(job.portMass-job.starboardMass)>cargo.mass)fail('The load is unbalanced. Remove a container from the heavy side and reload it on the other side.');job.secured=true;job.phase='secured';cargoReadings(job,boat);stopBoat(boat);return notify(sim,player,now,'Load balanced and secured. Departure is cleared. Follow every channel marker and slow before the receiving dock.');
 }
 if(operation==='depart'){
  if(job.phase!=='secured'||!job.secured)fail('Load, balance and secure the manifest before departure.');requireDock(boat,origin);job.phase='sailing';job.departedAt=now;job.lastPosition={...boat.position};job.lastPositionAt=now;startRoute(sim,player,environment,job,now);return notify(sim,player,now,'Underway. Auto follows the marked shipping lane; the helm remains available for manual control.');
 }
 if(operation==='navigate'){
  if(job.phase!=='sailing')fail('Depart with secured cargo before following the shipping lane.');startRoute(sim,player,environment,job,now);return notify(sim,player,now,'Resuming the marked route from your next required checkpoint.');
 }
 if(operation==='radio'||operation==='escort'){
  if(job.phase!=='sailing')return notify(sim,player,now,'Freight control: balance the manifest, secure it, follow every lane marker, then stop at the receiving berth to unload.');
  if(job.hazard&&!job.hazard.resolved){if(job.hazard.type==='pirates'&&operation!=='escort')return notify(sim,player,now,'Freight control: rogue launch confirmed. Choose Escort to call the convoy patrol.');job.hazard.resolved=true;job.hazard.resolution=operation;job.hazard.resolvedAt=now;releaseThreat(sim,job);if(operation==='escort'){const positions=[{x:boat.position.x+35,y:0,z:boat.position.z+35},{x:boat.position.x-35,y:0,z:boat.position.z-35}],position=positions.find(point=>watercraftFootprint(point,boat.rotation?.y||0,{modelId:'harbor-patrol'}).every(vertex=>harborWaterAt(environment,vertex,1))&&!Object.values(sim.actors).some(other=>other.active!==false&&isWatercraft(other)&&gap(point,other.position)<15));if(position){const id='shipping-support-'+job.id;sim.actors[id]={id,name:'Convoy Guardian · AI escort',modelId:'harbor-patrol',asset:{buildAssetId:'harbor-patrol'},position,rotation:{x:0,y:boat.rotation?.y||0,z:0},active:true,health:650,maxHealth:650,spawned:true,trafficAI:true,shippingSupport:true,shippingOwner:player.actorId,expiresAt:now+15000,destructible:false,boating:{speed:0,anchor:true,phase:'convoy escort'}};job.supportId=id;}}return notify(sim,player,now,operation==='escort'?'Convoy patrol intercepted the training pirates. Cargo remains protected.':'Freight control confirmed a safe passage. Continue through the marked lane.');}
  return notify(sim,player,now,'Freight control: passage clear. '+(job.waypoints[job.checkpointIndex]?.name||'Approach the receiving berth slowly.')+'.');
 }
 if(operation==='dock'){
  if(job.phase!=='sailing')fail('Complete the sea passage before docking for delivery.');if(job.checkpointIndex<job.waypoints.length)fail('Follow every required channel marker before requesting delivery clearance.');if(now-job.departedAt<job.minTransitMs)fail('The cargo passage is not yet verified. Sail the complete marked route.');if(gap(boat.position,destination.berth)>SHIPPING_RULES.dockRadius||Math.abs(boat.boating?.speed||0)>.8)fail('Slow below 0.8 m/s inside the receiving berth before docking.');stopBoat(boat);job.phase='unloading';job.dockedAt=now;job.workReadyAt=now;player.input={};return notify(sim,player,now,'Receiving dock cleared. Unload all '+job.units+' containers to complete the manifest and receive your stock.');
 }
 if(operation==='unload'){
  if(job.phase!=='unloading')fail('Dock at the receiving port before unloading.');requireDock(boat,destination);if(now<job.workReadyAt)fail('The receiving crane is clearing the previous container.');if(job.unloaded>=job.units)fail('This manifest has already been unloaded.');
  if(job.unloaded+1===job.units){const route=routeBy(job.contractId);return {message:'Manifest complete. Saving freight reward and marketplace stock.',settlement:{type:'delivery',deliveryId:job.id,contractId:job.contractId,cargoId:job.cargoId,units:job.units,quality:job.quality,demandBonusMzk:job.demandBonusMzk||0,competitionId:job.competitionId||null,amountMzk:Math.max(1,Math.round((route.rewardMzk+(job.demandBonusMzk||0))*job.quality/100)),startedAt:job.startedAt,departedAt:job.departedAt,deliveredAt:now,worldId:SHIPPING_ID,environmentId:environment.id,...(route.factoryExport?{factoryManifestId:job.factoryManifestId}: {})}};}
  job.unloaded++;job.workReadyAt=now+SHIPPING_RULES.loadingSeconds*1000;cargoReadings(job,boat);return notify(sim,player,now,job.unloaded+'/'+job.units+' containers received. Finish unloading to release the manifest reward.');
 }
 fail('Choose a listed shipping action.',422);
}
export function applyShippingSettlement(sim,player,result,receipt,now){
 applyShippingAccount(player,receipt);const state=stateFor(player);if(result.type==='delivery'&&state.job?.id===result.deliveryId){const job=state.job;if(!job.settled){recordShippingPortDelivery(sim,{deliveryId:job.id,actorId:player.actorId,contractId:job.contractId,cargoId:job.cargoId,destinationId:job.destinationId,units:job.units,deliveredAt:now});if(job.competitionId)recordShippingLeagueDelivery(sim,{deliveryId:job.id,contractId:job.contractId,units:job.units,quality:job.quality,startedAt:job.startedAt,departedAt:job.departedAt,deliveredAt:now},{actorId:player.actorId,competitionId:job.competitionId,now});}job.phase='delivered';job.unloaded=job.units;job.deliveredAt=now;job.settled=true;job.amountMzk=receipt.amountMzk;job.message=receipt.message;releaseThreat(sim,job);cargoReadings(job,sim.actors[job.vesselId]);player.score=(player.score||0)+Math.round(100+job.quality);sim.questResults ||= [];sim.questResults.push({questId:job.contractId,title:job.title,actorId:player.actorId,username:player.username,at:now,elapsed:now-job.startedAt,score:Math.round(100+job.quality),kind:'shipping',quality:job.quality});sim.questResults=sim.questResults.slice(-40);}
 if(result.type==='competition')applyShippingLeagueClaim(sim,player,result);state.message=receipt.message;return {message:receipt.message,shippingReceipt:receipt};
}
const publicAccount=state=>({stats:{...defaults(),...state?.stats},supplies:{...state?.supplies}});
/** Settlements come only from the room command. Receipts and stock quantities
 * live outside editable member memory and commit with the wallet transaction. */
export function grantShippingReward(database,walletId,result,{now=Date.now()}={}){
 const wallet=cleanWallet(walletId);if(result?.worldId!==SHIPPING_ID||!['delivery','trade','competition'].includes(result?.type))fail('Invalid authoritative shipping settlement.',422);
 const route=routeBy(result.contractId),cargo=SHIPPING_CARGO.find(item=>item.id===result.cargoId),trade=SHIP_STOCK_TRADES.find(item=>item.id===result.tradeId);
 if(result.type==='delivery'&&(!route||!cargo||route.cargoId!==cargo.id||!uuid(result.deliveryId)||result.units!==(route.units||4)||!Number.isInteger(result.quality)||result.quality<40||result.quality>100||!Number.isSafeInteger(result.demandBonusMzk??0)||(result.demandBonusMzk??0)<0||(result.demandBonusMzk??0)>15||result.amountMzk!==Math.max(1,Math.round((route.rewardMzk+(result.demandBonusMzk||0))*result.quality/100))||![result.startedAt,result.departedAt,result.deliveredAt].every(Number.isFinite)||result.deliveredAt>now||result.startedAt>result.departedAt||result.deliveredAt-result.startedAt<SHIPPING_RULES.loadingSeconds*1000*(result.units*2-2)||result.deliveredAt-result.startedAt>SHIPPING_RULES.contractLimitMs))fail('Invalid authoritative freight delivery.',422);
 if(result.type==='trade'&&(!trade||result.stockId!==trade.stockId||!uuid(result.exchangeId)))fail('Invalid port stock exchange.',422);
 if(result.type==='competition'&&(!uuid(result.competitionId)||!Number.isSafeInteger(result.rank)||result.rank<1||result.rank>256||!Number.isSafeInteger(result.score)||result.score<1||result.score>10000000||!Number.isSafeInteger(result.deliveries)||result.deliveries<1||result.deliveries>500||!Number.isSafeInteger(result.unitsDelivered)||result.unitsDelivered<result.deliveries||result.unitsDelivered>result.deliveries*12||![result.startsAt,result.endsAt].every(Number.isFinite)||result.endsAt-result.startsAt!==SHIPPING_LEAGUE_RULES.durationMs||result.endsAt>now||now-result.endsAt>SHIPPING_LEAGUE_RULES.claimWindowMs||result.amountMzk!==shippingLeaguePrize(result.rank,result.deliveries)))fail('Invalid authoritative freight league result.',422);
 const requestId=result.type==='delivery'?'delivery:'+result.deliveryId:result.type==='trade'?'trade:'+result.exchangeId:'competition:'+result.competitionId+':'+wallet;
 return database.transaction(data=>{
  const prior=(data.transactions||[]).find(entry=>entry.type==='SHIPPING_REWARD'&&entry.requestId===requestId);if(prior){if(prior.walletId!==wallet)fail('This freight receipt belongs to another captain.',403);return prior;}
  const user=data.users[wallet];if(!user)fail('Member wallet not found.',404);data.shipping ||= {accounts:{}};data.shipping.accounts ||= {};const state=data.shipping.accounts[wallet] ||= {stats:defaults(),supplies:{},dailyEarnedMzk:0};state.stats={...defaults(),...state.stats};state.supplies ||= {};const day=new Date(now).toISOString().slice(0,10);if(state.rewardDay!==day){state.rewardDay=day;state.dailyEarnedMzk=0;}
  if(result.type==='competition'&&state.leagueClaims?.[result.competitionId])return state.leagueClaims[result.competitionId];
  let amountMzk=0,message;user.items ||= [];
  if(result.type==='delivery'){
   if(route.factoryExport)settleFactoryShipping(data,wallet,{manifestId:result.factoryManifestId,deliveryId:result.deliveryId,contractId:result.contractId,quality:result.quality,now});
   amountMzk=Math.max(0,Math.min(result.amountMzk,SHIPPING_RULES.dailyRewardCapMzk-state.dailyEarnedMzk));const stockId=stockFor(cargo),quantity=Math.max(1,Math.floor(result.units*result.quality/100));state.supplies[stockId]=(state.supplies[stockId]||0)+quantity;if(!Number.isSafeInteger(state.supplies[stockId]))fail('Stock inventory is at capacity.');
   let item=user.items.find(item=>item.shippingSupplyId===stockId);if(!item){item={...economyItem('stock:'+stockId),id:'shipping-supply:'+stockId,economySku:'stock:'+stockId,shippingSupplyId:stockId,name:stockId.replace(/^shipping-|-stock$/g,'')+' freight stock',type:'shipping-stock',source:'shipping-delivery',listing:{active:false},acquiredAt:new Date(now).toISOString()};user.items.push(item);}item.quantity=state.supplies[stockId];
   state.stats.deliveries++;state.stats.unitsDelivered+=result.units;state.stats.bestQuality=Math.max(state.stats.bestQuality,result.quality);state.stats.totalEarnedMzk+=amountMzk;state.dailyEarnedMzk+=amountMzk;
   message='Delivered '+result.units+' containers at '+result.quality+'% quality. +'+quantity+' marketplace stock'+(amountMzk?' · +'+amountMzk+' MZK':'. Daily shipping reward cap reached.');
  }else if(result.type==='trade'){
   if((state.supplies[trade.stockId]||0)<trade.cost)fail('This stock has already been exchanged. Deliver another shipment.');const target=trade.productionCreditMzk?null:economyItem(trade.sku);if(!target&&!trade.productionCreditMzk)fail('This dock exchange is unavailable.');if(target&&target.kind!=='material'&&ownsEconomyItem(user,target))fail('This upgrade is already owned. Choose another stock exchange.');
   if(target){const supply=ensureWorldSupply(data);if(result.environmentId&&!Object.hasOwn(supply.maps,result.environmentId))ensureWorldSupply(data,{maps:[{id:result.environmentId}]});consumeWorldStock(data,target,trade.quantity,{mapId:result.environmentId});}
   state.supplies[trade.stockId]-=trade.cost;const item=user.items.find(item=>item.shippingSupplyId===trade.stockId);if(item)item.quantity=state.supplies[trade.stockId];
   if(trade.productionCreditMzk){data.factoryLogistics ||= {};data.factoryLogistics.productionCredits ||= {};const credits=Number(data.factoryLogistics.productionCredits[wallet]||0)+trade.quantity;if(!Number.isSafeInteger(credits)||credits>1000000)fail('Factory production credits are at capacity.');data.factoryLogistics.productionCredits[wallet]=credits;}
   else if(target.kind==='material'){user.memory ||= {};user.memory.materialCredits ||= {};user.memory.materialCredits[target.sku]=(user.memory.materialCredits[target.sku]||0)+trade.quantity;if(!ownsEconomyItem(user,target))user.items.push({...target,id:'economy:'+target.sku,economySku:target.sku,type:'game-upgrade',source:'shipping-exchange',listing:{active:false},acquiredAt:new Date(now).toISOString()});}
   else user.items.push({...target,id:'economy:'+target.sku,economySku:target.sku,type:'game-upgrade',source:'shipping-exchange',listing:{active:false},acquiredAt:new Date(now).toISOString()});
   message=trade.productionCreditMzk?'Port exchange complete · '+trade.name+'. It will reduce your next factory production order.':'Port exchange complete · '+trade.name+'. Find it in your Tools or material inventory.';
  }else{
   amountMzk=Math.max(0,Math.min(result.amountMzk,SHIPPING_RULES.dailyRewardCapMzk-state.dailyEarnedMzk));state.stats.leaguesPlayed++;state.stats.leaguesWon+=result.rank===1?1:0;state.stats.leagueEarnedMzk+=amountMzk;state.stats.totalEarnedMzk+=amountMzk;state.dailyEarnedMzk+=amountMzk;
   message='Freight League rank '+result.rank+' saved · '+result.score+' points'+(amountMzk?' · +'+amountMzk+' MZK.':'. Daily shipping reward cap reached.');
  }
  const balance=Number(user.tokens?.MZK||0)+amountMzk;if(!Number.isSafeInteger(balance))fail('The wallet cannot accept this shipping reward.');user.tokens ||= {};user.tokens.MZK=balance;user.revision=Number(user.revision||0)+1;user.updatedAt=new Date(now).toISOString();
  const receipt={id:'shipping-'+randomUUID(),type:'SHIPPING_REWARD',operation:result.type,walletId:wallet,requestId,amountMzk,balanceAfterMzk:balance,createdAt:new Date(now).toISOString(),...publicAccount(state),unlocks:unlocksFor(state.stats,user),...(result.type==='trade'?{tradeId:trade.id,sku:trade.sku}:result.type==='competition'?{competitionId:result.competitionId,rank:result.rank,score:result.score,endsAt:result.endsAt}:{}),message};
  if(result.type==='competition'){state.leagueClaims ||= {};for(const [id,claim]of Object.entries(state.leagueClaims))if(now-(claim.endsAt||0)>SHIPPING_LEAGUE_RULES.claimWindowMs)delete state.leagueClaims[id];state.leagueClaims[result.competitionId]=receipt;}
  (data.transactions ||= []).push(receipt);return receipt;
 });
}
export async function shippingAccountState(database,walletId){const wallet=cleanWallet(walletId);await database.initialize();const data=await database.read(),user=data.users[wallet];if(!user)return null;const state=data.shipping?.accounts?.[wallet]||{};return {...publicAccount(state),unlocks:unlocksFor(state.stats,user),factoryExport:factoryShippingExportState(data,wallet),dailyRewardCapMzk:SHIPPING_RULES.dailyRewardCapMzk};}

export async function shippingDefense(sim,player,environment,command,now,{charge=async()=>{},collision}={}){
 const state=stateFor(player),job=state.job,boat=currentBoat(sim,player),tool=String(command.tool||'laser'),profile=RANGED_WEAPONS[tool];
 if(!active(job)||job.phase!=='sailing'||job.hazard?.type!=='pirates'||job.hazard.resolved)fail('Shipping weapons only engage the marked training pirate. Use the freight actions to continue.');
 if(!profile&&tool!=='dynamite')fail('Choose a ranged weapon for the marked rogue launch.',422);if(shippingHandling(player))fail('Finish cargo handling before using a weapon.');
 const direction=command.direction;if(!Array.isArray(direction)||direction.length!==3||!direction.every(Number.isFinite)||Math.hypot(...direction)<.1)fail('Invalid defensive aim.',422);
 const target=sim.actors[job.threatId];if(!target||target.shippingOwner!==player.actorId||!target.shippingThreat||target.active===false||target.health<=0)fail('The marked rogue launch is no longer a threat.');
 const cooldown=tool==='dynamite'?1200:Math.max(200,(profile.interval||.25)*1000);player.toolReady ||= {};if(now<(player.toolReady[tool]||0))fail('Defensive tool is cooling down.',429);if((player.ammo??120)<=0)fail('Refill ammunition at a dock.');
 const seat=shippingVesselType(boat).seat,yaw=boat.rotation?.y||0,origin={x:boat.position.x+seat[0]*Math.cos(yaw)+seat[2]*Math.sin(yaw),y:boat.position.y+seat[1]+.35,z:boat.position.z-seat[0]*Math.sin(yaw)+seat[2]*Math.cos(yaw)},length=Math.hypot(...direction),ray=direction.map(value=>value/length),range=Math.min(120,profile?.range||60),along=patrolRayDistance(target,origin,ray);
 let hit=along!==null&&along<range;if(hit&&collision?.blocksShot?.(environment,origin,ray,along,Object.fromEntries(Object.entries(sim.actors).filter(([id])=>id!==boat.id&&id!==target.id))))hit=false;
 await charge('tool:'+tool);player.ammo=(player.ammo??120)-1;player.toolReady[tool]=now+cooldown;
 if(hit){target.health=Math.max(0,target.health-(profile?.damage||45));target.contributors ||= {};target.contributors[player.actorId]=true;if(target.health===0){target.active=false;job.hazard.resolved=true;job.hazard.message='Rogue training launch disabled. Shipment protected.';notify(sim,player,now,job.hazard.message);}}
 const distance=hit?along:range,end={x:origin.x+ray[0]*distance,y:origin.y+ray[1]*distance,z:origin.z+ray[2]*distance};return {tool,origin,end,direction:ray,firedAt:now,cooldownMs:cooldown,readyAt:player.toolReady[tool],hitId:hit?target.id:null,targetType:hit?'enemy':null,message:hit?'Training pirate hull · '+target.health:'Defensive shot fired. Only the marked rogue launch can be damaged.'};
}
