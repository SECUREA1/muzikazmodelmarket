import {questCatalog,questPoint} from './quest-catalog.js';
import {isAircraft} from './aircraft-flight.js';
import {armedAircraft} from './aircraft-types.js';
import {isWatercraft} from './harbor-water.js';
import {isRoadVehicle} from './road-vehicles.js';
import {isCombatBoat} from './patrol-combat.js';
import {requestGameInputRelease} from './game-input-release.js';

// These are guidance rules only. The server validates every acceptance/action.
export function questOfferRequirement(offer,self,snapshot={}){
 if(!self||self.health<=0)return 'Join the world and respawn to accept this challenge.';
 const previous=self.vehicleMission,finishedAt=previous?.finishedAt??previous?.completedAt;
 if(!self.localQuests&&previous?.status==='completed'&&Number.isFinite(finishedAt)&&snapshot.serverTime<finishedAt+60000)return 'Dispatch is preparing your next assignment. Explore the map and try again shortly.';
 const craft=snapshot.actors?.[self.vehicleId];
 if(offer.mode==='foot'&&(self.vehicleId||self.seatedId||self.skiLift))return 'Leave your vehicle or seat to begin on foot.';
 if(offer.mode!=='foot'){
  const valid=offer.mode==='road'?isRoadVehicle(craft):offer.mode==='gunboat'?isCombatBoat(craft):offer.mode==='boat'?isWatercraft(craft):offer.mode==='armed'?armedAircraft(craft):isAircraft(craft);
  const names={road:'road vehicle',gunboat:'Sentinel patrol boat',boat:'boat',armed:'armed Corsair',aircraft:'aircraft'};
  if(!valid||craft?.trafficAI||craft?.active===false||craft?.health<=0||craft?.holderId!==self.id)return 'Board an available '+(names[offer.mode]||'appropriate vehicle')+' first.';
  if(offer.mode==='armed'&&(!craft.flight?.airborne||craft.position?.y<20))return 'Take off and climb above 20 metres in your Corsair first.';
 }
 if(offer.kind==='marksman'&&snapshot.firingRange?.participants?.[self.id]?.role!=='player')return 'Join a firing lane before accepting this challenge.';
 if(offer.kind==='basketball'&&(!snapshot.basketball||self.basketballRole==='spectator'))return 'Join the live court game before accepting this challenge.';
 if(offer.kind==='ski'&&!['racing','countdown'].includes(self.skiRace?.status))return 'Start or join a ski race before accepting this challenge.';
 return '';
}

export function questObjectiveReading(mission,self,snapshot={}){
 const point=questPoint(mission,snapshot.actors);if(!point)return null;
 const position=snapshot.actors?.[self?.vehicleId]?.position||self?.position;
 const distance=position&&Number.isFinite(point.x)&&Number.isFinite(point.z)?Math.round(Math.hypot(point.x-position.x,(point.y||0)-(position.y||0),point.z-position.z)):null;
 const seconds=Math.max(0,Math.ceil(((mission.deadline||snapshot.serverTime)-snapshot.serverTime)/1000));
 const instruction=point.action==='interact'?'Use '+(point.objectName||point.siteName||point.name)+' at the marked site.':point.milestone?(mission.message||'Complete this activity in the live game.'):mission.ready?'Ready to '+(point.action||'continue')+'.':point.dwell?'Reach the marker and pause for '+point.dwell+' seconds.':'Follow the marked objective.';
 return {point,distance,instruction,progress:(mission.index+1)+' / '+mission.checkpoints.length,time:Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')};
}
export function questCompletionReading(self,worldId,questId){
 const record=self?.mapQuestProgress?.worldId===worldId&&self.mapQuestProgress.completed?.[questId];
 if(!record?.count)return '';
 const seconds=Math.max(0,Math.round((record.bestMs||0)/1000)),best=record.bestMs>0?' · Best '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'';
 return (record.count===1?'Completed once':'Completed '+record.count+' times')+best;
}

let nextId=0;
export function mountMapQuestPrompts({stage,command,onOpenAssignments}){
 const document=stage.ownerDocument,id='map-quests-'+ ++nextId;
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('../assets/map-quest-prompts.css',import.meta.url).href;document.head.append(style);
 const root=document.createElement('section');root.className='map-quest-prompts';root.dataset.gameplayBlocking='false';root.setAttribute('aria-label','Map quests and challenges');
 const launcher=document.createElement('button');launcher.type='button';launcher.className='map-quest-launcher';launcher.title='Quests and challenges';launcher.setAttribute('aria-label','Quests and challenges');launcher.setAttribute('aria-controls',id);launcher.setAttribute('aria-expanded','false');launcher.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7 3h11a2 2 0 0 1 2 2v16H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Zm0 0v15a3 3 0 0 0-3 0m7-10 1.5 1.5L15 7m-4 7h5m-5 3h5"/></svg><span class="map-quest-count" aria-hidden="true" hidden></span>';const questCount=launcher.querySelector('.map-quest-count');
 const panel=document.createElement('section');panel.id=id;panel.className='map-quest-card';panel.hidden=true;panel.dataset.gameplayBlocking='false';panel.setAttribute('role','region');panel.setAttribute('aria-label','Local quests and challenges');
 const header=document.createElement('header'),heading=document.createElement('h2'),close=document.createElement('button');heading.textContent='Local quests';close.type='button';close.textContent='×';close.setAttribute('aria-label','Close local quests');header.append(heading,close);
 const worldLabel=document.createElement('p');worldLabel.className='map-quest-world';
 const content=document.createElement('div');content.className='map-quest-content';
 const feedback=document.createElement('p');feedback.className='map-quest-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 panel.append(header,worldLabel,content,feedback);
 const hud=document.createElement('button');hud.type='button';hud.className='map-quest-objective';hud.hidden=true;hud.setAttribute('aria-label','Open active quest');root.append(panel,hud);stage.append(launcher,root);
 let world=null,snapshot=null,self=null,environment=null,offers=[],selection='',busy=false,mode='offers',result=null,lastMissionKey='',seenResults=new Set(),arrivalShown=false,disposed=false,renderKey='',requestVersion=0;
 const button=(label,run)=>{const node=document.createElement('button');node.type='button';node.textContent=label;node.addEventListener('click',run);return node;};
 const paragraph=(value,className)=>{const node=document.createElement('p');node.textContent=value;if(className)node.className=className;return node;};
 function open({automatic=false,view}={}){if(view)mode=view;const changed=panel.hidden;panel.hidden=false;launcher.setAttribute('aria-expanded','true');if(changed&&!automatic){requestGameInputRelease('quests-open',document);document.exitPointerLock?.();close.focus({preventScroll:true});}render();}
 function hide(){if(panel.hidden)return;requestGameInputRelease('quests-close',document);panel.hidden=true;launcher.setAttribute('aria-expanded','false');if(panel.contains(document.activeElement))launcher.focus({preventScroll:true});}
 function setFeedback(value){feedback.textContent=value||'';}
 async function request(operation,fields={}){
  if(busy||disposed)return;const version=++requestVersion;busy=true;setFeedback('');requestGameInputRelease('quest-'+operation,document);render();
  try{const state=await command('vehicle-mission',{operation,...fields});if(version!==requestVersion||disposed)return;if(!state)setFeedback('The request did not reach dispatch. Try again when connected.');else if(state.result?.message)setFeedback(state.result.message);}
  catch(error){if(version===requestVersion&&!disposed)setFeedback(error?.message||'Dispatch could not apply this request. Try again.');}
  finally{if(version===requestVersion&&!disposed){busy=false;render();}}
 }
 async function useObject(point){
  if(busy||disposed||!point.entityId)return;const version=++requestVersion;busy=true;setFeedback('');requestGameInputRelease('quest-use-object',document);render();
  try{const state=await command('interact',{entityId:point.entityId});if(version!==requestVersion||disposed)return;if(!state)setFeedback('The interaction did not reach the world. Try again when connected.');else if(state.result?.message)setFeedback(state.result.message);}
  catch(error){if(version===requestVersion&&!disposed)setFeedback(error?.message||'Move within reach of the marked object and try again.');}
  finally{if(version===requestVersion&&!disposed){busy=false;render();}}
 }
 launcher.addEventListener('click',()=>panel.hidden?open():hide());close.addEventListener('click',hide);hud.addEventListener('click',()=>open({view:'active'}));
 // Companion controls retain movement keys. Enter activates a focused button;
 // text/select editing remains local and Escape closes without trapping focus.
 panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide();}else if(event.target.closest('select,input,textarea,[contenteditable=true]')||event.key==='Enter')event.stopPropagation();else if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)&&event.target.closest('button'))event.preventDefault();});
 for(const type of ['pointerdown','click','wheel']){root.addEventListener(type,event=>event.stopPropagation());launcher.addEventListener(type,event=>event.stopPropagation());}
 function render(){
  if(disposed)return;worldLabel.textContent=(environment?.name||'This world')+(self?.localQuests?' · Solo practice':'');
  const mission=self?.vehicleMission,active=mission?.status==='active',reading=active?questObjectiveReading(mission,self,snapshot):null;
  questCount.hidden=!active;questCount.textContent=active?String((mission.index||0)+1):'';launcher.setAttribute('aria-label',active?'Quests and challenges · objective '+((mission.index||0)+1)+' of '+mission.checkpoints.length:'Quests and challenges');launcher.title=active?mission.title+' · objective '+((mission.index||0)+1)+' of '+mission.checkpoints.length:'Quests and challenges';
  hud.hidden=!reading;hud.textContent=reading?(reading.progress+' · '+reading.point.name+(reading.distance===null?'':' · '+reading.distance+' m')):'';
  if(panel.hidden)return;
  if(!offers.some(offer=>offer.id===selection))selection=offers.find(offer=>!questOfferRequirement(offer,self,snapshot))?.id||offers[0]?.id||'';
  const requirementKey=offers.map(offer=>[offer.id,offer.title,offer.description,offer.reward,questOfferRequirement(offer,self,snapshot),questCompletionReading(self,world,offer.id)]);
  const key=JSON.stringify([world,!!self?.localQuests,active?['active',missionKey(mission),mission.index,mission.ready,mission.teamRole,reading?.point.action,reading?.instruction]:[mode,selection,result?.status,result?.message,requirementKey],busy]);
  const meta=reading?(reading.distance===null?'':reading.distance+' metres · ')+reading.time+' remaining':'';
  if(key===renderKey){const node=content.querySelector('[data-objective-meta]');if(node)node.textContent=meta;const use=content.querySelector('[data-quest-use]');if(use)use.disabled=busy||!mission.ready||mission.teamRole==='observer';return;}
  renderKey=key;content.replaceChildren();
  if(active){
   heading.textContent=mission.title;content.append(paragraph(reading?reading.progress+' · '+reading.point.name:'Assignment in progress','map-quest-step'));
   if(reading){const information=paragraph(meta,'map-quest-meta');information.dataset.objectiveMeta='';content.append(information,paragraph(reading.instruction));
    if(reading.point.action&&reading.point.action!=='interact'){const confirm=button('Confirm '+reading.point.action,()=>request('interact'));confirm.disabled=busy||!mission.ready||mission.teamRole==='observer';confirm.dataset.questConfirm='';content.append(confirm);}
    if(reading.point.action==='interact'&&reading.point.entityId){const use=button(reading.point.prompt||'Use '+(reading.point.objectName||reading.point.siteName||reading.point.name),()=>useObject(reading.point));use.disabled=busy||!mission.ready||mission.teamRole==='observer';use.dataset.questUse='';content.append(use);}
   }
   if(mission.siteQuest)content.append(paragraph('Walk to each site. Map travel ends this assignment.','map-quest-meta'));
   const actions=document.createElement('div');actions.className='map-quest-actions';
   if(onOpenAssignments&&!self?.localQuests)actions.append(button('Contact & dispatch',()=>{hide();onOpenAssignments();}));
   const cancel=button('Cancel quest',()=>request('cancel'));cancel.disabled=busy;actions.append(cancel);content.append(actions);return;
  }
  if(mode==='result'&&result){
   heading.textContent=result.status==='completed'?'Challenge complete':result.status==='cancelled'?'Assignment ended':'Challenge ended';content.append(paragraph(result.title,'map-quest-step'),paragraph(result.message||'Choose another local assignment.'));
   if(result.status==='completed')content.append(paragraph('Reward: '+result.reward+(self?.localQuests?' practice score.':' world score.'),'map-quest-meta'));
   content.append(button('Explore more quests',()=>{mode='offers';render();}));return;
  }
  heading.textContent='Local quests & challenges';
  content.append(paragraph('Choose a local job or explore the marked places. Accept when you are ready.'));
  if(self?.localQuests)content.append(paragraph('Solo practice progress stays in this session.','map-quest-meta'));
  if(!offers.length){content.append(paragraph('No local assignments are available yet. Explore the world and its interactive objects.'));return;}
  const label=document.createElement('label');label.textContent='Choose a challenge';const select=document.createElement('select');select.setAttribute('aria-label','Choose local challenge');select.disabled=busy;
  for(const offer of offers){const option=document.createElement('option');option.value=offer.id;option.textContent=offer.title;select.append(option);}
  select.value=selection;select.addEventListener('change',()=>{const focused=document.activeElement===select;selection=select.value;setFeedback('');render();if(focused)content.querySelector('select')?.focus({preventScroll:true});});label.append(select);content.append(label);
  const offer=offers.find(offer=>offer.id===selection),requirement=questOfferRequirement(offer,self,snapshot);
  content.append(paragraph(offer.description),paragraph(offer.reward+(self?.localQuests?' practice score · ':' world score · ')+Math.ceil(offer.timeLimit/60)+' minute limit','map-quest-meta'));
  const completion=questCompletionReading(self,world,offer.id);if(completion)content.append(paragraph(completion,'map-quest-completion'));
  if(requirement)content.append(paragraph(requirement,'map-quest-requirement'));
  const accept=button('Accept challenge',()=>request('start',{questId:offer.id}));accept.disabled=busy||!!requirement;accept.dataset.questAccept='';content.append(accept);
  if(onOpenAssignments&&!self?.localQuests)content.append(button('Open crew radio',()=>{hide();onOpenAssignments();}));
 }
 function update(nextSnapshot,selfId,nextEnvironment){
  if(disposed)return;snapshot=nextSnapshot||{};environment=nextEnvironment||{};self=snapshot.players?.[selfId];if(self&&!self.id)self={...self,id:selfId};
  if(world!==environment.id){world=environment.id;requestVersion++;busy=false;arrivalShown=false;seenResults=new Set();lastMissionKey='';result=null;selection='';mode='offers';setFeedback('');panel.hidden=true;launcher.setAttribute('aria-expanded','false');}
  offers=[...(snapshot.questOffers?.length?snapshot.questOffers:questCatalog(environment))].sort((a,b)=>Number(!!b.siteQuest)-Number(!!a.siteQuest));
  const mission=self?.vehicleMission,missionKey=mission&&(mission.instanceId||mission.questId||mission.startedAt);
  if(mission?.status==='active'){mode='active';lastMissionKey=missionKey;}
  else if(mission&&['completed','failed','expired','cancelled'].includes(mission.status)&&missionKey&&missionKey===lastMissionKey&&!seenResults.has(missionKey+':'+mission.status)){
   seenResults.add(missionKey+':'+mission.status);result=mission;mode='result';setFeedback('');open({automatic:true});
  }
  if(!arrivalShown&&self){arrivalShown=true;if(mission?.status!=='active'&&offers.length)open({automatic:true,view:'offers'});}
  render();
 }
 return {update,open:()=>open({view:self?.vehicleMission?.status==='active'?'active':'offers'}),close:hide,dispose(){disposed=true;requestVersion++;launcher.remove();root.remove();style.remove();}};
}
function missionKey(mission){return mission.instanceId||mission.questId||mission.startedAt;}
