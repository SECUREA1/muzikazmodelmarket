import {observeCasinoInteraction} from './server-casino-residents.mjs';

const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z);
const fail=message=>{throw new Error(message);};
const staffName=npc=>npc.resident.name;
const point=(name,x,z,extra={})=>({name,x,y:.02,z,radius:3.5,...extra});
const rewards={orientation:{reputation:8,skill:'hospitality',xp:12,cosmetic:'Floor guide badge'},delivery:{reputation:10,skill:'hospitality',xp:16,cosmetic:'Velvet service pin'},guidance:{reputation:8,skill:'social',xp:14,cosmetic:'Good neighbour ribbon'},security:{reputation:10,skill:'security',xp:16,cosmetic:'Public safety pin'}};
const kindFor=npc=>npc.resident.duty==='guard'?'security':npc.resident.duty==='vendor'?'delivery':npc.resident.duty==='host'||npc.resident.duty==='cashier'?'orientation':'guidance';
const offers={
 orientation:{title:'Welcome floor orientation',description:'Walk the public promenade, find the poker salon and cashier, then return with your floor check. No wager is required.',steps:['Check the central promenade','Find the poker salon approach','Check the cashier approach','Return to your host']},
 delivery:{title:'Velvet Lounge service round',description:'Collect a prepared refreshment tray, speak with a guest on the public floor, then return to the vendor. The tray is supplied by the house; your wallet is untouched.',steps:['Collect the prepared tray beside the bar','Speak with the marked guest and deliver the tray','Return to the vendor']},
 guidance:{title:'Help a guest feel at home',description:'Meet another casino guest, ask about their evening, check the game information point and report back. You do not need to place a bet.',steps:['Speak with the marked guest','Check the game information point','Return to your contact']},
 security:{title:'Public corridor safety check',description:'Check both public approaches to the vault, then report back to the guard. The vault stays locked and you never enter the restricted room.',steps:['Check the west public corridor','Check the east public corridor','Report to the guard']}
};

export function casinoTaskOffer(npc){const kind=kindFor(npc);return {kind,...offers[kind],reward:{...rewards[kind]}};}
export function casinoProgressView(player){const p=player.casinoProgress||{};return {reputation:Number(p.reputation||0),skills:{hospitality:0,social:0,security:0,...p.skills},cosmetics:[...(p.cosmetics||[])],completedTasks:Number(p.completedTasks||0)};}
export function casinoTaskView(player){
 const task=player.casinoTask;if(!task)return null;
 const {_motion,completedKey,...result}=task;return structuredClone(result);
}
function targetFor(sim,checkpoint){return checkpoint?.actorId?sim.actors[checkpoint.actorId]?.position:checkpoint;}
function requiredWalk(from,to){return Math.max(2,Math.min(14,distance(from,to)*.55));}
function setLeg(task,player,sim,now){
 const target=targetFor(sim,task.checkpoints[task.index]);
 task.walkedMeters=0;task.dwellMs=0;task.requiredWalkMeters=requiredWalk(player.position,target||player.position);
 task._motion={position:{...player.position},at:now,arrivedAt:null};
}

/** Sample only positions resolved by the authoritative room. Relocation epochs
 * cancel tasks, and elapsed-time/speed bounds prevent a discontinuity from
 * being counted as walking. Checkpoints also require a stopped arrival dwell. */
export function sampleCasinoTaskMovement(sim,player,now){
 const task=player.casinoTask;if(task?.status!=='active')return;
 if(player.replacedByRoom){task.status='cancelled';task.message='World travel ended this casino favor. Ask your contact to start again.';return;}
 if((player.movementRevision||0)!==task.movementRevision){task.status='cancelled';task.message='Map travel or relocation reset this favor. Ask your contact to start again.';return;}
 if(now>task.deadline){task.status='expired';task.message='This favor expired. Your contact can offer another one.';return;}
 const motion=task._motion;
 if(!motion){setLeg(task,player,sim,now);return;}
 const elapsed=Math.max(0,now-motion.at),span=distance(motion.position,player.position);
 if(span>Math.max(2.2,elapsed/1000*7+.35)){task.status='cancelled';task.message='A position jump reset this favor. Please walk the public route.';return;}
 const onFoot=!player.vehicleId&&!player.seatedId&&player.health>0&&now-player.lastSeen<15000;
 if(onFoot&&elapsed>0&&elapsed<=1500)task.walkedMeters+=span;
 const target=targetFor(sim,task.checkpoints[task.index]);
 const stopped=span<=.03||elapsed>0&&span/(elapsed/1000)<.45;
 const arrived=onFoot&&player.grounded!==false&&target&&distance(player.position,target)<=task.checkpoints[task.index].radius&&task.walkedMeters>=task.requiredWalkMeters&&stopped;
 if(arrived){motion.arrivedAt??=now;task.dwellMs=Math.min(5000,now-motion.arrivedAt);}else{motion.arrivedAt=null;task.dwellMs=0;}
 motion.position={...player.position};motion.at=now;
}
export function stepCasinoTasks(sim,now){for(const player of Object.values(sim.players||{}))sampleCasinoTaskMovement(sim,player,now);}
export function recordCasinoPlayerGame(sim,player,round,now){
 if(!round?.id||round.phase!=='complete'||!['poker','blackjack','roulette','dice','slots','baccarat','threecard'].includes(round.game))return false;
 const completedAt=Date.parse(round.completedAt);
 if(!Number.isFinite(completedAt)||completedAt<=Number(player.casinoGameReplayFloor||0))return false;
 player.casinoGameRounds=(player.casinoGameRounds||[]).map(entry=>typeof entry==='string'?{id:entry,at:0}:entry);
 if(player.casinoGameRounds.some(entry=>entry.id===round.id))return false;
 player.casinoGameRounds.push({id:round.id,at:completedAt});
 if(player.casinoGameRounds.length>64){const evicted=player.casinoGameRounds.splice(0,player.casinoGameRounds.length-64);player.casinoGameReplayFloor=Math.max(Number(player.casinoGameReplayFloor||0),...evicted.map(entry=>entry.at||0));}
 const progress=player.casinoProgress ||= {reputation:0,skills:{},cosmetics:[],completedTasks:0,completedKeys:[]};
 progress.skills ||= {};progress.skills[round.game]=Number(progress.skills[round.game]||0)+2;
 player.casinoGameHistory=[...(player.casinoGameHistory||[]),{id:round.id,game:round.game,outcome:String(round.outcome||'round complete').slice(0,60),at:now}].slice(-8);
 observeCasinoInteraction(sim,null,{actorId:player.actorId,kind:'player-game',text:player.username+' completed '+round.game+' with '+round.outcome,stationId:round.stationId,game:round.game,result:round.outcome,requestId:'player-round:'+round.id,skill:round.game},now);
 return true;
}
export function noteCasinoTaskConversation(player,npc,now){
 const task=player.casinoTask,checkpoint=task?.checkpoints?.[task.index];
 if(task?.status==='active'&&checkpoint?.requiresConversation&&checkpoint.actorId===npc.id&&now>=task.startedAt){task.spokeWith ||= [];if(!task.spokeWith.includes(npc.id))task.spokeWith.push(npc.id);}
}

export function casinoTaskCommand(sim,player,npc,choice,now){
 sampleCasinoTaskMovement(sim,player,now);
 if(choice==='casino-task')return {text:casinoTaskOffer(npc).description,offer:casinoTaskOffer(npc)};
 if(choice==='casino-skills'){
  const progress=casinoProgressView(player);
  return {text:'Your casino reputation is '+progress.reputation+'. Hospitality '+progress.skills.hospitality+' XP, social '+progress.skills.social+' XP, and public safety '+progress.skills.security+' XP. Complete walking favors to practise these skills. These rewards never add or remove MZK.',progress};
 }
 if(choice==='casino-accept'){
  if(player.casinoTask?.status==='active')fail('Finish or cancel your current casino favor first.');
  const offer=casinoTaskOffer(npc),completedKey=Math.floor(now/86400000)+':'+npc.id;
  if(player.casinoProgress?.completedKeys?.includes(completedKey))fail('You already helped this contact today. Another staff member may have a different favor.');
  const guests=Object.values(sim.actors).filter(actor=>actor.active!==false&&actor.resident?.casino&&actor.resident.duty==='guest'&&actor.id!==npc.id).sort((a,b)=>distance(a.position,npc.position)-distance(b.position,npc.position));
  const guest=guests[0],checkpoints=[];
  if(offer.kind==='orientation')checkpoints.push(point('Check the central promenade',0,19),point('Check the poker salon approach',-15,9),point('Check the cashier approach',22,25));
  else if(offer.kind==='security')checkpoints.push(point('Check the west public vault approach',-9,-17),point('Check the east public vault approach',9,-17));
  else{
   if(!guest)fail('Our guests are unavailable for this favor. Please ask again later.');
   if(offer.kind==='delivery')checkpoints.push(point('Collect the prepared tray beside the bar',-26,25));
   checkpoints.push(point((offer.kind==='delivery'?'Deliver the tray and speak to ':'Ask about the evening with ')+staffName(guest),guest.position.x,guest.position.z,{actorId:guest.id,requiresConversation:true}));
   if(offer.kind==='guidance')checkpoints.push(point('Read the game information at the public promenade',0,19));
  }
  checkpoints.push(point('Return to '+staffName(npc),npc.position.x,npc.position.z,{actorId:npc.id}));
  const task=player.casinoTask={id:'casino-favor-'+globalThis.crypto.randomUUID(),kind:offer.kind,title:offer.title,residentId:npc.id,status:'active',index:0,startedAt:now,deadline:now+1200000,movementRevision:player.movementRevision||0,completedKey,checkpoints,reward:{...offer.reward},spokeWith:[]};
  setLeg(task,player,sim,now);
  return {text:'Thank you, '+player.username+'. '+checkpoints[0].name+'. Walk there, stop for a moment, then confirm in Residents. '+(offer.kind==='delivery'?'The house supplies your tray. ':'')+'You will earn reputation and '+offer.reward.skill+' practice, with no MZK charge.',task:casinoTaskView(player)};
 }
 const task=player.casinoTask;
 if(choice==='casino-cancel'){
  if(task?.status==='active')task.status='cancelled';
  return {text:'No problem. I have cleared that favor so you can explore at your own pace.'};
 }
 if(choice==='casino-progress')return {text:task?.status==='active'?task.checkpoints[task.index].name+'. '+(task.index+1)+' of '+task.checkpoints.length+' stops. Walked '+Math.floor(task.walkedMeters)+' of '+Math.ceil(task.requiredWalkMeters)+' required metres on this leg. '+(task.dwellMs<1200?'Stop at the marker for a moment before confirming.':'You are ready to check in.'):task?.status==='completed'?'Your favor is complete. The reputation, skill practice and keepsake are recorded.':task?.message||'No active casino favor. Ask a staff member what needs doing.'};
 if(choice!=='casino-confirm')return null;
 if(task?.status!=='active')fail(task?.status==='completed'?'This casino favor is already complete.':task?.message||'Accept a casino favor before checking in.');
 if(task.residentId!==npc.id)fail('Report this favor to the contact who gave it to you.');
 const checkpoint=task.checkpoints[task.index],target=targetFor(sim,checkpoint);
 if(player.vehicleId||player.seatedId||player.grounded===false||!target||distance(player.position,target)>checkpoint.radius)fail('Walk to the current casino marker and stop safely before confirming.');
 if(task.walkedMeters<task.requiredWalkMeters)fail('Walk the public route to this marker before confirming.');
 if(task.dwellMs<1200)fail('Stop at the marker for a moment, then confirm again.');
 if(checkpoint.requiresConversation&&!task.spokeWith.includes(checkpoint.actorId))fail('Speak with the marked guest before confirming this stop.');
 task.index++;
 if(task.index<task.checkpoints.length){setLeg(task,player,sim,now);return {text:'That is checked. Next, '+task.checkpoints[task.index].name.toLowerCase()+'.',checkpoint:true};}
 const progress=player.casinoProgress ||= {reputation:0,skills:{},cosmetics:[],completedTasks:0,completedKeys:[]};
 if(progress.completedKeys?.includes(task.completedKey))fail('This favor has already been rewarded.');
 progress.reputation=Number(progress.reputation||0)+task.reward.reputation;progress.skills ||= {};progress.skills[task.reward.skill]=Number(progress.skills[task.reward.skill]||0)+task.reward.xp;
 progress.cosmetics ||= [];if(!progress.cosmetics.includes(task.reward.cosmetic))progress.cosmetics.push(task.reward.cosmetic);
 progress.completedTasks=Number(progress.completedTasks||0)+1;progress.completedKeys=[...(progress.completedKeys||[]),task.completedKey].slice(-64);
 task.status='completed';task.completedAt=now;task.message='Favor complete. +'+task.reward.reputation+' reputation · +'+task.reward.xp+' '+task.reward.skill+' XP · '+task.reward.cosmetic;delete task._motion;
 return {text:'You followed through, '+player.username+'. '+task.message+'. Thank you for making the floor easier for everyone.',completed:true,reward:task.reward};
}
