import {bindGameActionButton} from './game-action-button.js';
import {gameActionLoading} from './game-action-loading.js';
import {doomsdayCommand,doomsdayView} from './doomsday-rules.js';
import {DOOMSDAY_AIRCRAFT_IDS} from './doomsday-config.js';
import {createDoomsdayAudio} from './doomsday-audio.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function mountDoomsdayUI({stage,getEnvironment,getPosition,getState=()=>null,isShared=()=>true,getActors=()=>({}),send,board,announce=()=>{},voice,getPreferences=()=>({}),effects}={}){
 if(!document.querySelector('#doomsday-styles')){const link=document.createElement('link');link.id='doomsday-styles';link.rel='stylesheet';link.href=new URL('../assets/doomsday.css',import.meta.url).href;document.head.append(link);}
 const toggle=document.createElement('button');toggle.type='button';toggle.className='doomsday-toggle';toggle.innerHTML='<b aria-hidden="true">☢</b><span>Doomsday</span>';toggle.setAttribute('aria-label','Doomsday response');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','doomsday-panel');
 const panel=document.createElement('section');panel.id='doomsday-panel';panel.className='doomsday-panel';panel.hidden=true;panel.dataset.gameOverlay='doomsday';panel.dataset.gameplayBlocking='false';panel.setAttribute('aria-label','Doomsday response command');
 panel.innerHTML='<header><div><small>WORLD EMERGENCY SCENARIO</small><h3>Doomsday response</h3></div><button type="button" data-close aria-label="Close doomsday menu">×</button></header><p class="doomsday-context">A fictional nuclear emergency across every map. Follow the response beams; travel and vehicle controls stay available.</p><div data-scenario></div><div class="doomsday-audio"><button type="button" data-siren aria-pressed="false">Mute sirens</button><button type="button" data-replay>Replay briefing</button></div><p data-feedback role="status" aria-live="polite"></p>';
 const banner=document.createElement('div');banner.className='doomsday-banner';banner.hidden=true;banner.setAttribute('role','status');banner.innerHTML='<span aria-hidden="true">☢</span><div><strong data-phase></strong><small data-task></small></div>';
 stage.append(toggle,panel,banner);
 const audio=createDoomsdayAudio({getPreferences,isSpeaking:()=>!!(voice?.state?.speaking||voice?.state?.outputBusy)});let local={},worldId=null,state=null,pending=false,disposed=false,generation=0,signature='',spoken='',unbound=[];
 const setOpen=open=>{panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));};
 const fixed=[bindGameActionButton(toggle,()=>setOpen(panel.hidden)),bindGameActionButton(panel.querySelector('[data-close]'),()=>setOpen(false))];
 fixed.push(bindGameActionButton(panel.querySelector('[data-siren]'),()=>{const muted=audio.setMuted(!audio.muted);panel.querySelector('[data-siren]').textContent=muted?'Enable sirens':'Mute sirens';panel.querySelector('[data-siren]').setAttribute('aria-pressed',String(muted));}));
 const speak=(text,key)=>voice?.announce?.(text,{key:'doomsday:'+key,worldId,category:'announcements',voice:'Emergency dispatch',role:'dispatcher'});
 fixed.push(bindGameActionButton(panel.querySelector('[data-replay]'),()=>{if(state)speak(state.phaseLabel+'. '+state.message+' '+(state.objectives.find(o=>o.phase===state.phase&&!o.completed)?.description||''),'replay:'+Date.now());}));
 const keydown=event=>{if(event.key==='Escape'&&!panel.hidden){setOpen(false);toggle.focus();}};panel.addEventListener('keydown',keydown);
 function feedback(text){panel.querySelector('[data-feedback]').textContent=text;announce(text);}
 async function run(operation,objectiveId){
  if(disposed||pending)return;pending=true;const requestGeneration=generation,loading=gameActionLoading(stage).begin('Updating doomsday response…');render(true);
  try{
   const result=isShared()?await send({operation,objectiveId}):doomsdayCommand(local,{id:'local',health:100,position:getPosition()},getEnvironment(),{operation,objectiveId},Date.now());
   if(requestGeneration!==generation){loading.finish('Previous map request finished.');return;}
   if(!result)throw new Error('Response unavailable. Check your connection and try again.');
   state=result.doomsday||result.result?.doomsday||getState()||state;
   if(result.result?.message||result.message)feedback(result.result?.message||result.message);
   if(operation==='stop')speak('Emergency scenario ended. Normal skies restored.','stop:'+Date.now());
   loading.finish('Doomsday response updated.');
  }catch(error){if(requestGeneration===generation){feedback(error.message||'Unable to update response. Try again.');loading.fail(error.message); }else loading.finish('Previous map request finished.');}
  finally{if(requestGeneration===generation){pending=false;render(true);}}
 }
 function render(force=false){
  if(!state)return;const aircraft=Object.values(getActors()).filter(actor=>actor.active!==false&&DOOMSDAY_AIRCRAFT_IDS.includes(actor.modelId));
  const nextSignature=JSON.stringify([state.id,state.revision,state.phase,pending,aircraft.map(a=>[a.id,a.holderId])]);if(!force&&signature===nextSignature)return;signature=nextSignature;
  for(const unbind of unbound)unbind();unbound=[];
  const active=state.active,current=state.objectives.filter(o=>o.phase===state.phase),next=current.find(o=>!o.completed);
  const distance=next?Math.round(Math.hypot(next.position.x-getPosition().x,next.position.z-getPosition().z)):null;
  panel.querySelector('[data-scenario]').innerHTML=`<div class="doomsday-phase" data-phase="${escape(state.phase)}"><small>${escape(getEnvironment()?.name||'Current map')}</small><h4>${escape(state.phaseLabel)}</h4><p>${escape(state.message)}</p><progress max="${state.totalObjectives||3}" value="${state.completedCount||0}" aria-label="Response objectives completed"></progress><span>${state.completedCount||0} / ${state.totalObjectives||3} objectives</span></div><ol class="doomsday-objectives">${state.objectives.map(o=>`<li class="${o.completed?'is-complete':o.phase===state.phase?'is-current':''}"><strong>${o.completed?'✓ ':''}${escape(o.name)}</strong><span>${escape(o.description)}</span><small>${Math.round(o.position.x)}, ${Math.round(o.position.z)}${o===next?' · '+distance+' m away':''}</small>${o.phase===state.phase&&!o.completed?`<button type="button" data-objective="${escape(o.id)}" ${pending?'disabled':''}>Check in at this site</button>`:''}</li>`).join('')}</ol><div class="doomsday-operations">${!active?`<button type="button" data-operation="start" ${pending?'disabled':''}>${state.phase==='all-clear'?'Replay':'Start'} scenario</button>`:`<button type="button" data-operation="advance" ${pending||!state.canAdvance?'disabled':''}>${state.phase==='recovery'?'Declare all clear':'Continue to next phase'}</button><button type="button" data-operation="stop" ${pending?'disabled':''}>End scenario</button>`}</div>${aircraft.length?'<div class="doomsday-fleet"><h4>Emergency aircraft</h4>'+aircraft.map(a=>`<button type="button" data-aircraft="${escape(a.id)}">✈ ${escape(a.name||a.id)}</button>`).join('')+'</div>':''}`;
  for(const button of panel.querySelectorAll('[data-operation]'))unbound.push(bindGameActionButton(button,()=>run(button.dataset.operation)));
  for(const button of panel.querySelectorAll('[data-objective]'))unbound.push(bindGameActionButton(button,()=>run('objective',button.dataset.objective)));
  for(const button of panel.querySelectorAll('[data-aircraft]'))unbound.push(bindGameActionButton(button,async()=>{if(pending)return;pending=true;const at=generation;try{const result=await board?.(button.dataset.aircraft);if(at===generation&&result)setOpen(false);}catch(error){if(at===generation)feedback(error.message);}finally{if(at===generation){pending=false;render(true);}}}));
  banner.hidden=!active;banner.dataset.phase=state.phase;banner.querySelector('[data-phase]').textContent=state.phaseLabel;banner.querySelector('[data-task]').textContent=next?next.name:active?'Objective complete · open Doomsday to continue':'';
 }
 function tick(time=0,{reducedMotion=false}={}){
  if(disposed)return;
  const environment=getEnvironment();if(worldId!==environment?.id){worldId=environment?.id;local={};generation++;pending=false;signature=spoken='';state=null;audio.stop();effects?.reset();setOpen(false);panel.querySelector('[data-feedback]').textContent='';}
  toggle.hidden=!environment;if(!environment){banner.hidden=true;return;}
  state=(isShared()?getState():null)||doomsdayView(local,environment);
  render();
  // Distance is local presentation; server proximity remains authoritative.
  const next=state.objectives.find(o=>o.phase===state.phase&&!o.completed),revision=state.id+':'+state.revision;
  if(spoken!==revision){spoken=revision;if(state.phase!=='idle')speak(state.phaseLabel+'. '+(state.active&&!next?'Objective complete. Open Doomsday and continue to the next phase.':state.message+' '+(next?'Next objective: '+next.name+'. '+next.description:'')),revision);}
  if(!panel.hidden&&next){const li=panel.querySelector('.is-current:not(.is-complete) small');if(li)li.textContent=`${Math.round(next.position.x)}, ${Math.round(next.position.z)} · ${Math.round(Math.hypot(next.position.x-getPosition().x,next.position.z-getPosition().z))} m away`;}
  audio.update(state,time);effects?.update(state,environment,getPosition(),time,{reducedMotion});
 }
 return {tick,run,open:()=>setOpen(true),getState:()=>state,reset(){worldId=null;state=null;generation++;audio.stop();effects?.reset();setOpen(false);banner.hidden=true;},dispose(){if(disposed)return;disposed=true;generation++;audio.dispose();effects?.dispose();for(const unbind of [...fixed,...unbound])unbind();panel.removeEventListener('keydown',keydown);toggle.remove();panel.remove();banner.remove();}};
}
