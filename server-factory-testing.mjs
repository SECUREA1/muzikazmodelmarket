import {randomUUID,randomInt} from 'node:crypto';
import {cleanWallet} from './user-json-database.mjs';
import {GAME_ECONOMY} from './game-economy.mjs';
import {ownedFactoryModel} from './factory-item-provenance.mjs';
import {itemLocked} from './public/js/factory-logistics-config.js';
import {PROVING_ID,COMPOUND_ID,PROVING_STATIONS,COMPOUND_GATE,PROVING_PROFILES,PROVING_COUNTDOWN_MS,PROVING_FLIGHT_MS,PROVING_IMPACT_MS,CONTAINMENT_CHANNELS,isProvingEnvironment,isCompoundEnvironment,testingStations,testingTargets} from './public/js/factory-test-config.js';

const fail=(message,statusCode=409,code='FACTORY_TEST_INVALID')=>{throw Object.assign(Error(message),{statusCode,code});};
const copy=value=>structuredClone(value);
const near=(a,b,radius=6)=>a&&b&&Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z)<=radius;
const profileFor=id=>PROVING_PROFILES.find(profile=>profile.id===id);
const stamp=(user,now)=>{user.revision=Number(user.revision||0)+1;user.updatedAt=new Date(now).toISOString();};
function testingStore(data){data.factoryTesting||={accounts:{},padLocks:{},itemLocks:{}};data.factoryTesting.accounts||={};data.factoryTesting.padLocks||={};data.factoryTesting.itemLocks||={};return data.factoryTesting;}
function account(data,wallet){return testingStore(data).accounts[wallet]||={session:null,containment:null,completedTests:0,totalScore:0,bestScores:{},skills:{},badges:[]};}
function userFor(data,wallet){const user=data.users[wallet];if(!user)fail('Member wallet not found.',404);return user;}
function clearance(data,wallet){
 const receipts=(data.transactions||[]).filter(row=>row.walletId===wallet),profiles=new Set(receipts.filter(row=>row.type==='FACTORY_TEST_COMPLETE'&&row.environmentId===PROVING_ID&&row.qualified===true).map(row=>row.profileId));
 const compound=PROVING_PROFILES.every(profile=>profiles.has(profile.id)),deep=compound&&receipts.some(row=>row.type==='FACTORY_CONTAINMENT_COMPLETE'&&row.environmentId===COMPOUND_ID);
 return {compound,deep};
}
/** Mutable Backpack fields never prove model type or purchase. Derive identity
 * from immutable crafting/purchase receipts and the corresponding owned id. */
export const ownedTestingItem=ownedFactoryModel;
function eligibleItems(data,wallet){return (data.users[wallet]?.items||[]).flatMap(item=>{const proof=ownedTestingItem(data,wallet,item.id);return proof?[{id:proof.id,name:proof.name,buildAssetId:proof.buildAssetId,profileId:proof.profileId}]:[];});}
function progress(state,data,wallet){return {completedTests:state.completedTests,totalScore:state.totalScore,bestScores:{...state.bestScores},skills:{...state.skills},badges:[...state.badges],canonicalProfiles:PROVING_PROFILES.filter(profile=>(data.transactions||[]).some(row=>row.type==='FACTORY_TEST_COMPLETE'&&row.walletId===wallet&&row.environmentId===PROVING_ID&&row.profileId===profile.id&&row.qualified)).map(profile=>profile.id)};}
function privateState(data,wallet,state){return {session:publicSession(state.session),containment:copy(state.containment),progress:progress(state,data,wallet),clearance:clearance(data,wallet),eligibleItems:eligibleItems(data,wallet)};}
function publicSession(session){if(!session)return null;const {proofId,itemLockKey,...safe}=session;return copy(safe);}
export function publicTestingState(state){if(!state)return null;return {session:publicSession(state.session),containment:copy(state.containment||null),progress:copy(state.progress||{}),clearance:copy(state.clearance||{compound:false,deep:false})};}
function ledger(data,wallet,type,now,extra={}){const row={id:'testing-'+randomUUID(),walletId:wallet,type,amountMzk:0,createdAt:new Date(now).toISOString(),...extra};(data.transactions||=[]).push(row);return row;}
function release(data,session){const store=testingStore(data);for(const locks of [store.padLocks,store.itemLocks])for(const [key,lock]of Object.entries(locks))if(lock.sessionId===session.id)delete locks[key];}
const running=session=>session&&['deployed','armed','countdown','flight','impact'].includes(session.status);
function phaseAt(session,now){if(!session?.launchAt||!['countdown','flight','impact','complete'].includes(session.status))return session?.status;if(now<session.launchAt)return 'countdown';if(now<session.flightEndsAt)return 'flight';if(now<session.endsAt)return 'impact';return 'complete';}
function stop(data,session,now,message){release(data,session);session.status='cancelled';session.cancelledAt=now;session.message=message;}
function advance(data,wallet,state,environment,now,stations){
 const session=state.session;if(!session||!running(session)||!environment||session.environmentId!==environment.id)return;
 if(!ownedTestingItem(data,wallet,session.itemId)){stop(data,session,now,'The test ended because this item is no longer owned.');return;}
 if(['deployed','armed'].includes(session.status)){
  const pad=stations.find(station=>station.id===session.padId),lock=testingStore(data).padLocks[session.environmentId+':'+session.padId];
  if(!pad||pad.revision!==session.padRevision||!lock||lock.sessionId!==session.id||lock.expiresAt<=now){stop(data,session,now,'The launch pad changed or its reservation expired. Configure a fresh test.');return;}return;
 }
 session.status=phaseAt(session,now);if(session.status!=='complete')return;
 if((data.transactions||[]).some(row=>row.type==='FACTORY_TEST_COMPLETE'&&row.sessionId===session.id)){release(data,session);return;}
 const score=Math.max(0,Math.min(100,Math.round(100-Math.hypot(session.aim.x,session.aim.y)*28))),grade=score>=90?'Gold':score>=70?'Silver':score>=40?'Bronze':'Practice',qualified=score>=40;
 session.result={score,grade,qualified,rewardMzk:0,completedAt:session.endsAt};session.message=profileFor(session.profileId).name+' complete · '+score+'/100 · '+grade+'. Your model remains in Backpack.';
 state.completedTests++;state.totalScore+=score;state.bestScores[session.profileId]=Math.max(state.bestScores[session.profileId]||0,score);state.skills[session.profileId]=(state.skills[session.profileId]||0)+1;
 if(!state.badges.includes('Proving Ground Operator'))state.badges.push('Proving Ground Operator');
 ledger(data,wallet,'FACTORY_TEST_COMPLETE',now,{sessionId:session.id,environmentId:session.environmentId,profileId:session.profileId,itemId:session.itemId,proofId:session.proofId,buildAssetId:session.buildAssetId,score,qualified,rewardMzk:0});
 if(clearance(data,wallet).compound&&!state.badges.includes('Mountain Facility Clearance'))state.badges.push('Mountain Facility Clearance');release(data,session);
}
function onFoot(player,{allowHeld=false}={}){if(player.health<=0||player.replacedByRoom||player.vehicleId||player.seatedId||!allowHeld&&player.heldId)fail('Stand on foot with your hands free before using this control.');}
function stationAt(player,stations,kind,id){const station=id?stations.find(value=>value.id===id&&value.kind===kind):stations.filter(value=>value.kind===kind).find(value=>near(player.position,value.position,value.interactionDistance));if(!station)fail('Walk to an active '+kind.replaceAll('-',' ')+' station.');if(!near(player.position,station.position,station.interactionDistance))fail('Move closer to '+station.name+'.');return station;}
function assertSession(state,input,environment){const session=state.session;if(!session||session.id!==input.sessionId)fail('This test session is no longer current. Refresh telemetry.');if(session.environmentId!==environment.id)fail('Return to the map where this test was configured.');return session;}
function matchesItem(actor,player,proof){
 if(actor.asset?.id===proof.id)return true;
 // Economy deployment can carry the catalog id rather than its owned id.
 // Crafted models retain their distinct instance ids; another owned model of
 // the same design must remain on display when this instance is recalled.
 if(!proof.sku)return false;
 return actor.asset?.sku===proof.sku||actor.asset?.economySku===proof.sku||actor.ownerId===player.actorId&&actor.asset?.id===GAME_ECONOMY.find(item=>item.sku===proof.sku)?.id&&actor.asset?.buildAssetId===proof.buildAssetId;
}
function itemInWorld(sim,player,proof){return Object.values(sim.actors||{}).some(actor=>actor.active!==false&&(actor.health===undefined||actor.health>0)&&!actor.testingSessionId&&matchesItem(actor,player,proof));}
function context(environment,sim){const stations=testingStations(environment,{actors:sim.actors}),targets=testingTargets(environment,{actors:sim.actors});return {stations,targets,kind:isCompoundEnvironment(environment)||stations.some(station=>['containment','deep-hatch','return'].includes(station.kind))?'compound':isProvingEnvironment(environment)||stations.length?'proving':null};}

/** Fictional display tests use preset routes and abstract alignment scoring.
 * They do not consume models, simulate weapon engineering or issue combat gear. */
export async function testingCommand(sim,player,environment,input,now,{database,walletId}={}){
 if(!database)fail('Testing account storage is unavailable.',503);if(!Number.isFinite(now))fail('Invalid testing server time.',422);
 const wallet=cleanWallet(walletId),action=input.action,{stations,targets,kind}=context(environment,sim);if(!kind)fail('Testing controls require a proving-ground or compound map.');
 const actions=['proving-status','proving-recall','proving-setup','proving-deploy','proving-arm','proving-launch','proving-cancel','proving-enter','proving-return','proving-core-start','proving-core-adjust','proving-core-confirm','proving-deep-enter'];if(!actions.includes(action))fail('Choose a supported testing action.',422);
 const requestId=String(input.requestId||'');if(action!=='proving-status'&&(!requestId||requestId.length>140||/[\x00-\x1f\x7f]/.test(requestId)))fail('A testing request id of 1 to 140 characters is required.',422);
 const signature=JSON.stringify([action,input.itemId,input.profileId,input.targetId,input.sessionId,input.padId,input.stationId,input.aim,input.puzzleId,input.channel,input.delta]);
 const response=await database.transaction(data=>{
  const user=userFor(data,wallet),state=account(data,wallet),store=testingStore(data);advance(data,wallet,state,environment,now,stations);
  const prior=action!=='proving-status'&&(data.transactions||[]).find(row=>row.type==='FACTORY_TEST_COMMAND'&&row.walletId===wallet&&row.requestId===requestId);if(prior){if(prior.signature!==signature)fail('This request id was used for another testing action.');return {message:prior.message,testing:privateState(data,wallet,state),duplicate:true,...copy(prior.travel?{travel:prior.travel,destination:prior.travel.destination}:{}),...(prior.recalledActorIds?{recalledActorIds:prior.recalledActorIds}:{})};}
  if(action==='proving-status')return {message:state.session?.message||'Configure a reusable model test at preparation.',testing:privateState(data,wallet,state)};
  onFoot(player,{allowHeld:action==='proving-recall'});let message='',travel=null,recalledActorIds=null;
  if(['proving-recall','proving-setup','proving-deploy','proving-arm','proving-launch','proving-cancel','proving-enter'].includes(action)&&kind!=='proving')fail('Use this control at the proving grounds.');
  if(['proving-return','proving-core-start','proving-core-adjust','proving-core-confirm','proving-deep-enter'].includes(action)&&kind!=='compound')fail('Use this control inside a compound.');
  if(environment.id===COMPOUND_ID&&!clearance(data,wallet).compound)fail('Complete one training accuracy test and one cargo test at the public proving grounds to earn facility clearance.',403,'COMPOUND_LOCKED');
  if(action==='proving-recall'){
   const station=input.stationId?stations.find(station=>station.id===input.stationId&&['setup','pad'].includes(station.kind)):stations.find(station=>['setup','pad'].includes(station.kind)&&near(player.position,station.position,station.interactionDistance));if(!station||!near(player.position,station.position,station.interactionDistance))fail('Return to preparation or the launch pad to recall a display copy.');
   const proof=ownedTestingItem(data,wallet,input.itemId);if(!proof)fail('Choose an owned, receipt-verified model to recall.',403);if(itemLocked(data,wallet,proof.id,now))fail('Finish or cancel this model’s freight manifest before recalling it.');const lock=store.itemLocks[proof.lockKey];if(lock&&lock.expiresAt>now)fail('Cancel or finish the active test before recalling this item.');
   const copies=Object.values(sim.actors||{}).filter(actor=>actor.active!==false&&matchesItem(actor,player,proof)&&!actor.testingSessionId);
   if(copies.some(actor=>actor.holderId&&actor.holderId!==player.actorId))fail('Another player is holding this copy. Ask them to release it first.');
   if(copies.some(actor=>!actor.spawned||actor.ownerId!==player.actorId))fail('Only your own deployed display copies can be recalled.');
   recalledActorIds=copies.map(actor=>actor.id);message=recalledActorIds.length?'Display copy recalled. Your reusable model is ready in Backpack.':'This model is already ready in Backpack.';
  }else if(action==='proving-setup'){
   stationAt(player,stations,'setup',input.stationId);if(running(state.session))fail('Finish or cancel the current test before configuring another.');
   const item=ownedTestingItem(data,wallet,input.itemId),profile=profileFor(input.profileId);if(!item||!profile||item.profileId!==profile.id)fail('Choose an owned, receipt-verified model and its matching test profile.',403);
   if(itemLocked(data,wallet,item.id,now))fail('Finish or cancel this model’s freight manifest before configuring a test.');
   if(itemInWorld(sim,player,item))fail('Recall the deployed or held copy of this item before testing it.');const target=targets.find(target=>target.id===input.targetId&&target.profileId===profile.id);if(!target)fail('Choose an active matching practice target or cargo platform.',422);
   state.session={id:randomUUID(),environmentId:environment.id,status:'configured',itemId:item.id,itemName:item.name,buildAssetId:item.buildAssetId,proofId:item.proofId,itemLockKey:item.lockKey,profileId:profile.id,targetId:target.id,target:copy(target),configuredAt:now,padId:null,launchAt:null,flightEndsAt:null,endsAt:null,result:null,message:'Test configured. Walk to the launch pad to deploy your reusable model.'};message=state.session.message;
  }else if(['proving-deploy','proving-arm','proving-launch','proving-cancel'].includes(action)){
   const session=assertSession(state,input,environment),proof=ownedTestingItem(data,wallet,session.itemId);if(!proof)fail('This test item is no longer owned.',403);
   if(action==='proving-cancel'){
    if(!stations.some(station=>['setup','pad','control'].includes(station.kind)&&near(player.position,station.position,station.interactionDistance)))fail('Return to a test station to cancel this session.');if(session.status==='complete')fail('Completed test results are already saved.');stop(data,session,now,'Test cancelled. Your reusable model remains in Backpack.');message=session.message;
   }else if(action==='proving-deploy'){
    if(itemLocked(data,wallet,proof.id,now))fail('Finish or cancel this model’s freight manifest before deployment.');
    if(session.status!=='configured')fail('Configure a test before deployment.');const pad=stationAt(player,stations,'pad',input.padId);if(itemInWorld(sim,player,proof))fail('Recall the deployed or held copy of this item before using the pad.');
    const padKey=environment.id+':'+pad.id,occupied=store.padLocks[padKey],itemLock=store.itemLocks[proof.lockKey];if(occupied&&occupied.expiresAt>now&&occupied.sessionId!==session.id)fail('This pad is reserved by another test.');if(itemLock&&itemLock.expiresAt>now&&itemLock.sessionId!==session.id)fail('This item is already deployed in another test.');
    const expiry=now+300000;store.padLocks[padKey]={sessionId:session.id,expiresAt:expiry};store.itemLocks[proof.lockKey]={sessionId:session.id,expiresAt:expiry};session.status='deployed';session.padId=pad.id;session.padPosition=copy(pad.position);session.padRevision=pad.revision;session.message='Model deployed. Move to launch control to arm the test.';message=session.message;
   }else if(action==='proving-arm'){
    stationAt(player,stations,'control',input.stationId);if(session.status!=='deployed')fail('Deploy your model before arming.');session.status='armed';session.armedAt=now;session.message='Test armed. Choose alignment and start the countdown from launch control.';message=session.message;
   }else{
    stationAt(player,stations,'control',input.stationId);if(session.status!=='armed')fail('Arm the deployed test before launching.');const target=targets.find(target=>target.id===session.targetId&&target.profileId===session.profileId);if(!target)fail('This target changed. Cancel and configure a fresh test.');
    const aim=input.aim||{x:0,y:0};if(!['x','y'].every(axis=>typeof aim[axis]==='number'&&Number.isFinite(aim[axis])&&Math.abs(aim[axis])<=1))fail('Game alignment values must be between -1 and 1.',422);
    session.aim={x:aim.x,y:aim.y};session.target=copy(target);session.status='countdown';session.launchAt=now+PROVING_COUNTDOWN_MS;session.flightEndsAt=session.launchAt+PROVING_FLIGHT_MS;session.endsAt=session.flightEndsAt+PROVING_IMPACT_MS;session.impactPosition={x:target.position.x+aim.x*(target.radius||8)*.7,y:target.position.y,z:target.position.z+aim.y*(target.radius||8)*.7};session.message='Countdown started. Watch the scripted flight and telemetry.';
    store.padLocks[environment.id+':'+session.padId].expiresAt=session.endsAt;store.itemLocks[proof.lockKey].expiresAt=session.endsAt;message=session.message;
   }
  }else if(action==='proving-enter'){
   stationAt(player,stations,'hatch',input.stationId);if(environment.id!==PROVING_ID||!clearance(data,wallet).compound)fail('Complete both public proving-ground test profiles before entering the mountain facility.',403,'COMPOUND_LOCKED');travel={destination:COMPOUND_ID,position:copy(COMPOUND_GATE.entry)};message='Facility clearance verified. Mountain access hatch unlocked.';
  }else if(action==='proving-return'){
   stationAt(player,stations,'return',input.stationId);travel={destination:PROVING_ID,position:copy(COMPOUND_GATE.surfaceReturn)};message='Returning to the surface proving grounds.';
  }else if(action==='proving-core-start'){
   stationAt(player,stations,'containment',input.stationId);if(state.containment?.status==='active'&&state.containment.environmentId===environment.id)fail('Finish your current containment puzzle.');
   const channels=Object.fromEntries(CONTAINMENT_CHANNELS.map(channel=>{const target=randomInt(3);return [channel.id,{value:(target+1)%3,target}];}));state.containment={id:randomUUID(),environmentId:environment.id,status:'active',channels,startedAt:now,moves:0,lastInputAt:null,message:'Match the three coloured circuit symbols to their target symbols.'};message=state.containment.message;
  }else if(['proving-core-adjust','proving-core-confirm'].includes(action)){
   stationAt(player,stations,'containment',input.stationId);const puzzle=state.containment;if(!puzzle||puzzle.id!==input.puzzleId||puzzle.environmentId!==environment.id)fail('This containment puzzle is no longer current.');
   if(action==='proving-core-adjust'){
    if(puzzle.status!=='active')fail('This puzzle is already complete.');const channel=puzzle.channels[input.channel];if(!channel||![1,-1].includes(input.delta))fail('Choose a circuit and one symbol step.',422);if(puzzle.lastInputAt!==null&&now-puzzle.lastInputAt<150)fail('Let the circuit indicator settle before the next input.',429);channel.value=(channel.value+input.delta+3)%3;puzzle.moves++;puzzle.lastInputAt=now;message='Circuit indicator updated.';
   }else{
    if(puzzle.status==='solved'){message='Containment clearance is already saved.';}else{
     if(now-puzzle.startedAt<2000||puzzle.moves<3||!CONTAINMENT_CHANNELS.every(channel=>puzzle.channels[channel.id].value===puzzle.channels[channel.id].target))fail('Match all three target symbols and let the display stabilize before confirming.');
     puzzle.status='solved';puzzle.solvedAt=now;puzzle.message='Symbolic power containment stabilized. Deep bunker access is available.';state.skills.containment=(state.skills.containment||0)+1;if(!state.badges.includes('Containment Operator'))state.badges.push('Containment Operator');ledger(data,wallet,'FACTORY_CONTAINMENT_COMPLETE',now,{puzzleId:puzzle.id,environmentId:environment.id,moves:puzzle.moves});message=puzzle.message;
    }
   }
  }else if(action==='proving-deep-enter'){
   stationAt(player,stations,'deep-hatch',input.stationId);const unlocked=environment.id===COMPOUND_ID?clearance(data,wallet).deep:state.containment?.status==='solved'&&state.containment.environmentId===environment.id;if(!unlocked)fail('Stabilize the three-symbol containment puzzle before entering the deep bunker.',403,'DEEP_BUNKER_LOCKED');travel={destination:environment.id,position:copy(COMPOUND_GATE.deepEntry)};message='Deep bunker access verified.';
  }
  stamp(user,now);ledger(data,wallet,'FACTORY_TEST_COMMAND',now,{requestId,signature,message,...(travel?{travel}:{}),...(recalledActorIds?{recalledActorIds}:{})});return {message,testing:privateState(data,wallet,state),...(travel?{travel,destination:travel.destination}:{}),...(recalledActorIds?{recalledActorIds}:{})};
 });
 for(const id of response.recalledActorIds||[]){const actor=sim.actors?.[id];if(actor?.spawned&&actor.ownerId===player.actorId){if(player.heldId===id)player.heldId=null;delete sim.actors[id];if(sim.devices)delete sim.devices[id];}}
 player.testing=response.testing;sim.factoryTestingEnabled=true;sim.factoryTestingKind=kind;sim.testingStations=stations;sim.testingTargets=targets;return response;
}

export async function testingAccountState(database,walletId,{now=Date.now(),environment,actors}={}){const wallet=cleanWallet(walletId);return database.transaction(data=>{userFor(data,wallet);const state=account(data,wallet);if(environment)advance(data,wallet,state,environment,now,testingStations(environment,{actors}));return privateState(data,wallet,state);});}
export async function hasCompoundClearance(database,walletId,{deep=false}={}){const wallet=cleanWallet(walletId);await database.initialize();return clearance(await database.read(),wallet)[deep?'deep':'compound'];}
export async function assertCompoundAccess(database,walletId,options={}){const wallet=cleanWallet(walletId);await database.initialize();const access=clearance(await database.read(),wallet);if(!access.compound||options.deep&&!access.deep)fail(options.deep?'Stabilize containment before entering the deep bunker.':'Earn both public proving-ground test clearances before entering this facility.',403,options.deep?'DEEP_BUNKER_LOCKED':'COMPOUND_LOCKED');return access;}
export function stepFactoryTesting(sim,environment,now){const {stations,targets,kind}=context(environment,sim);sim.factoryTestingEnabled=Boolean(kind);sim.factoryTestingKind=kind;sim.testingStations=stations;sim.testingTargets=targets;if(!kind)return;for(const player of Object.values(sim.players||{})){const session=player.testing?.session;if(session&&session.environmentId===environment.id&&session.launchAt&&session.status!=='cancelled'){session.displayPhase=phaseAt(session,now);session.remainingMs=Math.max(0,session.endsAt-now);}}}
export function factoryTestingView(sim,now){if(!sim.factoryTestingEnabled)return null;return {kind:sim.factoryTestingKind,stations:sim.testingStations||[],targets:sim.testingTargets||[],profiles:PROVING_PROFILES,countdownMs:PROVING_COUNTDOWN_MS,flightMs:PROVING_FLIGHT_MS,impactMs:PROVING_IMPACT_MS,sessions:Object.values(sim.players||{}).filter(player=>player.testing?.session&&now-player.lastSeen<15000).map(player=>({playerId:player.actorId,name:player.username||'Test operator',session:{...publicSession(player.testing.session),displayPhase:phaseAt(player.testing.session,now)}}))};}
