import {bindGameActionButton} from './game-action-button.js';
import {stepDoomsday,doomsdayView} from './doomsday-rules.js';
import {createDoomsdayAudio} from './doomsday-audio.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const guidePreference='muzikaz.emergency.guide.hidden';
const briefings={
 warning:'This is Cole on emergency radio. Nuclear warning. Head for the marked continuity shelter. Detonations are expected shortly. Keep your radio on; I will guide you.',
 detonation:'Cole here. Detonations on the horizon! Stay under cover while the blast passes. Fallout is coming.',
 fallout:'Cole on emergency radio. Fallout has begun. Follow the green beam to the emergency supply cache. Recover the sealed relief supplies.',
 recovery:'Good work. Supplies secured. Get to the recovery relay and restore community communications. Follow the marked beacon.',
 'all-clear':'Cole to all responders. Communications restored. All clear. You can keep exploring; all routes and aircraft remain available.'
};
const portrait=`<svg viewBox="0 0 100 112" aria-hidden="true"><rect width="100" height="112" rx="13" fill="#142c29"/><path d="M10 112V93q4-21 40-21t40 21v19" fill="#a67432"/><path d="M39 70v13l11 9 12-9V70" fill="#b98059"/><ellipse cx="50" cy="46" rx="24" ry="30" fill="#d5a075"/><path d="M26 44V29q0-21 25-21 25 0 25 22v15L66 26 40 24Z" fill="#28312d"/><path d="M31 58q4 22 19 22t19-22l-9 9H40Z" fill="#4d4032"/><path d="M35 42h9m12 0h9" stroke="#4a3629" stroke-width="3" stroke-linecap="round"/><circle cx="40" cy="48" r="2" fill="#152525"/><circle cx="61" cy="48" r="2" fill="#152525"/><path d="m51 49-3 10h5" fill="none" stroke="#a66d4e" stroke-width="2"/><rect class="radio-mouth" x="44" y="65" width="14" height="3" rx="2" fill="#382b26"/><path d="M24 46v-9q0-31 27-31 27 0 27 31v9" fill="none" stroke="#5c7770" stroke-width="5"/><rect x="20" y="37" width="9" height="23" rx="4" fill="#1a2523"/><rect x="73" y="37" width="9" height="23" rx="4" fill="#1a2523"/><path d="M78 56v11H64" fill="none" stroke="#8aaca0" stroke-width="3"/><circle cx="63" cy="67" r="3" fill="#b5dcc1"/><path d="m17 111 9-37 9 4-4 34" fill="#c49365"/><rect x="14" y="66" width="21" height="36" rx="4" fill="#172c29" transform="rotate(-10 25 85)"/><path d="m20 67-5-19" stroke="#172c29" stroke-width="4" stroke-linecap="round"/><path d="m18 80 12-2m-11 8 12-2m-11 8 12-2" stroke="#668c7d" stroke-width="2"/><circle class="radio-led" cx="27" cy="73" r="2" fill="#d0ff73"/></svg>`;

// This guide presents the room event. Closing it never owns the simulation,
// interrupts input, or changes the automatic warning/explosion timeline.
export function mountDoomsdayUI({stage,getEnvironment,getPosition,getState=()=>null,isShared=()=>true,announce=()=>{},voice,getPreferences=()=>({}),effects,now=Date.now}={}){
 if(!document.querySelector('#doomsday-styles')){const link=document.createElement('link');link.id='doomsday-styles';link.rel='stylesheet';link.href=new URL('../assets/doomsday.css',import.meta.url).href;document.head.append(link);}
 let guideHidden=false;try{guideHidden=localStorage.getItem(guidePreference)==='true';}catch{}
 const chip=document.createElement('button');chip.type='button';chip.className='doomsday-guide-chip';chip.hidden=true;chip.innerHTML='<span aria-hidden="true">◉</span> Radio guide';chip.setAttribute('aria-label','Show emergency guide');chip.setAttribute('aria-controls','doomsday-panel');chip.setAttribute('aria-expanded','false');
 const panel=document.createElement('section');panel.id='doomsday-panel';panel.className='doomsday-panel doomsday-guide';panel.hidden=true;panel.dataset.gameOverlay='emergency-guide';panel.dataset.gameplayBlocking='false';panel.dataset.speaking='false';panel.setAttribute('aria-label','Emergency radio guide');
 panel.innerHTML=`<header><div><small>LIVE · EMERGENCY CHANNEL 01</small><h3>Cole · radio guide</h3></div><button type="button" data-hide aria-label="Hide emergency guide">−</button></header><div class="doomsday-dispatch"><div class="doomsday-portrait">${portrait}</div><div class="doomsday-transmission"><span data-radio-status>RADIO CONNECTED</span><div class="doomsday-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><p data-transcript>Standing by for emergency dispatch.</p></div></div><div data-scenario></div><div class="doomsday-audio"><button type="button" data-siren aria-pressed="false">Mute sirens</button><button type="button" data-replay>Replay radio</button></div><p class="doomsday-guide-hint">Follow the beams. Quests register on arrival. Hide this guide to keep exploring.</p>`;
 const banner=document.createElement('div');banner.className='doomsday-banner';banner.hidden=true;banner.setAttribute('role','status');banner.innerHTML='<span aria-hidden="true">☢</span><div><strong data-phase></strong><small data-task></small><time data-countdown></time></div>';
 stage.append(chip,panel,banner);
 const audio=createDoomsdayAudio({getPreferences,isSpeaking:()=>!!(voice?.state?.speaking||voice?.state?.outputBusy)});
 let local={},worldId=null,state=null,disposed=false,generation=0,signature='',spoken='',runId=null,shelterSeen=null,rawState=null,receivedAt=0,transcript='',radioSequence=0,activeRadio=0,minimumRadio=0,speechActive=false;
 const showGuide=()=>{const available=!!state&&state.phase!=='idle';panel.hidden=!available||guideHidden;chip.hidden=!available||!guideHidden;chip.setAttribute('aria-expanded',String(!panel.hidden));};
 function hideGuide(value){guideHidden=value;try{localStorage.setItem(guidePreference,String(value));}catch{}showGuide();}
 function speaking(value){speechActive=value;panel.dataset.speaking=String(value);chip.dataset.speaking=String(value);panel.querySelector('[data-radio-status]').textContent=value?'COLE · TRANSMITTING':'RADIO CONNECTED';}
 function speak(text,key,{priority='emergency'}={}){
  const at=generation,sequence=++radioSequence;
  const caption=()=>{transcript=text;panel.querySelector('[data-transcript]').textContent=text;};
  if(priority==='emergency'){minimumRadio=sequence;caption();}else if(!transcript)caption();
  const done=()=>{if(at===generation&&activeRadio===sequence){activeRadio=0;speaking(false);}};
  voice?.announce?.(text,{key:'automatic-response:'+key,worldId,category:'announcements',voice:'Emergency dispatch',role:'dispatcher',voiceGender:'male',effect:'walkie',priority,
   onStarted:()=>{if(at===generation&&sequence>=minimumRadio){activeRadio=sequence;caption();speaking(true);}},onFinished:done,onCancelled:done,onError:done});
 }
 const fixed=[bindGameActionButton(chip,()=>hideGuide(false)),bindGameActionButton(panel.querySelector('[data-hide]'),()=>hideGuide(true))];
 fixed.push(bindGameActionButton(panel.querySelector('[data-siren]'),()=>{const muted=audio.setMuted(!audio.muted);panel.querySelector('[data-siren]').textContent=muted?'Enable sirens':'Mute sirens';panel.querySelector('[data-siren]').setAttribute('aria-pressed',String(muted));}));
 fixed.push(bindGameActionButton(panel.querySelector('[data-replay]'),()=>{if(transcript)speak(transcript,'replay:'+now());}));
 const keydown=event=>{if(event.key==='Escape'&&!panel.hidden){hideGuide(true);chip.focus();}};panel.addEventListener('keydown',keydown);
 function render(){
  if(!state)return;const next=state.objectives.find(o=>o.id===state.currentObjectiveId)||state.objectives.find(o=>o.phase===state.phase&&!o.completed);
  const nextSignature=JSON.stringify([state.id,state.revision,state.phase,state.objectives.map(o=>o.completed)]);
  if(signature!==nextSignature){signature=nextSignature;
   const required=state.objectives.filter(o=>!o.optional),completed=required.filter(o=>o.completed).length;
   panel.querySelector('[data-scenario]').innerHTML=`<div class="doomsday-phase" data-phase="${escape(state.phase)}"><small>${escape(getEnvironment()?.name||'Current map')}</small><h4>${escape(state.phaseLabel)}</h4><p>${escape(state.message)}</p><progress max="${required.length||2}" value="${completed}" aria-label="Response objectives completed"></progress><span>${completed} / ${required.length||2} response quests · shelter optional</span></div><ol class="doomsday-objectives">${state.objectives.map(o=>`<li class="${o.completed?'is-complete':o===next?'is-current':''}"><strong>${o.completed?'✓ ':''}${escape(o.name)}${o.id==='shelter'?' · optional':''}</strong><span>${escape(o.description)}</span><small data-site="${escape(o.id)}">${Math.round(o.position.x)}, ${Math.round(o.position.z)}</small></li>`).join('')}</ol>`;
  }
  showGuide();banner.hidden=state.phase==='idle';banner.dataset.phase=state.phase;banner.querySelector('[data-phase]').textContent=state.phaseLabel;
  banner.querySelector('[data-task]').textContent=next?next.name:state.phase==='detonation'?'Take cover · fallout approaching':state.phase==='all-clear'?'Communications restored':'';
  if(next){const distance=Math.round(Math.hypot(next.position.x-getPosition().x,next.position.z-getPosition().z)),site=panel.querySelector(`[data-site="${next.id}"]`);if(site)site.textContent=`${distance} m · registers on arrival`;}
 }
 function tick(time=0,{reducedMotion=false}={}){
  if(disposed)return;panel.dataset.reducedMotion=String(reducedMotion);const environment=getEnvironment();
  if(worldId!==environment?.id){worldId=environment?.id;local={};generation++;signature=spoken='';runId=null;shelterSeen=null;activeRadio=0;minimumRadio=radioSequence+1;rawState=state=null;audio.stop();effects?.reset();speaking(false);panel.hidden=chip.hidden=banner.hidden=true;}
  if(!environment){audio.stop();return;}
  if(isShared()){
   const incoming=getState();if(!incoming||incoming.mapId!==worldId){panel.hidden=chip.hidden=banner.hidden=true;audio.stop();effects?.reset();return;}
   if(rawState!==incoming){rawState=incoming;receivedAt=time;}
   state={...incoming,presentationTime:(incoming.serverTime||now())+Math.max(0,time-receivedAt)*1000};
  }else{
   stepDoomsday(local,environment,now(),{players:[{id:'local',health:100,position:getPosition()}]});
   state=doomsdayView(local,environment);state.presentationTime=state.serverTime;
  }
  render();
  const phaseKey=state.id+':'+state.phase;
  if(runId!==state.id){runId=state.id;shelterSeen=null;}
  if(spoken!==phaseKey){spoken=phaseKey;speaking(false);if(briefings[state.phase]){speak(briefings[state.phase],phaseKey);announce(state.phaseLabel+'. '+state.message);}}
  const shelter=state.objectives.find(o=>o.id==='shelter');
  if(shelterSeen===false&&shelter?.completed&&state.phase==='warning')speak('Shelter reached. Stay ready and keep the radio on. I will call when the fallout begins.',state.id+':shelter',{priority:'normal'});
  shelterSeen=!!shelter?.completed;
  const remaining=state.phaseEndsAt?Math.max(0,Math.ceil((state.phaseEndsAt-state.presentationTime)/1000)):0;
  banner.querySelector('[data-countdown]').textContent=remaining?(state.phase==='warning'?'Detonations in ':'Fallout in ')+remaining+'s':'';
  // Voice callbacks own the talking animation; hiding the guide never mutes it.
  if(speechActive&&voice?.state&&!voice.state.speaking&&!voice.state.outputBusy)speaking(false);
  audio.update(state,time);effects?.update(state,environment,getPosition(),time,{reducedMotion});
 }
 return {tick,open:()=>hideGuide(false),getState:()=>state,reset(){worldId=null;state=rawState=null;generation++;minimumRadio=++radioSequence;activeRadio=0;audio.stop();effects?.reset();speaking(false);panel.hidden=chip.hidden=banner.hidden=true;},dispose(){if(disposed)return;disposed=true;generation++;radioSequence++;audio.dispose();effects?.dispose();for(const unbind of fixed)unbind();panel.removeEventListener('keydown',keydown);chip.remove();panel.remove();banner.remove();}};
}
