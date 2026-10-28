import {questConversationVoice} from './quest-conversation-voice.js';

const point=value=>value&&[value.x,value.y??0,value.z].every(Number.isFinite);
const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y??0)-(b.y??0),a.z-b.z);
const text=value=>typeof value==='string'?value.trim():'';

// Speech bubbles are also used for private replies and periodic work captions.
// Only a fresh exchange between nearby residents belongs on the world audio.
export function createResidentConversationAudio({voice=questConversationVoice(),range=14,maxAge=5000}={}){
 let scope=null,ready=false;
 const seen=new Set();
 function remember(key){if(seen.has(key))return false;seen.add(key);while(seen.size>256)seen.delete(seen.values().next().value);return true;}
 function reset(){scope=null;ready=false;seen.clear();}
 return {
  update(snapshot,selfId,environment){
   const self=snapshot?.players?.[selfId];if(!self||!Number.isFinite(snapshot.serverTime))return;
   const worldId=environment?.id||snapshot.worldId||'world',now=snapshot.serverTime;
   if(scope!==worldId){scope=worldId;ready=false;seen.clear();}
   const actors=snapshot.actors||{},exchanges=new Map();
   for(const life of [snapshot.residentLife,snapshot.casinoLife])for(const conversation of life?.conversations||[])for(const line of conversation.lines||[]){
    if(!Array.isArray(conversation.participants)||!conversation.participants.includes(line.speakerId))continue;
    const partnerId=conversation.participants.find(id=>id!==line.speakerId);
    if(!actors[partnerId]?.resident)continue;
    const key=line.speakerId+'\0'+text(line.text);
    const previous=exchanges.get(key);if(!previous||line.at>previous.at)exchanges.set(key,line);
   }
   const direct=[];
   for(const player of Object.values(snapshot.players))for(const conversation of [player.npcConversation,player.vehicleMission])direct.push(...(conversation?.conversation||[]));
   direct.push(...(snapshot.transportRadio||[]).filter(call=>call.conversation));
   const candidates=[];
   for(const [id,actor]of Object.entries(actors)){
    const info=actor.resident,spoken=text(info?.speech);if(!spoken||!Number.isFinite(info.speechUntil))continue;
    const key=id+'\0'+info.speechUntil+'\0'+spoken;
    if(!remember(key)||!ready||actor.active===false||(actor.health??100)<=0||info.isAI===false)continue;
    if(info.speaking===false||info.speechUntil<=now||info.speechUntil-now>12000)continue;
    if(direct.some(call=>call.speakerId===id&&text(call.text)===spoken&&Number.isFinite(call.at)&&now-call.at>=0&&now-call.at<15000))continue;
    const line=exchanges.get(id+'\0'+spoken),interaction=info.interaction;
    const paired=interaction?.kind==='conversation'&&interaction.phase==='speaking'&&actors[interaction.partnerId]?.resident;
    if(!line&&!paired)continue;
    if(line&&(!Number.isFinite(line.at)||now-line.at<0||now-line.at>maxAge))continue;
    if(!point(self.position)||!point(actor.position)||Math.abs((self.position.y??0)-(actor.position.y??0))>1.2)continue;
    const gap=distance(self.position,actor.position);if(gap>=range)continue;
    candidates.push({id,actor,info,spoken,key,gap});
   }
   ready=true;
   const state=voice.state||{};
   // Ambient exchanges never build a backlog behind the guide or a requested
   // reply. They are heard where and when the exchange actually takes place.
   if(!state.unlocked||state.audioReady===false||state.muted||state.speaking||state.outputBusy||state.pending||state.loading||state.supported===false)return;
   const nearest=candidates.sort((a,b)=>a.gap-b.gap||a.id.localeCompare(b.id))[0];if(!nearest)return;
   const {id,actor,info,spoken,key}=nearest;
   voice.announce(spoken,{key:'resident-exchange:'+key,worldId,category:'dialogue',entityId:id,source:{...actor.position},range:range*2,
    voice:info.name||actor.name||'Resident',role:info.role||'Resident',personality:info.personality,mood:info.mood,voiceProfile:info.voiceProfile||actor.voiceProfile});
  },reset
 };
}
