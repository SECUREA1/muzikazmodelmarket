import {questConversationVoice} from './quest-conversation-voice.js';
import {isForestHarvestEnvironment} from './forest-harvest-config.js';

const point=value=>value&&[value.x,value.y??0,value.z].every(Number.isFinite);
const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y??0)-(b.y??0),a.z-b.z);
const text=value=>typeof value==='string'?value.trim():'';
const empty=()=>({visible:false,id:null,name:'Mossback',text:'',distance:null});
function recentConversation(self,now){
 return [self?.npcConversation,self?.vehicleMission].some(conversation=>{
  if(!conversation)return false;
  const lines=conversation.conversation||[];
  if(conversation.status==='active'&&lines.some(line=>line.conversation&&line.role==='player'))return true;
  return lines.some(line=>line.conversation&&Number.isFinite(line.at)&&now>=line.at&&now-line.at<12000);
 });
}

/** Ambient remarks are heard where they happen, never queued behind a guide or
 * a player-requested reply. Captions do not depend on audio permissions. */
export function createForestSnakeSpeech({voice=questConversationVoice(),render=()=>{},range=26,maxAge=5000,isConversationOpen=()=>false}={}){
 let scope=null,selfScope=null,ready=false,disposed=false,view=empty(),audioSource=null;
 const seen=new Set();let awaitingReply=false,replySequence=0;
 function remember(key){if(seen.has(key))return false;seen.add(key);while(seen.size>256)seen.delete(seen.values().next().value);return true;}
 function show(next){if(JSON.stringify(view)===JSON.stringify(next))return;view=next;render({...view});}
 function reset(){awaitingReply=false;scope=null;selfScope=null;ready=false;audioSource=null;show(empty());}
 return {
  update(snapshot,selfId,environment){
   if(disposed)return;
   const self=snapshot?.players?.[selfId],worldId=environment?.id||snapshot?.worldId;
   if(!isForestHarvestEnvironment(environment)||!self||!Number.isFinite(snapshot?.serverTime)){
    if(scope!==null||view.visible)reset();return;
   }
   if(scope!==worldId||selfScope!==selfId){scope=worldId;selfScope=selfId;ready=false;audioSource=null;show(empty());}
   const now=snapshot.serverTime,snake=snapshot.forestSnake||snapshot.forestHarvest?.snake,speech=snake?.speech;
   if(audioSource&&point(snake?.position))Object.assign(audioSource,snake.headPosition||snake.position,{y:(snake.headPosition||snake.position).y??0});
   const id=typeof speech?.id==='string'||Number.isFinite(speech?.id)?String(speech.id):'',spoken=text(speech?.text);
   const valid=!!id&&!!spoken&&Number.isFinite(speech.startedAt)&&Number.isFinite(speech.endsAt)&&speech.startedAt<=now&&speech.endsAt>now&&speech.endsAt-speech.startedAt<=30000;
   const eventKey=worldId+'\0'+(snake?.id||'forest-mossback')+'\0'+id;
   const fresh=valid&&remember(eventKey),wasReady=ready;ready=true;
   const actor=snapshot.actors?.[snake?.id],gap=point(self.position)&&point(snake?.position)?Math.min(distance(self.position,snake.position),point(snake.headPosition)?distance(self.position,snake.headPosition):Infinity):Infinity;
   const nearby=valid&&Number.isFinite(gap)&&gap<=range&&(self.health??100)>0&&actor?.active!==false;
   show(nearby?{visible:true,id,name:text(snake.name)||'Mossback',text:spoken,distance:Math.round(gap)}:empty());
   if(awaitingReply||!fresh||!wasReady||!nearby||now-speech.startedAt>maxAge||recentConversation(self,now)||isConversationOpen())return;
   const state=voice?.state||{};
   if(!state.unlocked||state.audioReady===false||state.muted||state.speaking||state.outputBusy||state.pending||state.loading||state.supported===false)return;
   audioSource={...(snake.headPosition||snake.position),y:(snake.headPosition||snake.position).y??0};
   voice.announce(spoken,{key:'forest-snake:'+eventKey,worldId,category:'dialogue',entityId:snake.id||'forest-mossback',source:audioSource,range:range*2,
    voice:text(snake.name)||'Mossback',role:'forest storyteller',personality:'A gentle, curious giant snake who tells whimsical woodland mysteries.',mood:'calm'});
  },
  requestReply(){awaitingReply=true;voice?.requestReply?.({worldId:scope,entityId:'forest-mossback'});},
  cancelReply(){awaitingReply=false;},
  reply(snapshot,selfId,environment){
   const snake=snapshot?.forestSnake||snapshot?.forestHarvest?.snake,speech=snapshot?.result?.snakeSpeech;
   if(disposed||!speech||!snake){awaitingReply=false;return false;}
   awaitingReply=true;this.update(snapshot,selfId,environment);awaitingReply=false;
   if(!view.visible||speech.id!==snake.speech?.id||speech.text!==snake.speech?.text||speech.startedAt!==snake.speech?.startedAt||speech.endsAt!==snake.speech?.endsAt)return false;
   audioSource={...(snake.headPosition||snake.position)};
   return voice?.announce?.(speech.text,{key:'forest-snake-request:'+ ++replySequence+':'+speech.id,worldId:scope,category:'dialogue',entityId:snake.id,source:audioSource,range:range*2,voice:snake.name||'Mossback',role:'forest storyteller',mood:'calm'})||false;
  },
  reset,
  dispose(){if(disposed)return;reset();disposed=true;},
  snapshot:()=>({...view})
 };
}

export function mountForestSnakeSpeech({stage,voice=questConversationVoice()}={}){
 if(!stage?.ownerDocument)throw new TypeError('A game stage is required for snake captions.');
 const document=stage.ownerDocument;
 if(!document.querySelector('#forest-snake-speech-style')){
  const link=document.createElement('link');link.id='forest-snake-speech-style';link.rel='stylesheet';link.href=new URL('../assets/forest-snake-speech.css',import.meta.url).href;document.head.append(link);
 }
 const caption=document.createElement('aside');caption.className='forest-snake-caption';caption.hidden=true;caption.setAttribute('aria-label','Mossback the wandering snake');caption.setAttribute('data-gameplay-blocking','false');
 const speaker=document.createElement('strong'),line=document.createElement('p');line.setAttribute('role','status');line.setAttribute('aria-live','polite');line.setAttribute('aria-atomic','true');caption.append(speaker,line);stage.append(caption);
 const controller=createForestSnakeSpeech({voice,isConversationOpen:()=>Boolean(document.querySelector('dialog:modal')),render:view=>{
  caption.hidden=!view.visible;caption.dataset.speechId=view.id||'';const name=view.visible?view.name+' · wandering snake':'',words=view.visible?view.text:'';if(speaker.textContent!==name)speaker.textContent=name;if(line.textContent!==words)line.textContent=words;
 }});
 return {...controller,dispose(){controller.dispose();caption.remove();}};
}
