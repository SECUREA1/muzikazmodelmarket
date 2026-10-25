import {spatialEffectGain} from './shared-effect-audio.js';

export function createQuestConversationVoice({speech=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance,setTimer=setTimeout,clearTimer=clearTimeout,now=()=>Date.now()}={}){
 let unlocked=false,muted=false,disposed=false,failed=false,current=null,utterance=null,timer=null,generation=0,scope=null,latest=null;
 let preferences={},listener=null,actors={};
 const queue=[],seen=new Set();
 const supported=()=>!!(speech?.speak&&Utterance)&&!failed;
 const blocked=call=>muted||preferences.masterMuted||preferences[({introduction:'introductionMuted',announcements:'announcementsMuted',dialogue:'dialogueMuted'})[call.category||'dialogue']];
 function volume(call){
  if(blocked(call))return 0;
  const source=call.source||actors[call.speakerId||call.entityId]?.position;
  // Browser speech synthesis exposes volume, but cannot connect to a Web Audio
  // panner. World voices use distance attenuation; radio/objectives stay clear.
  return .9*(preferences.spatialAudio!==false&&source&&listener?spatialEffectGain({...source,y:source.y??0},{...listener,y:listener.y??0},call.range||32):1);
 }
 function cancelCurrent(){generation++;clearTimer(timer);timer=null;current=null;utterance=null;try{speech?.cancel?.();}catch{}}
 function stop(){cancelCurrent();queue.length=0;}
 function play(){
  if(disposed||!unlocked||current||!supported())return;
  let call;
  while(queue.length){const candidate=queue.shift();if(now()-candidate.queuedAt<30000&&volume(candidate)>0){call=candidate;break;}}
  if(!call)return;
  const token=++generation;current=call;
  try{
   utterance=new Utterance(call.text);
   const voices=speech.getVoices?.().filter(v=>/^en/i.test(v.lang))||[],seed=Array.from(call.voice||call.speaker||'Guide').reduce((sum,c)=>sum+c.charCodeAt(0),0);
   if(voices.length)utterance.voice=voices[seed%voices.length];
   utterance.rate=call.role==='player'?1:.95;utterance.pitch=call.role==='player'?1.04:.94+(seed%4)*.04;utterance.volume=volume(call);
   const finish=error=>{if(token!==generation||disposed)return;clearTimer(timer);timer=null;current=null;utterance=null;if(error&&!['canceled','interrupted'].includes(error.error))failed=true;play();};
   utterance.onend=()=>finish();utterance.onerror=finish;
   timer=setTimer(()=>{if(token!==generation)return;cancelCurrent();play();},Math.min(22000,2000+call.text.length*65));
   speech.speak(utterance);
  }catch{failed=true;cancelCurrent();}
 }
 function setScope(worldId){if(scope===worldId)return;stop();seen.clear();scope=worldId;latest=null;}
 function remember(id){if(seen.has(id))return false;seen.add(id);if(seen.size>128)seen.delete(seen.values().next().value);return true;}
 function enqueue(call){latest={...call,queuedAt:now()};if(!blocked(latest)){queue.push(latest);if(queue.length>8)queue.shift();}play();}
 const api={
  announce(text,{key=text,worldId=scope,voice='World guide',role='guide',category='announcements',source,entityId,range}={}){
   if(disposed||!text)return false;setScope(worldId);
   const id='announcement:'+worldId+':'+key;if(!remember(id))return false;
   enqueue({id,text:String(text),voice,speaker:voice,role,category,source,entityId,range});return true;
  },
  unlock(){if(disposed)return;unlocked=true;failed=false;try{speech?.resume?.();}catch{}play();},
  setMuted(value){muted=!!value;if(muted)stop();else play();},
  setPreferences(value={}){preferences={...value};for(let i=queue.length-1;i>=0;i--)if(blocked(queue[i]))queue.splice(i,1);if(current&&blocked(current))cancelCurrent();play();},
  setScene({listener:position,actors:worldActors={}}={}){listener=position;actors=worldActors;if(current){const gain=volume(current);if(gain<=0){cancelCurrent();play();}else if(utterance)utterance.volume=gain;}},
  ingest(calls,{worldId,actorId,serverTime,instanceId}={}){
   if(disposed)return;setScope(worldId);
   for(const call of calls||[]){
    if(!call.conversation||call.questInstance!==instanceId&&!call.interaction||call.recipients&&!call.recipients.includes(actorId)||seen.has(call.id)||serverTime-call.at>30000)continue;
    remember(call.id);
    // Historical dialogue seen before the gesture is consumed, not replayed later.
    if(unlocked)enqueue({...call,category:'dialogue'});else latest={...call,category:'dialogue',queuedAt:now()};
   }play();
  },
  replay(call){if(call)latest={...call,category:call.category||'dialogue',queuedAt:now()};if(!latest||disposed)return false;muted=false;if(blocked(latest))return false;const replay={...latest,queuedAt:now()};stop();unlocked=true;queue.push(replay);play();return true;},
  reset(){stop();seen.clear();scope=null;latest=null;},
  dispose(){disposed=true;stop();},
  get state(){return {unlocked,muted:muted||!!preferences.masterMuted||!!preferences.dialogueMuted,supported:supported(),speaking:!!current,pending:queue.length};}
 };
 return api;
}
let shared;
export function questConversationVoice(){return shared||=createQuestConversationVoice();}
export function unlockQuestConversation(){questConversationVoice().unlock();}
