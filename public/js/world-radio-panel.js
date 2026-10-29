import {isRoadVehicle} from './road-vehicles.js';
import {isWatercraft} from './harbor-water.js';
import {isAircraft} from './aircraft-flight.js';
import {isCombatBoat} from './patrol-combat.js';
import {armedAircraft} from './aircraft-types.js';
import {questConversationVoice} from './quest-conversation-voice.js';
import {questOfferRequirement} from './map-quest-prompts.js';

const labels={foot:'On foot',road:'Road vehicle',boat:'Boat',gunboat:'Patrol boat',aircraft:'Aircraft',armed:'Armed aircraft'};
const identity=call=>call.type==='player'?call.worldId+':team:'+call.teamId:String(call.id).startsWith(call.worldId+':')?call.id:call.worldId+':'+call.id;
const announcementKey=call=>identity(call)+':'+call.at;

// The room snapshot is authoritative for local calls. The public directory
// adds destinations elsewhere without changing rooms or accepting work.
export function mountWorldRadioPanel(root,{command,onNavigate,voice=questConversationVoice()}={}){
 const section=document.createElement('section');section.className='world-radio-calls';section.setAttribute('aria-label','World radio calls');
 const title=document.createElement('h3');title.textContent='World radio · open calls';
 const note=document.createElement('p');note.textContent='Answer a local call, or travel to its world before accepting. Joining vehicle crews requires your own suitable craft.';
 const list=document.createElement('div');list.className='world-radio-call-list';
 const empty=document.createElement('p');empty.textContent='Listening for new jobs and calls for help…';
 const status=document.createElement('p');status.setAttribute('role','status');
 section.append(title,note,list,empty,status);root.append(section);
 let snapshot={},selfId=null,environment=null,remote=[],busy=false,disposed=false,generation=0,controller=null,inFlight=null,timer=null,baseline=false,connectionFailed=false;
 let clockAt=0,clockReceived=0;const rows=new Map(),seen=new Set();
 const now=()=>clockAt+(performance.now()-clockReceived);
 const valid=call=>call&&call.worldId&&call.title&&['ai','player'].includes(call.type)&&Number.isFinite(call.expires)&&call.expires>now()&&(call.type!=='player'||call.teamId&&call.members<4);
 function remember(call){seen.add(announcementKey(call));if(seen.size>256)seen.delete(seen.values().next().value);}
 function localCalls(){
  if(!environment?.id)return [];
  const worldId=environment.id,worldName=environment.name||worldId,calls=[],dispatch=snapshot.liveDispatch;
  if(dispatch)calls.push({...dispatch,description:dispatch.description||snapshot.questOffers?.find(offer=>offer.id===dispatch.questId)?.description||'',id:dispatch.id,type:'ai',worldId,worldName,speaker:dispatch.speaker||'Dispatch'});
  for(const team of snapshot.questTeams||[])calls.push({...team,id:team.id,type:'player',teamId:team.id,worldId,worldName,speaker:team.leader,leaderId:team.leaderId||team.speakerId});
  return calls;
 }
 function reason(call){
  const self=snapshot.players?.[selfId];
  if(self?.vehicleMission?.status==='active')return 'Finish or cancel your current assignment first.';
  if(call.worldId!==environment?.id)return onNavigate?'':'Travel is unavailable here.';
  if(!command||!self)return 'Join this world to answer its calls.';
  if(self.health<=0)return 'Recover before answering this call.';
  if(call.type==='ai')return questOfferRequirement(snapshot.questOffers?.find(offer=>offer.id===call.questId)||call,{...self,id:self.id||selfId},snapshot);
  if(call.type==='player'&&call.leaderId===selfId)return 'Your call is open to other players.';
  if(call.mode==='foot')return self.vehicleId||self.seatedId||self.skiLift?'Leave your vehicle or seat to take this walking job.':'';
  const craft=snapshot.actors?.[self.vehicleId];
  const matches=call.mode==='road'?isRoadVehicle(craft):call.mode==='boat'?isWatercraft(craft):call.mode==='gunboat'?isCombatBoat(craft):call.mode==='armed'?armedAircraft(craft):isAircraft(craft);
  return matches&&craft?.active!==false&&craft?.health>0&&!craft.trafficAI&&craft.holderId===selfId?'':'Board your own '+(labels[call.mode]||'suitable craft').toLowerCase()+' to respond.';
 }
 function render(){
  if(disposed)return;
  const calls=[...localCalls(),...remote.filter(call=>call.worldId!==environment?.id)]
   .filter(valid).sort((a,b)=>(a.type==='player'?0:1)-(b.type==='player'?0:1)||(b.at||0)-(a.at||0)).slice(0,24);
  const present=new Set();let index=0;
  for(const call of calls){
   const key=identity(call);if(present.has(key))continue;present.add(key);
   let row=rows.get(key);
   if(!row){
    const article=document.createElement('article');article.className='world-radio-call';
    const heading=document.createElement('strong'),details=document.createElement('p'),requirement=document.createElement('p'),button=document.createElement('button');button.type='button';
    article.append(heading,details,requirement,button);row={article,heading,details,requirement,button,call};rows.set(key,row);
    button.onclick=()=>respond(row.call);
   }
   row.call=call;
   row.article.dataset.type=call.type;
   const heading=call.title,details=(call.type==='player'?'Player · '+(call.speaker||call.leader||'Crew')+' · '+call.members+'/4':'AI dispatch')+' · '+(call.worldName||call.worldId)+' · '+(labels[call.mode]||call.mode||'Local job')+(call.description?' — '+call.description:'');
   const blocked=reason(call),label=call.worldId!==environment?.id?'Travel to call':call.type==='player'?'Join & help':'Accept job';
   if(row.heading.textContent!==heading)row.heading.textContent=heading;
   if(row.details.textContent!==details)row.details.textContent=details;
   if(row.requirement.textContent!==blocked)row.requirement.textContent=blocked;
   row.requirement.hidden=!blocked;row.button.disabled=busy||!!blocked;
   if(row.button.textContent!==label)row.button.textContent=label;
   row.button.setAttribute('aria-label',label+' · '+call.title+' · '+(call.worldName||call.worldId));
   if(list.children[index]!==row.article)list.insertBefore(row.article,list.children[index]||null);index++;
  }
  for(const [key,row]of rows)if(!present.has(key)){row.article.remove();rows.delete(key);}
  empty.hidden=present.size>0;
 }
 async function respond(call){
  if(disposed||busy||!valid(call))return;
  const blocked=reason(call);if(blocked){status.textContent=blocked;return;}
  busy=true;const context=generation,travelling=call.worldId!==environment?.id;render();voice.unlock?.();
  try{
   if(travelling){
    const travelled=await onNavigate(call.worldId);
    if(!disposed&&travelled!==false)status.textContent='Arrived. Open World radio and answer the call when ready.';
   }else{
    const result=await command('vehicle-mission',call.type==='player'?{operation:'join',teamId:call.teamId,role:'helper'}:{operation:'start',questId:call.questId});
    if(!disposed&&context===generation)status.textContent=result?.result?.message||'Check the game status for this request.';
   }
  }catch(error){if(!disposed&&(context===generation||travelling))status.textContent=error.message||'The call could not be answered. Refresh and try again.';}
  finally{busy=false;if(!disposed){render();refresh();}}
 }
 async function refresh(){
  if(disposed||snapshot.authoritative!==true||!environment?.id)return;
  if(inFlight)return inFlight;
  const context=generation;controller=new AbortController();
  const operation=(async()=>{
   try{
    const request={headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal};
    const response=window.MUZIKAZ_API?await window.MUZIKAZ_API.fetch('/api/world-radio',request):await fetch('/api/world-radio',request);
    if(!response.ok)throw Error('World radio is reconnecting.');
    const payload=await response.json(),data=payload?.data??payload;
    if(disposed||context!==generation)return;
    if(!Array.isArray(data?.calls))throw Error('World radio is reconnecting.');
    remote=data.calls.filter(valid).slice(0,24);
    let spoken=0;
    for(const call of remote){
     if(baseline&&!seen.has(announcementKey(call))&&call.worldId!==environment.id&&Number.isFinite(call.at)&&now()-call.at>=0&&now()-call.at<15000&&spoken<2){
      voice.announce((call.speaker||'Dispatch')+'. '+(call.type==='player'?'Requesting help. ':'New job. ')+call.title+'. '+(call.worldName||call.worldId)+'. '+(call.description?call.description+' ':'')+'Open World radio to respond.',{key:'world-radio:'+announcementKey(call),worldId:environment.id,category:'announcements',voice:call.speaker||'Dispatch',role:'dispatcher'});spoken++;
     }
     remember(call);
    }
    baseline=true;if(connectionFailed){status.textContent='';connectionFailed=false;}render();
   }catch(error){
    if(disposed||context!==generation||error.name==='AbortError')return;
    remote=[];connectionFailed=true;status.textContent='World radio is reconnecting. Local calls remain available.';render();
   }finally{if(context===generation){inFlight=null;controller=null;}}
  })();
  inFlight=operation;return operation;
 }
 return {
  update(state,id,world){
   if(disposed)return;
   const changed=environment?.id!==world?.id||snapshot.authoritative!==state?.authoritative;
   snapshot=state||{};selfId=id;environment=world;
   section.hidden=snapshot.authoritative===false||snapshot.localQuests===true;
   if(Number.isFinite(snapshot.serverTime)){clockAt=snapshot.serverTime;clockReceived=performance.now();}
   if(changed){generation++;controller?.abort();controller=null;inFlight=null;status.textContent='';clearInterval(timer);timer=null;if(snapshot.authoritative===true){timer=setInterval(refresh,10000);refresh();}else remote=[];}
   render();
  },refresh,
  dispose(){disposed=true;generation++;controller?.abort();clearInterval(timer);rows.clear();section.remove();}
 };
}
