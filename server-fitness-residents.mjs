import {FITNESS_ID,FITNESS_RESIDENTS,FITNESS_STATIONS,isFitnessEnvironment} from './public/js/fitness-config.js';

export const FITNESS_DIALOGUE_CHOICES=[
 ['day','Hello, coach!'],['fitness-technique','Explain the technique'],['fitness-workout','Plan my gym circuit'],['fitness-rewards','How do MZK rewards work?'],['resident-activity','What are you doing?'],['resident-personality','Tell me about yourself'],['resident-skills','Talk about training skills'],['resident-staff','Meet the other trainer'],['resident-memory','Do you remember me?'],['question','Help me find a station'],['joke','Tell me a gym joke'],['thanks','Thank you'],['bye','See you later']
].map(([id,label])=>({id,label}));
const labels={boxing:'practising clean boxing combinations',lifting:'performing controlled dumbbell curls',running:'running a steady treadmill interval',rowing:'practising the rowing drive and recovery',stretching:'working through a mobility stretch','jump-rope':'practising a jump-rope rhythm','bench-press':'performing a controlled bench-press set',deadlift:'rehearsing a controlled deadlift',coaching:'coaching members on the training floor'};
const tips={boxing:'Read the next punch cue and use the matching action. Accuracy keeps your combination alive; rushing the wrong punch breaks it.', 'bench-press':'Follow the moving bar and press in the target window. A controlled, well-timed repetition counts more than repeated taps.',deadlift:'Watch the lifting cue, time the drive, and control the lockout. Choose precision before speed.',agility:'Read each direction cue and choose the matching arrow quickly. Reset your attention after every step.','jump-rope':'Watch the beat marker and jump as it reaches the target. Keep the same cadence to build your streak.',rowing:'Time the drive and recovery with the stroke cue. Smooth repetition builds a strong rowing set.',balance:'Make small left and right corrections to keep the marker in the central zone.'};
const short=value=>String(value||'').replace(/[\u0000-\u001f]/g,' ').slice(0,240);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function remember(info,kind,subjectId,text,now){info.memory||=[];info.memory.push({kind,subjectId,text:short(text),at:now});info.memory=info.memory.slice(-8);}
function lifeState(sim,environment,now){
 const life=sim.residentLife ||= {version:1,worldId:FITNESS_ID,worldName:environment.name||'MUZIKAZ Fitness Centre',sequence:0,conversations:[],events:[],stats:{conversations:0,practices:0,work:0}};
 life.conversations||=[];life.events||=[];life.stats||={conversations:0,practices:0,work:0};life.sequence||=0;return life;
}
function say(npc,text,now,duration=4500){const info=npc.resident;info.speech=short(text);info.speechUntil=now+duration;info.speaking=true;info.pauseUntil=now+duration;info.gesture=info.duty==='trainer'?'explain':'talk';}
function spawn(sim,source,index,now){
 const home={...source.home},trainer=source.duty==='trainer',activity=source.activity||'stretching',skills=trainer?Object.fromEntries((source.specialties||[]).map(skill=>[skill,88+index*3])):{[activity==='lifting'?'strength':activity==='running'?'endurance':activity]:42+index*4};
 const info={...source,fitness:true,isAI:true,ageGroup:'adult',index,home,uniform:'sports',prop:'none',personality:trainer?(index?'Calm, precise strength coach':'Encouraging movement coach'):'Focused, friendly gym member',backstory:trainer?'I enjoy helping members build a reliable training rhythm, one controlled set at a time.':'I come here to practise with the coaches and meet friends between sets.',skills,needs:{energy:80,social:65,purpose:70,curiosity:60},phase:'practising',gesture:'fitness-'+activity,task:labels[activity]||labels.stretching,moving:false,speaking:false,speech:'',speechUntil:0,pauseUntil:0,workout:{kind:activity,phase:trainer?'coaching':'set',set:1,reps:0,startedAt:now-index*2100,nextAt:now+24000+index*1000},nextAmbientAt:now+8000+index*4500,memory:[],relationships:[],appearance:{outfit:source.color,skin:source.skin,hairstyle:trainer?(index?'short':'bun'):['short','curly','swept','bob','bun','short'][index%6],accessory:trainer?'watch':'none',height:1,build:trainer?1.04:1}};
 remember(info,'arrival',FITNESS_ID,trainer?'Opened my coaching session at the fitness centre.':'Started a '+activity+' practice session.',now);
 const npc={id:source.id,name:source.name+' · '+source.role,modelId:'world-resident',asset:{buildAssetId:'world-resident'},active:true,health:100,destructible:false,spawned:true,trafficAI:true,position:{...home},rotation:{x:0,y:source.heading||0,z:0},resident:info,definition:{objectId:source.id,modelId:'world-resident',name:source.name,position:{...home},gameplay:{behavior:'talk',interactionDistance:4,cooldown:1,prompt:(trainer?'Meet trainer · ':'Talk · ')+source.name},dialogue:{text:source.greeting||'Join a station and enjoy your training.'}}};
 sim.actors[source.id]=npc;return npc;
}
function chat(sim,a,b,now){
 const life=sim.residentLife,topic=a.resident.duty==='trainer'?'coaching':'training',lines=a.resident.duty==='trainer'?['Looking good, '+b.resident.name.split(' ')[0]+'. Keep your rhythm controlled.','Thanks, coach. I am focusing on a clean set before my next break.']:['How is your set going?','Steady progress. A little recovery now, then another controlled set.'];
 const id='fitness-chat-'+ ++life.sequence,conversation={id,participants:[a.id,b.id],topic,turn:1,status:'active',startedAt:now,nextAt:now+4700,lines:[{speakerId:a.id,text:lines[0],at:now}]};
 life.conversations.push(conversation);life.conversations=life.conversations.slice(-6);life.stats.conversations++;say(a,lines[0],now);b.resident.pendingReply={text:lines[1],at:now+4700,conversationId:id};
 for(const [one,other]of [[a,b],[b,a]]){remember(one.resident,'gym-conversation',other.id,lines[one===a?0:1],now);let relation=one.resident.relationships.find(value=>value.id===other.id);if(!relation){relation={id:other.id,affinity:0,lastAt:now};one.resident.relationships.push(relation);}relation.affinity=Math.min(100,relation.affinity+1);relation.lastAt=now;one.resident.relationships=one.resident.relationships.slice(-8);}
}
/** A fixed gym cast replaces generic resident placement. Workout routines are
 * server state; their demonstrations never mint currency or player progress. */
export function stepFitnessResidents(sim,environment,now,dt,{collision,objects={}}={}){
 if(!isFitnessEnvironment(environment))return;
 sim.actors||={};const life=lifeState(sim,environment,now);
 // Older saves may already contain generic residents from this same floor.
 const expected=new Set(FITNESS_RESIDENTS.map(person=>person.id));
 for(const [id,actor]of Object.entries(sim.actors))if(actor.resident&&!expected.has(id)){delete sim.actors[id];if(sim.devices)delete sim.devices[id];}
 const cast=FITNESS_RESIDENTS.map((source,index)=>sim.actors[source.id]||spawn(sim,source,index,now));
 for(const npc of cast){
  const info=npc.resident,workout=info.workout;
  if(info.pendingReply&&now>=info.pendingReply.at){const pending=info.pendingReply,talk=life.conversations.find(item=>item.id===pending.conversationId);say(npc,pending.text,now);if(talk){talk.lines.push({speakerId:npc.id,text:pending.text,at:now});talk.turn=2;talk.status='complete';}delete info.pendingReply;}
  info.speaking=now<info.speechUntil;
  if(now<info.pauseUntil){info.workoutPaused=true;continue;}
  info.workoutPaused=false;info.moving=false;
  if(info.duty==='trainer'){info.phase='working';info.gesture='explain';info.task=labels.coaching;}
  else if(now>=workout.nextAt){
   if(workout.phase==='set'){workout.phase='rest';workout.nextAt=now+8000;workout.reps+=8;life.stats.practices++;remember(info,'training',info.activity,'Completed set '+workout.set+' of '+info.activity+'.',now);}
   else{workout.phase='set';workout.set++;workout.startedAt=now;workout.nextAt=now+26000+info.index*500;}
  }
  if(info.duty!=='trainer'){info.phase=workout.phase==='set'?'practising':'resting';info.gesture=workout.phase==='set'?'fitness-'+info.activity:'fitness-recovery';info.task=workout.phase==='set'?labels[info.activity]:'recovering between '+info.activity+' sets';}
  info.needs.energy=Math.max(30,Math.min(90,info.needs.energy+(workout.phase==='rest'?.7:-.08)*Math.max(0,Math.min(.25,dt))));
  if(now>=info.nextAmbientAt){
   info.nextAmbientAt=now+24000+info.index*2100;
   const partner=cast.filter(other=>other!==npc&&now>=other.resident.speechUntil&&!other.resident.pendingReply&&distance(other.position,npc.position)<28).sort((a,b)=>distance(a.position,npc.position)-distance(b.position,npc.position))[0];
   if(partner)chat(sim,npc,partner,now);
  }
 }
 life.updatedAt=now;
}
export function fitnessResidentDialogue(sim,player,npc,choice,text,now){
 const info=npc.resident,message=short(text),trainer=info.duty==='trainer',interest=FITNESS_STATIONS.find(station=>(message+' '+choice).toLowerCase().includes(station.kind)||message.toLowerCase().includes(station.kind.replaceAll('-',' ')))?.kind;
 const key=FITNESS_ID+'|'+npc.id;player.residentSocial||={};const memory=player.residentSocial[key]||={visits:0,affinity:0,preferences:{},turns:[],lastAt:now};
 let intent=choice,reply='';
 if(/reward|\bmzk\b|coin|wallet/i.test(message))intent='fitness-rewards';
 else if(/technique|how.*(?:lift|box|row|play|train)|timing|control/i.test(message)||interest)intent='fitness-technique';
 else if(/circuit|routine|workout plan/i.test(message))intent='fitness-workout';
 else if(/remember|last time/i.test(message))intent='resident-memory';
 else if(/where|find|directions/i.test(message))intent='question';
 if(interest)memory.preferences.activity=interest;
 if(intent==='fitness-technique')reply=tips[interest||memory.preferences.activity||info.specialties?.[0]||info.activity]||tips['bench-press'];
 else if(intent==='fitness-workout')reply=trainer?(info.specialties?.includes('boxing')?'Try boxing, then agility, then jump rope. Visit Leon between sets for strength or rowing guidance.':'Try bench press, deadlift, rowing, then the balance course. Visit Maya for boxing, agility and jump rope.')+' Walk up to each station and open its training panel for the controls.':'I warm up, work through one station at a time, and take a recovery break after each set. Both trainers can help you find your next activity.';
 else if(intent==='fitness-rewards')reply='Finish a skill challenge at its station to earn a server-verified MZK reward. Your result panel shows your score and the exact reward. Sign in to save eligible rewards to your existing wallet; practice remains available. Replaying a completed result cannot pay it twice.';
 else if(intent==='resident-personality')reply='I am '+info.name+', the '+info.role.toLowerCase()+'. '+info.backstory;
 else if(intent==='resident-activity')reply='Right now I am '+info.task+'. '+(trainer?'I can explain technique, help plan a circuit, or point out the next station.':'I have completed '+Math.max(0,(info.workout?.set||1)-1)+' sets this session.');
 else if(intent==='resident-skills')reply='My training skills are '+Object.entries(info.skills).map(([skill,value])=>skill.replaceAll('-',' ')+' '+Math.round(value)).join(', ')+'. '+(trainer?'Build your own progress by completing accurate, controlled rounds at the gym stations.':'I practise steadily and recover between sets. The coaches can explain each challenge.');
 else if(intent==='resident-staff')reply='Maya Chen coaches boxing, agility and jump rope beside reception. Leon Brooks coaches bench press, deadlift, rowing and balance in the central strength aisle. Both are available for a conversation.';
 else if(intent==='resident-memory')reply=memory.visits?'Welcome back, '+player.username+'. We have spoken '+memory.visits+' time'+(memory.visits===1?'':'s')+'. '+(memory.preferences.activity?'You asked about '+memory.preferences.activity.replaceAll('-',' ')+'. ':'')+'Last time we discussed '+String(memory.topic||'your training').replace('fitness-','').replace('resident-','').replaceAll('-',' ')+'.':'This is our first conversation here. Tell me which activity you want to practise and I will remember it.';
 else if(intent==='question')reply=FITNESS_STATIONS.map(station=>station.name.split(' · ')[0]+' ('+Math.round(distance(npc.position,station.position))+' m)').join('; ')+'. Open the local map for each marked station, then walk to it and use E / Use.';
 else if(intent==='joke')reply='My jump rope asked for a promotion. It said it was tired of being skipped.';
 else if(intent==='thanks')reply='You are welcome, '+player.username+'. Keep your next set controlled and enjoy the gym.';
 else if(intent==='bye')reply='See you around, '+player.username+'. I will be here when you want another training tip.';
 else reply=(memory.visits?'Good to see you again, '+player.username+'. ':'Welcome, '+player.username+'! ')+(info.greeting||'I am '+info.name+'. I am '+info.task+'. Ask either trainer to help plan your next circuit.');
 memory.visits++;memory.affinity=Math.min(100,(memory.affinity||0)+1);memory.lastAt=now;memory.topic=intent;memory.turns=[...(memory.turns||[]),{text:message||choice,intent,at:now}].slice(-6);
 // Keep conversation storage bounded across the complete world, as with the
 // shared resident engine. Friendly guidance alone grants no fitness reward.
 for(const [oldKey]of Object.entries(player.residentSocial).sort((a,b)=>(b[1].lastAt||0)-(a[1].lastAt||0)).slice(32))if(oldKey!==key)delete player.residentSocial[oldKey];
 remember(info,'player-conversation',player.actorId,player.username+' asked about '+intent+'.',now);info.pauseUntil=now+7000;
 return {text:reply,closed:intent==='bye',metadata:{personality:info.personality,backstory:info.backstory,skills:{...info.skills},activity:info.task,relationship:{visits:memory.visits,affinity:memory.affinity,topic:intent,rememberedInterest:memory.preferences.activity||null}}};
}
