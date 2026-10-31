import {bunkerDefenseConfig,bunkerDefenseSystems,bunkerProtection,bunkerHazardDamage} from './public/js/bunker-defense-rules.js';
import {doomsdayForEnvironment} from './public/js/doomsday-config.js';
import {combatStats} from './rpg-match.mjs';
import {questRadio} from './server-quest-radio.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const present=(player,now)=>player&&!player.basketballAI&&!player.replacedByRoom&&player.position&&(!Number.isFinite(player.lastSeen)||now-player.lastSeen<15000);
const live=(player,now)=>present(player,now)&&player.health>0;
const nuclearActive=phase=>['warning','detonation','fallout','recovery','clearing'].includes(phase);
const reject=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
export function ensureBunkerDefense(sim,environment,now=sim.time||0){
 const config=bunkerDefenseConfig(environment);if(!config){if(sim.bunkerDefense)delete sim.bunkerDefense;return null;}
 let state=sim.bunkerDefense;
 if(!state||state.version!==1||state.mapId!==environment.id)state=sim.bunkerDefense={version:1,mapId:environment.id,revision:0,serverTime:now,airstrike:{id:null,cycle:0,phase:'idle',scheduledAt:null,nextEventAt:null,warningAt:null,impactAt:null,recoveryAt:null,clearAt:null},nuclear:{id:null,phase:'idle'},alarm:{id:null,active:false,level:'standby',kind:null,phase:'idle',message:'Continuity watch. Inspect the shelter systems and keep the descent route clear.'},systems:null,protection:{},impacts:[],history:[],responseTasks:[],impactReceipts:[],falloutReceipts:{},systemInitializations:{}};
 state.responseTasks||=[];state.impactReceipts||=[];state.falloutReceipts||={};state.systemInitializations||={};state.history||=[];state.impacts||=[];
 for(const [key,enabled]of Object.entries(config.initialSystems||{})){
  const id=config.stations[key],actor=id&&sim.actors?.[id];if(actor&&!state.systemInitializations[id]){actor.switched=enabled===true;state.systemInitializations[id]=true;}
 }
 // Upgrading the bunker moves its existing emergency objectives down with the
 // authored rooms while preserving an active warning and completed objectives.
 const geometry=JSON.stringify(environment.doomsday?.objectives||[]);
 if(state.objectiveGeometry!==geometry&&sim.doomsday){
  const authored=doomsdayForEnvironment(environment).objectives;
  for(const objective of sim.doomsday.objectives||[]){const source=authored.find(site=>site.id===objective.id);if(source){objective.position=copy(source.position);for(const key of ['name','description','arrivalArea','arrivalZone']){if(source[key]!==undefined)objective[key]=copy(source[key]);else if(key==='arrivalArea'||key==='arrivalZone')delete objective[key];}}}
  state.objectiveGeometry=geometry;
 }
 state.systems=bunkerDefenseSystems(sim.actors,environment);state.serverTime=now;return state;
}
function applyDamage(player,amount,now){
 if(!amount||player.health<=0||now<(player.spawnProtectedUntil||0)||now<(player.shieldUntil||0))return 0;
 const before=player.health;player.health=Math.max(0,Math.round((before-amount)*1000)/1000);const damage=before-player.health,stats=combatStats(player);stats.damageTaken+=damage;stats.hitsTaken++;
 if(player.health===0){stats.deaths++;player.input={};player.velocityY=0;}return damage;
}
function impact(sim,environment,state,id,kind,now,eventAt=now,windowMs=7000){
 if(state.impactReceipts.includes(id))return;
 state.impactReceipts.push(id);state.impactReceipts=state.impactReceipts.slice(-24);
 let protectedCount=0,exposedCount=0;const outcomes=[];
 for(const [playerId,player]of Object.entries(sim.players||{})){
  if(!live(player,now)||now>eventAt+windowMs)continue;const protection=bunkerProtection(player.position,environment,state.systems),amount=bunkerHazardDamage(kind,protection),damage=applyDamage(player,amount,now);
  if(amount===0)protectedCount++;else exposedCount++;
  outcomes.push({playerId,damage,protected:amount===0});
  player.bunkerImpact={id,kind,at:now,damage,protected:amount===0};
 }
 const record={id,kind,at:eventAt,observedAt:now,missed:now>eventAt+windowMs,protectedCount,exposedCount,outcomes};state.impacts.push(record);state.impacts=state.impacts.slice(-12);state.revision++;
 sim.events||=[];sim.events.push({id,action:'bunker-impact',kind,at:now,protectedCount,exposedCount});sim.events=sim.events.slice(-100);
}
function airstrikeTimeline(sim,environment,state,now,config){
 const air=state.airstrike,humans=Object.values(sim.players||{}).filter(player=>live(player,now)),timing=config.timing;
 if(!humans.length&&['idle','all-clear'].includes(air.phase)){air.nextEventAt=air.scheduledAt=null;return;}
 if(humans.length&&['idle','all-clear'].includes(air.phase)){
  if(air.nextEventAt===null){air.scheduledAt=now;air.nextEventAt=now+(air.cycle?timing.repeatAirstrikeMs:timing.firstAirstrikeMs);}
  if(now>=air.nextEventAt&&!nuclearActive(sim.doomsday?.phase)){
   air.cycle++;air.id=environment.id+':airstrike:'+air.cycle+':'+now;air.phase='warning';air.warningAt=now;air.impactAt=now+timing.airstrikeWarningMs;air.recoveryAt=air.impactAt+timing.airstrikeImpactMs;air.clearAt=air.recoveryAt+timing.airstrikeRecoveryMs;air.nextEventAt=air.scheduledAt=null;state.revision++;
  }
 }
 if(air.phase==='warning'&&now>=air.impactAt){air.phase='impact';impact(sim,environment,state,air.id,'airstrike',now,air.impactAt,timing.airstrikeImpactMs);}
 if(air.phase==='impact'&&now>=air.recoveryAt)air.phase='recovery';
 if(air.phase==='recovery'&&now>=air.clearAt){air.phase='all-clear';air.scheduledAt=now;air.nextEventAt=now+timing.repeatAirstrikeMs;state.revision++;}
}
function currentAlarm(state,nuclear){
 if(nuclearActive(nuclear?.phase)){
  const phase=nuclear.phase,level=phase==='warning'?'warning':['detonation','fallout'].includes(phase)?'danger':'recovery';
  const message={warning:'Nuclear alert. Descend below ground, seal the blast shutter and keep filtration powered.',detonation:'Nuclear impacts confirmed. Remain underground behind the sealed blast shutter.',fallout:'Fallout outside. Keep power and filtration running; follow the active supply and relay objectives.',recovery:'Recovery response active. Check the marked supplies and emergency relay before returning to standby.',clearing:'Radiation is clearing. Keep the shelter sealed until the emergency channel confirms all clear.'}[phase];
  return {id:nuclear.id,active:true,level,kind:'nuclear',phase,message};
 }
 const air=state.airstrike;
 if(['warning','impact','recovery'].includes(air.phase))return {id:air.id,active:true,level:air.phase==='warning'?'warning':air.phase==='impact'?'danger':'recovery',kind:'airstrike',phase:air.phase,message:air.phase==='warning'?'Airstrike alert. Leave the surface approach, descend and seal the blast shutter.':air.phase==='impact'?'Airstrikes overhead. Stay inside the sealed underground rooms.':'Airstrike recovery. Check the shelter controls and follow the crew handover.'};
 if(air.phase==='all-clear'||nuclear?.phase==='all-clear')return {id:air.phase==='all-clear'?air.id:nuclear.id,active:false,level:'all-clear',kind:null,phase:'all-clear',message:'All clear. The crew is returning to normal work. Keep power and filtration ready.'};
 return {id:null,active:false,level:'standby',kind:null,phase:'idle',message:'Continuity watch. Inspect the shelter systems and keep the descent route clear.'};
}
export function stepBunkerDefense(sim,environment,now){
 const state=ensureBunkerDefense(sim,environment,now);if(!state)return null;const config=bunkerDefenseConfig(environment);
 airstrikeTimeline(sim,environment,state,now,config);
 const nuclear=sim.doomsday||{};state.nuclear={id:nuclear.id||null,phase:nuclear.phase||'idle',detonationAt:nuclear.detonationAt??null,falloutAt:nuclear.falloutAt??null};
 if(nuclear.id&&Number.isFinite(nuclear.detonationAt)&&now>=nuclear.detonationAt&&['detonation','fallout','recovery','clearing'].includes(nuclear.phase))impact(sim,environment,state,nuclear.id+':blast','nuclear',now,nuclear.detonationAt,Math.max(1000,(nuclear.falloutAt??nuclear.detonationAt+7000)-nuclear.detonationAt));
 if(nuclear.phase==='fallout'&&Number.isFinite(nuclear.falloutAt)){
  const bucket=Math.max(0,Math.floor((now-nuclear.falloutAt)/config.timing.falloutPulseMs));
  for(const [id,player]of Object.entries(sim.players||{})){
   if(!live(player,now))continue;const receipt=nuclear.id+':'+bucket;if(state.falloutReceipts[id]?.receipt===receipt)continue;state.falloutReceipts[id]={receipt,at:now};
   const protection=bunkerProtection(player.position,environment,state.systems),damage=applyDamage(player,bunkerHazardDamage('fallout',protection),now);
   if(damage)player.bunkerExposure={id:nuclear.id,at:now,damage,kind:'fallout'};
  }
 }
 // Expired visitor records cannot grow a long-lived shared room indefinitely.
 const presentIds=new Set(Object.entries(sim.players||{}).filter(([,player])=>present(player,now)).map(([id])=>id));
 state.protection=Object.fromEntries(Object.entries(sim.players||{}).filter(([id])=>presentIds.has(id)).map(([id,player])=>[id,bunkerProtection(player.position,environment,state.systems)]));
 for(const [id,receipt]of Object.entries(state.falloutReceipts))if(now-(receipt.at||0)>3600000)delete state.falloutReceipts[id];
 const staleReceipts=Object.entries(state.falloutReceipts).sort((a,b)=>(b[1].at||0)-(a[1].at||0)).slice(256);for(const [id]of staleReceipts)delete state.falloutReceipts[id];
 const alarm=currentAlarm(state,nuclear),signature=[alarm.id,alarm.kind,alarm.phase].join(':');
 if(state.alarm.signature!==signature){
  const previous=state.alarm;
  state.alarm={...alarm,signature,changedAt:now,acknowledgedBy:previous.id===alarm.id?previous.acknowledgedBy||null:null,acknowledgedAt:previous.id===alarm.id?previous.acknowledgedAt||null:null};
  state.history.push({id:alarm.id,kind:alarm.kind,phase:alarm.phase,level:alarm.level,at:now,message:alarm.message});state.history=state.history.slice(-16);state.revision++;
  if(alarm.active||alarm.level==='all-clear')questRadio(sim,now,'Null Sector control',alarm.message,{bunkerAlert:true,alertId:alarm.id,alertKind:alarm.kind,phase:alarm.phase,speakerId:config.stations.alert});
 }
 const alertDevices=new Set(['bunker-alert-console','bunker-alarm-beacon','bunker-radiation-monitor']),configured=new Set(Object.values(config.stations));
 for(const [id,actor]of Object.entries(sim.actors||{})){const role=actor.definition?.gameplay?.bunkerSystem||actor.asset?.function_data?.bunkerSystem;if(configured.has(id)||alertDevices.has(actor.asset?.buildAssetId||actor.modelId)||['alerts','alarm','radiation'].includes(role))actor.bunkerAlertState={id:state.alarm.id,level:state.alarm.level,phase:state.alarm.phase,threat:state.alarm.kind,message:state.alarm.message};}
 return bunkerDefenseView(sim);
}
export function bunkerDefenseView(sim){
 const state=sim.bunkerDefense;if(!state)return null;
 const {impactReceipts,falloutReceipts,systemInitializations,objectiveGeometry,...view}=state;return copy(view);
}
export function bunkerDefenseCommand(sim,player,environment,command,now){
 const state=stepBunkerDefense(sim,environment,now);if(!state)reject('This destination has no bunker defense equipment.',404);
 const operation=command.operation||'status';if(operation==='status')return {message:state.alarm.message,bunkerDefense:state};
 if(operation!=='acknowledge')reject('Use the marked shelter equipment to change its physical controls.',422);
 if(!live(player,now))reject('Respawn before acknowledging an alert.');
 const config=bunkerDefenseConfig(environment),consoleActor=sim.actors?.[config.stations.alert];
 if(!consoleActor||consoleActor.active===false)reject('The bunker alert console is unavailable.');
 if(Math.hypot(player.position.x-consoleActor.position.x,player.position.y-consoleActor.position.y,player.position.z-consoleActor.position.z)>4.5)reject('Move within reach of the bunker alert console to acknowledge the warning.');
 if(!state.alarm.active)reject('There is no active bunker alert to acknowledge.');
 const alarm=sim.bunkerDefense.alarm;
 alarm.acknowledgedBy=player.actorId||player.id;alarm.acknowledgedAt=now;sim.bunkerDefense.revision++;
 return {message:'Alert acknowledged. The alarm remains active until the threat clears.',bunkerDefense:bunkerDefenseView(sim)};
}
