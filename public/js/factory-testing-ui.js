import {testingStations,isProvingEnvironment,isCompoundEnvironment} from './factory-test-config.js';
import {loadGameMenuStyles} from './game-menu-controls.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const gap=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,Number(value)||0));
const active=station=>station?.position&&station.active!==false&&station.enabled!==false&&station.disabled!==true;
const label=value=>String(value||'').replaceAll('-',' ').replace(/^./,char=>char.toUpperCase());
export function nearestFactoryTestingStation(environment,position,{stations=testingStations(environment),vehicleId=null}={}){
 if(!position||vehicleId)return null;
 return stations.filter(active).map(station=>({station,distance:gap(position,station.position)})).filter(value=>value.distance<=(value.station.interactionDistance||6)).sort((a,b)=>a.distance-b.distance)[0]?.station||null;
}
export function testingSessionPhase(session,now){
 if(!session)return {phase:'standby',progress:0,countdown:null};
 const status=session.status;
 if(!['countdown','flight','impact'].includes(status))return {phase:status,progress:status==='complete'?1:0,countdown:null};
 if(now<session.launchAt)return {phase:'countdown',progress:0,countdown:Math.max(1,Math.ceil((session.launchAt-now)/1000))};
 if(now<session.flightEndsAt)return {phase:'flight',progress:clamp((now-session.launchAt)/Math.max(1,session.flightEndsAt-session.launchAt)),countdown:null};
 return {phase:status==='complete'?'complete':'impact',progress:1,countdown:null};
}
export function testingFlightPoint(session,now){
 const {phase,progress}=testingSessionPhase(session,now),cargo=session?.profileId==='cargo',start={x:95,y:240},end={x:cargo?665:690,y:cargo?238:222};
 // The display is a schematic game animation, driven by server timestamps.
 const x=start.x+(end.x-start.x)*progress,y=start.y+(end.y-start.y)*progress-Math.sin(progress*Math.PI)*(cargo?145:110);
 return {x,y,phase,progress,cargo,angle:Math.atan2(end.y-start.y-Math.cos(progress*Math.PI)*(cargo?145:110)*Math.PI,end.x-start.x)*180/Math.PI};
}
export function ownTestingItems(state){
 const used=new Set();return (Array.isArray(state?.eligibleItems)?state.eligibleItems:[]).filter(item=>item&&typeof item.id==='string'&&item.id&&!used.has(item.id)&&used.add(item.id)&&['accuracy','cargo'].includes(item.profileId));
}

export function mountFactoryTestingUI(stage,command,{getPosition=()=>null,onOpen=()=>{},onClose=()=>{},announce=()=>{}}={}){
 loadGameMenuStyles();
 if(!document.querySelector('#factory-testing-styles')){const link=document.createElement('link');link.id='factory-testing-styles';link.rel='stylesheet';link.href=new URL('../css/factory-testing.css',import.meta.url).href;document.head.append(link);}
 const toggle=document.createElement('button');toggle.type='button';toggle.className='factory-testing-toggle';toggle.id='factory-testing-toggle';toggle.title='Proving grounds & compound';toggle.hidden=true;toggle.setAttribute('aria-label','Open factory testing and compound controls');toggle.setAttribute('aria-haspopup','dialog');toggle.setAttribute('aria-controls','factory-testing-dialog');toggle.setAttribute('aria-expanded','false');toggle.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 15 9m-3-4 7-2 2 7-7 5-5-5 3-5ZM8 15l-4-1-2 4 5-1m2 0 1 4 4-2-1-4"/><circle cx="17" cy="7" r="1.1"/></svg>';stage.append(toggle);
 const dialog=document.createElement('dialog');dialog.id='factory-testing-dialog';dialog.className='factory-testing-dialog';dialog.setAttribute('aria-label','Factory proving grounds and mountain compound');
 dialog.innerHTML=`<header class="ft-header"><div><small>ATLAS INDUSTRIES / FIELD OPERATIONS</small><h2 data-heading>Proving grounds</h2><p data-subheading>Turn your factory creation into a test flight.</p></div><button type="button" data-close aria-label="Close testing controls">×</button></header>
 <div class="ft-live-strip"><span><i></i> SHARED WORLD / LIVE CONTROL</span><strong data-clearance>COMPOUND LOCKED</strong></div>
 <div class="ft-body"><aside><h3>Local operations</h3><nav data-stations aria-label="Test and compound stations"></nav><p data-location></p><div class="ft-record"><small>YOUR FIELD RECORD</small><strong data-record>0 successful tests</strong><p data-skills></p></div><div class="ft-clearance"><strong>Mountain compound</strong><p data-clearance-description>Complete a qualifying test to earn compound clearance.</p><button type="button" data-enter>Open mountain hatch</button><button type="button" data-return hidden>Return to proving grounds</button></div></aside>
 <main><section data-view="proving"><div class="ft-stage-heading"><div><small>01 / PREPARE YOUR FLIGHT</small><h3>Your creation. Its first flight.</h3></div><span data-phase>STANDBY</span></div><p class="ft-intro">Bring a factory-built model, choose a test profile, deploy it at the pad, then arm and launch from the control station.</p>
 <div class="ft-config"><label>Factory item<select data-item aria-label="Owned factory test item"></select></label><label>Test preset<select data-profile aria-label="Test preset"></select></label><label>Target<select data-target aria-label="Test target"></select></label></div><p class="ft-empty" data-empty hidden>No eligible factory item is available. Finish and collect a factory build before configuring a test.</p>
 <div class="ft-actions"><button type="button" data-configure>Configure test</button><button type="button" data-recall>Recall display copy</button><button type="button" data-deploy>Deploy at pad</button><button type="button" data-arm>Arm at control</button><button type="button" data-launch>Start countdown</button><button type="button" data-cancel>Cancel test</button></div>
 <div class="ft-aim"><label>Target alignment · horizontal <output data-aim-x-value>0</output><input data-aim-x type="range" min="-1" max="1" value="0" step="0.05" aria-label="Horizontal target alignment"></label><label>Target alignment · vertical <output data-aim-y-value>0</output><input data-aim-y type="range" min="-1" max="1" value="0" step="0.05" aria-label="Vertical target alignment"></label></div>
 <div class="ft-range"><svg viewBox="0 0 800 300" role="img" aria-label="Live test range flight schematic"><defs><pattern id="ft-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#5c8799" stroke-opacity=".18"/></pattern></defs><rect width="800" height="300" fill="url(#ft-grid)"/><path d="M0 248H800M65 248V240H125V248" stroke="#577988" fill="none"/><path d="M95 240Q390 -22 690 222" stroke="#80c9c5" stroke-width="2" stroke-dasharray="5 9" fill="none" opacity=".4"/><g data-target-art><circle cx="690" cy="222" r="28" stroke="#f7be6c" fill="#f7be6c11"/><circle cx="690" cy="222" r="15" stroke="#f7be6c" fill="none"/><path d="M650 222H730M690 182V262" stroke="#f7be6c"/></g><g data-cargo-zone hidden><path d="M625 242H705M635 235H695" stroke="#8ee9c9" stroke-width="5"/><path d="M645 200H685V234H645Z" fill="#73b9aa"/><text x="665" y="274" text-anchor="middle" fill="#a9c9c6" font-size="11">CARGO LANDING ZONE</text></g><g data-flight-marker><path d="M-23-6H9L26 0 9 6H-23L-18 0Z" fill="#e3f5ec" stroke="#86d8c9"/><path d="M-18-6-25-15H-12L-4-6M-18 6-25 15H-12L-4 6" fill="#efb766"/><path class="ft-flame" d="M-23-4-43 0-23 4" fill="#ffbb63"/></g><circle data-impact-ring cx="690" cy="222" r="18" stroke="#f7be6c" stroke-width="3" fill="none" hidden/><text x="24" y="28" fill="#8cb3be" font-size="10" letter-spacing="2">ATLAS / LIVE FLIGHT TELEMETRY</text><text x="90" y="277" fill="#8cb3be" font-size="11">LAUNCH PAD</text><text data-countdown x="400" y="165" text-anchor="middle" fill="#f4c478" font-size="76" font-weight="700"></text></svg><span class="ft-range-badge" data-range-caption>Awaiting a configured test</span></div>
 <div class="ft-telemetry"><div><small>FLIGHT PHASE</small><strong data-flight-phase>Standby</strong></div><div><small>COURSE</small><strong data-course>0%</strong></div><div><small>TEST PROFILE</small><strong data-profile-readout>—</strong></div><div><small>CONTROL</small><strong data-control-distance>—</strong></div></div><section class="ft-result" data-result hidden aria-live="polite"><small>FLIGHT REPORT</small><h3 data-result-title></h3><p data-result-detail></p></section></section>
 <section data-view="compound" hidden><small class="ft-eyebrow">MOUNTAIN COMPOUND / CONTAINMENT LAB</small><h3>Bring the core into balance.</h3><p class="ft-intro">Match the three field channels to the marked targets. Each adjustment cycles through three positions. A stable core earns deeper compound clearance.</p><div class="ft-core-art" aria-hidden="true"><svg viewBox="0 0 500 200"><path d="M60 172H440M110 170V90L160 40H340L390 90V170" stroke="#648f9a" fill="#11303c"/><circle cx="250" cy="111" r="65" fill="#133e45" stroke="#72c9bc" stroke-width="3"/><circle class="ft-core-pulse" cx="250" cy="111" r="43" fill="#72c9bc22" stroke="#a3efe0"/><path d="M250 78V144M217 111H283" stroke="#a3efe0" stroke-width="7"/><path d="M130 156V112M370 156V112" stroke="#efbd6c" stroke-width="5"/></svg></div><div class="ft-core-channels" data-channels></div><div class="ft-actions"><button type="button" data-core-start>Begin stabilization</button><button type="button" data-core-confirm>Confirm stable channels</button></div><p data-core-status role="status"></p><div class="ft-deep"><strong>Deep bunker</strong><p data-deep-state>Locked · stabilize the containment core first.</p><button type="button" data-deep-enter>Open deep bunker</button></div></section>
 </main></div><footer><p data-status role="status" aria-live="polite">Walk to Test setup to select your factory item.</p><button type="button" data-close>Return to world →</button></footer>`;
 document.body.append(dialog);
 const $=selector=>dialog.querySelector(selector);
 $('[data-channels]').innerHTML=['coolant','shield','power'].map(channel=>'<div data-channel-cell="'+channel+'"><strong>'+({coolant:'Blue circuit',shield:'Violet circuit',power:'Gold circuit'}[channel])+'</strong><span class="ft-channel-value">—</span><small data-channel-target>Target —</small><div><button type="button" data-channel="'+channel+'" data-delta="-1" aria-label="Decrease '+channel+' channel">−</button><button type="button" data-channel="'+channel+'" data-delta="1" aria-label="Increase '+channel+' channel">+</button></div></div>').join('');
 let environment=null,snapshot=null,self=null,selfId=null,view=null,own=null,stations=[],selected=null,busy=false,serverAt=0,receivedAt=performance.now(),frame=null,poll=null,lastPoll=0,returnFocus=null,stationKey='',itemKey='',items=[],disposed=false;
 const now=()=>serverAt+Math.max(0,performance.now()-receivedAt),position=()=>getPosition()||self?.position;
 const role=kind=>{const candidates=stations.filter(station=>station.kind===kind||station.id==='proving-'+kind||station.id==='compound-'+kind);return candidates.find(station=>station.id===selected?.id)||candidates.sort((a,b)=>gap(position(),a.position)-gap(position(),b.position))[0];};
 const nearStation=kind=>{const station=role(kind);return station&&gap(position(),station.position)<=(station.interactionDistance||6)&&!self?.vehicleId&&!self?.seatedId;};
 const near=()=>nearestFactoryTestingStation(environment,position(),{stations,vehicleId:self?.vehicleId});
 const context=()=>view?.kind||(isCompoundEnvironment(environment)?'compound':isProvingEnvironment(environment)?'proving':null);
 const available=()=>!!context()&&stations.length>0;
 function status(message){if($('[data-status]').textContent!==message)$('[data-status]').textContent=message;}
 function reconcile(state,id,nextEnvironment){
  if(nextEnvironment?.id!==environment?.id){own=null;itemKey='';selected=null;stationKey='';}
  environment=nextEnvironment; snapshot=state;selfId=id;self=state?.players?.[id]||null;view=state?.testing||null;own=self?.testing?{...own,...self.testing}:own;
  stations=(view?.stations||testingStations(environment)||[]).filter(active);serverAt=state?.serverTime||Date.now();receivedAt=performance.now();
  const key=JSON.stringify(stations.map(station=>[station.id,station.name,station.position]));
  if(key!==stationKey){stationKey=key;selected=stations.find(station=>station.id===selected?.id)||stations[0]||null;$('[data-stations]').innerHTML=stations.map((station,index)=>'<button type="button" data-station="'+esc(station.id)+'"><span>'+String(index+1).padStart(2,'0')+'</span>'+esc(station.name||label(station.kind))+'</button>').join('');}
  toggle.hidden=!available();if(toggle.hidden)close();render();
 }
 async function send(action,fields={}){
  if(busy||disposed)return false;const issuedEnvironment=environment?.id;busy=true;render();
  try{const state=await command(action,fields);if(!state)return false;if(environment?.id!==issuedEnvironment)return state;reconcile(state,state.selfId||selfId,environment);if(state.result?.testing)own={...own,...state.result.testing};status(state.result?.message||'Operations synchronized.');announce(state.result?.message||'');render();return state;}
  catch(error){status(error.message);return false;}
  finally{busy=false;render();}
 }
 function open(id){if(!available())return false;if(id)selected=stations.find(station=>station.id===id)||selected;returnFocus=document.activeElement;document.exitPointerLock?.();onOpen();for(const other of document.querySelectorAll('dialog[open]'))if(other!==dialog&&other.dataset.gameplayBlocking!=='false')other.close();(document.fullscreenElement||document.body).append(dialog);if(!dialog.open)dialog.showModal();document.documentElement.classList.add('game-menu-open');toggle.setAttribute('aria-expanded','true');render();animate();void send('proving-status');return true;}
 function close(){if(dialog.open)dialog.close();}
 function refreshItems(){
  items=ownTestingItems(own);const key=JSON.stringify([items.map(item=>[item.id,item.name,item.profileId]),view?.targets,view?.profiles]);if(key===itemKey)return;itemKey=key;
  const previous=$('[data-item]').value;$('[data-item]').innerHTML=items.length?items.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name)+'</option>').join(''):'<option value="">No eligible factory items</option>';
  if(items.some(item=>item.id===previous))$('[data-item]').value=previous;
  syncProfile();
 }
 function syncProfile(){
  const selectedItem=items.find(item=>item.id===$('[data-item]').value),profile=selectedItem?.profileId||'accuracy';
  const profileRecord=view?.profiles?.find(value=>value.id===profile),targets=Array.isArray(view?.targets)?view.targets.filter(value=>active(value)&&(value.profileId===profile||value.kind===profile)):[];
  $('[data-profile]').innerHTML='<option value="'+esc(profile)+'">'+esc(profileRecord?.name||(profile==='cargo'?'Cargo recovery':'Precision target'))+'</option>';
  $('[data-target]').innerHTML=targets.length?targets.map(target=>'<option value="'+esc(target.id)+'">'+esc(target.name)+'</option>').join(''):Array.isArray(view?.targets)?'<option value="">No active targets</option>':profile==='cargo'?'<option value="cargo-zone">Cargo landing zone</option>':'<option value="target-alpha">Target Alpha</option>';
 }
 function render(){
  if(!dialog.open)return;const compound=context()==='compound',session=own?.session,clearance=own?.clearance||{},containment=own?.containment;
  $('[data-heading]').textContent=compound?'Mountain compound':'Proving grounds';$('[data-subheading]').textContent=compound?'A hidden facility beneath the mountain.':'Turn your factory creation into a test flight.';
  for(const section of dialog.querySelectorAll('[data-view]'))section.hidden=section.dataset.view!==(compound?'compound':'proving');
  $('[data-clearance]').textContent=clearance.deep?'DEEP ACCESS GRANTED':clearance.compound?'COMPOUND ACCESS GRANTED':'COMPOUND LOCKED';
  $('[data-clearance-description]').textContent=clearance.compound?'Compound clearance earned. Visit the mountain hatch to enter.':'Complete accuracy and cargo tests to earn compound clearance.';
  $('[data-enter]').hidden=compound;$('[data-enter]').disabled=busy||!clearance.compound||!nearStation('hatch');
  $('[data-return]').hidden=!compound;$('[data-return]').disabled=busy||!nearStation('return');
  const progress=own?.progress||{},completed=progress.completedTests??progress.successfulTests??progress.testsCompleted??0;
  $('[data-record]').textContent=completed+' completed tests';$('[data-skills]').textContent=Object.entries(progress.skills||{}).map(([key,value])=>label(key)+' '+value).join(' · ');
  $('[data-location]').textContent=selected?(selected.name||label(selected.kind))+' · '+Math.ceil(gap(position(),selected.position))+' m away. '+(selected.description||'Walk here to use these controls.'):'Choose an operation station.';
  for(const button of dialog.querySelectorAll('[data-station]'))button.setAttribute('aria-pressed',String(button.dataset.station===selected?.id));
  if(compound){
   const channels=containment?.channels||{};
   for(const channel of ['coolant','shield','power']){const cell=$('[data-channel-cell="'+channel+'"]'),state=channels[channel];cell.querySelector('.ft-channel-value').textContent=state?.value??'—';cell.querySelector('[data-channel-target]').textContent='Target '+(state?.target??'—');for(const button of cell.querySelectorAll('button'))button.disabled=busy||!nearStation('containment')||containment?.status!=='active';}
   $('[data-core-start]').disabled=busy||!nearStation('containment')||containment?.status==='active';$('[data-core-confirm]').disabled=busy||!nearStation('containment')||containment?.status!=='active';
   $('[data-core-status]').textContent=containment?.status==='solved'?'Core stabilized. Deep clearance saved.':containment?.status==='active'?'Match the three target positions, then confirm. '+(containment.moves||0)+' adjustments made.':'Walk to the containment console to begin.';
   $('[data-deep-state]').textContent=clearance.deep?'Unlocked · approach the deep hatch to enter.':'Locked · stabilize the containment core first.';$('[data-deep-enter]').disabled=busy||!clearance.deep||!nearStation('deep-hatch');return;
  }
  refreshItems();$('[data-empty]').hidden=items.length>0;
  const inFlight=['countdown','flight','impact'].includes(session?.status),pending=session&&!['complete','cancelled'].includes(session.status);
  for(const control of dialog.querySelectorAll('.ft-config select'))control.disabled=busy||!!pending;
  $('[data-configure]').disabled=busy||!items.length||!$('[data-target]').value||!nearStation('setup')||!!pending;
  $('[data-recall]').disabled=busy||!$('[data-item]').value||!(nearStation('setup')||nearStation('pad'))||['deployed','armed','countdown','flight','impact'].includes(session?.status);
  $('[data-deploy]').disabled=busy||session?.status!=='configured'||!nearStation('pad');
  $('[data-arm]').disabled=busy||session?.status!=='deployed'||!nearStation('control');
  $('[data-launch]').disabled=busy||session?.status!=='armed'||!nearStation('control');
  $('[data-cancel]').disabled=busy||!pending||inFlight;
  for(const slider of dialog.querySelectorAll('.ft-aim input'))slider.disabled=busy||inFlight||session?.status==='complete';
  $('[data-profile-readout]').textContent=session?session.profileId==='cargo'?'Cargo recovery':'Precision target':'—';
  $('[data-control-distance]').textContent=nearStation('control')?'AT CONSOLE':Math.ceil(gap(position(),role('control')?.position))+' m';
  const result=session?.result;$('[data-result]').hidden=session?.status!=='complete'||!result;
  if(result){$('[data-result-title]').textContent=(result.grade||'Completed')+' · '+(result.score??0)+' points';$('[data-result-detail]').textContent=clearance.compound?'Flight recorded. Mountain compound clearance is now available.':'Flight recorded. Complete both accuracy and cargo tests to earn mountain compound access.';}
  drawFlight();
 }
 function drawFlight(){
  if(!dialog.open||context()!=='proving')return;const session=own?.session,clock=now(),flight=testingFlightPoint(session,clock),phase=testingSessionPhase(session,clock),marker=$('[data-flight-marker]');
  marker.setAttribute('transform','translate('+flight.x.toFixed(2)+' '+flight.y.toFixed(2)+') rotate('+flight.angle.toFixed(2)+')');
  marker.toggleAttribute('hidden',!session||['cancelled','impact','complete'].includes(phase.phase));marker.classList.toggle('is-flying',phase.phase==='flight');
  $('[data-target-art]').toggleAttribute('hidden',!!flight.cargo);$('[data-cargo-zone]').toggleAttribute('hidden',!flight.cargo);
  $('[data-countdown]').textContent=phase.countdown||'';
  $('[data-flight-phase]').textContent=label(phase.phase);$('[data-phase]').textContent=label(phase.phase).toUpperCase();$('[data-course]').textContent=Math.round(phase.progress*100)+'%';
  const effect=$('[data-impact-ring]');effect.toggleAttribute('hidden',!['impact','complete'].includes(phase.phase));effect.setAttribute('cx',flight.cargo?665:690);effect.setAttribute('cy',flight.cargo?238:222);effect.classList.toggle('is-impact',phase.phase==='impact');
  $('[data-range-caption]').textContent=phase.phase==='countdown'?'Launch in '+phase.countdown:phase.phase==='flight'?(flight.cargo?'Cargo flight in progress':'Tracking test flight'):phase.phase==='impact'?(flight.cargo?'Cargo has reached the landing zone':'Target effect registered'):phase.phase==='complete'?'Test complete · report confirmed':session?label(session.status)+' · follow the station route':'Awaiting a configured test';
 }
 function animate(){if(frame!==null||!dialog.open)return;const tick=()=>{frame=null;if(!dialog.open||disposed)return;drawFlight();frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);}
 toggle.addEventListener('click',()=>open());
 dialog.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;const session=own?.session;
  if(button.hasAttribute('data-close'))close();else if(button.dataset.station){selected=stations.find(station=>station.id===button.dataset.station)||selected;render();}
  else if(button.hasAttribute('data-configure'))void send('proving-setup',{itemId:$('[data-item]').value,profileId:$('[data-profile]').value,targetId:$('[data-target]').value,stationId:role('setup')?.id});
  else if(button.hasAttribute('data-recall'))void send('proving-recall',{itemId:$('[data-item]').value,stationId:nearStation('setup')?role('setup')?.id:role('pad')?.id});
  else if(button.hasAttribute('data-deploy'))void send('proving-deploy',{sessionId:session?.id,padId:role('pad')?.id});
  else if(button.hasAttribute('data-arm'))void send('proving-arm',{sessionId:session?.id,stationId:role('control')?.id});
  else if(button.hasAttribute('data-launch'))void send('proving-launch',{sessionId:session?.id,stationId:role('control')?.id,aim:{x:Number($('[data-aim-x]').value),y:Number($('[data-aim-y]').value)}});
  else if(button.hasAttribute('data-cancel'))void send('proving-cancel',{sessionId:session?.id});
  else if(button.hasAttribute('data-enter'))void send('proving-enter',{stationId:role('hatch')?.id});else if(button.hasAttribute('data-return'))void send('proving-return',{stationId:role('return')?.id});
  else if(button.hasAttribute('data-core-start'))void send('proving-core-start',{stationId:role('containment')?.id});else if(button.dataset.channel)void send('proving-core-adjust',{puzzleId:own?.containment?.id,stationId:role('containment')?.id,channel:button.dataset.channel,delta:Number(button.dataset.delta)});
  else if(button.hasAttribute('data-core-confirm'))void send('proving-core-confirm',{puzzleId:own?.containment?.id,stationId:role('containment')?.id});else if(button.hasAttribute('data-deep-enter'))void send('proving-deep-enter',{stationId:role('deep-hatch')?.id});
 });
 for(const axis of ['x','y'])$('[data-aim-'+axis+']').addEventListener('input',()=>{$('[data-aim-'+axis+'-value]').textContent=$('[data-aim-'+axis+']').value;});
 $('[data-item]').addEventListener('change',syncProfile);
 dialog.addEventListener('close',()=>{if(frame!==null)cancelAnimationFrame(frame);frame=null;toggle.setAttribute('aria-expanded','false');if(!document.querySelector('dialog[open]'))document.documentElement.classList.remove('game-menu-open');onClose();const target=returnFocus?.isConnected&&!returnFocus.closest('[hidden]')&&returnFocus.getClientRects().length?returnFocus:stage.querySelector('.game-view-more:not([hidden])');target?.focus({preventScroll:true});});
 poll=setInterval(()=>{if(!dialog.open||busy||disposed)return;render();const session=own?.session;if(['countdown','flight','impact'].includes(session?.status)&&performance.now()-lastPoll>1600){lastPoll=performance.now();void send('proving-status');}},300);
 return {open,close,near,available,visible:()=>dialog.open,update:reconcile,dispose(){disposed=true;clearInterval(poll);if(frame!==null)cancelAnimationFrame(frame);close();toggle.remove();dialog.remove();}};
}
