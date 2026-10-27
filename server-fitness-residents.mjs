import {FITNESS_ID,FITNESS_RESIDENTS,FITNESS_STATIONS,isFitnessEnvironment} from './public/js/fitness-config.js';

export const FITNESS_DIALOGUE_CHOICES=[
 ['day','Hello!'],['fitness-technique','Explain the technique'],['fitness-workout','Plan my gym circuit'],['fitness-competition','Explain competitive sports'],['fitness-performance','Review my last performance'],['fitness-rewards','How do MZK rewards work?'],['resident-activity','What are you doing?'],['resident-personality','Tell me about yourself'],['resident-skills','Talk about training skills'],['resident-staff','Meet the gym team'],['resident-memory','Do you remember me?'],['question','Help me find a station'],['joke','Tell me a gym joke'],['thanks','Thank you'],['bye','See you later']
].map(([id,label])=>({id,label}));
const labels={boxing:'practising clean boxing combinations',sparring:'sparring with a gym partner','boxing-sparring':'sparring with a gym partner',refereeing:'officiating a practice boxing bout',lifting:'performing controlled dumbbell curls',running:'running a steady treadmill interval',rowing:'practising the rowing drive and recovery',stretching:'working through a mobility stretch','jump-rope':'practising a jump-rope rhythm','bench-press':'performing a controlled bench-press set',deadlift:'rehearsing a controlled deadlift',coaching:'coaching members on the training floor',basketball:'dribbling and practising jump shots','table-tennis':'rallying with a table-tennis partner',sprint:'training sprint starts and footwork',spectating:'watching the ring from the spectator area'};
const tips={boxing:'Read the next punch cue and use the matching action. Accuracy keeps your combination alive; rushing the wrong punch breaks it.','boxing-sparring':'Read your opponent, balance attacks with guard and footwork, and keep enough stamina for the next exchange. The ring panel explains each move and shows the judges’ score.',sparring:'Read your opponent, balance attacks with guard and footwork, and keep enough stamina for the next exchange.','bench-press':'Follow the moving bar and press in the target window. A controlled, well-timed repetition counts more than repeated taps.',deadlift:'Watch the lifting cue, time the drive, and control the lockout. Choose precision before speed.',agility:'Read each direction cue and choose the matching arrow quickly. Reset your attention after every step.','jump-rope':'Watch the beat marker and jump as it reaches the target. Keep the same cadence to build your streak.',rowing:'Time the drive and recovery with the stroke cue. Smooth repetition builds a strong rowing set.',balance:'Make small left and right corrections to keep the marker in the central zone.',basketball:'Read the possession cue, control your dribble, and time the open shot. The contest panel shows both scores and each exchange.','table-tennis':'Watch the return cue, choose the matching stroke, and keep the rally controlled. Reset your ready position after each point.',sprint:'React to the start cue, then build a consistent stride. Read each sprint cue before committing your input.'};
const short=value=>String(value||'').replace(/[\u0000-\u001f]/g,' ').slice(0,300);
const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,Number(value)||0));
const distance=(a,b)=>a&&b?Math.hypot(a.x-b.x,a.z-b.z):Infinity;
const gap=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const hash=value=>{let result=2166136261;for(const char of String(value))result=Math.imul(result^char.charCodeAt(0),16777619);return result>>>0;};
const skillFor=activity=>activity==='lifting'||activity==='bench-press'||activity==='deadlift'?'strength':activity==='running'||activity==='sprint'?'endurance':['sparring','boxing-sparring','refereeing'].includes(activity)?'boxing':activity;
const sparring=source=>['sparring','boxing-sparring'].includes(source.activity);
const point=value=>value&&['x','y','z'].every(axis=>Number.isFinite(value[axis]??(axis==='y'?0:NaN)))?{x:value.x,y:value.y||0,z:value.z}:null;
function remember(info,kind,subjectId,text,now){info.memory||=[];info.memory.push({kind,subjectId,text:short(text),at:now});info.memory=info.memory.slice(-8);}
function lifeState(sim,environment,now){
 const life=sim.residentLife ||= {version:1,worldId:environment.id||FITNESS_ID,worldName:environment.name||'MUZIKAZ Fitness Centre',sequence:0,conversations:[],events:[],stats:{conversations:0,practices:0,work:0}};
 life.conversations||=[];life.events||=[];life.stats||={};for(const field of ['conversations','practices','work'])life.stats[field]||=0;life.sequence||=0;return life;
}
function say(npc,text,now,duration=4500){const info=npc.resident;info.speech=short(text);info.speechUntil=now+duration;info.speaking=true;info.pauseUntil=now+duration;info.gesture=info.duty==='trainer'||info.duty==='referee'?'explain':'talk';}
function baseSkills(source,index){const activity=source.activity||'stretching',main=skillFor(activity);return {...(source.duty==='trainer'?Object.fromEntries((source.specialties||[]).map(skill=>[skill,88+index%3*3])):{[main]:45+hash(source.id)%37,social:38+hash(source.id+'social')%30}),...source.skills};}
function ensureResident(sim,source,index,now){
 let npc=sim.actors[source.id];
 if(!npc?.resident?.fitness){
  const home={...source.home},trainer=source.duty==='trainer',activity=source.activity||'stretching',seed=hash(source.id);
  const info={...source,fitness:true,isAI:true,ageGroup:'adult',index,home,uniform:'sports',prop:'none',personality:source.personality||(trainer?(index?'Calm, precise strength coach':'Encouraging movement coach'):['Patient technician','Competitive strategist','Encouraging teammate','Quiet, focused athlete','Curious improver'][seed%5]),backstory:source.backstory||(trainer?'I enjoy helping members build a reliable training rhythm, one controlled set at a time.':source.duty==='referee'?'I practise fair scoring, clear signals and calm restarts so everyone can enjoy a competitive bout.':'I come here to improve my '+activity.replaceAll('-',' ')+' and compare notes with the other athletes.'),skills:baseSkills(source,index),needs:{energy:80,social:65,purpose:70,curiosity:60},phase:'practising',gesture:'fitness-'+activity,task:labels[activity]||labels.stretching,moving:false,speaking:false,speech:'',speechUntil:0,pauseUntil:0,workout:{kind:activity,phase:trainer?'coaching':'set',set:1,reps:0,startedAt:now-index*2100,nextAt:now+24000+index*1000},nextAmbientAt:now+8000+index*4500,memory:[],relationships:[],appearance:{outfit:source.color,skin:source.skin,hairstyle:trainer?(index?'short':'bun'):['short','curly','swept','bob','bun','short'][seed%6],accessory:trainer||source.duty==='referee'?'watch':'none',height:1,build:sparring(source)?1.08:trainer?1.04:1}};
  remember(info,'arrival',environmentId(sim),trainer?'Opened my coaching session at the fitness centre.':'Started a '+activity+' practice session.',now);
  npc={id:source.id,name:source.name+' · '+source.role,modelId:'world-resident',asset:{buildAssetId:'world-resident'},active:true,health:100,destructible:false,spawned:true,trafficAI:true,solid:false,position:{...home},rotation:{x:0,y:source.heading||0,z:0},resident:info,definition:{objectId:source.id,modelId:'world-resident',name:source.name,position:{...home},gameplay:{behavior:'talk',interactionDistance:4,cooldown:1,prompt:(trainer?'Meet trainer · ':'Talk · ')+source.name},dialogue:{text:source.greeting||'Join a station and enjoy your training.'}}};
  sim.actors[source.id]=npc;
 }
 const info=npc.resident;
 // Keep saved identities, relationships and learned skills while adopting the
 // expanded roster's current role, equipment positions and safe patrol path.
 for(const key of ['name','role','duty','activity','stationKind','partnerId','sparringSide','patrol','spectate','watchKind','maxRoam','specialties','greeting'])if(source[key]!==undefined)info[key]=structuredClone(source[key]);
 if(info.fitnessVersion!==2){if(source.personality)info.personality=source.personality;else if(info.personality==='Focused, friendly gym member')info.personality=['Patient technician','Competitive strategist','Encouraging teammate','Quiet, focused athlete','Curious improver'][hash(source.id)%5];if(source.backstory)info.backstory=source.backstory;}
 info.home={...source.home};info.index=index;info.fitness=true;info.isAI=true;info.uniform='sports';info.skills||=baseSkills(source,index);for(const [key,value]of Object.entries(baseSkills(source,index)))info.skills[key]=clamp(info.skills[key]??value);
 info.workout||={kind:source.activity,phase:'set',set:1,reps:0,startedAt:now,nextAt:now+26000};
 info.routine||={phase:info.workout.phase==='rest'?'resting':'training',startedAt:info.workout.startedAt,nextAt:info.workout.nextAt,cycle:0,routeIndex:0};
 info.observedResults=(info.observedResults||[]).slice(-12);info.memory=(info.memory||[]).slice(-8);info.relationships=(info.relationships||[]).slice(-8);info.needs||={energy:80,social:65,purpose:70,curiosity:60};info.fitnessVersion=2;npc.solid=false;npc.trafficAI=true;return npc;
}
const environmentId=sim=>sim.residentLife?.worldId||FITNESS_ID;
function chat(sim,a,b,now){
 const life=sim.residentLife,coach=a.resident.duty==='trainer',official=a.resident.duty==='referee',topic=official?'ring-officiating':coach?'coaching':a.resident.stationKind||a.resident.activity;
 const lines=official?['Clean scoring and a clear guard. Take your time at the restart.','Understood. I will reset my stance before the next exchange.']:coach?['Looking good, '+b.resident.name.split(' ')[0]+'. Keep your rhythm controlled.','Thanks, coach. I am focusing on a clean set before my next break.']:['My next goal is a cleaner '+(skillFor(a.resident.activity)||'training').replaceAll('-',' ')+' set. What are you working on?','Steady timing first. We can compare our next results after recovery.'];
 const id='fitness-chat-'+ ++life.sequence,conversation={id,participants:[a.id,b.id],topic,turn:1,status:'active',startedAt:now,nextAt:now+4700,lines:[{speakerId:a.id,text:lines[0],at:now}]};
 life.conversations.push(conversation);life.conversations=life.conversations.slice(-6);life.stats.conversations++;say(a,lines[0],now);b.resident.pendingReply={text:lines[1],at:now+4700,conversationId:id};
 for(const [one,other]of [[a,b],[b,a]]){remember(one.resident,'gym-conversation',other.id,lines[one===a?0:1],now);let relation=one.resident.relationships.find(value=>value.id===other.id);if(!relation){relation={id:other.id,affinity:0,lastAt:now};one.resident.relationships.push(relation);}relation.affinity=Math.min(100,relation.affinity+1);relation.lastAt=now;one.resident.relationships=one.resident.relationships.slice(-8);}
}
function safeMove(sim,npc,target,environment,dt,collision,objects,cast,{radius}={}){
 const span=distance(npc.position,target);if(span<.16)return true;
 const amount=Math.min(span,Math.max(0,Math.min(.25,dt))*(npc.resident.activity==='sprint'?2.8:1.05));if(!amount)return false;
 const desired={x:npc.position.x+(target.x-npc.position.x)/span*amount,y:npc.position.y,z:npc.position.z+(target.z-npc.position.z)/span*amount};
 const players=Object.values(sim.players||{}).filter(player=>player.health>0&&!player.replacedByRoom);
 if(players.some(player=>gap(player.position,desired)<1.15)||cast.some(other=>other!==npc&&gap(other.position,desired)<.75))return false;
 if(Number.isFinite(radius)&&distance(desired,npc.resident.home)>radius)return false;
 const floor=collision?.groundAt?collision.groundAt(environment,desired,{actors:sim.actors,objects,maxRise:.2}):desired;
 if(!floor||Math.abs(floor.y-npc.position.y)>.25)return false;
 const resolved=collision?.resolve?collision.resolve(environment,npc.position,{...desired,y:floor.y},sim.actors,objects):{...desired,y:floor.y};
 if(!resolved||distance(resolved,desired)>.12||Math.abs((resolved.y??floor.y)-npc.position.y)>.25||distance(npc.position,resolved)<amount*.2)return false;
 if(collision?.hasBodyClearance&&!collision.hasBodyClearance(environment,resolved,.28,{actors:sim.actors,objects}))return false;
 npc.rotation.y=Math.atan2(npc.position.x-resolved.x,npc.position.z-resolved.z);npc.position={x:resolved.x,y:floor.y,z:resolved.z};npc.resident.moving=true;npc.resident.gesture='walk';npc.resident.phase='walking';return distance(npc.position,target)<.16;
}
function watchTarget(sim,info){return Object.values(sim.players||{}).filter(player=>player.health>0&&['countdown','active'].includes(player.fitness?.status)&&(!info.watchKind||player.fitness.kind===info.watchKind)).sort((a,b)=>distance(a.position,info.home)-distance(b.position,info.home))[0];}
function routinePhase(info,phase,now,duration){info.routine.phase=phase;info.routine.startedAt=now;info.routine.nextAt=now+duration;info.routine.blockedSince=0;}
function stepRoutine(sim,npc,source,cast,environment,now,dt,collision,objects){
 const info=npc.resident,routine=info.routine,workout=info.workout,trainer=info.duty==='trainer',official=info.duty==='referee',path=(info.patrol||[]).map(point).filter(Boolean),maxRoam=Math.min(30,Math.max(1,Number(info.maxRoam)||4));
 info.moving=false;info.currentActivity=info.activity;
 if(now>=routine.nextAt&&!['patrolling','returning'].includes(routine.phase)){
  if(routine.phase==='training'){
   if(!trainer&&!official){workout.reps+=8;sim.residentLife.stats.practices++;const skill=skillFor(info.activity);info.skills[skill]=clamp((info.skills[skill]||45)+.15);remember(info,'training',info.activity,'Completed set '+workout.set+' of '+info.activity+'.',now);}
   routinePhase(info,'resting',now,8000);workout.phase='rest';workout.nextAt=routine.nextAt;
  }else if(routine.phase==='resting'&&(info.spectate||trainer||official||info.activity==='spectating')){routinePhase(info,'spectating',now,9000);workout.phase='spectating';}
  else if(path.length){routinePhase(info,'patrolling',now,16000);routine.routeIndex=0;workout.phase='walking';}
  else{routinePhase(info,'training',now,26000+info.index*500);routine.cycle++;workout.phase=trainer?'coaching':official?'officiating':'set';workout.set++;workout.startedAt=now;workout.nextAt=routine.nextAt;}
 }
 if(routine.phase==='patrolling'||routine.phase==='returning'){
  const target=routine.phase==='returning'?info.home:path[routine.routeIndex];
  if(!target||now>=routine.nextAt){routinePhase(info,'returning',now,20000);}
  const destination=routine.phase==='returning'?info.home:target;
  if(destination&&safeMove(sim,npc,destination,environment,dt,collision,objects,cast,{radius:maxRoam})){
   if(routine.phase==='patrolling'&&routine.routeIndex<path.length-1)routine.routeIndex++;
   else if(routine.phase==='patrolling')routinePhase(info,'returning',now,20000);
   else{routinePhase(info,'training',now,26000);routine.cycle++;workout.phase=trainer?'coaching':official?'officiating':'set';workout.set++;workout.startedAt=now;workout.nextAt=routine.nextAt;}
  }else if(!info.moving){routine.blockedSince||=now;if(now-routine.blockedSince>2500&&routine.phase==='patrolling')routinePhase(info,'returning',now,20000);}
  info.currentActivity='walking';info.task='taking a short, clear route between training and observation';if(!info.moving){info.gesture='listen';info.phase='waiting';}
 }else if(routine.phase==='spectating'){
  const watched=watchTarget(sim,info),target=watched?.position||info.spectate;
  if(target)info.lookAt={...target,y:(target.y||0)+1.25};info.currentActivity='spectating';info.phase='watching';info.gesture='listen';info.task=watched?'watching '+(watched.username||'a member')+' compete in '+watched.fitness.kind.replaceAll('-',' '):'watching the '+(info.watchKind||info.stationKind||'training').replaceAll('-',' ')+' area';
 }else if(routine.phase==='resting'){
  info.currentActivity='recovery';info.phase='resting';info.gesture='fitness-recovery';info.task='recovering between '+info.activity.replaceAll('-',' ')+' sets';
 }else{
  if(!info.moving&&distance(npc.position,info.home)<.3)npc.rotation.y=source.heading||0;
  info.phase=trainer?'working':official?'officiating':'practising';info.gesture=trainer?'explain':'fitness-'+info.activity;info.task=labels[info.activity]||'practising '+info.activity.replaceAll('-',' ');
 }
 info.needs.energy=clamp(info.needs.energy+(routine.phase==='resting'?.7:-.08)*Math.max(0,Math.min(.25,dt)),25,95);
}
function stepSparring(sim,cast,now){
 const boxers=cast.filter(npc=>sparring(npc.resident)),pairs=[],taken=new Set();
 for(const red of boxers){if(taken.has(red.id))continue;const blue=boxers.find(other=>other!==red&&!taken.has(other.id)&&(red.resident.partnerId?other.id===red.resident.partnerId:other.resident.sparringSide!==red.resident.sparringSide));if(!blue)continue;pairs.push([red,blue]);taken.add(red.id);taken.add(blue.id);}
 sim.fitnessSparring||={};const officials=cast.filter(npc=>npc.resident.duty==='referee');
 for(const [a,b]of pairs){
  const key=[a.id,b.id].sort().join('|'),bout=sim.fitnessSparring[key]||={id:key,round:1,phase:'sparring',startedAt:now,nextAt:now+18000,exchangeAt:now+900,exchange:0,scores:{[a.id]:0,[b.id]:0},completedBouts:0,winnerId:null};
  const nearbyPlayer=Object.values(sim.players||{}).some(player=>player.health>0&&(player.fitness?.kind==='boxing-sparring'&&['countdown','active'].includes(player.fitness.status)&&distance(player.position,a.position)<20||gap(player.position,a.position)<1.1||gap(player.position,b.position)<1.1));
  if(nearbyPlayer){bout.suspendedAt??=now;for(const npc of [a,b]){npc.resident.currentActivity='spectating';npc.resident.gesture='guard';npc.resident.task='giving the ring to the live competitor';}continue;}
  if(bout.suspendedAt!==undefined){const pause=now-bout.suspendedAt;bout.nextAt+=pause;bout.exchangeAt+=pause;delete bout.suspendedAt;}
  if(now>=bout.nextAt){
   if(bout.phase==='sparring'){bout.phase='recovery';bout.nextAt=now+6500;if(bout.round>=3){bout.winnerId=bout.scores[a.id]===bout.scores[b.id]?null:bout.scores[a.id]>bout.scores[b.id]?a.id:b.id;bout.completedBouts++;for(const npc of [a,b])remember(npc.resident,'sparring-result',key,'Practice bout '+(bout.winnerId===npc.id?'won':bout.winnerId?'lost':'drawn')+' on clean-point scoring.',now);const event={id:'fitness-bout-'+ ++sim.residentLife.sequence,kind:'practice-bout',actorId:bout.winnerId,text:'Practice bout complete: '+a.resident.name+' '+bout.scores[a.id]+' — '+bout.scores[b.id]+' '+b.resident.name,at:now};sim.residentLife.events.push(event);sim.residentLife.events=sim.residentLife.events.slice(-12);}}
   else{if(bout.round>=3){bout.round=1;bout.scores={[a.id]:0,[b.id]:0};bout.winnerId=null;}else bout.round++;bout.phase='sparring';bout.startedAt=now;bout.nextAt=now+18000;bout.exchangeAt=now+900;}
  }
  if(bout.phase==='sparring'&&now>=bout.exchangeAt){
   const attacker=bout.exchange%2?a:b,defender=attacker===a?b:a,attack=['jab','cross','hook','uppercut'][hash(key+':'+bout.exchange)%4],defence=['guard','slip','duck'][hash(key+':defence:'+bout.exchange)%3];
   const clean=hash(key+':score:'+bout.exchange)%100<clamp(55+((attacker.resident.skills.boxing||60)-(defender.resident.skills.boxing||60))*.5,25,80);if(clean)bout.scores[attacker.id]++;
   attacker.resident.combatPose=attack;defender.resident.combatPose=defence;bout.exchange++;bout.exchangeAt=now+1100;bout.lastExchange={attackerId:attacker.id,defenderId:defender.id,attack,defence,clean,at:now};
  }
  for(const npc of [a,b]){const other=npc===a?b:a,info=npc.resident;info.currentActivity=bout.phase==='sparring'?'sparring':'recovery';info.phase=bout.phase==='sparring'?'sparring':'resting';info.gesture='fitness-'+info.currentActivity;info.task=bout.phase==='sparring'?'sparring with '+other.resident.name+' · round '+bout.round:'recovering between practice rounds';info.workout.phase=bout.phase==='sparring'?'set':'rest';info.lookAt={...other.position,y:other.position.y+1.5};info.sparring={round:bout.round,phase:bout.phase,ownPoints:bout.scores[npc.id],opponentPoints:bout.scores[other.id],opponentId:other.id,completedBouts:bout.completedBouts,winnerId:bout.winnerId};npc.rotation.y=Math.atan2(npc.position.x-other.position.x,npc.position.z-other.position.z);}
  for(const ref of officials){ref.resident.sparring={round:bout.round,phase:bout.phase,redPoints:bout.scores[a.id],bluePoints:bout.scores[b.id],completedBouts:bout.completedBouts};ref.resident.lookAt={x:(a.position.x+b.position.x)/2,y:a.position.y+1.4,z:(a.position.z+b.position.z)/2};if(!ref.resident.moving&&!ref.resident.speaking){ref.resident.currentActivity='refereeing';ref.resident.task='officiating practice round '+bout.round+' · '+bout.scores[a.id]+' to '+bout.scores[b.id];ref.resident.gesture='fitness-refereeing';}}
 }
}
function performanceText(player){
 const round=player.fitness,competition=round?.competition;if(!round)return 'You have no gym result yet. Start a training set or a sports contest, then come back for a review.';
 const name=String(round.name||round.kind||'training').split(' · ')[0];
 if(['countdown','active'].includes(round.status))return name+' is '+(round.status==='countdown'?'in its countdown':'live')+(competition?' in round '+competition.round+' of '+competition.totalRounds+', with '+competition.playerPoints+' to '+competition.opponentPoints+' '+(competition.unit||'points'):' with '+(round.hits||0)+' clean inputs')+'. Keep your attention on the next cue.';
 if(round.status!=='complete')return 'Your last '+name+' session ended without a completed result. Start a fresh round when you are ready.';
 const total=round.cues?.length||0,accuracy=total?Math.round((round.hits||0)/total*100):null;
 let text='Your '+name+' result: '+(competition?.outcome?competition.outcome+' against '+(competition.opponent?.name||'your opponent')+', '+competition.playerPoints+' to '+competition.opponentPoints+' '+(competition.unit||'points'):Number(round.score||0)+' points')+'. ';
 if(accuracy!==null)text+='Clean inputs: '+accuracy+'%. ';
 if(competition?.playerStamina<30)text+='You finished low on stamina; use more recovery and controlled defence next time. ';
 else if(accuracy!==null&&accuracy<65)text+='Try one deliberate response per cue before adding speed. ';
 else text+='Keep that controlled rhythm and aim for a longer clean streak. ';
 if(round.settled&&Number.isFinite(round.payoutMzk))text+='Your saved payout was '+round.payoutMzk+' MZK.';
 return text;
}
function observePerformance(sim,npc,now){
 if(!['trainer','referee'].includes(npc.resident.duty))return false;
 const info=npc.resident,candidates=Object.values(sim.players||{}).filter(player=>player.health>0&&player.fitness?.status==='complete'&&gap(player.position,npc.position)<26).sort((a,b)=>(b.fitness.finishedAt||0)-(a.fitness.finishedAt||0));
 const player=candidates.find(value=>!info.observedResults.includes(value.fitness.id));if(!player)return false;
 info.observedResults.push(player.fitness.id);info.observedResults=info.observedResults.slice(-12);const review=performanceText(player);remember(info,'observed-result',player.actorId,review,now);say(npc,(player.username||'Member')+', '+review,now,6000);return true;
}
/** Server-owned routines and practice bouts are social demonstrations. Only
 * the separate player competition service may award a score or MZK. */
export function stepFitnessResidents(sim,environment,now,dt,{collision,objects={}}={}){
 if(!isFitnessEnvironment(environment))return;
 sim.actors||={};const life=lifeState(sim,environment,now),expected=new Set(FITNESS_RESIDENTS.map(person=>person.id));
 for(const [id,actor]of Object.entries(sim.actors))if(actor.resident&&!expected.has(id)){delete sim.actors[id];if(sim.devices)delete sim.devices[id];}
 const cast=FITNESS_RESIDENTS.map((source,index)=>ensureResident(sim,source,index,now));
 for(let index=0;index<cast.length;index++){
  const npc=cast[index],info=npc.resident;
  if(info.pendingReply&&now>=info.pendingReply.at){const pending=info.pendingReply,talk=life.conversations.find(item=>item.id===pending.conversationId);say(npc,pending.text,now);if(talk){talk.lines.push({speakerId:npc.id,text:pending.text,at:now});talk.turn=2;talk.status='complete';}delete info.pendingReply;}
  info.speaking=now<info.speechUntil;info.workoutPaused=now<info.pauseUntil;
  if(info.workoutPaused){info.moving=false;continue;}
  stepRoutine(sim,npc,FITNESS_RESIDENTS[index],cast,environment,now,dt,collision,objects);
  if(now>=info.nextAmbientAt){
   info.nextAmbientAt=now+24000+info.index*1300;
   if(observePerformance(sim,npc,now))continue;
   if(sparring(info)||info.duty==='referee')continue;
   const partner=cast.filter(other=>other!==npc&&!sparring(other.resident)&&now>=other.resident.speechUntil&&!other.resident.pendingReply&&gap(other.position,npc.position)<15).sort((a,b)=>distance(a.position,npc.position)-distance(b.position,npc.position))[0];if(partner)chat(sim,npc,partner,now);
  }
 }
 stepSparring(sim,cast,now);life.updatedAt=now;
}
export function fitnessResidentDialogue(sim,player,npc,choice,text,now){
 const info=npc.resident,message=short(text),trainer=info.duty==='trainer',interest=FITNESS_STATIONS.find(station=>(message+' '+choice).toLowerCase().includes(station.kind)||message.toLowerCase().includes(station.kind.replaceAll('-',' ')))?.kind;
 const key=environmentId(sim)+'|'+npc.id;player.residentSocial||={};const memory=player.residentSocial[key]||={visits:0,affinity:0,preferences:{},turns:[],lastAt:now};
 let intent=choice,reply='';
 if(/reward|\bmzk\b|coin|wallet/i.test(message))intent='fitness-rewards';
 else if(/result|performance|how did i|my last|review|did i win/i.test(message))intent='fitness-performance';
 else if(/competi|opponent|rival|tournament|referee|judg|sparr|rounds|rules/i.test(message))intent='fitness-competition';
 else if(/technique|how.*(?:lift|box|row|play|train)|timing|control/i.test(message)||interest)intent='fitness-technique';
 else if(/circuit|routine|workout plan/i.test(message))intent='fitness-workout';
 else if(/remember|last time/i.test(message))intent='resident-memory';
 else if(/where|find|directions/i.test(message))intent='question';
 if(interest)memory.preferences.activity=interest;
 if(intent==='fitness-technique')reply=tips[interest||memory.preferences.activity||info.specialties?.[0]||info.activity]||tips['bench-press'];
 else if(intent==='fitness-performance')reply=performanceText(player);
 else if(intent==='fitness-competition')reply=(info.duty==='referee'?'I keep the practice ring fair and signal each restart. ':'')+'The ring offers boxing sparring, and the east sports wing has basketball, table tennis and sprint contests. Each contest shows the server-selected opponent, live round, both scores and the final result. '+(player.fitness?.competition?performanceText(player):'Choose your sport at its marked station and review its controls before starting.')+' The sparring pair you see in the ring are practising; their demonstration does not affect your own match.';
 else if(intent==='fitness-workout')reply=trainer?(info.specialties?.includes('boxing')?'Try boxing, then agility, then jump rope. Add a sparring bout when you are comfortable reading the cues.':'Try bench press, deadlift, rowing, then the balance course. For a competitive finish, visit basketball, table tennis or sprint in the east wing.')+' Walk up to each station and open its training panel for the controls.':'I work through one station at a time, take recovery breaks, watch a clean round, and return to practice. Both trainers can help plan your next circuit.';
 else if(intent==='fitness-rewards')reply='Finish a skill challenge at its station to earn a server-verified MZK reward. Your result panel shows your score and the exact reward. Sign in to save eligible rewards to your existing wallet; practice remains available. Replaying a completed result cannot pay it twice.';
 else if(intent==='resident-personality')reply='I am '+info.name+', the '+info.role.toLowerCase()+'. '+info.backstory+' My approach is '+String(info.personality).toLowerCase()+'.';
 else if(intent==='resident-activity')reply='Right now I am '+info.task+'. '+(info.sparring?'The practice bout is in round '+info.sparring.round+'. ':trainer?'I can review a completed performance or help plan a circuit.':'I have completed '+Math.max(0,(info.workout?.set||1)-1)+' sets this session.');
 else if(intent==='resident-skills')reply='My training skills are '+Object.entries(info.skills).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([skill,value])=>skill.replaceAll('-',' ')+' '+Math.round(value)).join(', ')+'. '+(player.fitness?.status==='complete'?performanceText(player):'Build your own progress with accurate, controlled rounds at the gym stations.');
 else if(intent==='resident-staff')reply='Maya Chen coaches boxing, agility and jump rope beside reception. Leon Brooks coaches strength and conditioning in the central aisle. The ring referee and boxing rivals are at the training ring; basketball players, table-tennis partners and sprinters practise in the east sports wing.';
 else if(intent==='resident-memory')reply=memory.visits?'Welcome back, '+player.username+'. We have spoken '+memory.visits+' time'+(memory.visits===1?'':'s')+'. '+(memory.preferences.activity?'You asked about '+memory.preferences.activity.replaceAll('-',' ')+'. ':'')+'Last time we discussed '+String(memory.topic||'your training').replace('fitness-','').replace('resident-','').replaceAll('-',' ')+'.':'This is our first conversation here. Tell me which activity you want to practise and I will remember it.';
 else if(intent==='question')reply=FITNESS_STATIONS.map(station=>station.name.split(' · ')[0]+' ('+Math.round(distance(npc.position,station.position))+' m)').join('; ')+'. Open the local map for each marked station, then walk to it and use E / Use.';
 else if(intent==='joke')reply=['My jump rope asked for a promotion. It said it was tired of being skipped.','The referee brought a ruler to the ring. They wanted to measure a close round.','I told my basketball to take a break. It bounced right back.'][hash(info.id||npc.id)%3];
 else if(intent==='thanks')reply='You are welcome, '+player.username+'. Keep your next set controlled and enjoy the gym.';
 else if(intent==='bye')reply='See you around, '+player.username+'. I will be here when you want another training tip.';
 else reply=(memory.visits?'Good to see you again, '+player.username+'. ':'Welcome, '+player.username+'! ')+(info.greeting||'I am '+info.name+'. I am '+info.task+'. Ask about my training or the sports contests.');
 memory.visits++;memory.affinity=Math.min(100,(memory.affinity||0)+1);memory.lastAt=now;memory.topic=intent;memory.turns=[...(memory.turns||[]),{text:message||choice,intent,at:now}].slice(-6);
 for(const [oldKey]of Object.entries(player.residentSocial).sort((a,b)=>(b[1].lastAt||0)-(a[1].lastAt||0)).slice(32))if(oldKey!==key)delete player.residentSocial[oldKey];
 remember(info,'player-conversation',player.actorId,player.username+' asked about '+intent+'.',now);info.pauseUntil=now+7000;
 return {text:reply,closed:intent==='bye',metadata:{personality:info.personality,backstory:info.backstory,skills:{...info.skills},activity:info.task,competition:player.fitness?.competition?structuredClone(player.fitness.competition):null,relationship:{visits:memory.visits,affinity:memory.affinity,topic:intent,rememberedInterest:memory.preferences.activity||null}}};
}
