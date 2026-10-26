import {randomInt,randomUUID} from 'node:crypto';
import {cleanWallet} from './user-json-database.mjs';
import {FISH_SPECIES,FISHING_GEAR,FISHING_GUIDES,FISHING_RULES,fishingZones,fishingZoneAt,isFishingBoat,fishingStationPosition} from './public/js/fishing-config.js';
import {harborWaterAt,watercraftFootprint} from './public/js/harbor-water.js';
import {stopBoat} from './server-harbor-operations.mjs';
import {GAME_ECONOMY,ownsEconomyItem} from './game-economy.mjs';

const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const uuid=value=>/^[a-f0-9-]{36}$/.test(value||'');
const fishPrice=(species,weightKg)=>Math.max(1,Math.min(200,Math.round(species.value*weightKg)));
const live=session=>session&&['waiting','bite','reeling','caught'].includes(session.status);
export const fishingLocked=player=>live(player?.fishing?.session);
const prizes=[60,35,20];
const defaultStats=()=>({catches:0,releases:0,totalWeightKg:0,bestKg:0,totalEarnedMzk:0});
const enabled=environment=>!!environment?.builderScene?.layoutMeta?.harbor;

function stateFor(player){return player.fishing ||= {session:null,creel:[],stats:defaultStats(),gear:FISHING_GEAR.filter(item=>item.basic).map(item=>item.id)};}
export function applyFishingAccount(player,account){
 if(!account)return;
 const state=stateFor(player);
 state.gear=account.gear||state.gear;state.creel=account.creel||[];state.stats=account.stats||defaultStats();
}

export function cancelFishing(player,sim,now,message='Line packed away. You can move and steer again.'){
 const state=player.fishing,session=state?.session;if(!live(session))return;
 session.status='cancelled';session.reeling=false;session.finishedAt=now;session.message=message;state.message=message;player.input={};
 const boat=sim.actors?.[session.boatId];
 if(boat&&player.vehicleId===boat.id&&boat.holderId===player.actorId){player.position={...boat.position,y:.35};player.floor=.35;player.velocityY=0;player.grounded=true;}
}

function castSite(sim,player,environment,side='port',requestedZoneId=null){
 if(!enabled(environment))return {canCast:false,reason:'Fishing is available in Neon Harbor and its island lakes.'};
 if(player.health<=0||player.grounded===false||player.skiing||player.skiLift||player.seatedId||player.heldId)return {canCast:false,reason:'Stand still with free hands before fishing.'};
 const boat=sim.actors[player.vehicleId];
 if(player.vehicleId){
  if(!isFishingBoat(boat)||boat.active===false||boat.holderId!==player.actorId)return {canCast:false,reason:'Use the fishing boat or fish from a marked shore.'};
  if(!Number.isFinite(boat.boating?.speed??0)||Math.abs(boat.boating?.speed||0)>FISHING_RULES.castSpeedLimit||boat.boating?.assist)return {canCast:false,reason:'Let the boat stop at your fishing destination, or slow down and cancel Auto before casting.'};
  if(!watercraftFootprint(boat.position,boat.rotation?.y||0,boat).every(point=>harborWaterAt(environment,point,.25)))return {canCast:false,reason:'Move the fishing boat clear of the shore before casting.'};
  const selectedZoneId=requestedZoneId||(fishingZones(environment).some(zone=>zone.id===boat.boating?.navigationZoneId)?boat.boating.navigationZoneId:null);
  const position=fishingStationPosition(boat,side),yaw=boat.rotation?.y||0,sign=side==='starboard'?1:-1;
  const castPoint={x:position.x+Math.cos(yaw)*sign*5,y:.05,z:position.z-Math.sin(yaw)*sign*5},zone=fishingZoneAt(environment,castPoint,selectedZoneId);
  if(!zone||!harborWaterAt(environment,castPoint,.1))return {canCast:false,reason:'Choose the other side or sail to a marked fishing area.'};
  const preparationRequired=boat.boating?.anchor!==true||Math.abs(boat.boating?.speed||0)>.15;
  return {canCast:true,ready:!preparationRequired,preparationRequired,position,castPoint,zoneId:zone.id,boatId:boat.id,water:zone.water,zone};
 }
 if(harborWaterAt(environment,player.position)&&player.position.y<.1)return {canCast:false,reason:'Climb onto a fishing pier or dry shore before casting.'};
 const yaw=player.yaw||0;
 for(const turn of [0,1,-1,2,-2,3,-3,4])for(const range of [5,8]){
  const angle=yaw+turn*Math.PI/4,castPoint={x:player.position.x-Math.sin(angle)*range,y:.05,z:player.position.z-Math.cos(angle)*range},zone=fishingZoneAt(environment,castPoint,requestedZoneId);
  if(zone&&harborWaterAt(environment,castPoint,.1))return {canCast:true,ready:true,preparationRequired:false,position:{...player.position},castPoint,zoneId:zone.id,water:zone.water,zone,boatId:null};
 }
 return {canCast:false,reason:'Walk to a marked fishing pier, shoreline, or the fishing boat.'};
}

function board(tournament){return Object.values(tournament?.entries||{}).sort((a,b)=>b.score-a.score||b.weightKg-a.weightKg||a.actorId.localeCompare(b.actorId));}
function ensureTournament(sim,now){
 const old=sim.fishing.tournament;
 if(old&&!(old.status==='finished'&&now>=old.endsAt+60000))return old;
 if(old){sim.fishing.history ||= [];sim.fishing.history.push(old);sim.fishing.history=sim.fishing.history.slice(-8);}
 const tournament={id:randomUUID(),name:'Neon Harbor Fishing Cup',status:'open',createdAt:now,startsAt:now+15000,endsAt:now+195000,entries:{},claims:{}};
 for(const [index,name]of ['Captain Mira AI','Reef Ranger AI'].entries())tournament.entries['fishing-ai-'+index]={actorId:'fishing-ai-'+index,name,ai:true,weightKg:0,catches:0,score:0,nextCatchAt:tournament.startsAt+22000+index*5000};
 sim.fishing.tournament=tournament;return tournament;
}

function scoreFish(sim,player,session,now){
 const tournament=sim.fishing?.tournament,entry=tournament?.entries?.[player.actorId];
 if(!entry||session.scored||session.tournamentId!==tournament.id||session.landedAt>tournament.endsAt||session.startedAt<tournament.startsAt)return;
 session.scored=true;entry.catches++;entry.weightKg=Math.round((entry.weightKg+session.fish.weightKg)*1000)/1000;entry.score+=Math.round(session.fish.weightKg*100);entry.lastCatchAt=now;
}

function endSession(session,status,now,message){session.status=status;session.reeling=false;session.finishedAt=now;session.message=message;}

/** Advance from server time, never client frame counts. Short reel leases allow
 * mobile jitter but stop progress after backgrounding or a lost pointer-up. */
export function stepFishing(sim,environment,now){
 sim.fishing ||= {enabled:enabled(environment),zones:[],guides:[],tournament:null};
 sim.fishing.enabled=enabled(environment);sim.fishing.zones=enabled(environment)?fishingZones(environment):[];sim.fishing.guides=enabled(environment)?FISHING_GUIDES:[];
 const harbor=environment.builderScene?.layoutMeta?.harbor;
 sim.fishing.environmentId=environment.id;sim.fishing.harbor=harbor?{extent:harbor.extent,islands:harbor.islands||[],lakes:harbor.lakes||[],fishingZones:sim.fishing.zones}:null;
 const tournament=sim.fishing.tournament;
 if(tournament&&tournament.status!=='finished'){
  if(now>=tournament.startsAt)tournament.status='active';
  const until=Math.min(now,tournament.endsAt);
  for(const entry of Object.values(tournament.entries))if(entry.ai)while(entry.nextCatchAt<=until){const weight=.65+(entry.catches*17+(entry.actorId.endsWith('0')?3:9))%25/10;entry.catches++;entry.weightKg=Math.round((entry.weightKg+weight)*1000)/1000;entry.score+=Math.round(weight*100);entry.nextCatchAt+=26000+(entry.catches%3)*4000;}
  if(now>=tournament.endsAt){tournament.status='finished';tournament.finishedAt=tournament.endsAt;}
 }
 if(tournament?.status==='finished'&&now>=tournament.endsAt+60000&&enabled(environment)&&Object.values(sim.players||{}).some(player=>!player.replacedByRoom&&now-player.lastSeen<15000))ensureTournament(sim,now);
 for(const player of Object.values(sim.players||{})){
  const state=player.fishing,session=state?.session;if(!live(session))continue;
  const boat=sim.actors?.[session.boatId];
  if(!enabled(environment)||session.environmentId!==environment.id||player.health<=0||player.replacedByRoom||now-player.lastSeen>=15000||player.heldId||player.seatedId||session.boatId&&(!boat||boat.active===false||boat.holderId!==player.actorId||player.vehicleId!==boat.id||!boat.boating?.anchor||boat.boating?.assist||Math.abs(boat.boating?.speed||0)>.15)||!session.boatId&&player.vehicleId||distance(player.position,session.position)>.9||(player.movementRevision||0)!==session.movementRevision){cancelFishing(player,sim,now,'Fishing ended after movement, travel, disconnection, or leaving the boat.');continue;}
  player.input={};
  if(session.status==='caught')continue;
  if(now>=session.startedAt+FISHING_RULES.sessionLimitMs){endSession(session,'escaped',now,'The fish got away. Cast again.');continue;}
  if(session.status==='waiting'&&now>=session.biteAt){session.status='bite';session.message='Bite! Tap Hook before the fish escapes.';}
  if(session.status==='bite'&&now>session.biteEndsAt){endSession(session,'escaped',now,'Missed bite. Wait for the next bite on a fresh cast.');continue;}
  if(session.status!=='reeling')continue;
  const from=session.lastStepAt||now,until=Math.min(now,session.startedAt+FISHING_RULES.sessionLimitMs);
  for(let at=from;at<until;at+=50){
   const dt=Math.min(50,until-at)/1000,reeling=session.reeling&&at<session.reelUntil;
   const surge=Math.sin((at-session.hookedAt)/1400+session.fightPhase)>.55;
   const strength=(session.rodId==='fishing-pro-rod'?.82:1)*(state.gear.includes('fishing-reel')?.85:1);
   if(!reeling)session.dragEasing=false;
   else if(session.tension>=FISHING_RULES.dragEaseAt)session.dragEasing=true;
   else if(session.tension<=FISHING_RULES.dragRecoverAt)session.dragEasing=false;
   session.tension=clamp(session.tension+(reeling?(session.dragEasing?-.16:(surge?.115:.07)*session.difficulty*strength):-.30)*dt,0,1);
   const netAssist=state.gear.includes('fishing-net')&&session.progress>.75?1.35:1;
   session.progress=clamp(session.progress+(reeling?(surge?.105:.14)*netAssist/session.difficulty*(session.dragEasing?.65:1):0)*dt,0,1);
   session.reeling=!!reeling;session.surge=surge;
   if(session.tension>=1){endSession(session,'escaped',at,'The line snapped. Release Reel when tension climbs.');break;}
   if(session.progress>=1){session.status='caught';session.landedAt=at;session.reeling=false;session.message='Fish landed! Keep it for the market or release it for conservation rewards.';break;}
  }
  session.lastStepAt=now;
  if(session.status==='reeling'&&now>=session.reelUntil)session.reeling=false;
  if(session.status==='reeling')session.message=session.dragEasing?'Automatic drag is protecting your line. Keep holding Reel, or release to lower tension faster.':session.surge?'Fish surge! Hold Reel to bring it in, or release to lower tension.':'Hold Reel to bring the fish in. Release anytime; your progress is saved.';
  if(session.status==='caught')scoreFish(sim,player,session,session.landedAt);
 }
}

export function fishingView(sim){
 const state=sim.fishing;if(!state?.enabled)return null;
 const tournament=state.tournament;
 const publicTournament=event=>({id:event.id,name:event.name,status:event.status,startsAt:event.startsAt,endsAt:event.endsAt,prizes,leaderboard:board(event).map(({nextCatchAt,...entry})=>entry),members:Object.values(event.entries).filter(entry=>!entry.ai).map(entry=>entry.actorId),claimedBy:Object.keys(event.claims||{})});
 return {enabled:true,zones:state.zones,guides:state.guides,rules:FISHING_RULES,tournament:tournament?publicTournament(tournament):null,recentTournaments:(state.history||[]).map(publicTournament)};
}

export function playerFishingView(sim,player,environment={id:sim.fishing?.environmentId,builderScene:{layoutMeta:{harbor:sim.fishing?.harbor}}}){
 const state=player.fishing;if(!enabled(environment)&&!state)return null;
 const {session,...rest}=state||{creel:[],stats:defaultStats(),gear:FISHING_GEAR.filter(item=>item.basic).map(item=>item.id)};
 // Species and weight stay hidden until landing; the bite clock is public for
 // reliable mobile feedback, while hook/catch decisions use only server time.
 const safeSession=session?Object.fromEntries(Object.entries(session).filter(([key])=>!['fightPhase','difficulty'].includes(key)&&!(key==='fish'&&session.status!=='caught'&&!session.settled))):null;
 const sides={port:castSite(sim,player,environment,'port'),starboard:castSite(sim,player,environment,'starboard')},availability=sides.port.canCast?sides.port:sides.starboard.canCast?sides.starboard:sides.port;
 return {...rest,creelCapacity:rest.gear?.includes('fishing-tackle-box')?30:10,session:safeSession,availability:{...availability,sides}};
}

function nearestGuide(player,guideId){return FISHING_GUIDES.filter(guide=>!guideId||guide.id===guideId).find(guide=>distance(player.position,guide.position)<=6);}

export function fishingCommand(sim,player,environment,command,now,{integer=randomInt,visible=()=>true}={}){
 if(!enabled(environment))fail('Travel to Neon Harbor to fish.');
 stepFishing(sim,environment,now);const state=stateFor(player),operation=command.operation;
 if(player.health<=0)fail('Respawn before fishing.');
 if(operation==='status')return {message:state.message||'Fishing gear and catch records refreshed.'};
 if(operation==='talk'){
  const guide=nearestGuide(player,command.guideId);if(!guide)fail('Walk closer to the fishing guide or fish market.');
  const message=guide.name+': '+guide.dialogue;state.message=message;return {message};
 }
 if(operation==='join-tournament'){
  const tournament=ensureTournament(sim,now);if(tournament.status==='finished')fail('The next Fishing Cup opens one minute after this round.');
  if(Object.keys(tournament.entries).length>=34&&!tournament.entries[player.actorId])fail('This Fishing Cup is full.');
  tournament.entries[player.actorId] ||= {actorId:player.actorId,name:player.username||'Angler',ai:false,weightKg:0,catches:0,score:0,joinedAt:now};
  state.message='Joined the Fishing Cup. Land fish during the live round; highest total weight wins.';return {message:state.message};
 }
 if(operation==='claim-tournament'){
  const tournament=command.tournamentId?[sim.fishing.tournament,...sim.fishing.history||[]].find(event=>event?.id===command.tournamentId):sim.fishing.tournament;if(!tournament||tournament.status!=='finished')fail('Wait for the Fishing Cup to finish.');
  const ranking=board(tournament),rank=ranking.findIndex(entry=>entry.actorId===player.actorId)+1,entry=ranking[rank-1];
  if(!entry||entry.ai)fail('Join a Fishing Cup before claiming results.');
  if(tournament.claims[player.actorId])return {message:'This tournament result is already saved.'};
  return {message:'Saving tournament results.',settlement:{type:'tournament',tournamentId:tournament.id,rank,score:entry.score,catches:entry.catches,weightKg:entry.weightKg,amountMzk:entry.catches>0?prizes[rank-1]||5:0,endsAt:tournament.endsAt}};
 }
 if(operation==='sell'){
  if(fishingLocked(player))fail('Pack away your fishing line before selling fish.');
  if(!nearestGuide(player,command.guideId))fail('Visit a fishing guide at the fish market to sell your catch.');
  if(!state.creel.length)fail('Your creel is empty. Keep a landed fish first.');
  return {message:'Selling your kept catch.',settlement:{type:'sale',saleId:randomUUID(),catchIds:state.creel.map(fish=>fish.catchId)}};
 }
 if(operation==='cast'){
  if(fishingLocked(player))fail('Keep, release, or cancel your current fish before casting again.');
  const side=command.side||'port';if(!['port','starboard'].includes(side))fail('Choose port or starboard.',422);
  const rodId=command.rodId||'fishing-rod',baitId=command.baitId||'fishing-bait';
  if(!['fishing-rod','fishing-pro-rod'].includes(rodId)||!['fishing-bait','fishing-lure'].includes(baitId))fail('Equip a fishing rod and fishing bait or lure.',422);
  if(!state.gear.includes(rodId)||!state.gear.includes(baitId))fail('Unlock that fishing gear in the Tools market first.',403);
  const site=castSite(sim,player,environment,side,command.zoneId);if(!site.canCast)fail(site.reason);
  if(command.zoneId&&command.zoneId!==site.zoneId)fail('Cast from the marked fishing area you are standing beside.');
  const origin={...site.position,y:site.position.y+1.2};if(!visible(origin,site.castPoint,site.boatId))fail('The cast is blocked. Move to a clear pier edge or the other side of the boat.');
  if(state.creel.length>=(state.gear.includes('fishing-tackle-box')?30:10))fail('Your creel is full. Sell your fish at the market first.');
  const eligible=FISH_SPECIES.filter(fish=>fish.water===site.water),weighted=eligible.flatMap(fish=>Array.from({length:(fish.rarity==='legendary'?1:fish.rarity==='rare'?3:fish.rarity==='uncommon'?6:12)*(baitId==='fishing-lure'&&['rare','legendary'].includes(fish.rarity)?2:1)},()=>fish));
  if(!weighted.length)fail('There are no fish in this water.');
  const species=weighted[integer(weighted.length)],grams=integer(Math.round(species.weight[0]*1000),Math.round(species.weight[1]*1000)+1),weightKg=grams/1000;
  const fish={id:species.id,name:species.name,rarity:species.rarity,weightKg,valueMzk:fishPrice(species,weightKg),catchId:randomUUID()};
  const wait=baitId==='fishing-lure'?FISHING_RULES.lureWaitMs:FISHING_RULES.baitWaitMs,biteAt=now+integer(wait[0],wait[1]+1),boat=sim.actors[site.boatId];
  if(boat){stopBoat(boat,{preserveNavigation:true});player.position={...site.position};player.floor=site.position.y;player.grounded=true;player.velocityY=0;player.movementRevision=(player.movementRevision||0)+1;}
  state.session={id:randomUUID(),status:'waiting',environmentId:environment.id,side,boatId:site.boatId,zoneId:site.zoneId,rodId,baitId,position:{...site.position},castPoint:site.castPoint,startedAt:now,biteAt,biteEndsAt:biteAt+FISHING_RULES.biteWindowMs,tension:.24,progress:0,reeling:false,dragEasing:false,fish,difficulty:.82+(Number(species.difficulty)||.3)*.45,fightPhase:integer(628)/100,movementRevision:player.movementRevision||0,tournamentId:sim.fishing.tournament?.status==='active'?sim.fishing.tournament.id:null,message:'Line cast. Wait for the float to dip, then tap Hook.'};
  player.input={};state.message=state.session.message;return {message:state.message};
 }
 const session=state.session;
 if(!session||session.id!==command.sessionId)fail('This fishing cast has expired. Refresh the fishing panel.');
 if(operation==='cancel'){cancelFishing(player,sim,now);return {message:state.message};}
 // The tick immediately before a held-button renewal can land or lose the fish.
 // Acknowledge that renewal so the room transaction commits its terminal state.
 if(operation==='reel'&&['caught','escaped'].includes(session.status))return {message:session.message};
 if(['keep','release'].includes(operation)&&session.settled)return {message:'This catch is already saved.'};
 if(!live(session))fail('This cast has ended. Cast again.');
 if(operation==='hook'){
  if(session.status==='reeling')return {message:session.message};
  if(session.status!=='bite'||now<session.biteAt||now>session.biteEndsAt)fail('Tap Hook while the bite indicator is live.');
  session.status='reeling';session.hookedAt=now;session.lastStepAt=now;session.message='Hook set! Hold Reel to bring the fish in. Automatic drag protects your line.';return {message:session.message};
 }
 if(operation==='reel'){
  if(session.status!=='reeling')fail('Hook the fish before reeling.');
  if(typeof command.holding!=='boolean')fail('Reel input must be held or released.',422);
  session.reeling=command.holding;session.reelUntil=command.holding?now+FISHING_RULES.reelLeaseMs:now;return {message:session.message};
 }
 if(operation==='keep'||operation==='release'){
  if(session.status!=='caught')fail('Land the fish before keeping or releasing it.');
  if(session.settled)return {message:'This catch is already saved.'};
  return {message:'Saving your catch.',settlement:{type:'catch',disposition:operation,fish:session.fish,landedAt:session.landedAt,startedAt:session.startedAt,environmentId:environment.id,zoneId:session.zoneId}};
 }
 fail('Choose a supported fishing action.',422);
}

export function applyFishingSettlement(sim,player,settlement,receipt,now){
 const state=stateFor(player);if(receipt?.creel)state.creel=receipt.creel;if(receipt?.stats)state.stats=receipt.stats;
 if(settlement.type==='catch'){
  const session=state.session;if(session?.fish?.catchId===settlement.fish.catchId){session.settled=true;session.disposition=receipt.disposition||settlement.disposition;scoreFish(sim,player,session,now);cancelFishing(player,sim,now);session.status=session.disposition==='keep'?'kept':'released';}
 }else if(settlement.type==='tournament'){const tournament=[sim.fishing.tournament,...sim.fishing.history||[]].find(event=>event?.id===settlement.tournamentId);if(tournament)tournament.claims[player.actorId]=true;}
 state.message=receipt.message;return {message:receipt.message,fishingReceipt:receipt};
}

const accountPublic=state=>({creel:[...(state.creel||[])],stats:{...defaultStats(),...state.stats}});
const catalogGear=user=>FISHING_GEAR.filter(gear=>gear.basic||ownsEconomyItem(user,GAME_ECONOMY.find(item=>item.sku==='tool:'+gear.id))).map(gear=>gear.id);

/** Only called with private authoritative results, never with HTTP request data.
 * The wallet transaction owns catch consumption, reward caps and replay receipts. */
export function grantFishingReward(database,walletId,result,{now=Date.now()}={}){
 const wallet=cleanWallet(walletId),type=result?.type;
 if(!['catch','sale','tournament'].includes(type))fail('Invalid fishing settlement.',422);
 if(type==='catch'){
  const fish=result.fish,species=FISH_SPECIES.find(item=>item.id===fish?.id);
  if(!species||!uuid(fish.catchId)||!['keep','release'].includes(result.disposition)||!Number.isFinite(fish.weightKg)||fish.weightKg<species.weight[0]||fish.weightKg>species.weight[1]||fish.valueMzk!==fishPrice(species,fish.weightKg)||![result.startedAt,result.landedAt].every(Number.isFinite)||result.landedAt-result.startedAt<6000||result.landedAt-result.startedAt>90000||result.landedAt>now)fail('Invalid authoritative catch.',422);
 }else if(type==='sale'){
  if(!uuid(result.saleId)||!Array.isArray(result.catchIds)||!result.catchIds.length||result.catchIds.length>30||new Set(result.catchIds).size!==result.catchIds.length||!result.catchIds.every(uuid))fail('Invalid fish sale.',422);
 }else if(!uuid(result.tournamentId)||!Number.isInteger(result.rank)||result.rank<1||result.rank>34||!Number.isSafeInteger(result.catches)||result.catches<0||result.catches>100||!Number.isFinite(result.weightKg)||result.weightKg<0||!Number.isSafeInteger(result.score)||result.score<0||!Number.isFinite(result.endsAt)||result.endsAt>now||result.amountMzk!==(result.catches>0?prizes[result.rank-1]||5:0))fail('Invalid tournament settlement.',422);
 const key=type==='catch'?'catch:'+result.fish.catchId:type==='sale'?'sale:'+result.saleId:'tournament:'+result.tournamentId+':'+wallet;
 return database.transaction(data=>{
  const prior=(data.transactions||[]).find(entry=>entry.type==='FISHING_REWARD'&&entry.requestId===key);
  if(prior){if(prior.walletId!==wallet)fail('This fishing result belongs to another angler.');return prior;}
  const user=data.users[wallet];if(!user)fail('Member wallet not found.',404);
  data.fishing ||= {accounts:{}};const state=data.fishing.accounts[wallet] ||= {creel:[],stats:defaultStats(),dailyEarnedMzk:0};
  const day=new Date(now).toISOString().slice(0,10);if(state.rewardDay!==day){state.rewardDay=day;state.dailyEarnedMzk=0;}
  let expected=0,message;
  if(type==='catch'){
   if(result.disposition==='keep'&&state.creel.length>=(catalogGear(user).includes('fishing-tackle-box')?30:10))fail('Your creel is full. Sell your kept fish first.');
   const fish={...result.fish,caughtAt:result.landedAt,zoneId:result.zoneId};
   state.stats.catches++;state.stats.totalWeightKg=Math.round((state.stats.totalWeightKg+fish.weightKg)*1000)/1000;state.stats.bestKg=Math.max(state.stats.bestKg,fish.weightKg);
   if(result.disposition==='keep'){state.creel.push(fish);message=fish.name+' kept in your creel.';}
   else{state.stats.releases++;expected=2;message=fish.name+' released safely.';}
  }else if(type==='sale'){
   const fish=result.catchIds.map(id=>state.creel.find(item=>item.catchId===id));if(fish.some(item=>!item))fail('Some fish have already been sold. Refresh your creel.');
   const allowance=300-state.dailyEarnedMzk,sold=[];
   for(const item of fish)if(expected+item.valueMzk<=allowance){sold.push(item.catchId);expected+=item.valueMzk;}
   if(!sold.length)fail('Today’s remaining fishing reward allowance is too small for these catches. Your fish stay in the creel for tomorrow.');
   state.creel=state.creel.filter(item=>!sold.includes(item.catchId));message=sold.length+' fish sold at the market.'+(sold.length<fish.length?' Remaining fish stay in your creel until tomorrow.':'');
  }else{expected=result.amountMzk;message='Fishing Cup rank '+result.rank+' saved.';}
  const amountMzk=Math.max(0,Math.min(expected,300-state.dailyEarnedMzk)),balance=Number(user.tokens?.MZK||0)+amountMzk;
  if(!Number.isSafeInteger(balance))fail('The wallet cannot accept this fishing reward.');
  user.tokens ||= {};user.tokens.MZK=balance;user.revision=Number(user.revision||0)+1;user.updatedAt=new Date(now).toISOString();state.dailyEarnedMzk+=amountMzk;state.stats.totalEarnedMzk+=amountMzk;
  const receipt={id:'fishing-'+randomUUID(),type:'FISHING_REWARD',operation:type,...(type==='catch'?{disposition:result.disposition}:{}),walletId:wallet,requestId:key,amountMzk,balanceAfterMzk:balance,createdAt:new Date(now).toISOString(),...accountPublic(state),message:message+(amountMzk?' +'+amountMzk+' MZK':expected?' Daily fishing reward cap reached.':'')};
  (data.transactions ||= []).push(receipt);return receipt;
 });
}

export async function fishingAccountState(database,walletId){
 const wallet=cleanWallet(walletId);await database.initialize();const data=await database.read(),user=data.users[wallet];if(!user)return null;
 return {...accountPublic(data.fishing?.accounts?.[wallet]||{}),gear:catalogGear(user),dailyRewardCapMzk:300};
}
