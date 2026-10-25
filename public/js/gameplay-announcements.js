import {questConversationVoice} from './quest-conversation-voice.js';

// Snapshots establish a baseline. Only changes observed while visiting a map
// become announcements; returning to a map never replays its introduction.
export function createGameplayAnnouncements({voice=questConversationVoice()}={}){
 let scope=null,radio=0,ready=false;const states=new Map(),introduced=new Set();
 const say=(text,key,options={})=>voice.announce(text,{key,worldId:scope,category:'announcements',...options});
 function changed(key,signature){const previous=states.get(key);states.set(key,signature);return {previous,changed:previous!==signature};}
 function task(task,label){
  if(!task)return;const key=label+':'+(task.instanceId||task.id||task.startedAt||task.title),point=task.checkpoints?.[task.index],signature=[task.status,task.index].join(':'),state=changed(key,signature);
  if(!ready||!state.changed)return;
  if(task.status==='active')say((state.previous?'Next objective. ':'Assignment. ')+(task.title||label)+'. '+(point?.name||task.message||task.description||'Follow the live map marker.')+(point?.action?' '+point.action+'.':''),key+':'+signature);
  else if(state.previous)say((task.title||label)+'. '+(task.message||task.status||'Updated.'),key+':'+signature);
 }
 return {update(snapshot,selfId,environment){
  if(!snapshot||!selfId)return;const self=snapshot.players?.[selfId];if(!self)return;
  const worldId=environment?.id||snapshot.worldId||'world';
  if(scope!==worldId){scope=worldId;radio=0;ready=false;states.clear();if(!introduced.has(scope)){introduced.add(scope);say('Welcome to '+(environment?.name||'this world')+'. Movement, map travel and vehicle selection are available.','arrival',{category:'introduction'});}}
  task(self.vehicleMission,'Vehicle job');task(self.urbanMission,'Local job');task(self.residentTask,'Resident favor');task(self.casinoTask,'Local objective');
  const dispatch=snapshot.liveDispatch,dispatchState=changed('live-dispatch',dispatch?.id||null);
  if(ready&&dispatchState.changed&&dispatch?.id&&(!dispatch.expires||dispatch.expires>snapshot.serverTime))say('New local job. '+dispatch.title+'. Open the local map to volunteer.','dispatch:'+dispatch.id);
  // Periodic traffic reports remain captions in Crew Dispatch. Only a direct
  // call or a requested interaction can interrupt gameplay with spoken radio.
  for(const call of snapshot.transportRadio||[]){
   if(call.id<=radio)continue;radio=call.id;
   if(!ready||call.conversation||call.recipients&&!call.recipients.includes(selfId)||!call.interaction&&!call.recipients?.includes(selfId)||snapshot.serverTime-call.at>12000)continue;
   say((call.speaker?call.speaker+'. ':'')+call.text,'radio:'+call.id,{source:call.source,entityId:call.speakerId,voice:call.voice||call.speaker||'Dispatch',role:call.role||'dispatcher'});
  }
  for(const job of snapshot.construction?.crew?.jobs||[]){
   const key='crew:'+job.id,state=changed(key,job.status);if(!ready||!state.changed)continue;
   if(state.previous||['queued','active','working','assigned','running'].includes(job.status)){
    const worker=snapshot.construction.crew.workers?.find(worker=>worker.id===job.workerId);
    say('Crew job. '+job.label+'. '+(job.message||job.status)+'.',key+':'+job.status,{source:worker?.position,entityId:job.machineId});
   }
  }
  for(const [id,status]of Object.entries(self.quests||{})){
   const key='walking:'+id,state=changed(key,status);if(!ready||!state.changed)continue;
   const board=environment?.builderScene?.objects?.find(object=>object.functionalSettings?.quest?.id===id);
   if(board)say((board.name||board.functionalSettings.quest.title)+'. '+(status==='complete'?'Objective complete.':board.dialogueSettings?.text||'Objective accepted. Follow the marked collection route.'),key+':'+status,{source:board.position});
  }
  ready=true;if(states.size>160)for(const key of [...states.keys()].slice(0,40))states.delete(key);
 },say:(text,key=text,options={})=>say(text,'action:'+key,options),unlock:()=>voice.unlock(),setMuted:value=>voice.setMuted(value),replay:()=>voice.replay()};
}
