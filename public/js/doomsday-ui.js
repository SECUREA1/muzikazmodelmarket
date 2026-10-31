import {emergencyGameFlow} from './emergency-game-flow.js';
import {shelterGuidance} from './shelter-guidance.js';
import {bindGameActionButton} from './game-action-button.js';
import {stepDoomsday,doomsdayView,isDoomsdayObjectiveNearby} from './doomsday-rules.js';
import {createDoomsdayAudio} from './doomsday-audio.js';
import {doomsdayResponseStatus} from './doomsday-response-flight.js';

const setShelterText=(node,help)=>{const text=help.label+'. '+help.message;if(node.textContent!==text)node.textContent=text;};
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const automaticPanelPreference='muzikaz.emergency.panel.automatic';
const challengePreference='muzikaz.emergency.challenge.follow';
const noticeIntervalMs=45000;
const briefings={
 warning:'This is Cole on emergency radio. Nuclear warning. Command flight is departing. Reach the marked continuity shelter. Detonations are expected shortly. Keep your radio on.',
 detonation:'Cole here. Detonations on the horizon! Stay under cover while the blast passes. Command flight is holding clear; fallout is coming.',
 fallout:'Cole on emergency radio. Fallout has begun. Relief aircraft are circling overhead. Follow the green beam to the emergency supply cache. Recover the sealed relief supplies.',
 recovery:'Supplies secured. Cole here. Relief aircraft are returning. Reach the marked recovery relay and restore community communications.',
 clearing:'Cole on emergency radio. Response aircraft are clearing the area. Fallout and warning lights are fading. Normal conditions are returning.',
 'all-clear':'Cole to all responders. This alert has passed. All clear. Normal conditions are returning. Keep exploring; I will call again if another warning arrives.'
};
const ambientBriefings={
 warning:'This is Cole on emergency radio. Nuclear warning. Command flight is departing. Take cover; detonations are expected shortly. Keep your radio on.',
 detonation:briefings.detonation,
 fallout:'Cole on emergency radio. Fallout has begun. Relief aircraft are circling overhead. The emergency response is still underway.',
 recovery:'Cole here. Recovery is underway. Relief aircraft are returning. The emergency alert remains active while community communications are restored. Stand by for the all-clear.',
 clearing:briefings.clearing,
 'all-clear':briefings['all-clear']
};
const statusNotices={
 fallout:'Cole on emergency radio. The fallout alert remains active. Relief flights are continuing their circuits. Stay clear of the blast zone and keep your radio on.',
 recovery:'Cole here. Emergency recovery is still underway. Response aircraft are returning. The alert remains active. Stand by for the all-clear.'
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
const mountedEmergencyUI=new WeakMap();
export function mountDoomsdayUI({stage,getEnvironment,getPosition,getState=()=>null,isShared=()=>true,announce=()=>{},voice,getPreferences=()=>({}),onEnableAudio=()=>{},getEvacuation=()=>null,onBoardAircraft=null,effects,now=Date.now,random=Math.random}={}){
 if(mountedEmergencyUI.has(stage))return mountedEmergencyUI.get(stage);
 const popups=document.createElement('section');popups.id='emergency-radio-popup';popups.className='emergency-popup-stack emergency-radio-popup doomsday-guide';popups.setAttribute('role','region');popups.setAttribute('aria-label','Emergency radio');popups.hidden=true;popups.dataset.gameplayBlocking='false';stage.append(popups);
 if(!document.querySelector('#doomsday-styles')){const link=document.createElement('link');link.id='doomsday-styles';link.rel='stylesheet';link.href=new URL('../assets/doomsday.css',import.meta.url).href;document.head.append(link);}
 let followChallenge=false,automaticPanel=true;try{followChallenge=localStorage.getItem(challengePreference)==='true';automaticPanel=localStorage.getItem(automaticPanelPreference)!=='false';}catch{}
 const panel=document.createElement('section');panel.id='doomsday-panel';panel.className='doomsday-panel doomsday-guide';panel.hidden=true;panel.dataset.gameOverlay='emergency-guide';panel.dataset.gameplayBlocking='false';panel.dataset.speaking='false';panel.setAttribute('aria-label','Emergency radio guide');
 panel.innerHTML=`<header><div><small data-panel-phase>Emergency standby</small><h3>Emergency response</h3></div><button type="button" data-hide aria-label="Close emergency menu">Close menu</button></header><div class="doomsday-panel-content"><div class="doomsday-sound-controls" aria-label="Emergency sound controls"><label class="doomsday-switch-row"><span>Sirens &amp; blasts<strong data-sound-state>Off</strong></span><input type="checkbox" role="switch" data-siren aria-label="Sirens and explosions"></label><p data-audio-status role="status" aria-live="polite">Tap Enable sounds to hear the emergency.</p><div class="doomsday-audio"><button type="button" data-enable>Enable sounds</button><button type="button" data-test>Test sounds</button></div><p class="doomsday-audio-help">Enable sirens, explosions and radio for this session. Turning effects off leaves radio calls on.</p><small class="doomsday-device-hint">If quiet, raise your phone’s media volume.</small></div><label class="doomsday-switch-row doomsday-challenge-toggle"><span>Follow challenge<strong data-follow-state>Off</strong><small id="doomsday-follow-hint">Quest directions and markers. The event continues either way.</small></span><input type="checkbox" role="switch" data-follow-challenge aria-label="Follow emergency challenge" aria-describedby="doomsday-follow-hint"></label><div class="doomsday-dispatch"><div class="doomsday-portrait">${portrait}</div><div class="doomsday-transmission"><span data-radio-status>RADIO CONNECTED</span><div class="doomsday-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><p data-transcript>Standing by for emergency dispatch.</p></div></div><button type="button" class="doomsday-replay" data-replay>Replay radio</button><div data-scenario></div><p class="doomsday-guide-hint">Close the menu to return to the world. Sound and the event stay active.</p></div><p class="doomsday-scroll-hint" aria-hidden="true">Swipe up for challenge &amp; radio ↑</p>`;
 const find=selector=>panel.querySelector(selector)||popups.querySelector(selector);
 const banner=document.createElement('div');banner.className='doomsday-banner';banner.hidden=true;banner.setAttribute('role','status');banner.innerHTML='<span aria-hidden="true">☢</span><div><strong data-phase></strong><small data-task></small><time data-countdown></time></div>';
 const countdown=banner.querySelector('[data-countdown]');
 const menu=document.createElement('div');menu.className='doomsday-menu';menu.hidden=true;menu.dataset.gameViewOverflow='true';
 const navigation=document.createElement('div');navigation.className='doomsday-panel-navigation';navigation.setAttribute('role','group');navigation.setAttribute('aria-label','Emergency panels');
 const sectionLabels={sound:'Emergency radio',nuclear:'Nuclear event',flow:'Emergency response flow'},sectionButtons={},sections={};
 for(const [key,label]of Object.entries(sectionLabels)){
  const button=document.createElement('button');button.type='button';button.className='doomsday-section-toggle'+(key==='flow'?' game-header-emergency-link':'');button.dataset.emergencyPanelToggle=key;button.setAttribute('aria-label',label);button.setAttribute('aria-controls','emergency-'+key+'-panel');button.setAttribute('aria-expanded','false');button.innerHTML='<strong>'+label.replace('&','&amp;')+'</strong><small data-panel-toggle-state>Hidden</small>';sectionButtons[key]=button;navigation.append(button);
  const section=document.createElement('section');section.id='emergency-'+key+'-panel';section.className='doomsday-subpanel';section.hidden=true;section.setAttribute('aria-label',label);const header=document.createElement('header'),heading=document.createElement('h4'),close=document.createElement('button');heading.textContent=label;close.type='button';close.dataset.closeEmergencyPanel=key;close.setAttribute('aria-label','Close '+label);close.textContent='Close';header.append(heading,close);section.append(header);sections[key]=section;
 }
 const automaticLabel=document.createElement('label');automaticLabel.className='doomsday-switch-row doomsday-automatic-panel';automaticLabel.innerHTML='<span>Auto-show event panel<small>Open the countdown for each new alert. Hiding it keeps the event running.</small></span><input type="checkbox" role="switch" aria-label="Auto-show event panel">';const automaticControl=automaticLabel.querySelector('input');automaticControl.checked=automaticPanel;navigation.append(automaticLabel);
 const radioIcon='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 8h10v13H7zM9 8V2m2 11h3m-3 4h3M4 5a6 6 0 0 0 0 6m16-6a6 6 0 0 1 0 6"/></svg>';
 const nuclearIcon='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="m10 9-2-4m6 4 2-4M9 13l-4 2m10-2 4 2m-8 0-2 4m4-4 2 4"/></svg>';
 for(const [key,icon]of [['sound',radioIcon],['nuclear',nuclearIcon]]){const button=sectionButtons[key];button.className=key==='sound'?'emergency-radio-toggle':'emergency-nuclear-toggle';button.hidden=true;button.innerHTML=icon+'<small data-panel-toggle-state aria-hidden="true">Hidden</small>';button.title=sectionLabels[key];stage.append(button);}
 const flowShortcut=sectionButtons.flow;flowShortcut.dataset.headerAction='emergency-response';menu.append(navigation,panel);stage.append(menu);
 const flow=document.createElement('section');flow.className='doomsday-game-flow';flow.setAttribute('aria-label','Emergency response flow');flow.tabIndex=-1;flow.innerHTML='<h4 data-flow-title></h4><p data-flow-description></p><details><summary>View full response flow</summary><ol data-flow-steps></ol></details>';find('[data-scenario]').before(flow);let flowSignature='';
 const evacuation=document.createElement('section');evacuation.className='doomsday-evacuation';evacuation.hidden=true;evacuation.setAttribute('aria-label','Emergency aircraft onboarding');evacuation.innerHTML='<h4>Emergency aircraft · optional</h4><ol><li data-evac-step="board">Board an available emergency cockpit.</li><li data-evac-step="depart">Choose Emergency departure in the cockpit, or fly manually.</li><li data-evac-step="complete">Reach a safe airborne climb.</li></ol><p data-evac-status role="status" aria-live="polite"></p><div data-evac-aircraft></div><small>Flight progress is separate from the supply and relay quests. Movement and manual controls remain available.</small>';
 find('[data-scenario]').before(evacuation);
 const announcement=document.createElement('section');announcement.id='emergency-announcement-panel';announcement.className='doomsday-subpanel emergency-announcement-popup';announcement.hidden=true;announcement.setAttribute('role','region');announcement.setAttribute('aria-label','Emergency radio announcement');announcement.innerHTML='<header><h4>Cole · emergency radio</h4><button type="button" data-close-announcement aria-label="Close emergency announcement">Close</button></header>';
 const dispatch=find('.doomsday-dispatch'),dispatchPortrait=dispatch.querySelector('.doomsday-portrait');announcement.querySelector('header').prepend(dispatchPortrait);
 announcement.append(dispatch,find('[data-replay]'));
 const latestCall=document.createElement('button');latestCall.type='button';latestCall.textContent='Latest radio announcement';latestCall.dataset.latestAnnouncement='';
 sections.sound.append(find('.doomsday-sound-controls'),latestCall);
 sections.nuclear.append(banner,find('.doomsday-challenge-toggle'),find('[data-scenario]'));
 sections.flow.append(flow,evacuation);
 // Keep one live copy of every control in a single radio card. More contains
 // only the original flow shortcut; sound and event preferences stay here.
 const radioHeader=panel.querySelector('header'),radioClose=radioHeader.querySelector('[data-hide]');
 radioHeader.className='emergency-radio-heading';radioHeader.querySelector('h3').textContent='Emergency radio';radioClose.setAttribute('aria-label','Close emergency radio');radioClose.textContent='Close';radioHeader.prepend(dispatchPortrait);
 announcement.querySelector('header').remove();
 for(const section of Object.values(sections))section.querySelector('[data-close-emergency-panel]').remove();
 const nuclearHeading=sections.nuclear.querySelector('header h4'),countdownHeading=document.createElement('div');nuclearHeading.replaceWith(countdownHeading);countdownHeading.append(nuclearHeading,countdown);countdown.className='emergency-popup-countdown';
 const soundDetails=document.createElement('details');soundDetails.className='emergency-radio-details';soundDetails.innerHTML='<summary>Radio &amp; sound settings</summary>';
 sections.sound.querySelector('header').remove();sections.sound.append(automaticLabel);soundDetails.append(sections.sound);
 const guidanceDetails=document.createElement('details');guidanceDetails.className='emergency-radio-details';guidanceDetails.innerHTML='<summary>Challenge &amp; evacuation guide</summary>';
 sections.flow.querySelector('header').remove();sections.flow.prepend(sections.nuclear.querySelector('.doomsday-challenge-toggle'));sections.flow.append(sections.nuclear.querySelector('[data-scenario]'));guidanceDetails.append(sections.flow);
 popups.append(radioHeader,sections.nuclear,announcement,guidanceDetails,soundDetails);
 panel.remove();navigation.className='doomsday-panel-navigation emergency-flow-shortcut';
 for(const key of Object.keys(sectionButtons))sectionButtons[key].setAttribute('aria-controls','emergency-radio-popup');

 const followControl=find('[data-follow-challenge]');followControl.checked=followChallenge;popups.dataset.followChallenge=String(followChallenge);
 const audio=createDoomsdayAudio({getPreferences,isSpeaking:()=>!!(voice?.state?.audible??voice?.state?.speaking)});
 let radioOpen=false,radioManual=false;const shownAnnouncements=new Set();
 let audioBusy=false,enableSequence=0;const presentedEvents=new Set();
 const eventKey=()=>state?.id?(state.mapId||worldId)+':'+state.id:null;
 function rememberEvent(key){if(!key)return;presentedEvents.add(key);if(presentedEvents.size>64)presentedEvents.delete(presentedEvents.values().next().value);}

 function presentAutomaticPanel(){
  if(disposed)return;const key=eventKey();
  if(!state?.active||!key)return;
  if(presentedEvents.has(key))return;
  if(!automaticPanel){rememberEvent(key);return;}
  if(document.hidden||document.querySelector('dialog:modal'))return;
  hideGuide(true);setSection('nuclear',true);rememberEvent(key);

 }

 let local={},worldId=null,state=null,disposed=false,generation=0,signature='',spoken='',runId=null,shelterArrived=false,rawState=null,receivedAt=0,transcript='',radioSequence=0,captionSequence=0,activeRadio=0,minimumRadio=0,speechActive=false,nextNoticeAt=0,noticeSequence=0;
 let boardingId=null,boardingRequestId=null,boardingSequence=0,boardingMessage='',evacuationAircraftSignature='',evacuationSpoken='',evacuationPending=null;const evacuationBindings=[];
 const nuclearAvailable=()=>!!state&&(state.active||state.phase==='all-clear'&&state.presentationTime-state.phaseStartedAt<8000);
 const showGuide=()=>{
  const available=!!state&&!!getEnvironment();menu.hidden=!available;
  if(!nuclearAvailable()&&!radioManual){radioOpen=false;}
  popups.hidden=!available||!radioOpen;
  sections.nuclear.hidden=!available||!radioOpen||!nuclearAvailable();
  announcement.hidden=!available||!radioOpen;
  sections.sound.hidden=sections.flow.hidden=false;
  for(const key of Object.keys(sectionLabels)){
   const expanded=available&&radioOpen&&(key!=='flow'||guidanceDetails.open),button=sectionButtons[key];
   if(button.getAttribute('aria-expanded')!==String(expanded))button.setAttribute('aria-expanded',String(expanded));
   button.disabled=key==='nuclear'&&!nuclearAvailable();if(key!=='flow'){button.hidden=!available;button.title=sectionLabels[key]+(key==='nuclear'&&nuclearAvailable()?' · '+state.phaseLabel:'');if(key==='nuclear')button.dataset.active=String(!!state?.active);}
   const status=key==='nuclear'?(nuclearAvailable()?state.phaseLabel:'Standing by'):(expanded?'Shown':'Hidden');setText(button.querySelector('[data-panel-toggle-state]'),status);
  }
  const more=stage.querySelector('.game-view-more');
  if(more){const active=String(!!state?.active);if(more.dataset.emergencyActive!==active)more.dataset.emergencyActive=active;more.title='More controls'+(state?.active?' · '+state.phaseLabel:'');}
 };
 function setSection(key,value,{focus=false,manual=false}={}){
  if(key==='nuclear'&&value&&!nuclearAvailable())return;
  radioOpen=value;if(manual&&value)radioManual=true;
  if(value&&nuclearAvailable())rememberEvent(eventKey());
  if(key==='flow'&&value){guidanceDetails.open=true;flow.querySelector('details').open=true;}
  showGuide();if(value)popups.scrollTop=key==='flow'?Math.max(0,guidanceDetails.offsetTop-radioHeader.offsetHeight):0;if(focus)sectionButtons.sound.focus({preventScroll:true});
 }
 function resetSections(){radioOpen=radioManual=false;soundDetails.open=guidanceDetails.open=false;transcript='';find('[data-transcript]').textContent='Standing by for emergency dispatch.';}

 function hideGuide(value){
  const overflow=menu.closest('.game-view-overflow'),more=stage.querySelector('.game-view-more'),native=menu.closest('.native-radio-menu');
  if(overflow){const restore=value&&overflow.contains(document.activeElement);overflow.hidden=value;more?.setAttribute('aria-expanded',String(!value));if(restore)more?.focus({preventScroll:true});}
  if(native)native.open=!value;
  showGuide();
 }
 function currentBriefing(description=false){
  if(shelterArrived){const line=shelteredBriefings[state.phase]||(!followChallenge&&shelteredAmbientBriefings[state.phase]);if(line)return line;}
  return description?followChallenge?state.message:ambientBriefings[state.phase]||state.message:(followChallenge?briefings:ambientBriefings)[state.phase];
 }
 function speaking(value){speechActive=value;popups.dataset.speaking=announcement.dataset.speaking=String(value);find('[data-radio-status]').textContent=value?'COLE · TRANSMITTING':'RADIO CONNECTED';}
 function showAnnouncement(text,key,{manual=false}={}){
  if(!text||!state||!manual&&(!automaticPanel||!nuclearAvailable()))return;
  const identity=eventKey()+':'+key;if(!manual&&shownAnnouncements.has(identity))return;
  shownAnnouncements.add(identity);if(shownAnnouncements.size>128)shownAnnouncements.delete(shownAnnouncements.values().next().value);
  hideGuide(true);radioOpen=true;if(manual)radioManual=true;showGuide();popups.scrollTop=0;
 }
 function closeAll(){radioOpen=radioManual=false;showGuide();sectionButtons.sound.focus({preventScroll:true});}
 function speak(text,key,{priority='emergency',captionNow=false}={}){
  const at=generation,sequence=++radioSequence;
  const caption=()=>{if(sequence<captionSequence)return;captionSequence=sequence;transcript=text;find('[data-transcript]').textContent=text;showAnnouncement(text,key);};
  if(priority==='emergency'){minimumRadio=sequence;caption();}else if(captionNow||!transcript)caption();
  const done=()=>{if(at===generation&&activeRadio===sequence){activeRadio=0;speaking(false);}};
  voice?.announce?.(text,{key:'automatic-response:'+key,worldId,category:'announcements',voice:'Emergency dispatch',role:'dispatcher',voiceGender:'male',effect:'walkie',priority,
   onStarted:()=>{if(at===generation&&sequence>=minimumRadio){activeRadio=sequence;caption();speaking(true);}},onFinished:done,onCancelled:done,onError:done});
 }
 const automaticChanged=()=>{automaticPanel=automaticControl.checked;try{localStorage.setItem(automaticPanelPreference,String(automaticPanel));}catch{}if(!automaticPanel&&state?.active)rememberEvent(eventKey());};automaticControl.addEventListener('change',automaticChanged);
 const fixed=[bindGameActionButton(find('[data-hide]'),closeAll),bindGameActionButton(latestCall,()=>showAnnouncement(transcript,'latest',{manual:true}))];
 for(const key of Object.keys(sectionLabels))fixed.push(bindGameActionButton(sectionButtons[key],()=>{
  const opening=key==='sound'?!radioOpen:true;
  if(opening)hideGuide(true);
  if(!opening)closeAll();else setSection(key,true,{manual:true});
 }));
 const detailsChanged=()=>showGuide();guidanceDetails.addEventListener('toggle',detailsChanged);
 const soundControl=find('[data-siren]'),audioStatus=find('[data-audio-status]'),enableButton=find('[data-enable]'),testButton=find('[data-test]'),replayButton=find('[data-replay]'),soundState=find('[data-sound-state]'),followState=find('[data-follow-state]');
 const setText=(node,text)=>{if(node.textContent!==text)node.textContent=text;};
 function resetEvacuation(){boardingSequence++;boardingId=boardingRequestId=null;boardingMessage='';evacuationAircraftSignature=evacuationSpoken='';evacuationPending=null;for(const unbind of evacuationBindings.splice(0))unbind();evacuation.querySelector('[data-evac-aircraft]').replaceChildren();evacuation.hidden=true;}
 function evacuationSpeechKey(progress){
  if(!state?.active||!state.id||progress?.eventId!==state.id||progress.status==='ended')return null;
  const stage=progress.status==='complete'||progress.stage==='complete'?'complete':Number.isFinite(progress.boardedAt)?'boarded':null;
  return stage?progress.eventId+':'+stage:null;
 }
 function renderEvacuation(){
  const data=getEvacuation();evacuation.hidden=!data;if(!data){evacuationPending=null;return;}
  const aircraft=Array.isArray(data.aircraft)?data.aircraft:[],progress=data.progress?.eventId===state?.id?data.progress:null,complete=progress?.status==='complete'||progress?.stage==='complete',boarded=Number.isFinite(progress?.boardedAt),ended=progress?.status==='ended';
  if(aircraft.some(craft=>craft.id===boardingRequestId&&craft.own))boardingMessage='';
  const completionMessage=data.canAssist===false?'Evacuation flight airborne. Safe climb confirmed. Continue manual flight and choose a clear landing area when ready.':'Evacuation flight airborne. Safe climb confirmed. Continue manual flight, or choose Land for an assisted return.';
  const messages=complete?completionMessage:ended?'This response has ended. Emergency aircraft remain available for normal flight.':progress?.stage==='depart'?(progress.mode==='manual'?'Manual evacuation flight active. Build safe airspeed and climb steadily; the flight controls remain yours.':'Departure in progress. Keep the controls centered for assistance, or move the stick to take manual control.'):progress?.stage==='preflight'?(data.canAssist===false?'Cockpit confirmed. Use manual flight controls and a clear departure area to reach a safe airborne climb.':'Cockpit confirmed. Choose Emergency departure in the flight controls for checks, taxi, clearance and climb.'):aircraft.some(craft=>craft.own)?(data.canAssist===false?'Cockpit ready. Use manual flight controls and a clear departure area. The next alert will track your evacuation climb.':'Cockpit ready. Choose Emergency departure in the flight controls when ready. The next alert will track your evacuation climb.'):aircraft.length?'Choose an available emergency cockpit below. Boarding is optional; shelter, supply and relay objectives continue separately.':'No emergency aircraft is available on this map. Use the shelter and follow the supply and relay response.';
  setText(evacuation.querySelector('[data-evac-status]'),boardingId?'Boarding emergency aircraft…':boardingMessage||messages);
  setText(evacuation.querySelector('[data-evac-step="depart"]'),data.canAssist===false?'Use manual flight controls and a clear departure area.':'Choose Emergency departure in the cockpit, or fly manually.');
  for(const step of evacuation.querySelectorAll('[data-evac-step]')){const done=step.dataset.evacStep==='board'?boarded:step.dataset.evacStep==='depart'?progress?.stage==='depart'||complete:complete;step.classList.toggle('is-complete',!!done);}
  const nextSignature=JSON.stringify(aircraft.map(craft=>[craft.id,craft.name,!!craft.available,!!craft.own]));
  if(evacuationAircraftSignature!==nextSignature){
   evacuationAircraftSignature=nextSignature;for(const unbind of evacuationBindings.splice(0))unbind();const buttons=evacuation.querySelector('[data-evac-aircraft]');buttons.replaceChildren();
   for(const craft of aircraft){const button=document.createElement('button');button.type='button';button.dataset.boardAircraft=craft.id;button.dataset.name=craft.name||'emergency aircraft';button.dataset.available=String(!!craft.available);button.dataset.own=String(!!craft.own);evacuationBindings.push(bindGameActionButton(button,()=>boardEmergencyAircraft(craft.id)));buttons.append(button);}
  }
  for(const button of evacuation.querySelectorAll('[data-board-aircraft]')){const own=button.dataset.own==='true',available=button.dataset.available==='true';button.disabled=!!boardingId||own||!available||!onBoardAircraft;button.setAttribute('aria-busy',String(boardingId===button.dataset.boardAircraft));setText(button,boardingId===button.dataset.boardAircraft?'Boarding…':own?button.dataset.name+' · In cockpit':available?'Board '+button.dataset.name:button.dataset.name+' · Occupied');}
  const key=evacuationSpeechKey(progress);
  if(evacuationPending?.key!==key)evacuationPending=null;
  if(key&&key!==evacuationSpoken&&key!==evacuationPending?.key)evacuationPending={key,atGeneration:generation,text:complete?'Cole here. '+completionMessage:data.canAssist===false?'Cole here. Emergency cockpit confirmed. Use manual flight controls and a clear departure area. Keep your radio on.':'Cole here. Emergency cockpit confirmed. Choose Emergency departure in the flight controls for checks, taxi, runway clearance and climb. Manual control remains available.'};
 }
 async function boardEmergencyAircraft(id){
  const craft=getEvacuation()?.aircraft?.find(craft=>craft.id===id);if(disposed||boardingId||!craft?.available||craft.own||!onBoardAircraft)return;
  const at=generation,sequence=++boardingSequence;boardingId=boardingRequestId=id;boardingMessage='';voice?.unlock?.();renderEvacuation();
  try{const result=await onBoardAircraft(id);if(disposed||at!==generation||sequence!==boardingSequence)return;boardingMessage=result===false?'Boarding did not complete. Choose the aircraft again to retry.':'Boarding request accepted. Waiting for cockpit confirmation.';}
  catch(error){if(!disposed&&at===generation&&sequence===boardingSequence)boardingMessage=error?.message||'Unable to board. Choose an available aircraft and try again.';}
  finally{if(!disposed&&at===generation&&sequence===boardingSequence){boardingId=null;if(getEvacuation()?.aircraft?.some(craft=>craft.id===id&&craft.own))boardingMessage='';renderEvacuation();}}
 }
 function renderAudio(){
  const status=audio.status||{code:'locked',label:'Tap Enable sounds to hear the emergency.'},code=status.code||status.state;
  const enabled=['ready','playing'].includes(code),available=code!=='hidden';
  popups.dataset.audioState=code;soundControl.checked=enabled;
  setText(soundState,enabled?'On':'Off');setText(followState,followChallenge?'On':'Off');
  setText(audioStatus,audioBusy?'Enabling sound…':status.label);
  enableButton.hidden=enabled;enableButton.disabled=!available;
  testButton.disabled=audioBusy||!available||!enabled||status.previewing;setText(testButton,status.previewing?'Playing test…':'Test sounds');
  replayButton.disabled=latestCall.disabled=!transcript;
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
  followChallenge=followControl.checked;popups.dataset.followChallenge=String(followChallenge);
  try{localStorage.setItem(challengePreference,String(followChallenge));}catch{}
  signature='';render();renderAudio();nextNoticeAt=(state?.presentationTime||now())+noticeIntervalMs;
  if(state?.active){const line=currentBriefing();if(line)speak((followChallenge?'Following the emergency challenge. ':'Challenge tracking off. ')+line,'follow:'+now(),{priority:followChallenge?'normal':'emergency'});}
 };
 followControl.addEventListener('change',followChanged);
 const keydown=event=>{if(event.key==='Escape'&&!popups.hidden){event.preventDefault();event.stopPropagation();closeAll();}else if(event.target.matches('summary')&&[' ','Enter'].includes(event.key))event.stopPropagation();};menu.addEventListener('keydown',keydown);popups.addEventListener('keydown',keydown);sectionButtons.sound.addEventListener('keydown',keydown);sectionButtons.nuclear.addEventListener('keydown',keydown);
 function render(){
  if(!state)return;const next=followChallenge?(state.objectives.find(o=>o.id===state.currentObjectiveId)||state.objectives.find(o=>o.phase===state.phase&&!o.completed)):null;
  const nextSignature=JSON.stringify([state.id,state.revision,state.phase,followChallenge,shelterArrived,state.objectives.map(o=>o.completed)]);
  if(signature!==nextSignature){signature=nextSignature;
   const required=state.objectives.filter(o=>!o.optional),completed=required.filter(o=>o.completed).length,response=doomsdayResponseStatus(state);
   find('[data-scenario]').innerHTML=`<div class="doomsday-phase" data-phase="${escape(state.phase)}"><small>${escape(getEnvironment()?.name||'Current map')}</small><h4>${escape(state.phaseLabel)}</h4><p>${escape(currentBriefing(true))}</p></div><p class="doomsday-response-activity" data-response-status ${response.active?'':'hidden'}><strong>${escape(response.label)}</strong><span>${escape(response.message)}</span></p><p class="doomsday-response-activity" data-shelter-guidance hidden></p><div data-challenge ${followChallenge?'':'hidden'}><progress max="${required.length||2}" value="${completed}" aria-label="Response objectives completed"></progress><span>${completed} / ${required.length||2} response quests · shelter optional</span><ol class="doomsday-objectives">${state.objectives.map(o=>`<li class="${o.completed?'is-complete':o===next?'is-current':''}"><strong>${o.completed?'✓ ':''}${escape(o.name)}${o.id==='shelter'?' · optional':''}</strong><span>${escape(o.description)}</span><small data-site="${escape(o.id)}">${Math.round(o.position.x)}, ${Math.round(o.position.z)}</small></li>`).join('')}</ol></div>`;
  }
  showGuide();find('[data-panel-phase]').textContent=state.phase==='idle'?'Standing by · explore freely':state.phaseLabel;banner.hidden=!nuclearAvailable();banner.dataset.phase=state.phase;banner.querySelector('[data-phase]').textContent=state.phaseLabel;
  banner.querySelector('[data-task]').textContent=shelterArrived&&['warning','detonation'].includes(state.phase)?'Shelter reached · stay under cover':next?next.name:state.phase==='warning'?'Incoming alert · take cover':state.phase==='fallout'?'Fallout alert active · emergency response underway':state.phase==='recovery'?'Emergency response active · awaiting all clear':state.phase==='detonation'?'Take cover · fallout approaching':state.phase==='clearing'?'Final clearance · normal conditions returning':state.phase==='all-clear'?'The alert has passed':'';
  if(next){const distance=Math.round(Math.hypot(next.position.x-getPosition().x,next.position.z-getPosition().z)),site=find(`[data-site="${next.id}"]`);if(site)site.textContent=`${distance} m · registers on arrival`;}
 }
 function tick(time=0,{reducedMotion=false}={}){
  if(disposed)return;popups.dataset.reducedMotion=String(reducedMotion);const environment=getEnvironment();
  if(worldId!==environment?.id){hideGuide(true);resetSections();worldId=environment?.id;local={};enableSequence++;audioBusy=false;generation++;resetEvacuation();signature=spoken='';runId=null;shelterArrived=false;nextNoticeAt=0;activeRadio=0;minimumRadio=radioSequence+1;rawState=state=null;audio.stop();effects?.reset();speaking(false);popups.hidden=announcement.hidden=panel.hidden=menu.hidden=banner.hidden=sectionButtons.sound.hidden=sectionButtons.nuclear.hidden=true;}
  if(!environment){audio.stop();return;}
  if(isShared()){
   const incoming=getState();if(!incoming||incoming.mapId!==worldId){popups.hidden=announcement.hidden=panel.hidden=menu.hidden=banner.hidden=sectionButtons.sound.hidden=sectionButtons.nuclear.hidden=true;audio.stop();effects?.reset();return;}
   if(rawState!==incoming){rawState=incoming;receivedAt=time;}
   state={...incoming,presentationTime:(incoming.serverTime||now())+Math.max(0,time-receivedAt)*1000};
  }else{
   stepDoomsday(local,environment,now(),{players:[{id:'local',health:100,position:getPosition()}],random});
   state=doomsdayView(local,environment);state.presentationTime=state.serverTime;
  }
  // World events never open the menu or its radio controls automatically.
  const phaseKey=state.id+':'+state.phase;
  if(runId!==state.id){runId=state.id;shelterArrived=false;evacuationSpoken='';evacuationPending=null;}
  const shelter=state.objectives.find(o=>o.id==='shelter');
  // The room objective belongs to the first responder. Arrival feedback is
  // personal: another player checking in cannot acknowledge this viewer.
  const arrivedNow=!shelterArrived&&state.active&&['warning','detonation','fallout','recovery'].includes(state.phase)&&isDoomsdayObjectiveNearby(getPosition(),shelter);
  if(arrivedNow)shelterArrived=true;
  render();
  presentAutomaticPanel();
  const shelterHelp=shelterGuidance(state,getPosition()),shelterPanel=find('[data-shelter-guidance]');
  if(shelterPanel){shelterPanel.hidden=!shelterHelp.visible;if(shelterHelp.visible)setShelterText(shelterPanel,shelterHelp);}
  if(spoken!==phaseKey){
   spoken=phaseKey;nextNoticeAt=state.presentationTime+noticeIntervalMs;speaking(false);
   const line=arrivedNow?shelterBriefing(state.phase,followChallenge):currentBriefing();
   if(line){speak(line,phaseKey);announce(state.phaseLabel+'. '+line);}
  }else if(arrivedNow){
   const line=shelterBriefing(state.phase,followChallenge);nextNoticeAt=state.presentationTime+noticeIntervalMs;
   speak(line,state.id+':shelter',{priority:'normal',captionNow:true});announce(line);
  }
  const gameFlow=emergencyGameFlow(state,{shelterArrived,evacuation:getEvacuation()}),nextFlowSignature=JSON.stringify(gameFlow);
  if(flowSignature!==nextFlowSignature){flowSignature=nextFlowSignature;setText(flow.querySelector('[data-flow-title]'),gameFlow.title);setText(flow.querySelector('[data-flow-description]'),gameFlow.description);flow.querySelector('[data-flow-steps]').innerHTML=gameFlow.steps.map(step=>`<li data-flow-step="${escape(step.id)}" data-status="${escape(step.status)}" ${step.status==='current'?'aria-current="step"':''}><strong>${escape(step.label)}</strong><small>${({pending:'Next',current:'Current',complete:'Complete',optional:'Optional'})[step.status]}</small><span>${escape(step.detail)}</span></li>`).join('');}
  renderEvacuation();
  // Cockpit onboarding waits for the nuclear dispatch and never opens the menu.
  const evacuationVoice=voice?.state||{};
  if(evacuationPending&&(evacuationPending.atGeneration!==generation||evacuationPending.key!==evacuationSpeechKey(getEvacuation()?.progress)))evacuationPending=null;
  if(evacuationPending&&!speechActive&&!evacuationVoice.speaking&&!evacuationVoice.outputBusy&&!evacuationVoice.loading&&!evacuationVoice.pending){const call=evacuationPending;evacuationPending=null;evacuationSpoken=call.key;speak(call.text,'evacuation:'+call.key,{priority:'normal',captionNow:true});announce(call.text);}
  const remaining=state.phaseEndsAt?Math.max(0,Math.ceil((state.phaseEndsAt-state.presentationTime)/1000)):0;
  const countdownLabel={warning:'Detonations in ',detonation:'Fallout in ',fallout:'Recovery in ',recovery:'Clearing in ',clearing:'Normal conditions in '}[state.phase]||'';
  countdown.textContent=remaining&&countdownLabel?countdownLabel+remaining+'s':'';
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
   }else{transcript=notice;find('[data-transcript]').textContent=notice;showAnnouncement(notice,key);}
   announce(state.phaseLabel+'. '+notice);
  }
  audio.update(state,time);renderAudio();effects?.update(state,environment,getPosition(),time,{reducedMotion,showObjectives:followChallenge});
 }
 const api={tick,open:()=>{hideGuide(true);setSection('flow',true,{manual:true});},close:closeAll,getState:()=>state,followingChallenge:()=>followChallenge,reset(){hideGuide(true);resetSections();enableSequence++;audioBusy=false;worldId=null;state=rawState=null;generation++;resetEvacuation();nextNoticeAt=0;minimumRadio=++radioSequence;activeRadio=0;audio.stop();effects?.reset();speaking(false);popups.hidden=announcement.hidden=panel.hidden=menu.hidden=banner.hidden=sectionButtons.sound.hidden=sectionButtons.nuclear.hidden=true;},dispose(){if(disposed)return;disposed=true;automaticControl.removeEventListener('change',automaticChanged);guidanceDetails.removeEventListener('toggle',detailsChanged);enableSequence++;audioBusy=false;generation++;resetEvacuation();radioSequence++;audio.dispose();effects?.dispose();for(const unbind of fixed)unbind();menu.removeEventListener('keydown',keydown);popups.removeEventListener('keydown',keydown);sectionButtons.sound.removeEventListener('keydown',keydown);sectionButtons.nuclear.removeEventListener('keydown',keydown);followControl.removeEventListener('change',followChanged);soundControl.removeEventListener('change',soundChanged);sectionButtons.sound.remove();sectionButtons.nuclear.remove();menu.remove();popups.remove();mountedEmergencyUI.delete(stage);}};mountedEmergencyUI.set(stage,api);return api;
}
