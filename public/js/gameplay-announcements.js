import {questConversationVoice} from './quest-conversation-voice.js';
const gap=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
export function createGameplayAnnouncements({voice=questConversationVoice()}={}){
 let scope=null,radio=0;const states=new Map(),people=new Set();
 const say=(text,key)=>voice.announce(text,{key,worldId:scope});
 function task(task,label){
  if(!task)return;const key=label+':'+(task.instanceId||task.id||task.startedAt||task.title),point=task.checkpoints?.[task.index],signature=[task.status,task.index].join(':');
  if(states.get(key)===signature)return;states.set(key,signature);
  if(task.status==='active')say((states.get(key+':started')?'Next objective. ':'Assignment. ')+(task.title||label)+'. '+(point?.name||task.message||task.description||'Follow the live map marker.')+(point?.action?' '+point.action+'.':''),key+':'+signature);
  else say((task.title||label)+'. '+(task.message||task.status||'Updated.'),key+':'+signature);
  states.set(key+':started',true);
 }
 return {update(snapshot,selfId,environment){
  if(!snapshot||!selfId)return;
  if(scope!==environment?.id){scope=environment?.id;radio=0;states.clear();people.clear();say('Welcome to '+(environment?.name||'this world')+'. Movement, map travel and vehicle selection are available.','arrival');}
  const self=snapshot.players?.[selfId];if(!self)return;
  task(self.vehicleMission,'Vehicle job');task(self.urbanMission,'Local job');task(self.residentTask,'Resident favor');task(self.casinoTask,'Local objective');
  for(const call of snapshot.transportRadio||[]){if(call.id<=radio)continue;radio=call.id;if(call.conversation||call.recipients&&!call.recipients.includes(selfId)||snapshot.serverTime-call.at>12000)continue;say(call.speaker+'. '+call.text,'radio:'+call.id);}
  const nearby=Object.values(snapshot.actors||{}).filter(actor=>(actor.resident||actor.questRole==='contact'||/ranger|merchant|knight|scout-avatar/.test(actor.modelId||''))&&actor.active!==false&&!people.has(actor.id)&&gap(actor.position,self.position)<12).sort((a,b)=>gap(a.position,self.position)-gap(b.position,self.position));
  if(nearby[0]){const actor=nearby[0],person=actor.resident||{name:actor.name,role:'local guide',task:actor.definition?.dialogue?.text||actor.definition?.gameplay?.prompt};people.add(actor.id);say('Nearby, '+(person.name||actor.name)+', '+(person.role||'local resident')+'. '+(person.task||person.ask||'Approach to talk and discover local objectives.'),'person:'+actor.id);}
  for(const job of snapshot.construction?.crew?.jobs||[]){const key='crew:'+job.id,signature=job.status;if(states.get(key)===signature)continue;const previous=states.get(key);states.set(key,signature);if(previous||['active','working','assigned','running','completed','blocked'].includes(signature))say('Crew job. '+job.label+'. '+(job.message||signature)+'.',key+':'+signature);}
  for(const [id,status]of Object.entries(self.quests||{})){const key='walking:'+id;if(states.get(key)===status)continue;states.set(key,status);const board=environment?.builderScene?.objects?.find(object=>object.functionalSettings?.quest?.id===id);if(board)say((board.name||board.functionalSettings.quest.title)+'. '+(status==='complete'?'Objective complete.':board.dialogueSettings?.text||'Objective accepted. Follow the marked collection route.'),key+':'+status);}
  if(states.size>160)for(const key of [...states.keys()].slice(0,40))states.delete(key);
 },say:(text,key=text)=>say(text,'action:'+key),unlock:()=>voice.unlock(),setMuted:value=>voice.setMuted(value),replay:()=>voice.replay()};
}
