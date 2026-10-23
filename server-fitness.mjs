import {randomInt,randomUUID} from 'node:crypto';
import {cleanWallet} from './user-json-database.mjs';
import {FITNESS_ID,FITNESS_STATIONS,FITNESS_TRAINERS,isFitnessEnvironment,fitnessStations,canonicalFitnessStation} from './public/js/fitness-config.js';
import {FITNESS_GAMES,FITNESS_CUE_COUNT,FITNESS_COUNTDOWN_MS,FITNESS_DAILY_REWARD_CAP,FITNESS_REWARD_COOLDOWN_MS,fitnessInputPoints,fitnessMedal,fitnessRoundReward} from './public/js/fitness-rules.js';

const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode});};
const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z);
const stationFor=(id,stations=FITNESS_STATIONS)=>stations.find(station=>station.id===id);
const running=round=>round&&['countdown','active'].includes(round.status);
export const fitnessIsTraining=player=>running(player?.fitness);

function invalidate(player,now,message){const round=player.fitness;round.status='cancelled';round.finishedAt=now;round.rewardMzk=0;round.payoutMzk=0;round.message=message;player.input={};}
function complete(player,now){
 const round=player.fitness;if(!running(round))return;
 round.status='complete';round.finishedAt=round.endsAt;round.misses=round.cues.length-round.hits;
 round.medal=fitnessMedal(round.score);round.rewardMzk=fitnessRoundReward(round.kind,round.score);
 round.message=round.medal+' set · '+round.score+'/'+round.cues.length*100+' points. '+(round.rewardMzk?'Confirm your MZK reward.':'Try for 40% precision to earn MZK.');
 const progress=player.fitnessProgress ||= {completedSets:0,totalScore:0,bestScores:{},skills:{},badges:[]};
 const progressId=round.canonicalStationId||canonicalFitnessStation(round.kind)?.id||round.stationId;
 progress.completedSets++;progress.totalScore+=round.score;progress.bestScores[progressId]=Math.max(progress.bestScores[progressId]||0,round.score);
 const skill=FITNESS_GAMES[round.kind].skill;progress.skills[skill]=(progress.skills[skill]||0)+round.hits;
 player.score=(player.score||0)+round.score;player.input={};
}
/** Called before player physics. The server holds a training stance and cancels
 * relocated, dead, remote, or disconnected participants before any settlement. */
export function stepFitness(sim,environment,now){
 sim.fitnessEnabled=isFitnessEnvironment(environment);
 sim.fitnessStations=sim.fitnessEnabled?fitnessStations(environment,{actors:sim.actors}):[];
 if(!sim.fitnessEnabled)return;
 for(const player of Object.values(sim.players||{})){
  const round=player.fitness;if(!running(round)&&!(round?.status==='complete'&&!round.settled))continue;
  const station=stationFor(round.stationId,sim.fitnessStations);
  if(!station||station.kind!==round.kind||round.stationRevision&&round.stationRevision!==station.stationRevision||round.environmentId&&round.environmentId!==environment.id||player.health<=0||player.replacedByRoom||now-player.lastSeen>15000||player.vehicleId||player.seatedId||player.heldId||distance(player.position,round.position)>.8||(player.movementRevision||0)!==round.movementRevision){invalidate(player,now,'Set ended. Return to the station and start a fresh set.');continue;}
  if(round.status==='complete')continue;
  player.input={};
  if(now>=round.endsAt){complete(player,now);continue;}
  round.status=now<round.startedAt?'countdown':'active';
  const passed=round.cues.filter(cue=>now>cue.at+round.windowMs).length;
  round.misses=Object.values(round.attempts).filter(attempt=>!attempt.hit).length+round.cues.slice(0,passed).filter((cue,index)=>!Object.hasOwn(round.attempts,index)).length;
 }
}
export function fitnessCommand(sim,player,environment,command,now,{integer=randomInt}={}){
 if(!isFitnessEnvironment(environment))fail('Fitness activities are available inside the Fitness Centre.');
 sim.fitnessEnabled=true;sim.fitnessStations=fitnessStations(environment,{actors:sim.actors});
 if(command.action==='fitness-trainer'){
  const trainer=FITNESS_TRAINERS.find(person=>person.id===command.trainerId);
  if(!trainer)fail('Choose one of the two fitness trainers.',422);
  if(distance(player.position,trainer.position)>5)fail('Walk closer to '+trainer.name+' to speak.');
  player.fitnessCoach={id:trainer.id,name:trainer.name,role:trainer.role,message:trainer.greeting,stationIds:sim.fitnessStations.filter(station=>trainer.specialties.includes(station.kind)).map(station=>station.id),at:now};
  return {message:trainer.name+': '+trainer.greeting,fitnessCoach:player.fitnessCoach};
 }
 if(command.action==='fitness-start'){
  const station=stationFor(command.stationId,sim.fitnessStations),rules=FITNESS_GAMES[station?.kind];
  if(!station||!rules)fail('Choose a fitness station.',422);
  if(running(player.fitness))fail('Finish or cancel your current set first.');
  if(player.fitness?.status==='complete'&&!player.fitness.settled)fail('Confirm the previous set before starting another.');
  if(player.health<=0||player.vehicleId||player.seatedId||player.heldId||player.grounded===false)fail('Stand on the gym floor with your hands free before training.');
  if(distance(player.position,station.position)>station.interactionDistance)fail('Walk to '+station.name+' before starting.');
  if(Object.values(sim.players||{}).some(other=>other!==player&&running(other.fitness)&&other.fitness.stationId===station.id&&now-other.lastSeen<15000))fail('That station is in use. Try another activity or wait for the set to finish.');
  const startedAt=now+FITNESS_COUNTDOWN_MS,cues=Array.from({length:FITNESS_CUE_COUNT},(_,index)=>{const input=rules.inputs[station.kind==='rowing'?index%2:integer(rules.inputs.length)];return {at:startedAt+(index+.5)*rules.intervalMs,input,label:rules.labels[input]};});
  player.fitness={id:randomUUID(),stationId:station.id,canonicalStationId:station.canonicalStationId,stationRevision:station.stationRevision,environmentId:environment.id,kind:station.kind,name:station.name,status:'countdown',createdAt:now,startedAt,endsAt:startedAt+FITNESS_CUE_COUNT*rules.intervalMs,intervalMs:rules.intervalMs,windowMs:rules.windowMs,cues,attempts:{},score:0,hits:0,misses:0,combo:0,bestCombo:0,medal:null,rewardMzk:rules.rewardMzk,payoutMzk:0,settled:false,position:{...player.position},movementRevision:player.movementRevision||0,message:rules.instructions};
  player.input={};return {message:station.name+' · Get ready. Follow the timing cues.',fitness:player.fitness};
 }
 const round=player.fitness;
 if(!round||round.id!==command.roundId)fail('This fitness set is no longer active. Refresh the station.');
 stepFitness(sim,environment,now);
 if(command.action==='fitness-cancel'){
  if(running(round)||round.status==='complete'&&!round.settled)invalidate(player,now,'Set cancelled. Choose any station when you are ready.');
  return {message:round.message,fitness:round};
 }
 if(command.action==='fitness-finish'){
  if(running(round))fail('Complete the set before confirming the result.');
  if(round.status!=='complete')fail('Cancelled sets do not earn MZK. Start a fresh set.');
  const settlement={roundId:round.id,stationId:round.stationId,canonicalStationId:round.canonicalStationId||canonicalFitnessStation(round.kind)?.id,kind:round.kind,score:round.score,hits:round.hits,bestCombo:round.bestCombo,startedAt:round.startedAt,endsAt:round.endsAt,finishedAt:round.finishedAt};
  return {message:round.settled?round.message:'Set complete. Saving your MZK reward.',fitness:round,settlement};
 }
 if(command.action!=='fitness-input')fail('Choose a supported fitness action.',422);
 if(round.status!=='active')fail(round.status==='countdown'?'Wait for the countdown.':'This set has ended.');
 const cueIndex=command.cueIndex;
 if(!Number.isInteger(cueIndex)||cueIndex<0||cueIndex>=round.cues.length)fail('Choose a current cue.',422);
 if(typeof command.input!=='string'||!FITNESS_GAMES[round.kind].inputs.includes(command.input))fail('Choose a valid move for this activity.',422);
 const cue=round.cues[cueIndex];
 // A caller cannot pre-submit future cues or replay a scored cue. Client clocks,
 // score fields and timestamps never participate in scoring.
 if(Math.abs(now-cue.at)>round.intervalMs*.5)fail('That cue is not current. Follow the live marker.');
 if(Object.hasOwn(round.attempts,cueIndex))fail('That repetition has already been judged.');
 if(round.lastInputAt!==undefined&&now-round.lastInputAt<180)fail('One controlled move at a time.',429);
 round.lastInputAt=now;
 const points=command.input===cue.input?fitnessInputPoints(now-cue.at,round.windowMs):0,hit=points>0;
 const intervening=round.lastAttemptIndex!==undefined&&cueIndex>round.lastAttemptIndex+1;
 if(intervening)round.combo=0;
 round.attempts[cueIndex]={input:command.input,at:now,score:points,hit};round.lastAttemptIndex=cueIndex;round.score+=points;round.hits+=hit?1:0;round.combo=hit?round.combo+1:0;round.bestCombo=Math.max(round.bestCombo,round.combo);
 round.lastResult={cueIndex,points,label:points===100?'Perfect':points===70?'Great':points?'Good':command.input!==cue.input?'Wrong move':'Miss',at:now};
 round.message=round.lastResult.label+(points?' · +'+points+' points':' · reset and find the next cue');
 return {message:round.message,fitness:round};
}

export function fitnessView(sim,now){
 if(!sim.fitnessEnabled)return null;
 const leaderboard=Object.values(sim.players||{}).filter(player=>player.fitnessProgress?.completedSets).map(player=>({id:player.actorId,name:player.username||'Member',score:player.fitnessProgress.totalScore,completedSets:player.fitnessProgress.completedSets})).sort((a,b)=>b.score-a.score).slice(0,10);
 return {id:FITNESS_ID,stations:(sim.fitnessStations||[]).map(station=>({...station,occupiedBy:Object.values(sim.players||{}).find(player=>running(player.fitness)&&player.fitness.stationId===station.id&&now-player.lastSeen<15000)?.actorId||null})),trainers:FITNESS_TRAINERS,leaderboard,dailyRewardCapMzk:FITNESS_DAILY_REWARD_CAP};
}

function publicProgress(state){return {completedSets:state.completedSets||0,totalScore:state.totalScore||0,bestScores:{...state.bestScores},skills:{...state.skills},badges:[...(state.badges||[])],totalEarnedMzk:state.totalEarnedMzk||0,dailyEarnedMzk:state.dailyEarnedMzk||0};}
/** Private server callback only: atomically credits an authoritative room result.
 * Durable account state is outside user-editable memory. Unique round receipts
 * prevent replay after reconnects, room resets, or a process restart. */
export function grantFitnessReward(database,walletId,result,{now=Date.now()}={}){
 const wallet=cleanWallet(walletId),station=canonicalFitnessStation(result?.kind),rules=FITNESS_GAMES[station?.kind],instance=typeof result?.stationId==='string'?result.stationId:'',knownInstance=stationFor(instance);
 if(!rules||!instance||instance.length>200||/[\x00-\x1f\x7f]/.test(instance)||knownInstance&&knownInstance.kind!==station.kind||result.canonicalStationId&&result.canonicalStationId!==station.id||!/^[a-f0-9-]{36}$/.test(result.roundId||'')||!Number.isSafeInteger(result.score)||result.score<0||result.score>FITNESS_CUE_COUNT*100||!Number.isSafeInteger(result.hits)||result.hits<0||result.hits>FITNESS_CUE_COUNT||result.score>result.hits*100||!Number.isSafeInteger(result.bestCombo)||result.bestCombo<0||result.bestCombo>result.hits||![result.startedAt,result.endsAt,result.finishedAt,now].every(Number.isFinite)||result.endsAt-result.startedAt!==FITNESS_CUE_COUNT*rules.intervalMs||result.finishedAt<result.endsAt||result.finishedAt>now)fail('Invalid authoritative fitness result.',422);
 return database.transaction(data=>{
  const prior=(data.transactions||[]).find(entry=>entry.type==='FITNESS_REWARD'&&entry.roundId===result.roundId);
  if(prior){if(prior.walletId!==wallet||prior.stationId!==result.stationId||prior.kind!==station.kind||prior.score!==result.score)fail('This fitness set has already been settled.');return prior;}
  const user=data.users[wallet];if(!user)fail('Member wallet not found.',404);
  data.fitness ||= {accounts:{}};const state=data.fitness.accounts[wallet] ||= {completedSets:0,totalScore:0,bestScores:{},skills:{},badges:[],totalEarnedMzk:0,dailyEarnedMzk:0};
  const day=new Date(now).toISOString().slice(0,10);if(state.rewardDay!==day){state.rewardDay=day;state.dailyEarnedMzk=0;}
  const expected=fitnessRoundReward(station.kind,result.score),cooldown=state.lastRewardAt!==undefined&&now-state.lastRewardAt<FITNESS_REWARD_COOLDOWN_MS;
  const amountMzk=cooldown?0:Math.max(0,Math.min(expected,FITNESS_DAILY_REWARD_CAP-state.dailyEarnedMzk));
  const balance=Number(user.tokens?.MZK||0)+amountMzk;if(!Number.isSafeInteger(balance))fail('The wallet balance cannot accept this reward.');
  user.tokens ||= {};user.tokens.MZK=balance;user.revision=Number(user.revision||0)+1;user.updatedAt=new Date(now).toISOString();
  state.completedSets++;state.totalScore+=result.score;state.bestScores[station.id]=Math.max(state.bestScores[station.id]||0,result.score);state.skills[rules.skill]=(state.skills[rules.skill]||0)+result.hits;
  state.dailyEarnedMzk+=amountMzk;state.totalEarnedMzk+=amountMzk;if(amountMzk)state.lastRewardAt=now;
  for(const trainer of FITNESS_TRAINERS){const badge=trainer.id==='fitness-trainer-maya'?'Maya’s Movement Circuit':'Leon’s Strength Circuit';if(trainer.specialties.every(kind=>FITNESS_STATIONS.some(place=>place.kind===kind&&(state.bestScores[place.id]||0)>=480))&&!state.badges.includes(badge))state.badges.push(badge);}
  const receipt={id:'fitness-'+randomUUID(),type:'FITNESS_REWARD',walletId:wallet,requestId:'fitness:'+result.roundId,roundId:result.roundId,stationId:result.stationId,canonicalStationId:station.id,kind:station.kind,score:result.score,medal:fitnessMedal(result.score),amountMzk,balanceAfterMzk:balance,createdAt:new Date(now).toISOString(),progress:publicProgress(state),message:amountMzk?'Set saved · +'+amountMzk+' MZK':cooldown?'Set saved. Your next MZK reward is available shortly.':state.dailyEarnedMzk>=FITNESS_DAILY_REWARD_CAP?'Set saved. Today’s 300 MZK gym rewards are complete.':'Practice saved. Reach 40% precision to earn MZK.'};
  (data.transactions ||= []).push(receipt);return receipt;
 });
}

export async function fitnessAccountState(database,walletId){
 const wallet=cleanWallet(walletId);await database.initialize();const data=await database.read(),state=data.fitness?.accounts?.[wallet]||{};
 return {currency:'MZK',balance:Number(data.users[wallet]?.tokens?.MZK||0),progress:publicProgress(state),history:(data.transactions||[]).filter(entry=>entry.type==='FITNESS_REWARD'&&entry.walletId===wallet).slice(-20).reverse()};
}
