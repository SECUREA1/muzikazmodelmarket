import {bindGameActionButton} from './game-action-button.js';
import {stepDoomsday,doomsdayView,isDoomsdayObjectiveNearby} from './doomsday-rules.js';
import {createDoomsdayAudio} from './doomsday-audio.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const guidePreference='muzikaz.emergency.guide.hidden';
const challengePreference='muzikaz.emergency.challenge.follow';
const noticeIntervalMs=45000;
const briefings={
 warning:'This is Cole on emergency radio. Nuclear warning. Head for the marked continuity shelter. Detonations are expected shortly. Keep your radio on; I will guide you.',
 detonation:'Cole here. Detonations on the horizon! Stay under cover while the blast passes. Fallout is coming.',
 fallout:'Cole on emergency radio. Fallout has begun. Follow the green beam to the emergency supply cache. Recover the sealed relief supplies.',
 recovery:'Cole here. The fallout is easing. Reach the recovery relay if you can and restore community communications. Follow the marked beacon.',
 clearing:'Cole on emergency radio. The fallout is lifting and the warning lights are powering down. Conditions are clearing. Keep exploring.',
 'all-clear':'Cole to all responders. This alert has passed. All clear. Normal conditions are returning. Keep exploring; I will call again if another warning arrives.'
};
const ambientBriefings={
 warning:'This is Cole on emergency radio. Nuclear warning. Take cover; detonations are expected shortly. Keep your radio on.',
 detonation:'Cole here. Detonations on the horizon! Stay under cover while the blast passes. Fallout is coming.',
 fallout:'Cole on emergency radio. Fallout has begun. Fallout is drifting across the area. The emergency response is still underway.',
 recovery:'Cole here. Recovery is underway. The emergency alert remains active while community communications are restored. Stand by for the all-clear.',
 clearing:briefings.clearing,
 'all-clear':briefings['all-clear']
};
const statusNotices={
 fallout:'Cole on emergency radio. The fallout alert remains active. The emergency response is continuing. Stay clear of the blast zone and keep your radio on.',
 recovery:'Cole here. Emergency recovery is still underway. The alert remains active. Stand by for the all-clear.'
};
const challengeNotices={
 fallout:'Cole on emergency radio. The fallout warning remains active. Follow the green supply beacon and collect the sealed relief supplies.',
 recovery:'Cole here. Restore the marked recovery relay to complete the response. The emergency alert remains active until communications are restored.'
};
const shelteredBriefings={
 warning:'Your shelter arrival is confirmed. Stay under cover until the blasts pass. The supply response comes after fallout begins.',
 detonation:'Your shelter arrival is confirmed. Detonations are on the horizon. Stay under cover until the blast passes; fallout is coming.'
};
const shelteredAmbientBriefings={
 fallout:'Cole on emergency radio. Fallout has begun. Relief supply collection is the next response step. Turn on Follow challenge for directions and markers. The emergency response remains active.',
 recovery:'Cole here. Recovery is underway. Restoring community communications is the next response step. Turn on Follow challenge for directions and markers. The alert remains active until all-clear.'
};
function shelterBriefing(phase,following){
 const arrival='Cole here. Shelter reached. Your arrival is confirmed. ';
 if(phase==='warning')return arrival+'Stay under cover; detonations are expected shortly. The supply response comes after the blasts and fallout. Keep your radio on for the next stage.';
 if(phase==='detonation')return arrival+'Detonations are on the horizon. Stay under cover until the blast passes. The supply response comes next when fallout begins.';
 if(phase==='fallout')return arrival+(following?'Fallout has begun. Next, follow the green supply beacon and collect the sealed relief supplies.':'Fallout is drifting across the area. Relief supply collection is the next response step. Turn on Follow challenge in the radio guide for directions and markers.');
 return arrival+(following?'Recovery is underway. Next, reach the marked recovery relay and restore emergency communications.':'Recovery is underway and the alert remains active. Restoring community communications is the next response step. Turn on Follow challenge in the radio guide for directions and markers.');
}
const portrait=`<svg viewBox="0 0 100 112" aria-hidden="true"><rect width="100" height="112" rx="13" fill="#142c29"/><path d="M10 112V93q4-21 40-21t40 21v19" fill="#a67432"/><path d="M39 70v13l11 9 12-9V70" fill="#b98059"/><ellipse cx="50" cy="46" rx="24" ry="30" fill="#d5a075"/><path d="M26 44V29q0-21 25-21 25 0 25 22v15L66 26 40 24Z" fill="#28312d"/><path d="M31 58q4 22 19 22t19-22l-9 9H40Z" fill="#4d4032"/><path d="M35 42h9m12 0h9" stroke="#4a3629" stroke-width="3" stroke-linecap="round"/><circle cx="40" cy="48" r="2" fill="#152525"/><circle cx="61" cy="48" r="2" fill="#152525"/><path d="m51 49-3 10h5" fill="none" stroke="#a66d4e" stroke-width="2"/><rect class="radio-mouth" x="44" y="65" width="14" height="3" rx="2" fill="#382b26"/><path d="M24 46v-9q0-31 27-31 27 0 27 31v9" fill="none" stroke="#5c7770" stroke-width="5"/><rect x="20" y="37" width="9" height="23" rx="4" fill="#1a2523"/><rect x="73" y="37" width="9" height="23" rx="4" fill="#1a2523"/><path d="M78 56v11H64" fill="none" stroke="#8aaca0" stroke-width="3"/><circle cx="63" cy="67" r="3" fill="#b5dcc1"/><path d="m17 111 9-37 9 4-4 34" fill="#c49365"/><rect x="14" y="66" width="21" height="36" rx="4" fill="#172c29" transform="rotate(-10 25 85)"/><path d="m20 67-5-19" stroke="#172c29" stroke-width="4" stroke-linecap="round"/><path d="m18 80 12-2m-11 8 12-2m-11 8 12-2" stroke="#668c7d" stroke-width="2"/><circle class="radio-led" cx="27" cy="73" r="2" fill="#d0ff73"/></svg>`;

// This guide presents the room event. Closing it never owns the simulation,
// interrupts input, or changes the automatic warning/explosion timeline.
export function mountDoomsdayUI({stage,getEnvironment,getPosition,getState=()=>null,isShared=()=>true,announce=()=>{},voice,getPreferences=()=>({}),onEnableAudio=()=>{},effects,now=Date.now,random=Math.random}={}){
 if(!document.querySelector('#doomsday-styles')){const link=document.createElement('link');link.id='doomsday-styles';link.rel='stylesheet';link.href=new URL('../assets/doomsday.css',import.meta.url).href;document.head.append(link);}
 let guideHidden=false,followChallenge=false;try{guideHidden=localStorage.getItem(guidePreference)==='true';followChallenge=localStorage.getItem(challengePreference)==='true';}catch{}
 const chip=document.createElement('button');chip.type='button';chip.className='doomsday-guide-chip';chip.hidden=true;chip.innerHTML='<span aria-hidden="true">◉</span><span>Radio &amp; sound<small data-chip-audio>Tap to check sound</small></span>';chip.setAttribute('aria-label','Show emergency guide');chip.setAttribute('aria-controls','doomsday-panel');chip.setAttribute('aria-expanded','false');
 const panel=document.createElement('section');panel.id='doomsday-panel';panel.className='doomsday-panel doomsday-guide';panel.hidden=true;panel.dataset.gameOverlay='emergency-guide';panel.dataset.gameplayBlocking='false';panel.dataset.speaking='false';panel.setAttribute('aria-label','Emergency radio guide');
 panel.innerHTML=`<header><div><small data-panel-phase>Emergency standby</small><h3>Emergency radio</h3></div><button type="button" data-hide aria-label="Hide emergency guide">Hide</button></header><div class="doomsday-panel-content"><div class="doomsday-sound-controls" aria-label="Emergency sound controls"><label class="doomsday-switch-row"><span>Sirens &amp; blasts<strong data-sound-state>Off</strong></span><input type="checkbox" role="switch" data-siren aria-label="Sirens and explosions"></label><p data-audio-status role="status" aria-live="polite">Tap Enable sounds to hear the emergency.</p><div class="doomsday-audio"><button type="button" data-enable>Enable sounds</button><button type="button" data-test>Test sounds</button></div><p class="doomsday-audio-help">Enable sirens, explosions and radio for this session. Turning effects off leaves radio calls on.</p><small class="doomsday-device-hint">If quiet, raise your phone’s media volume.</small></div><label class="doomsday-switch-row doomsday-challenge-toggle"><span>Follow challenge<strong data-follow-state>Off</strong><small id="doomsday-follow-hint">Quest directions and markers. The event continues either way.</small></span><input type="checkbox" role="switch" data-follow-challenge aria-label="Follow emergency challenge" aria-describedby="doomsday-follow-hint"></label><div class="doomsday-dispatch"><div class="doomsday-portrait">${portrait}</div><div class="doomsday-transmission"><span data-radio-status>RADIO CONNECTED</span><div class="doomsday-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><p data-transcript>Standing by for emergency dispatch.</p></div></div><button type="button" class="doomsday-replay" data-replay>Replay radio</button><div data-scenario></div><p class="doomsday-guide-hint">Hide this guide to see more of the world. Sound and the event stay active.</p></div><p class="doomsday-scroll-hint" aria-hidden="true">Swipe up for challenge &amp; radio ↑</p>`;
 const banner=document.createElement('div');banner.className='doomsday-banner';banner.hidden=true;banner.setAttribute('role','status');banner.innerHTML='<span aria-hidden="true">☢</span><div><strong data-phase></strong><small data-task></small><time data-countdown></time></div>';
 stage.append(chip,panel,banner);
 const followControl=panel.querySelector('[data-follow-challenge]');followControl.checked=followChallenge;panel.dataset.followChallenge=String(followChallenge);
 const audio=createDoomsdayAudio({getPreferences,isSpeaking:()=>!!(voice?.state?.audible??voice?.state?.speaking)});
 let manualGuideOpen=false,audioBusy=false,enableSequence=0;
 let local={},worldId=null,state=null,disposed=false,generation=0,signature='',spoken='',runId=null,shelterArrived=false,rawState=null,receivedAt=0,transcript='',radioSequence=0,captionSequence=0,activeRadio=0,minimumRadio=0,speechActive=false,nextNoticeAt=0,noticeSequence=0;
 const guideAvailable=()=>!!state&&state.phase!=='idle'&&(state.phase!=='all-clear'||state.presentationTime-state.phaseStartedAt<8000);
 const showGuide=()=>{const available=!!state&&!!getEnvironment();panel.hidden=!available||guideHidden||!guideAvailable()&&!manualGuideOpen;chip.hidden=!available||!panel.hidden;chip.setAttribute('aria-expanded',String(!panel.hidden));};
 function hideGuide(value){if(value)manualGuideOpen=false;else manualGuideOpen=!guideAvailable();guideHidden=value;try{localStorage.setItem(guidePreference,String(value));}catch{}showGuide();}
 function currentBriefing(description=false){
  if(shelterArrived){const line=shelteredBriefings[state.phase]||(!followChallenge&&shelteredAmbientBriefings[state.phase]);if(line)return line;}
  return description?followChallenge?state.message:ambientBriefings[state.phase]||state.message:(followChallenge?briefings:ambientBriefings)[state.phase];
 }
 function speaking(value){speechActive=value;panel.dataset.speaking=String(value);chip.dataset.speaking=String(value);panel.querySelector('[data-radio-status]').textContent=value?'COLE · TRANSMITTING':'RADIO CONNECTED';}
 function speak(text,key,{priority='emergency',captionNow=false}={}){
  const at=generation,sequence=++radioSequence;
  const caption=()=>{if(sequence<captionSequence)return;captionSequence=sequence;transcript=text;panel.querySelector('[data-transcript]').textContent=text;};
  if(priority==='emergency'){minimumRadio=sequence;caption();}else if(captionNow||!transcript)caption();
  const done=()=>{if(at===generation&&activeRadio===sequence){activeRadio=0;speaking(false);}};
  voice?.announce?.(text,{key:'automatic-response:'+key,worldId,category:'announcements',voice:'Emergency dispatch',role:'dispatcher',voiceGender:'male',effect:'walkie',priority,
   onStarted:()=>{if(at===generation&&sequence>=minimumRadio){activeRadio=sequence;caption();speaking(true);}},onFinished:done,onCancelled:done,onError:done});
 }
 const fixed=[bindGameActionButton(chip,()=>hideGuide(false)),bindGameActionButton(panel.querySelector('[data-hide]'),()=>hideGuide(true))];
 const soundControl=panel.querySelector('[data-siren]'),audioStatus=panel.querySelector('[data-audio-status]'),enableButton=panel.querySelector('[data-enable]'),testButton=panel.querySelector('[data-test]'),replayButton=panel.querySelector('[data-replay]'),soundState=panel.querySelector('[data-sound-state]'),followState=panel.querySelector('[data-follow-state]'),chipAudio=chip.querySelector('[data-chip-audio]');
 const setText=(node,text)=>{if(node.textContent!==text)node.textContent=text;};
 function renderAudio(){
  const status=audio.status||{code:'locked',label:'Tap Enable sounds to hear the emergency.'},code=status.code||status.state;
  const enabled=['ready','playing'].includes(code),available=code!=='hidden';
  panel.dataset.audioState=code;chip.dataset.audioState=code;soundControl.checked=enabled;
  setText(soundState,enabled?'On':'Off');setText(followState,followChallenge?'On':'Off');
  setText(chipAudio,enabled?'Effects on':'Effects off · tap to fix');
  setText(audioStatus,audioBusy?'Enabling sound…':status.label);
  enableButton.hidden=enabled;enableButton.disabled=!available;
  testButton.disabled=audioBusy||!available||!enabled||status.previewing;setText(testButton,status.previewing?'Playing test…':'Test sounds');
  replayButton.disabled=!transcript;
 }
 function enableSounds(){
  const attempt=++enableSequence;audioBusy=true;
  try{onEnableAudio();}catch{audioBusy=false;renderAudio();return;}
  audio.setMuted(false);const unlocked=audio.unlock?.();voice?.unlock?.();renderAudio();
  Promise.resolve(unlocked).then(ready=>{if(!disposed&&attempt===enableSequence&&ready)return audio.preview?.();}).catch(()=>{}).finally(()=>{if(!disposed&&attempt===enableSequence){audioBusy=false;renderAudio();}});
 }
 const soundChanged=()=>{if(soundControl.checked)enableSounds();else{audio.setMuted(true);renderAudio();}};
 soundControl.addEventListener('change',soundChanged);
 fixed.push(bindGameActionButton(enableButton,enableSounds));
 fixed.push(bindGameActionButton(testButton,()=>{audio.preview?.();renderAudio();}));
 fixed.push(bindGameActionButton(replayButton,()=>{if(transcript){audio.unlock?.();voice?.unlock?.();speak(transcript,'replay:'+now());}}));
 const followChanged=()=>{
  followChallenge=followControl.checked;panel.dataset.followChallenge=String(followChallenge);
  try{localStorage.setItem(challengePreference,String(followChallenge));}catch{}
  signature='';render();renderAudio();nextNoticeAt=(state?.presentationTime||now())+noticeIntervalMs;
  if(state?.active){const line=currentBriefing();if(line)speak((followChallenge?'Following the emergency challenge. ':'Challenge tracking off. ')+line,'follow:'+now(),{priority:followChallenge?'normal':'emergency'});}
 };
 followControl.addEventListener('change',followChanged);
 const keydown=event=>{if(event.key==='Escape'&&!panel.hidden){hideGuide(true);chip.focus();}};panel.addEventListener('keydown',keydown);
 function render(){
  if(!state)return;const next=followChallenge?(state.objectives.find(o=>o.id===state.currentObjectiveId)||state.objectives.find(o=>o.phase===state.phase&&!o.completed)):null;
  const nextSignature=JSON.stringify([state.id,state.revision,state.phase,followChallenge,shelterArrived,state.objectives.map(o=>o.completed)]);
  if(signature!==nextSignature){signature=nextSignature;
   const required=state.objectives.filter(o=>!o.optional),completed=required.filter(o=>o.completed).length;
   panel.querySelector('[data-scenario]').innerHTML=`<div class="doomsday-phase" data-phase="${escape(state.phase)}"><small>${escape(getEnvironment()?.name||'Current map')}</small><h4>${escape(state.phaseLabel)}</h4><p>${escape(currentBriefing(true))}</p></div><div data-challenge ${followChallenge?'':'hidden'}><progress max="${required.length||2}" value="${completed}" aria-label="Response objectives completed"></progress><span>${completed} / ${required.length||2} response quests · shelter optional</span><ol class="doomsday-objectives">${state.objectives.map(o=>`<li class="${o.completed?'is-complete':o===next?'is-current':''}"><strong>${o.completed?'✓ ':''}${escape(o.name)}${o.id==='shelter'?' · optional':''}</strong><span>${escape(o.description)}</span><small data-site="${escape(o.id)}">${Math.round(o.position.x)}, ${Math.round(o.position.z)}</small></li>`).join('')}</ol></div>`;
  }
  showGuide();panel.querySelector('[data-panel-phase]').textContent=state.phase==='idle'?'Standing by · explore freely':state.phaseLabel;banner.hidden=!guideAvailable();banner.dataset.phase=state.phase;banner.querySelector('[data-phase]').textContent=state.phaseLabel;
  banner.querySelector('[data-task]').textContent=shelterArrived&&['warning','detonation'].includes(state.phase)?'Shelter reached · stay under cover':next?next.name:state.phase==='warning'?'Incoming alert · take cover':state.phase==='fallout'?'Fallout alert active · emergency response underway':state.phase==='recovery'?'Emergency response active · awaiting all clear':state.phase==='detonation'?'Take cover · fallout approaching':state.phase==='clearing'?'Final clearance · normal conditions returning':state.phase==='all-clear'?'The alert has passed':'';
  if(next){const distance=Math.round(Math.hypot(next.position.x-getPosition().x,next.position.z-getPosition().z)),site=panel.querySelector(`[data-site="${next.id}"]`);if(site)site.textContent=`${distance} m · registers on arrival`;}
 }
 function tick(time=0,{reducedMotion=false}={}){
  if(disposed)return;panel.dataset.reducedMotion=String(reducedMotion);const environment=getEnvironment();
  if(worldId!==environment?.id){worldId=environment?.id;local={};manualGuideOpen=false;enableSequence++;audioBusy=false;generation++;signature=spoken='';runId=null;shelterArrived=false;nextNoticeAt=0;activeRadio=0;minimumRadio=radioSequence+1;rawState=state=null;audio.stop();effects?.reset();speaking(false);panel.hidden=chip.hidden=banner.hidden=true;}
  if(!environment){audio.stop();return;}
  if(isShared()){
   const incoming=getState();if(!incoming||incoming.mapId!==worldId){panel.hidden=chip.hidden=banner.hidden=true;audio.stop();effects?.reset();return;}
   if(rawState!==incoming){rawState=incoming;receivedAt=time;}
   state={...incoming,presentationTime:(incoming.serverTime||now())+Math.max(0,time-receivedAt)*1000};
  }else{
   stepDoomsday(local,environment,now(),{players:[{id:'local',health:100,position:getPosition()}],random});
   state=doomsdayView(local,environment);state.presentationTime=state.serverTime;
  }
  if(state.active)manualGuideOpen=false;
  const phaseKey=state.id+':'+state.phase;
  if(runId!==state.id){runId=state.id;shelterArrived=false;}
  const shelter=state.objectives.find(o=>o.id==='shelter');
  // The room objective belongs to the first responder. Arrival feedback is
  // personal: another player checking in cannot acknowledge this viewer.
  const arrivedNow=!shelterArrived&&state.active&&['warning','detonation','fallout','recovery'].includes(state.phase)&&isDoomsdayObjectiveNearby(getPosition(),shelter);
  if(arrivedNow)shelterArrived=true;
  render();
  if(spoken!==phaseKey){
   spoken=phaseKey;nextNoticeAt=state.presentationTime+noticeIntervalMs;speaking(false);
   const line=arrivedNow?shelterBriefing(state.phase,followChallenge):currentBriefing();
   if(line){speak(line,phaseKey);announce(state.phaseLabel+'. '+line);}
  }else if(arrivedNow){
   const line=shelterBriefing(state.phase,followChallenge);nextNoticeAt=state.presentationTime+noticeIntervalMs;
   speak(line,state.id+':shelter',{priority:'normal',captionNow:true});announce(line);
  }
  const remaining=state.phaseEndsAt?Math.max(0,Math.ceil((state.phaseEndsAt-state.presentationTime)/1000)):0;
  const countdownLabel={warning:'Detonations in ',detonation:'Fallout in ',fallout:'Recovery in ',recovery:'Clearing in ',clearing:'Normal conditions in '}[state.phase]||'';
  banner.querySelector('[data-countdown]').textContent=remaining&&countdownLabel?countdownLabel+remaining+'s':'';
  // Voice callbacks own the talking animation; hiding the guide never mutes it.
  if(speechActive&&voice?.state&&!voice.state.speaking&&!voice.state.outputBusy)speaking(false);
  // Long quest-held phases keep reporting their actual status. Wait for an
  // idle radio, send one update, then start a fresh interval: clock jumps and
  // background tabs never produce a backlog of overdue announcements.
  const notice=(followChallenge?challengeNotices:statusNotices)[state.phase],voiceState=voice?.state||{};
  if(state.active&&notice&&state.presentationTime>=nextNoticeAt&&!document.hidden&&!speechActive&&!voiceState.speaking&&!voiceState.outputBusy&&!voiceState.loading&&!voiceState.pending){
   nextNoticeAt=state.presentationTime+noticeIntervalMs;
   const key=phaseKey+':status:'+ ++noticeSequence,preferences=getPreferences();
   if(voice?.announce&&voiceState.supported!==false&&voiceState.unlocked!==false&&!(voiceState.announcementsMuted??voiceState.muted)&&!preferences.masterMuted&&!preferences.announcementsMuted){
    speak(notice,key,{priority:'normal',captionNow:true});
   }else{transcript=notice;panel.querySelector('[data-transcript]').textContent=notice;}
   announce(state.phaseLabel+'. '+notice);
  }
  audio.update(state,time);renderAudio();effects?.update(state,environment,getPosition(),time,{reducedMotion,showObjectives:followChallenge});
 }
 return {tick,open:()=>hideGuide(false),getState:()=>state,followingChallenge:()=>followChallenge,reset(){manualGuideOpen=false;enableSequence++;audioBusy=false;worldId=null;state=rawState=null;generation++;nextNoticeAt=0;minimumRadio=++radioSequence;activeRadio=0;audio.stop();effects?.reset();speaking(false);panel.hidden=chip.hidden=banner.hidden=true;},dispose(){if(disposed)return;disposed=true;enableSequence++;audioBusy=false;generation++;radioSequence++;audio.dispose();effects?.dispose();for(const unbind of fixed)unbind();panel.removeEventListener('keydown',keydown);followControl.removeEventListener('change',followChanged);soundControl.removeEventListener('change',soundChanged);chip.remove();panel.remove();banner.remove();}};
}
