import {isPrisonEnvironment} from './public/js/prison-config.js';
import {isForgeEnvironment} from './public/js/forge-config.js';
import {stepForgeResidents} from './server-forge-residents.mjs';
import {isFunhouseEnvironment} from './public/js/clown-funhouse-config.js';
import {residentIdentity} from './public/js/resident-personalities.js';
import {stepCommunityLife} from './server-community-life.mjs';
import {localMapLocations} from './public/js/local-map-locations.js';
import {harborWaterAt} from './public/js/harbor-water.js';
import {questRadio} from './server-quest-radio.mjs';
import {isCasinoEnvironment} from './public/js/casino-config.js';
import {stepCasinoResidents} from './server-casino-residents.mjs';
import {isFitnessEnvironment} from './public/js/fitness-config.js';
import {stepFitnessResidents,fitnessResidentDialogue,FITNESS_DIALOGUE_CHOICES} from './server-fitness-residents.mjs';
import {isFactoryEnvironment} from './public/js/missile-factory-config.js';
import {stepFactoryResidents} from './server-factory-residents.mjs';
import {casinoDialogue,CASINO_DIALOGUE_CHOICES} from './server-casino-dialogue.mjs';
import {ensureResidentIntelligence,stepResidentLife,archiveResidentIntelligence,residentActivityRestricted,observeResidentInteraction} from './server-resident-life.mjs';
import {residentDialogue,residentDialogueIntent,RESIDENT_DIALOGUE_CHOICES,residentFavorReward,awardResidentFavor} from './server-resident-dialogue.mjs';
import {aiConversationActions,attachAIConversation,performAIConversation} from './server-ai-interactions.mjs';
import {residentActivityInvitation} from './server-resident-invitations.mjs';
const colors=['#daab62','#699dba','#a580b9','#799f7c','#cc8372','#67aaa7'];
const gap=(a,b)=>Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z),day=now=>Math.floor(now/86400000);
const choices=RESIDENT_DIALOGUE_CHOICES;
const clownResidentModels=['funhouse-ringmaster-avatar','funhouse-juggler-avatar','funhouse-greeter-avatar','funhouse-driver-avatar','funhouse-scare-clown-avatar'];
function applyFunhouseResidentTheme(sim,environment){
 const themed=isFunhouseEnvironment(environment);
 for(const npc of Object.values(sim.actors||{})){
  if(!npc.resident)continue;
  if(themed){let seed=0;for(const character of String(npc.id))seed=(Math.imul(seed,31)+character.charCodeAt(0))>>>0;npc.resident.funhouseClown=true;npc.resident.funhouseClownModelId=clownResidentModels[seed%clownResidentModels.length];}
  else{delete npc.resident.funhouseClown;delete npc.resident.funhouseClownModelId;}
 }
}
export function residentActivity(place){const text=place.name.toLowerCase();if(/construction|excavat|site crew|steel|crane/.test(text))return {role:'Site coordinator',task:'preparing materials and coordinating safe crew handovers',prop:'clipboard',ask:'Can you check the supply board and help prepare the next handover?'};if(/basketball|court|hockey|arena/.test(text))return {role:'Activity host',task:'practising and cheering on players',prop:'ball',ask:'Want to help welcome someone to the activity space?'};if(/ski|lift|château|chateau|lodge/.test(text))return {role:'Resort host',task:'checking trail supplies and helping guests',prop:'clipboard',ask:'Could you check the local supply point before your next run?'};if(/airport|runway|hangar/.test(text))return {role:'Ground crew',task:'organising equipment and briefing pilots',prop:'clipboard',ask:'Can you help check our equipment station?'};if(/dock|marina|harbo/.test(text))return {role:'Dock crew',task:'sorting supplies and welcoming crews',prop:'crate',ask:'Could you help with a small dock supply run?'};if(/music|main floor|stage|lounge/.test(text))return {role:'Community musician',task:'rehearsing and enjoying the music',prop:'music',ask:'Would you check the activity board and come back for a chat?'};if(/range|firing/.test(text))return {role:'Training guide',task:'checking equipment and supporting practice',prop:'clipboard',ask:'Could you check the preparation area while I help the next player?'};return {role:'Local explorer',task:'organising supplies and exploring this space',prop:'crate',ask:'Could you check a nearby activity space and help me with supplies?'};}
function safePoint(environment,point,collision,sim,objects){if(harborWaterAt(environment,point,.6)||residentActivityRestricted(environment,point,sim))return null;const floor=collision?.groundAt?collision.groundAt(environment,point,{entry:true,actors:sim.actors,objects,earthworks:sim.construction?.earthworks}):point;if(!floor||collision?.hasBodyClearance&&!collision.hasBodyClearance(environment,floor,.45,{actors:sim.actors,objects,earthworks:sim.construction?.earthworks}))return null;return {x:floor.x??point.x,y:floor.y||0,z:floor.z??point.z};}
function residentHome(environment,place,index,slot,collision,sim,objects){
 const initial=/runway|court|firing lane/i.test(place.name)?[(place.width||16)/2+4,(place.width||16)/2+7]:[3.5,6,9],angle=(index+slot*3)*1.7;
 const acceptPoint=candidate=>{const point=safePoint(environment,candidate,collision,sim,objects);return point&&!Object.values(sim.actors).some(actor=>actor.position&&actor.active!==false&&gap(actor.position,point)<1.4)?point:null;};
 const accept=(radius,yaw)=>acceptPoint({x:place.x+Math.cos(yaw)*radius,y:place.y||0,z:place.z+Math.sin(yaw)*radius});
 const layout=environment.builderScene?.layout||environment.layout,sport=environment.basketball===true||environment.basketballCourt===true||['basketball','hockey'].includes(environment.game)||['basketball-arena','basketball-stadium','hockey-arena'].includes(layout)||environment.id==='basketball-arena';
 // A single sports arrival can be separated from its opposite public edge by
 // the whole playing surface. Keep a second host on the same safe sideline so
 // local social goals remain reachable without crossing the active court.
 if(slot>0&&sport&&localMapLocations(environment).length===1)for(const host of Object.values(sim.actors).filter(actor=>actor.active!==false&&actor.resident?.locationIndex===index))for(const radius of [2.5,3.25,4])for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI/4,Math.PI*.75,Math.PI*1.25,Math.PI*1.75]){const home=acceptPoint({x:host.position.x+Math.cos(yaw)*radius,y:host.position.y,z:host.position.z+Math.sin(yaw)*radius});if(home&&Math.abs(home.y-host.position.y)<.4)return home;}
 for(const radius of initial){const home=accept(radius,angle);if(home)return home;}
 // Native courts and ranges can have a narrow public concourse on one side
 // of their entry. Search the remaining directions before giving up; a safe
 // sideline matters more than preserving a decorative radial arrangement.
 for(const radius of [...new Set([...initial,12,16,22,30])])for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI/4,Math.PI*.75,Math.PI*1.25,Math.PI*1.75]){const home=accept(radius,yaw);if(home)return home;}
 return null;
}
function residents(sim){return Object.values(sim.actors).filter(a=>a.resident&&a.active!==false);}
function line(sim,player,npc,now,text,human=false){const q=player.npcConversation,call=questRadio(sim,now,human?player.username:npc.resident.name,text,{conversation:true,interaction:true,questInstance:q.instanceId,recipients:[player.actorId],speakerId:human?player.actorId:npc.id,role:human?'player':npc.resident.role,voice:human?'player':npc.resident.name});q.conversation.push(call);q.conversation=q.conversation.slice(-8);if(!human&&npc.crewWorker){npc.crewWorker.speech=text;npc.crewWorker.speechRecipients=[player.actorId];npc.crewWorker.speechUntil=now+7000;}if(!human){npc.resident.speech=text;npc.resident.speechRecipients=[player.actorId];npc.resident.speechUntil=now+7000;npc.resident.speaking=true;npc.resident.gesture=/ha!|laugh|fun|smile/i.test(text)?'laugh':'talk';npc.resident.pauseUntil=now+5000;}}
function openConversation(sim,player,npc,now){const previous=player.npcConversation;player.npcConversation={type:'resident',entityId:npc.id,instanceId:'resident:'+npc.id+':'+day(now),status:'active',contact:{name:npc.resident.name,role:npc.resident.role,channel:'Local conversation',color:npc.resident.color},dialogueChoices:npc.resident.casino?CASINO_DIALOGUE_CHOICES:npc.resident.fitness?FITNESS_DIALOGUE_CHOICES:choices,conversation:previous?.entityId===npc.id?previous.conversation||[]:[],...(previous?.entityId===npc.id?{aiWorkContext:previous.aiWorkContext}:{})};}
export function crewResident(sim,id){
 const worker=sim.construction?.crew?.workers?.find(worker=>worker.id===id);if(!worker)return null;
 const job=sim.construction.crew.jobs.find(job=>job.id===worker.jobId),profile={...residentActivity({name:'Construction crew reception'}),name:worker.name,role:worker.role,index:sim.construction.crew.workers.indexOf(worker),home:worker.home||worker.position,placeName:'Construction site',color:'#b6e94d',task:job?(job.label+' · '+worker.message):worker.message||'preparing the next safe handover',ask:'Could you check the site supply board and report back? You can assign my machine jobs in Crew / Jobs.',mood:'thoughtful'};
 worker.socialResident||={};Object.assign(worker.socialResident,profile);return {id:worker.id,position:worker.position,active:true,resident:worker.socialResident,crewWorker:worker};
}
const residentPosition=(sim,id)=>sim.actors[id]?.position||crewResident(sim,id)?.position;
function invitationDestination(environment,place,collision,sim,objects){
 const radius=Math.max(Number(place.width)||8,Number(place.depth)||8)/2+2;
 for(const [dx,dz]of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius],[3,3],[-3,-3]]){
  const point=safePoint(environment,{x:place.x+dx,y:place.y||0,z:place.z+dz},collision,sim,objects);
  if(point&&Math.abs(point.y-(place.y||0))<1.2)return point;
 }
 return null;
}
function endVisit(player,status,message,now){
 const visit=player.residentVisit;if(visit?.status==='active'){visit.status=status;visit.message=message;visit.finishedAt=now;}
 const invitation=player.residentInvitation;if(invitation&&['offered','joined'].includes(invitation.status)){invitation.status=status;invitation.message=message;}
}
function updateResidentVisits(sim,environment,now){
 const places=localMapLocations(environment);
 for(const player of Object.values(sim.players||{})){
  const invitation=player.residentInvitation,visit=player.residentVisit;
  if(invitation?.status==='offered'&&(invitation.worldId!==environment.id||now>=invitation.expiresAt)){invitation.status=invitation.worldId===environment.id?'expired':'cancelled';}
  if(visit?.status!=='active')continue;
  if(visit.worldId!==environment.id||(player.movementRevision||0)!==visit.revision)endVisit(player,'cancelled','World travel ended this activity visit.',now);
  else if(now>=visit.deadline)endVisit(player,'expired','This visit has ended. Ask a resident for another suggestion.',now);
  else {
   const place=places.find(place=>(place.id||place.name)===visit.locationId);
   if(!place)endVisit(player,'cancelled','This public activity is no longer on the map.',now);
   else if(visit.locationPosition&&gap({...place,y:place.y||0},visit.locationPosition)>.1)endVisit(player,'cancelled','This activity moved. Ask for a new suggestion.',now);
  }
 }
}
function residentVisitReply(sim,player,npc,environment,intent,now,{collision,objects}){
 const invitation=player.residentInvitation,visit=player.residentVisit;
 if(intent==='invite'||intent==='other'){
  if(invitation?.residentId===npc.id&&invitation.status==='offered'&&now<invitation.expiresAt&&intent==='invite')return invitation.description+' Choose Join suggested activity if you would like to go.';
  const offer=residentActivityInvitation(environment,npc,player,now,{excludeLocationId:intent==='other'?invitation?.locationId:undefined,resolveDestination:place=>invitationDestination(environment,place,collision,sim,objects)});
  if(!offer)return 'I cannot find '+(intent==='other'?'another ':'a ')+'clear public activity point right now. We can chat here or try another suggestion later.';
  player.residentInvitation=offer;
  return offer.description+' Choose Join suggested activity to mark the visit, or ask for something different. There is no purchase or automatic game entry.';
 }
 if(intent==='decline'){
  if(invitation?.residentId===npc.id&&invitation.status==='offered')invitation.status='declined';
  player.residentInviteCooldownUntil=now+120000;
  return 'Of course. We can just talk, or you can explore at your own pace. I will give you some space before suggesting another activity.';
 }
 if(intent==='join'){
  if(invitation?.residentId!==npc.id||invitation.worldId!==environment.id||!['offered','joined'].includes(invitation.status)||now>=invitation.expiresAt)throw Error('Ask this resident for a fresh activity suggestion first.');
  if(invitation.status==='joined'&&visit?.status==='active'&&visit.id===invitation.id)return 'Your visit is already marked: '+visit.checkpoints[visit.index].name+'.';
  const place=localMapLocations(environment).find(place=>(place.id||place.name)===invitation.locationId);
  const destination=place&&invitationDestination(environment,place,collision,sim,objects);
  if(!destination){invitation.status='cancelled';throw Error('The public approach is no longer clear. Ask for something different.');}
  if(visit?.status==='active'){visit.status='cancelled';visit.message='You chose another activity visit.';visit.finishedAt=now;}
  invitation.status='joined';invitation.destination={...destination,name:place.name};
  player.residentVisit={id:invitation.id,residentId:npc.id,worldId:environment.id,locationId:invitation.locationId,locationPosition:{x:place.x,y:place.y||0,z:place.z},title:invitation.title,status:'active',revision:player.movementRevision||0,index:0,startedAt:now,deadline:now+600000,checkpoints:[{...destination,name:'Visit '+place.name,radius:4,action:'resident-visit-confirm'}]};
  return 'Great! I have marked the public approach to '+place.name+'. Walk there and confirm your arrival. Its own activity controls let you choose whether to play or watch; you can end this visit at any time.';
 }
 if(intent==='visit-cancel'){
  if(visit?.residentId!==npc.id||visit.status!=='active')return 'There is no active visit with me right now. Ask what we can do together for another suggestion.';
  endVisit(player,'cancelled','You ended this activity visit.',now);player.residentInviteCooldownUntil=now+120000;
  return 'No problem. The visit marker is cleared. We can try something else when you are ready.';
 }
 if(intent==='visit-confirm'){
  if(visit?.residentId!==npc.id||visit.worldId!==environment.id||visit.status!=='active')throw Error('Join a suggested activity before confirming your arrival.');
  if((player.movementRevision||0)!==visit.revision){endVisit(player,'cancelled','World travel ended this activity visit.',now);throw Error('Travel ended this visit. Ask for another suggestion.');}
  if(now>=visit.deadline){endVisit(player,'expired','This activity visit has expired.',now);throw Error('This visit has expired. Ask for another suggestion.');}
  const point=visit.checkpoints[visit.index],place=localMapLocations(environment).find(place=>(place.id||place.name)===visit.locationId),floor=place&&safePoint(environment,point,collision,sim,objects);
  if(!floor||Math.abs(floor.y-point.y)>=1.2||visit.locationPosition&&gap({...place,y:place.y||0},visit.locationPosition)>.1){endVisit(player,'cancelled','The public approach changed.',now);throw Error('The activity approach has changed. Ask for another suggestion.');}
  if(player.vehicleId||player.grounded===false||gap(player.position,point)>point.radius||Math.abs((player.position.y||0)-point.y)>=1.2)throw Error('Walk to the marked public activity point on the same floor and stop safely before confirming.');
  if(now-visit.startedAt<1200)throw Error('Take a moment to reach the public activity point.');
  visit.index++;endVisit(player,'completed','You arrived at '+place.name+'. Use the local activity controls to join or watch.',now);
  observeResidentInteraction(sim,npc.id,{actorId:player.actorId,kind:'activity-complete',text:player.username+' explored '+place.name,skill:'exploration',requestId:visit.id},now);
  return 'You made it to '+place.name+'! Take a look at the local activity controls and choose whether to join or watch. Tell me what you discover next time we chat.';
 }
 return null;
}
export function residentCommand(sim,player,environment,command,now,{collision,objects={},constructionContext}={}){
 const npcId=command.entityId||player.npcConversation?.entityId,npc=sim.actors[npcId]||crewResident(sim,npcId);if(!npc?.resident||npc.active===false)throw Error('That resident is no longer in this location.');
 const choice=String(command.choice||'day'),text=String(command.text||'').trim().slice(0,180),availableChoices=npc.resident.fitness?FITNESS_DIALOGUE_CHOICES:npc.resident.casino?[...choices,...CASINO_DIALOGUE_CHOICES]:choices;if(!availableChoices.some(c=>c.id===choice)&&choice!=='talk'&&!aiConversationActions(sim,player,npc,environment,now).some(action=>action.id===choice))throw Error('Choose a listed conversation action.');
 if(npc.resident.casino&&['accept','progress','confirm','cancel'].includes(choice))throw Error('Casino staff offer game guidance and conversation; daily reward objectives are unavailable here.');
 const conversationIntent=residentDialogueIntent(choice,text),visit=player.residentVisit;
 const invitation=player.residentInvitation,task=player.residentTask,remote=invitation?.residentId===npc.id&&invitation.worldId===environment.id&&invitation.status==='offered'&&conversationIntent==='decline'||visit?.residentId===npc.id&&visit.status==='active'&&['visit-confirm','visit-cancel'].includes(conversationIntent)||task?.residentId===npc.id&&task.status==='active'&&['progress','confirm','cancel'].includes(choice)||npc.resident.casino&&player.casinoTask?.residentId===npc.id&&player.casinoTask.status==='active'&&['casino-progress','casino-confirm','casino-cancel'].includes(choice);
 if(player.health<=0||now-player.lastSeen>15000)throw Error('Join the live world before speaking.');if(!remote&&(gap(player.position,npc.position)>10||Math.abs((player.position.y||0)-(npc.position.y||0))>=1.2))throw Error('Move closer on the same public floor to speak to this resident.');if(now<(player.residentReplyAt||0)+900)throw Error('Let the resident finish their reply.');player.residentReplyAt=now;
 if(task?.status==='active'&&task.socialTargetId===npc.id&&!['confirm','progress'].includes(choice))task.metResident=true;
 openConversation(sim,player,npc,now);line(sim,player,npc,now,text||[...choices,...CASINO_DIALOGUE_CHOICES].find(c=>c.id===choice)?.label||'Hello!',true);
 player.residentMet||={};const met=!!player.residentMet[npc.id];player.residentMet[npc.id]=now;
 const info=npc.resident;let reply='';let intent=choice;
 attachAIConversation(sim,player,npc,environment,player.npcConversation,now);
 const aiReply=performAIConversation(sim,player,npc,environment,player.npcConversation,{choice,text},now,constructionContext||{collision,objects,environment});
 if(aiReply!==null){line(sim,player,npc,now,aiReply);return info.name+' replied.';}

 if(info.casino){const response=casinoDialogue(sim,player,npc,choice,text,now);player.npcConversation.casino=response.metadata;if(response.closed)player.npcConversation.status='closed';line(sim,player,npc,now,response.text);return info.name+' replied.';}
 if(info.fitness){const response=fitnessResidentDialogue(sim,player,npc,choice,text,now);player.npcConversation.residentContext=response.metadata;if(response.closed)player.npcConversation.status='closed';line(sim,player,npc,now,response.text);return info.name+' replied.';}
 ensureResidentIntelligence(sim,npc,environment,now);
 if(npc.crewWorker){info.role=npc.crewWorker.role;info.task=crewResident(sim,npc.id).resident.task;info.placeName='Construction site';}
 const response=residentDialogue(sim,player,npc,environment,choice,text,now);intent=response.intent;player.npcConversation.residentContext=response.metadata;
 const visitReply=residentVisitReply(sim,player,npc,environment,intent,now,{collision,objects});
 if(visitReply!==null)reply=visitReply;
 else if(intent==='accept'){
  if(task?.status==='active')throw Error('Finish or cancel your current daily objective first.');const key=environment.id+':'+npc.id+':'+day(now);player.residentDaily||={};if(player.residentDaily[key])throw Error('You already completed this resident’s objective today. Try another resident.');
  const candidates=localMapLocations(environment).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.hypot(p.x-npc.position.x,p.z-npc.position.z)>6).sort((a,b)=>gap(a,npc.position)-gap(b,npc.position));let destination=null;
  for(const place of candidates.slice(0,5)){const position=safePoint(environment,{x:place.x,y:place.y||0,z:place.z},collision,sim,objects);if(position){destination={...position,name:place.name};break;}}
  if(!destination){const position=safePoint(environment,{x:info.home.x+6,y:info.home.y,z:info.home.z+3},collision,sim,objects);if(position)destination={...position,name:info.placeName+' supply point'};}if(!destination)throw Error('The local supply point is blocked. Try another resident.');
  const survey=(day(now)+info.index)%2===0;player.residentTask={id:key,residentId:npc.id,title:survey?'Daily activity check-in':'Daily supply favor',status:'active',revision:player.movementRevision||0,kind:survey?'check-in':'supplies',index:0,startedAt:now,deadline:now+900000,reward:survey?100:150,checkpoints:[{...destination,name:(survey?'Check in at ':'Collect supplies at ')+destination.name,action:'confirm',radius:4},{...npc.position,name:'Return to '+info.name,actorId:npc.id,action:'confirm',radius:4}]};const variant=(day(now)+info.index)%4,accepted=player.residentTask;if(variant===2){const extra=candidates.find(p=>Math.hypot(p.x-destination.x,p.z-destination.z)>5);if(extra){const floor=safePoint(environment,{x:extra.x,y:extra.y||0,z:extra.z},collision,sim,objects);if(floor){accepted.kind='tour';accepted.title='Daily discovery tour';accepted.reward=150;accepted.checkpoints.splice(1,0,{...floor,name:'Check in at '+extra.name,action:'confirm',radius:4});}}}else if(variant===3){const friend=residents(sim).find(a=>a.id!==npc.id&&gap(a.position,npc.position)<50);if(friend){accepted.kind='social';accepted.title='Daily community connection';accepted.reward=125;accepted.socialTargetId=friend.id;accepted.checkpoints[0]={...friend.position,name:'Speak to '+friend.resident.name,actorId:friend.id,action:'confirm',radius:4};}}
  if(info.factory)player.residentTask.title=({supplies:'Factory parts handover','check-in':'Factory station inspection',tour:'Factory quality walk',social:'Factory crew handover'})[player.residentTask.kind]||'Factory shift favor';
  player.residentTask.progressReward=residentFavorReward(player.residentTask,info);
  reply='Thank you! '+player.residentTask.checkpoints[0].name+'. Stop there, confirm on your local map, then come back to me. Your daily reward is '+player.residentTask.reward+' score, plus '+player.residentTask.progressReward.reputation+' reputation and '+player.residentTask.progressReward.xp+' '+player.residentTask.progressReward.skill+' experience.';
 }else if(intent==='cancel'){if(task?.status==='active'&&task.residentId===npc.id)task.status='cancelled';reply='No problem. Thank you for letting me know. We can try another time.';
 }else if(intent==='confirm'){
  if(!task||task.status!=='active'||task.residentId!==npc.id)throw Error('Accept this resident’s daily objective first.');if((player.movementRevision||0)!==task.revision)throw Error('Travel reset this daily objective. Ask for a new one.');if(now>task.deadline)throw Error('This daily objective has expired.');const point=task.checkpoints[task.index],target=point.actorId?residentPosition(sim,point.actorId):point,vehicle=sim.actors[player.vehicleId];if(!target||gap(player.position,target)>point.radius||Math.abs(vehicle?.driving?.speed||vehicle?.boating?.speed||vehicle?.flight?.speed||0)>.8||vehicle?.flight?.airborne)throw Error('Reach the daily marker and stop safely before confirming.');if(task.index===0&&task.kind==='social'&&!task.metResident)throw Error('Speak with the marked resident before checking in.');if(now-task.startedAt<2000)throw Error('Take a moment to reach the objective.');task.index++;
  if(task.index===task.checkpoints.length){if(player.residentDaily[task.id])throw Error('Today’s reward has already been collected.');player.residentDaily[task.id]=true;task.status='completed';task.finishedAt=now;player.score=(player.score||0)+task.reward;awardResidentFavor(sim,player,npc,environment,task,now);reply='You did it! Thanks for helping our community. +'+task.reward+' score, +'+task.progressReward.reputation+' reputation and +'+task.progressReward.xp+' '+task.progressReward.skill+' experience. You earned the '+task.progressReward.badge+'. Shall we take a well-earned break?';info.gesture='cheer';}else reply='Confirmed! Please '+task.checkpoints[task.index].name.toLowerCase()+'. I will wait for you here.';
 }else if(intent==='progress')reply=task?.status==='active'?task.checkpoints[task.index].name+'. '+Math.max(0,Math.ceil((task.deadline-now)/60000))+' minutes left. The daily marker is live on your map.':task?.status==='completed'?'Your daily favor is complete. Thank you! Other residents may need a hand.':'No daily objective accepted yet. Ask whether I need help.';
 else{reply=response.text;if(intent==='bye')player.npcConversation.status='closed';}
 player.npcConversation.residentContext.invitation=player.residentInvitation?.residentId===npc.id?player.residentInvitation:null;
 player.npcConversation.residentContext.visit=player.residentVisit?.residentId===npc.id?player.residentVisit:null;
 line(sim,player,npc,now,reply);if(response.metadata.gesture)info.gesture=response.metadata.gesture;if(intent==='confirm'&&player.residentTask?.status==='completed')info.gesture='cheer';return info.name+' replied.';
}
export function stepWorldResidents(sim,environment,now,dt,{collision,objects={}}={}){
 updateResidentVisits(sim,environment,now);
 if(isPrisonEnvironment(environment))return;
 applyFunhouseResidentTheme(sim,environment);
 if(sim.residentUpdatedAt!=null&&now-sim.residentUpdatedAt<150)return;dt=Math.min(.25,sim.residentUpdatedAt==null?dt:(now-sim.residentUpdatedAt)/1000);sim.residentUpdatedAt=now;
 if(isCasinoEnvironment(environment)){stepCasinoResidents(sim,environment,now,dt,{collision,objects});return;}
 if(isFitnessEnvironment(environment)){stepFitnessResidents(sim,environment,now,dt,{collision,objects});return;}
 if(isFactoryEnvironment(environment)){stepFactoryResidents(sim,environment,now,dt,{collision,objects});return;}
 if(isForgeEnvironment(environment)){stepForgeResidents(sim,environment,now,dt,{collision,objects});return;}
 const available=localMapLocations(environment).map((place,index)=>({place,index})).filter(({place:p})=>Number.isFinite(p.x)&&Number.isFinite(p.z)),players=Object.values(sim.players||{}).filter(p=>p.health>0&&now-p.lastSeen<15000),selected=new Map(available.slice(0,players.length?4:8).map(p=>[p.index,p]));for(const player of players)for(const entry of [...available].sort((a,b)=>gap(a.place,player.position)-gap(b.place,player.position)).slice(0,2))selected.set(entry.index,entry);const places=[...selected.values()].slice(0,12);
 for(const npc of residents(sim)){npc.resident.isAI=true;if(!npc.resident.ageGroup){const place=available.find(entry=>entry.index===npc.resident.locationIndex)?.place;npc.resident.ageGroup=!sim.construction&&npc.id.endsWith('-1')&&/court|park|commons|lounge|play|plaza|garden/i.test(place?.name||npc.resident.placeName||'')?'child':'adult';}ensureResidentIntelligence(sim,npc,environment,now);}
 for(const npc of residents(sim))if(npc.aiTask?.status!=='active'&&npc.resident.machineWork?.status!=='active'&&!npc.resident.sharedTask&&npc.resident.objective?.status!=='active'&&players.length&&!selected.has(npc.resident.locationIndex)&&players.every(p=>gap(p.position,npc.position)>60)&&!Object.values(sim.players).some(p=>p.residentTask?.status==='active'&&(p.residentTask.residentId===npc.id||p.residentTask.socialTargetId===npc.id)||p.residentVisit?.status==='active'&&p.residentVisit.residentId===npc.id||p.residentInvitation?.status==='offered'&&p.residentInvitation.residentId===npc.id&&now<p.residentInvitation.expiresAt)){archiveResidentIntelligence(sim,npc,environment,now);delete sim.actors[npc.id];if(sim.residentPlacementAttempts)delete sim.residentPlacementAttempts[npc.id];}
 let residentCount=residents(sim).length;
 for(const {index,place}of places)for(let slot=0;slot<((Number(place.width)||0)*(Number(place.depth)||0)>=900&&Number(environment.builderScene?.mapSize||200)>=160?((Number(place.width)||0)*(Number(place.depth)||0)>=6000?4:3):(index<2?2:1));slot++){if(residentCount>=22)break;const id='world-resident-'+index+'-'+slot;if(sim.actors[id])continue;sim.residentPlacementAttempts||={};if(now<(sim.residentPlacementAttempts[id]||0))continue;sim.residentPlacementAttempts[id]=now+30000;const home=residentHome(environment,place,index,slot,collision,sim,objects);if(!home)continue;const child=slot===1&&!sim.construction&&/court|park|commons|lounge|play|plaza|garden/i.test(place.name),profile=child?{role:'Junior player',task:'practising, playing and making friends',prop:'ball',ask:'Could you help welcome another player and check the activity board?'}:residentActivity(place),n=(index*2+slot)%10,identity=residentIdentity(environment,place,id);sim.actors[id]={id,name:identity.name+' · '+profile.role,modelId:'world-resident',asset:{buildAssetId:'world-resident'},active:true,health:100,destructible:false,spawned:true,trafficAI:true,position:{...home},rotation:{x:0,y:0,z:0},resident:{...profile,isAI:true,ageGroup:child?'child':'adult',name:identity.name,index:n,locationIndex:index,color:colors[n%colors.length],skin:['#b78361','#e5ba98','#76503d'][n%3],placeName:place.name,home,mood:n%2?'playful':'thoughtful',phase:'working',nextPhaseAt:now+10000+n*800,day:day(now),moving:false,speech:'',speechUntil:0},definition:{objectId:id,modelId:'world-resident',name:identity.name,position:{...home},gameplay:{behavior:'talk',interactionDistance:4,cooldown:1,prompt:'Talk / daily objectives · '+identity.name},dialogue:{text:profile.ask}}};residentCount++;ensureResidentIntelligence(sim,sim.actors[id],environment,now);}
 applyFunhouseResidentTheme(sim,environment);
 const cast=residents(sim);stepCommunityLife(sim,cast,now,dt);stepResidentLife(sim,environment,now,dt,{collision,objects});
 for(const player of Object.values(sim.players||{})){const task=player.residentTask;if(task?.status==='active'&&(player.movementRevision||0)!==task.revision){task.status='cancelled';task.message='Travel reset this daily objective.';}if(task?.status==='active'&&now>task.deadline){task.status='expired';task.message='Daily objective expired. Ask a resident for another task.';}if(player.residentDaily&&Object.keys(player.residentDaily).length>80)player.residentDaily=Object.fromEntries(Object.entries(player.residentDaily).filter(([key])=>key.endsWith(':'+day(now))));}
}
