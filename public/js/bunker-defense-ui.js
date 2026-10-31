import {isBunkerEnvironment} from './bunker-config.js';
import {createDoomsdayAudio} from './doomsday-audio.js';
import {bindGameActionButton} from './game-action-button.js';
import {requestGameInputRelease} from './game-input-release.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const label=value=>String(value||'standby').replaceAll('-',' ');
export function bunkerDefenseReading(snapshot,selfId){
 const defense=snapshot?.bunkerDefense;if(!defense)return null;
 const protection=defense.protection?.[selfId]||{},alarm=defense.alarm||{},systems=defense.systems||{};
 const mission=snapshot.players?.[selfId]?.vehicleMission,point=mission?.status==='active'?mission.checkpoints?.[mission.index]:null;
 const impactAt=alarm.kind==='nuclear'?defense.nuclear?.detonationAt:defense.airstrike?.impactAt;
 const countdown=alarm.phase==='warning'&&Number.isFinite(impactAt)?'Impact in '+Math.max(0,Math.ceil((impactAt-snapshot.serverTime)/1000))+'s':'';
 return {alarm,systems,protection,mission,point,countdown,crew:Object.values(snapshot.actors||{}).filter(actor=>actor.resident?.bunker&&actor.active!==false),
  status:alarm.active?alarm.message||label(alarm.kind)+' alert':'No incoming threat. Inspect shelter systems before the next warning.',
  cover:protection.underground||protection.inside?'Underground cover':'Outside underground cover'};
}
export function nearestBunkerControl(snapshot,position,environment){
 if(!isBunkerEnvironment(environment)||!position)return null;
 return Object.values(snapshot?.actors||{}).filter(actor=>{
  const settings=actor.definition?.gameplay||actor.definition?.functionalSettings||{},id=actor.asset?.buildAssetId||actor.modelId;
  if(actor.active===false||!actor.position||!(['alerts','radiation'].includes(settings.bunkerSystem)||['bunker-alert-console','bunker-radiation-monitor'].includes(id)))return false;
  return Math.hypot(position.x-actor.position.x,position.y-actor.position.y,position.z-actor.position.z)<=Math.min(4,Number(settings.interactionDistance)||3.5);
 }).sort((a,b)=>Math.hypot(position.x-a.position.x,position.y-a.position.y,position.z-a.position.z)-Math.hypot(position.x-b.position.x,position.y-b.position.y,position.z-b.position.z))[0]||null;
}
export function mountBunkerDefenseUI({stage,command,onOpenQuests=()=>{},getPreferences=()=>({}),isSpeaking=()=>false}={}){
 const document=stage.ownerDocument;
 if(!document.querySelector('#bunker-defense-styles')){const style=document.createElement('link');style.id='bunker-defense-styles';style.rel='stylesheet';style.href=new URL('../assets/bunker-defense.css',import.meta.url).href;document.head.append(style);}
 const toggle=document.createElement('button');toggle.type='button';toggle.className='bunker-defense-toggle';toggle.hidden=true;toggle.setAttribute('aria-label','Bunker defense and alarms');toggle.setAttribute('aria-controls','bunker-defense-panel');toggle.setAttribute('aria-expanded','false');toggle.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z"/><path d="M12 6v7m0 3v1"/></svg><span>Defense</span>';
 const banner=document.createElement('button');banner.type='button';banner.className='bunker-alert-banner';banner.hidden=true;banner.setAttribute('aria-label','Open bunker alert status');
 const panel=document.createElement('section');panel.id='bunker-defense-panel';panel.className='bunker-defense-panel';panel.hidden=true;panel.dataset.gameplayBlocking='false';panel.setAttribute('aria-label','Bunker defense status');panel.innerHTML='<header><div><small>NULL SECTOR / CIVIL DEFENSE</small><h2>Shelter command</h2></div><button type="button" data-close aria-label="Close bunker defense">×</button></header><div data-defense-content></div><p data-defense-feedback role="status"></p>';
 stage.append(toggle,banner,panel);
 let snapshot=null,selfId=null,environment=null,signature='',busy=false,disposed=false,worldId=null;
 const audio=createDoomsdayAudio({getPreferences,isSpeaking});
 const unbind=[];
 const feedback=panel.querySelector('[data-defense-feedback]'),content=panel.querySelector('[data-defense-content]');
 function close(){panel.hidden=true;toggle.setAttribute('aria-expanded','false');}
 function open(){if(toggle.hidden)return;requestGameInputRelease('bunker-defense-open',document);document.exitPointerLock?.();panel.hidden=false;toggle.setAttribute('aria-expanded','true');render();}
 function render(){
  const reading=bunkerDefenseReading(snapshot,selfId);if(!reading)return;
  const {alarm,systems,protection,mission,point,crew}=reading;
  const key=JSON.stringify([alarm.id,alarm.level,alarm.kind,alarm.message,alarm.acknowledgedBy,systems,protection.underground,protection.inside,protection.blastProtected,protection.falloutProtected,mission?.instanceId,mission?.status,mission?.index,point?.name,crew.map(actor=>[actor.id,actor.resident.name,actor.resident.task,actor.resident.bunkerResponse]),busy]);if(signature===key)return;signature=key;
  const ready=value=>value?.ready===true?'Online':value?.available===false?'Missing':'Offline';
  const protectedBlast=protection.blastProtected??protection.protectedFromBlast??protection.underground??protection.inside;
  const protectedFallout=protection.falloutProtected??protection.protectedFromFallout;
  const assignment=point?'<section class="bunker-defense-section"><h3>Active assignment</h3><strong>'+escape(mission.title)+'</strong><p>'+escape((mission.index+1)+' / '+mission.checkpoints.length+' · '+point.name)+'</p><button type="button" data-quests>View quest directions</button></section>':'';
  content.innerHTML='<p class="bunker-defense-alarm" data-level="'+escape(alarm.level||'standby')+'"><strong>'+escape(label(alarm.kind||alarm.level||'standby'))+'</strong><span>'+escape(reading.status)+'</span></p><div class="bunker-protection"><strong>'+escape(reading.cover)+'</strong><span>Blast cover: '+(protectedBlast?'Protected':protection.underground?'Partial cover · seal entrance':'Exposed')+'</span><span>Fallout isolation: '+(protectedFallout?'Protected':'Seal doors and run filtration')+'</span></div><dl class="bunker-system-grid"><div><dt>Backup power</dt><dd>'+ready(systems.power)+'</dd></div><div><dt>Filtered air</dt><dd>'+ready(systems.filtration)+'</dd></div><div><dt>Secure relay</dt><dd>'+ready(systems.relay)+'</dd></div><div><dt>Blast entrance</dt><dd>'+(systems.sealed?'Sealed':'Open or unavailable')+'</dd></div></dl><p class="bunker-defense-hint">Descend below the surface for blast cover. Close the ingress shutter and keep power and filtration online for fallout isolation. Use each physical control nearby.</p><div class="bunker-defense-actions"><button type="button" data-ack '+(busy||!alarm.active?'disabled':'')+'>Acknowledge at alert console</button><button type="button" data-audio>Enable alarm sound</button><button type="button" data-quests>Quests</button></div>'+assignment+'<section class="bunker-defense-section"><h3>Crew response</h3><ul>'+crew.map(actor=>{const task=actor.resident.bunkerResponse;return '<li><strong>'+escape(actor.resident.name)+'</strong><span>'+escape(task?.message||task?.task||actor.resident.task||actor.resident.workLabel||'Monitoring shelter readiness')+'</span></li>';}).join('')+'</ul></section><a class="bunker-defense-market" href="/builder-market.html?collection=bunker">Shop bunker equipment · MZK →</a>';
 }
 async function acknowledge(){if(busy)return;busy=true;signature='';render();try{const result=await command('bunker-defense',{operation:'acknowledge'});feedback.textContent=result?.result?.message||'Alert acknowledged.';}catch(error){feedback.textContent=error.message;}finally{busy=false;signature='';render();}}
 unbind.push(bindGameActionButton(toggle,open),bindGameActionButton(banner,open),bindGameActionButton(panel.querySelector('[data-close]'),close));
 const action=event=>{if(event.target.closest('[data-ack]'))void acknowledge();if(event.target.closest('[data-audio]'))void audio.unlock().then(()=>{feedback.textContent=audio.status.label;});if(event.target.closest('[data-quests]')){close();onOpenQuests();}};
 panel.addEventListener('click',action);
 return {open,close,update(next,nextSelfId,nextEnvironment){
  if(disposed)return;snapshot=next;selfId=nextSelfId;environment=nextEnvironment;
  const enabled=isBunkerEnvironment(environment);toggle.hidden=!enabled;
  if(worldId!==environment?.id){worldId=environment?.id;signature='';close();feedback.textContent='';audio.stop();}
  const reading=enabled?bunkerDefenseReading(snapshot,selfId):null;banner.hidden=!reading?.alarm.active;
  stage.dataset.bunkerAlarm=reading?.alarm.level||'standby';
  if(reading){toggle.dataset.level=reading.alarm.level||'standby';banner.dataset.level=reading.alarm.level||'standby';const bannerText=(reading.alarm.kind==='nuclear'?'☢ ':'⚠ ')+(reading.alarm.message||'Bunker alert')+(reading.countdown?' · '+reading.countdown:'')+' · '+reading.cover;if(banner.textContent!==bannerText)banner.textContent=bannerText;if(!panel.hidden)render();}
 },tick(time){const defense=snapshot?.bunkerDefense,air=defense?.airstrike;if(!isBunkerEnvironment(environment)||!air||defense?.alarm?.kind==='nuclear'){audio.stop();return;}const active=['warning','impact','detonation'].includes(air.phase);audio.update(active?{id:air.id,phase:air.phase==='warning'?'warning':'detonation',detonationAt:air.impactAt,phaseStartedAt:air.phase==='warning'?air.warningAt:air.impactAt,serverTime:snapshot.serverTime,presentationTime:snapshot.serverTime}:null,time);},snapshot:()=>bunkerDefenseReading(snapshot,selfId),dispose(){disposed=true;audio.dispose();for(const release of unbind)release();panel.removeEventListener('click',action);toggle.remove();banner.remove();panel.remove();delete stage.dataset.bunkerAlarm;}};
}
