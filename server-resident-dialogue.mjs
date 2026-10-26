import {localMapLocations} from './public/js/local-map-locations.js';
import {residentIntelligence,observeResidentInteraction} from './server-resident-life.mjs';
import {residentActivitySummary} from './public/js/resident-activity-summary.js';

export const RESIDENT_DIALOGUE_CHOICES=[
 ['day','How is your day?'],['help','Do you need help?'],['accept','Accept daily objective'],['progress','Daily objective progress'],['confirm','Confirm pickup / check-in'],['resident-activity','What are you doing now?'],['resident-personality','Tell me about yourself'],['resident-skills','Our skills and progress'],['resident-staff','Who else is nearby?'],['resident-memory','What do you remember?'],['joke','Tell me something fun'],['question','Ask about this location'],['thanks','Thank you'],['cancel','Cancel daily objective'],['bye','See you later']
].map(([id,label])=>({id,label}));
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),day=now=>Math.floor(now/86400000);
const activityFrom=text=>{
 const choices=[['basketball',/\b(basketball|hoops)\b/i],['hockey',/\b(hockey|skating)\b/i],['skiing',/\b(ski|skiing|snowboarding)\b/i],['aviation',/\b(flying|aviation|planes|pilot)\b/i],['seamanship',/\b(sailing|boats|boating|marinas)\b/i],['music',/\b(music|singing|dancing|guitar|jazz)\b/i],['construction',/\b(building|construction|machines|cranes)\b/i],['craftsmanship',/\b(crafting|crafts|design|drawing)\b/i],['exploration',/\b(exploring|exploration|walking|hiking|travelling)\b/i],['rangeSafety',/\b(targets|shooting|target practice|range)\b/i],['games',/\b(games|puzzles|arcade)\b/i]];
 return choices.find(([,pattern])=>pattern.test(text))?.[0];
};
const statedInterest=text=>{
 const match=String(text).match(/\b(?:i (?:really )?(?:like|love|enjoy|prefer)|my (?:favorite|favourite)(?: activity| hobby)?(?: is| are)?|i(?:'m| am) into)\s+([^.!?;]{1,70})/i);
 return match?match[1].replace(/[\u0000-\u001f]/g,' ').trim().slice(0,60):null;
};
const describe=value=>String(value||'').replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('-',' ').toLowerCase();
const activityGuidance={
 manufacturing:'Open Factory to choose a fictional missile or cargo rocket project. Walk to Procurement to spend MZK, then visit the marked production stations in order. Dispatch adds the completed item to your existing Backpack. Park vehicles before operating consoles; daily factory favors earn reputation and room score.',
 basketball:'Join a team or watch from the public sideline. Players aim for the opposite hoop and use the court’s shot, pass and steal controls. The court panel shows the current match and available actions.',
 hockey:'Join a team or watch from the stands. Players skate, pass the puck and shoot at the opposite goal using the hockey controls. Keep the rink and its entrances clear when you are observing.',
 iceHockey:'Join a team or watch from the stands. Players skate, pass the puck and shoot at the opposite goal using the hockey controls. Keep the rink and its entrances clear when you are observing.',
 skiing:'Start at the rental and trail information points. Equip skis before a run, follow the signed trails, and use a lift to reach the summit. Race boards and the ski controls explain the active course.',
 aviation:'Use the public terminal and ground-crew areas first. Board a parked available aircraft and review its controls. Check runway clearance and keep the runway clear before attempting takeoff.',
 seamanship:'Use the marked public quays to find an available boat. Board from the dock, review the helm controls, and use the harbor service points. Slow down and anchor safely before leaving the helm.',
 rangeSafety:'Begin in the public preparation or spectator area. The range panel explains free practice, equipment and targets. Join the range activity before using its controls, and stay out of live firing lanes.',
 construction:'Find a parked available machine and review its operating controls. Construction jobs list their own checkpoints. Keep working zones and suspended loads clear, and park safely before getting out.',
 music:'The local stages and lounge areas are good places to listen, meet people and practise. Approach an interactive music or media device to see its own controls, and leave the paths around the stage clear.',
 craftsmanship:'If building is enabled in this room, the Builder tools show what you can place and edit. Start on clear ground, respect other people’s placements, and save your work through the existing map tools.',
 games:'Approach a playable machine and use its interaction button. Each game explains its own rules and controls. You can also watch a round or ask a nearby host before starting.',
 exploration:'Follow the public walking routes, inspect the local signs and use the map to find activity points. Each area’s own panel explains its controls before you join.'
};
function relationship(player,npc,environment,now){
 player.residentSocial ||= {};const key=environment.id+'|'+npc.id;
 const memory=player.residentSocial[key] ||= {visits:0,affinity:0,preferences:{},turns:[],topic:'greeting',lastAt:now};
 for(const [id]of Object.entries(player.residentSocial).sort((a,b)=>(b[1].lastAt||0)-(a[1].lastAt||0)).slice(32))if(id!==key)delete player.residentSocial[id];
 memory.preferences ||= {};memory.turns ||= [];return memory;
}
export function residentProgressView(player){
 const progress=player.residentProgress||{},cosmetics=[...(progress.cosmetics||progress.badges||[])],completedTasks=Number(progress.completedTasks??progress.completedFavors??0);
 return {reputation:Number(progress.reputation||0),skills:{...progress.skills},cosmetics,completedTasks,badges:cosmetics,completedFavors:completedTasks};
}
export function residentFavorReward(task,info){
 const skill=task.kind==='social'?'social':task.kind==='tour'?'observation':task.kind==='supplies'?'hospitality':info.context?.primarySkill||'exploration';
 return {reputation:task.kind==='social'?6:task.kind==='tour'?8:5,skill,xp:task.kind==='tour'?16:12,badge:task.kind==='social'?'Community connector':task.kind==='tour'?'Local discovery guide':task.kind==='supplies'?'Helpful neighbour':info.role+' check-in pin'};
}
export function residentFavorOffer(info,environment,now){
 const variant=(day(now)+(info.index||0))%4,kind=variant===2?'tour':variant===3?'social':variant===0?'check-in':'supplies',score=kind==='check-in'?100:kind==='social'?125:150;
 const title=kind==='tour'?'Daily discovery tour':kind==='social'?'Daily community connection':kind==='check-in'?'Daily activity check-in':'Daily supply favor';
 return {title,description:(kind==='social'?'Meet another resident and ask how their day is going.':kind==='tour'?'Visit two safe public activity points and share what you find.':kind==='supplies'?'Collect the prepared supplies at a public activity point.':'Check a safe public activity point.')+' Then return to '+info.name+' in '+(info.placeName||environment.name||'this map')+'. The local map marks each stop. No MZK purchase is required.',steps:[kind==='social'?'Speak to the marked resident':kind==='tour'?'Check the marked public places':kind==='supplies'?'Collect the prepared supplies':'Visit the marked activity point','Stop safely and confirm each check-in','Return to your contact'],reward:{score,...residentFavorReward({kind},info)}};
}
export function awardResidentFavor(sim,player,npc,environment,task,now){
 const progress=player.residentProgress ||= {reputation:0,skills:{},cosmetics:[],completedTasks:0,completedKeys:[]};
 if((progress.completedKeys||[]).includes(task.id))return false;
 const reward=task.progressReward ||= residentFavorReward(task,npc.resident);
 progress.reputation=Number(progress.reputation||0)+reward.reputation;progress.skills ||= {};progress.skills[reward.skill]=Number(progress.skills[reward.skill]||0)+reward.xp;
 progress.cosmetics ||= [...(progress.badges||[])];if(!progress.cosmetics.includes(reward.badge))progress.cosmetics.push(reward.badge);progress.cosmetics=progress.cosmetics.slice(-32);
 progress.completedTasks=Number(progress.completedTasks??progress.completedFavors??0)+1;progress.completedKeys=[...(progress.completedKeys||[]),task.id].slice(-128);
 observeResidentInteraction(sim,npc.id,{actorId:player.actorId,kind:'favor-complete',text:player.username+' completed a '+task.kind+' favor at '+npc.resident.placeName,skill:reward.skill,requestId:task.id},now);
 return true;
}
function intentFor(choice,text){
 if(['accept','confirm','progress','cancel'].includes(choice))return choice;
 if(!text)return choice.startsWith('resident-')?choice.slice(9):choice;
 if(/\b(remember|last time|told you|said earlier|say earlier)\b/i.test(text))return 'memory';
 if(/\b(bye|goodbye|see you|good night)\b/i.test(text))return 'bye';
 if(/\b(cancel|never mind|changed my mind)\b/i.test(text))return 'cancel';
 if(/\baccept\b|i(?:'ll| will| can) help|let me help/i.test(text))return 'accept';
 if(/\b(confirm|check.?in|finished.*stop|collected.*supplies)\b/i.test(text))return 'confirm';
 if(/\b(progress|next stop|next marker)\b/i.test(text))return 'progress';
 if(statedInterest(text))return 'preference';
 if(/\b(where|find|directions|way to|which area)\b/i.test(text))return 'directions';
 if(/\b(rules?|controls?|how.*play|how.*start|join.*game)\b/i.test(text))return 'rules';
 if(/\b(skill|teach|learn|talent|good at|experience|practise|practice)\b/i.test(text))return 'skills';
 if(/\b(tell me about yourself|backstory|personality|hobbies|interests|why.*work|why.*here|your.*(?:favorite|favourite))\b/i.test(text))return 'personality';
 if(/\b(doing|working on|right now|happening|what happened|news|your plans?|your goals?|your objectives?|your teammates?)\b/i.test(text))return 'activity';
 if(/\b(who else|other residents|who.*help|staff|crew|host|guide)\b/i.test(text))return 'staff';
 if(/\b(help|quest|task|favor|favour|job|errand)\b/i.test(text))return 'help';
 if(/\b(joke|laugh|funny|amusing)\b/i.test(text))return 'joke';
 if(/\b(thank|thanks|appreciate)\b/i.test(text))return 'thanks';
 if(/\b(tired|thirsty|hungry|nervous|new here|first time|first visit)\b/i.test(text))return 'comfort';
 if(/how are you|how.*day|hello|\bhi\b/i.test(text))return 'day';
 return /\?|what|how/i.test(text)?'question':'followup';
}
function currentActivity(sim,npc,intelligence){
 const info=npc.resident,plans=residentActivitySummary(info,sim.actors),goal=intelligence.goal||info.goal,target=goal?.targetId&&sim.actors[goal.targetId]?.resident;
 if(npc.aiTask?.status==='active'||info.machineWork?.status==='active')return 'Right now I am '+(info.machineWork?.message||npc.aiTask?.message||info.task||'finishing a requested job')+'.';
 if(plans.shared){const work=plans.shared;return 'Right now I am working with '+work.partnerName+' on '+work.title.toLowerCase()+'. '+(work.responsibility?'My part is to '+work.responsibility.replace(/^[A-Z]/,letter=>letter.toLowerCase())+'. ':work.stage?'We are at '+work.stage.toLowerCase()+'. ':'')+'We are '+Math.floor(work.progress*100)+'% through our task.';}
 if(plans.objective?.status==='active'){const work=plans.objective;return 'Right now I am working on '+work.title.toLowerCase()+'. '+(work.current?'My next stop is '+work.current+'. ':'')+(work.total?'I have completed '+work.index+' of '+work.total+' steps. ':'')+(plans.completedObjectives?'I have finished '+plans.completedObjectives+' personal objective'+(plans.completedObjectives===1?'':'s')+' here.':'');}
 let reply='Right now I am '+(intelligence.activity||info.task||'checking the public area')+'.';
 if(target)reply+=' I plan to catch up with '+target.name+' next.';
 else if(goal?.reason)reply+=' '+goal.reason+(/\.$/.test(goal.reason)?'':'.');
 const memory=(intelligence.memory||info.memory||[]).filter(item=>item.text&&!/player-conversation/.test(item.kind||'')).at(-1);
 if(memory)reply+=' '+memory.text;
 return reply;
}
function directionReply(environment,npc,text){
 const places=localMapLocations(environment),terms=text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(term=>term.length>3&&!['where','there','find','which','this','about','would','could'].includes(term));
 const matched=places.filter(place=>terms.some(term=>(place.name+' '+(place.description||'')).toLowerCase().includes(term))).slice(0,3);
 if(matched.length)return matched.map(place=>{const dx=place.x-npc.position.x,dz=place.z-npc.position.z,heading=Math.abs(dx)>Math.abs(dz)?dx>0?'east':'west':dz>0?'south':'north';return place.name+' is '+Math.round(gap(place,npc.position))+' metres '+heading+' of us.';}).join(' ')+' The local map shows the safe approaches and markers.';
 return 'This is '+npc.resident.placeName+' in '+(environment.name||environment.id)+'. '+(places.length>1?'The local map also lists '+places.slice(0,4).map(place=>place.name).join(', ')+'. ':'')+'Use the marked public routes and keep active play and working areas clear.';
}
export function residentDialogue(sim,player,npc,environment,choice,text,now){
 const info=npc.resident,memory=relationship(player,npc,environment,now),message=String(text||'').trim().slice(0,180),intent=intentFor(choice,message),intelligence=residentIntelligence(info)||{},interest=activityFrom(message)||statedInterest(message),inherited=player.residentPreferences?.interest,visits=memory.visits||0,variant=visits%3;
 let reply='',offer=null;
 if(intent==='preference'){
  memory.preferences.activity=interest;player.residentPreferences={...player.residentPreferences,interest};
  reply=['I will remember your interest in ','Then we have a good starting point: ','Good to know you enjoy '][variant]+describe(interest)+'. '+(info.context?.primarySkill===interest?'That connects with my work here. ':'')+'Do you enjoy learning the details or getting straight into an activity?';
 }else if(intent==='memory')reply=visits?'Good to see you again, '+player.username+'. We have spoken '+visits+' time'+(visits===1?'':'s')+'. '+(memory.preferences.activity?'You told me you enjoy '+describe(memory.preferences.activity)+'. ':inherited?'Our hosts remember your interest in '+describe(inherited)+'. ':'')+(memory.preferences.pace?'You prefer '+memory.preferences.pace+'. ':'')+'We were last talking about '+describe(memory.topic)+'.':(inherited?'Our hosts note that you enjoy '+describe(inherited)+'. ':'')+'This is our first conversation here. Tell me what interests you, and I can keep it in mind.';
 else if(intent==='personality'){
  const identity=residentActivitySummary(info,sim.actors);
  const story=String(intelligence.backstory||'').replace(new RegExp('^'+info.name.split(' ')[0]+'\\b'),'I').replace(/^I is\b/,'I am');
  reply='I am '+info.name+', the '+info.role.toLowerCase()+' at '+info.placeName+'. '+(story||'I enjoy helping visitors discover this area at their own pace.')+(intelligence.personality?' People describe me as '+String(intelligence.personality).toLowerCase()+'.':'')+(intelligence.preferences?.conversation?' I like talking about '+intelligence.preferences.conversation+'.':'');
  const habit=identity.quirk.replace(/\b(keeps|counts|celebrates|asks|collects|likes)\b/g,word=>({keeps:'keep',counts:'count',celebrates:'celebrate',asks:'ask',collects:'collect',likes:'like'})[word]);
  reply+=(identity.form?' I am '+(identity.form==='Automaton'?'an ':'a ')+identity.form.toLowerCase()+'.':'')+(identity.ambition&&!story.includes(identity.ambition)?' My ambition is to '+identity.ambition.replace(/^[A-Z]/,letter=>letter.toLowerCase())+'.':'')+(habit?' I '+habit+'.':'');
 }else if(intent==='activity')reply=currentActivity(sim,npc,intelligence);
 else if(intent==='rules')reply=(activityGuidance[interest||info.context?.primarySkill]||activityGuidance.exploration)+' I can explain the area or help you find its public activity point. You can inspect an activity before deciding to join.';
 else if(intent==='skills'){
  const strongest=Object.entries(intelligence.skills||info.skills||{}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,value])=>describe(name)+' '+Math.round(value));
  const progress=residentProgressView(player);
  reply='My strongest skills are '+(strongest.join(', ')||'observation, hospitality and listening')+'. I practise through my work and short drills here. '+(activityGuidance[interest]?activityGuidance[interest]+' ':'')+'Your reputation is '+progress.reputation+' with '+progress.completedTasks+' completed local favors. '+(Object.keys(progress.skills).length?'Your experience: '+Object.entries(progress.skills).map(([name,value])=>describe(name)+' '+value+' XP').join(', ')+'. ':'You can gain experience by completing a local favor. ')+'These skills record practice; a conversation does not change your wallet or take control of a live game.';
 }else if(intent==='staff'){
  const cast=Object.values(sim.actors).filter(actor=>actor!==npc&&actor.resident&&!actor.resident.casino&&actor.active!==false).sort((a,b)=>gap(a.position,npc.position)-gap(b.position,npc.position)).slice(0,4);
  reply=cast.length?cast.map(actor=>actor.resident.name+' is a '+actor.resident.role.toLowerCase()+' near '+actor.resident.placeName).join('; ')+'. Approach them and ask about their work.':'I am the resident on this part of the map right now. I can explain this location and offer a small favor.';
 }else if(intent==='directions')reply=directionReply(environment,npc,message);
 else if(intent==='help'){
  offer=residentFavorOffer(info,environment,now);reply=info.ask+' '+offer.description+' Choose Accept daily objective to help. You can also explore this map’s activities in Quests.';
 }else if(intent==='joke')reply=['Ha! My warm-up lap became a sightseeing tour. That is my kind of route planning.','I brought a snack for a quick break. The snack has finished its task; the break is still working on it.','A smile is the only leaderboard entry I can improve while standing still.'][variant];
 else if(intent==='thanks')reply=(visits>3?'It is always good to see you, ':'You are welcome, ')+player.username+'. '+(player.residentTask?.status==='active'?'Your next stop is '+player.residentTask.checkpoints[player.residentTask.index].name+'.':'Thank you for taking an interest in our community.');
 else if(intent==='bye')reply='See you around, '+player.username+'! Enjoy '+info.placeName+'.'+(memory.preferences.activity?' I will remember your interest in '+describe(memory.preferences.activity)+'.':'');
 else if(intent==='comfort'){
  const pace=/new|first/i.test(message)?'a gentle introduction':'an easy pace';memory.preferences.pace=pace;player.residentPreferences={...player.residentPreferences,pace};reply='We can take this at '+pace+'. There is no need to rush into an activity. '+directionReply(environment,npc,'')+' I can explain my work or offer a small check-in when you are ready.';
 }else if(!['accept','progress','confirm','cancel'].includes(intent)){
  if(/slow|quiet|take my time/i.test(message)){memory.preferences.pace='an easy pace';player.residentPreferences={...player.residentPreferences,pace:'an easy pace'};}
  reply=intent==='question'?'This is '+info.placeName+'. I am '+info.name+', the '+info.role.toLowerCase()+'. '+currentActivity(sim,npc,intelligence)+' The local map shows nearby activities, vehicles and quests.':(visits?'Good to see you again, ':'Hi ')+player.username+'! '+currentActivity(sim,npc,intelligence)+' '+(memory.preferences.activity||inherited?'Are you finding opportunities for '+describe(memory.preferences.activity||inherited)+'?':'Would you like to know about the area, my work, or a local favor?');
 }
 memory.visits=visits+1;memory.affinity=Math.min(100,Math.max(-20,Number(memory.affinity||0)+(/\b(idiot|stupid|hate you)\b/i.test(message)?-2:1)));memory.lastAt=now;memory.topic=intent;memory.lastPlayerMessage=message||choice;memory.turns=[...memory.turns,{text:message||choice,intent,at:now}].slice(-6);
 observeResidentInteraction(sim,npc.id,{actorId:player.actorId,kind:'player-conversation',text:player.username+' asked about '+intent,skill:'social',requestId:'conversation:'+player.actorId+':'+npc.id+':'+now},now);
 return {intent,text:reply,metadata:{relationship:{visits:memory.visits,affinity:memory.affinity,topic:intent,rememberedInterest:memory.preferences.activity||inherited||null},personality:intelligence.personality||info.personality||'',backstory:intelligence.backstory||'',skills:intelligence.skills||info.skills||{},activity:intelligence.activity||info.task||'',taskOffer:offer}};
}
