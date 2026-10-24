import {FACTORY_RECIPES,factoryStations,factoryCrew,canonicalFactoryStation} from './missile-factory-config.js';
import {loadGameMenuStyles} from './game-menu-controls.js';
import {signalInventoryChange} from './shared-game-inventory.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const recipes=()=>Array.isArray(FACTORY_RECIPES)?FACTORY_RECIPES:Object.values(FACTORY_RECIPES);
const gap=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const activeStations=stations=>(stations||[]).filter(station=>station&&station.active!==false&&station.enabled!==false&&station.disabled!==true&&station.position&&['x','y','z'].every(axis=>Number.isFinite(station.position[axis]??(axis==='y'?0:NaN))));
export function nearestFactoryStation(environment,position,{vehicleId=null,actors,stations=factoryStations(environment,{actors})}={}){
 if(!position)return null;
 return activeStations(stations).map(station=>({station,distance:gap(position,station.position)})).filter(value=>value.distance<=(vehicleId?value.station.vehicleInteractionDistance||9:value.station.interactionDistance||6)&&(!vehicleId||['dispatch','loading'].includes(value.station.kind))).sort((a,b)=>a.distance-b.distance)[0]?.station||null;
}
export function factoryStationForRole(stations,kind,position,selectedId){
 const candidates=activeStations(stations).filter(station=>station.kind===kind);
 return candidates.find(station=>station.id===selectedId)||candidates.sort((a,b)=>gap(position,a.position)-gap(position,b.position))[0]||null;
}
export function factoryJobTarget(job,stations,position,selectedId){
 if(!job||job.status==='collected')return null;
 const step=job.steps?.[job.stepIndex],kind=['loaded','ready'].includes(job.status)?'dispatch':job.status==='haul'?'loading':step?.kind||canonicalFactoryStation(step?.canonicalStationId||step?.stationId)?.kind;
 const exact=activeStations(stations).find(station=>station.id===step?.stationId&&station.kind===kind);
 return ['haul','loaded','ready'].includes(job.status)?factoryStationForRole(stations,kind,position,selectedId):exact||factoryStationForRole(stations,kind,position,selectedId);
}
export function factoryMapBounds(stations,position){
 const points=activeStations(stations).map(station=>station.position);if(position&&Number.isFinite(position.x)&&Number.isFinite(position.z))points.push(position);
 if(!points.length)return {x:-12,z:-12,width:24,depth:24};
 const minX=Math.min(...points.map(point=>point.x)),maxX=Math.max(...points.map(point=>point.x)),minZ=Math.min(...points.map(point=>point.z)),maxZ=Math.max(...points.map(point=>point.z));
 const padding=Math.max(12,Math.max(maxX-minX,maxZ-minZ)*.1);return {x:minX-padding,z:minZ-padding,width:Math.max(24,maxX-minX+padding*2),depth:Math.max(24,maxZ-minZ+padding*2)};
}

export function mountMissileFactoryUI(stage,command,{onOpen=()=>{},onClose=()=>{},announce=()=>{},getPosition=()=>null}={}){
 loadGameMenuStyles();
 if(!document.querySelector('#missile-factory-style')){const link=document.createElement('link');link.id='missile-factory-style';link.rel='stylesheet';link.href=new URL('../css/missile-factory.css',import.meta.url).href;document.head.append(link);}
 const toggle=document.createElement('button');toggle.type='button';toggle.id='factory-jobs-toggle';toggle.className='factory-toggle';toggle.hidden=true;toggle.title='Factory & jobs';toggle.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 21V11l6 3V9l6 3V4h4v17H3ZM7 17v1m4-1v1m4-1v1M15 8h4M19 21h2"/></svg>';toggle.setAttribute('aria-haspopup','dialog');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','factory-jobs-dialog');toggle.setAttribute('aria-label','Open missile factory production and jobs');stage.append(toggle);
 const dialog=document.createElement('dialog');dialog.id='factory-jobs-dialog';dialog.className='factory-dialog';dialog.setAttribute('aria-label','Missile Factory production');
 dialog.innerHTML='<header><div><small>MUZIKAZ INDUSTRIES / PRODUCTION CONTROL</small><h2>Missile Factory<span>Build something extraordinary.</span></h2></div><button type="button" data-close aria-label="Close factory">×</button></header><div class="factory-overview"><span><i></i> SHARED FACTORY FLOOR</span><strong data-balance>Connect to view MZK</strong></div><div class="factory-layout"><aside><h3>Production route</h3><div data-stations></div><h3>Your shift</h3><p data-progress>No completed builds yet.</p><div class="factory-crew-note"><strong>Meet your crew</strong><p data-crew></p><p data-crew-work role="status"></p><button type="button" data-assist>Enable crew assistance</button></div></aside><main><section data-recipes><small class="factory-eyebrow">01 / CHOOSE A BUILD</small><h3>From parts to your Backpack.</h3><p>Purchase an in-game parts kit, work each station, then collect your completed item at dispatch. Your build is saved when you leave.</p><div class="factory-recipes" data-recipe-list></div></section><section data-job hidden><small class="factory-eyebrow">ACTIVE WORK ORDER</small><h3 data-job-name></h3><p data-job-message></p><div class="factory-blueprint" aria-hidden="true"><svg viewBox="0 0 480 160"><defs><pattern id="factory-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#5bc5cf" stroke-opacity=".15"/></pattern></defs><rect width="480" height="160" fill="url(#factory-grid)"/><path d="M70 60H337L412 80 337 100H70Z M110 60 90 32H160L185 60 M110 100 90 128H160L185 100 M260 60V100 M315 60V100 M80 60V100" fill="#184151" stroke="#8ce5db" stroke-width="2"/><path d="M42 80H438M260 19V141" stroke="#8ce5db" stroke-dasharray="4 6" opacity=".4"/><circle cx="260" cy="80" r="48" fill="none" stroke="#8ce5db" opacity=".35"/></svg><span>MODULAR ASSEMBLY / MZK SERIES</span></div><ol class="factory-job-steps" data-steps></ol><div class="factory-cycle"><progress data-cycle max="1" value="0" aria-label="Machine cycle progress"></progress><span data-timer></span></div><div class="factory-primary-row"><button type="button" data-work>Operate station</button><button type="button" data-haul hidden>Load truck</button><button type="button" data-collect hidden>Collect to Backpack</button></div></section><section class="factory-local-map"><h3>Local factory map</h3><p>Select a station to see its location. Follow the marked walking route; the outer yard is for vehicles.</p><div data-map></div><p data-location></p></section></main></div><footer><p data-status role="status" aria-live="polite">Walk to Procurement to buy your first parts kit.</p><button type="button" data-close>Back to factory floor →</button></footer>';
 document.body.append(dialog);
 const $=selector=>dialog.querySelector(selector);
 let environment=null,self=null,actors={},stations=[],crew=[],selected=null,factory=null,busy=false,lastPoll=0,serverAt=0,receivedAt=0,returnFocus=null,pollTimer=null,signature='',stationSignature='',view=null;
 const now=()=>serverAt+Math.max(0,performance.now()-receivedAt);
 const pos=()=>getPosition()||self?.position;
 const distance=(station,point=pos())=>gap(point,station?.position);
 const vehiclePosition=()=>actors[self?.vehicleId]?.position||pos();
 const point=()=>self?.vehicleId?vehiclePosition():pos();
 const role=kind=>factoryStationForRole(stations,kind,point(),selected?.id);
 const near=()=>nearestFactoryStation(environment,point(),{vehicleId:self?.vehicleId,actors,stations});
 const available=()=>stations.length>0;
 function status(message){$('[data-status]').textContent=message;}
 function select(id){selected=stations.find(station=>station.id===id)||selected;signature='';render();}
 function open(id){if(!available())return false;if(id)select(id);document.exitPointerLock?.();onOpen();returnFocus=document.activeElement;for(const node of document.querySelectorAll('dialog[open]'))if(node!==dialog&&node.dataset.gameplayBlocking!=='false')node.close();(document.fullscreenElement||document.body).append(dialog);if(!dialog.open)dialog.showModal();document.documentElement.classList.add('game-menu-open');toggle.setAttribute('aria-expanded','true');render();void send('factory-status');return true;}
 function close(){if(dialog.open)dialog.close();}
 function syncGeometry(snapshot){
  if(snapshot)view=snapshot.factory||null;
  stations=activeStations(Array.isArray(view?.stations)?view.stations:factoryStations(environment,{actors}));
  crew=Array.isArray(view?.crew)?view.crew:factoryCrew(environment,{actors});
  const next=JSON.stringify([stations.map(station=>[station.id,station.name,station.kind,station.position,station.interactionDistance,station.vehicleInteractionDistance]),crew.map(person=>[person.id,person.name])]);
  if(next===stationSignature)return;stationSignature=next;signature='';
  selected=stations.find(station=>station.id===selected?.id)||stations[0]||null;
  $('[data-stations]').innerHTML=stations.length?stations.map((station,index)=>'<button type="button" data-station="'+esc(station.id)+'"><span>'+String(index+1).padStart(2,'0')+'</span>'+esc(station.name)+'</button>').join(''):'<p>No active factory stations are placed in this map.</p>';
  $('[data-crew]').textContent=crew.length?crew.map(member=>member.name).join(', ')+'. Speak to staff on the floor for local favors. Crew assistance speeds up your next machine cycle.':'Place factory crew in Builder to offer assistance and local favors.';
  drawMap();
 }
 function drawMap(){
  const bounds=factoryMapBounds(stations,point()),unit=Math.max(bounds.width,bounds.depth)/116,number=value=>Number(value).toFixed(3);
  $('[data-map]').innerHTML='<svg viewBox="'+[bounds.x,bounds.z,bounds.width,bounds.depth].map(number).join(' ')+'" role="img" aria-label="Factory floor plan"><rect x="'+number(bounds.x)+'" y="'+number(bounds.z)+'" width="'+number(bounds.width)+'" height="'+number(bounds.depth)+'" rx="'+number(unit*3)+'" fill="#102632" stroke="#52757b" stroke-width="'+number(unit)+'"/>'+stations.map((station,index)=>'<g data-map-station="'+esc(station.id)+'"><circle cx="'+number(station.position.x)+'" cy="'+number(station.position.z)+'" r="'+number(unit*3.5)+'" fill="#72d9cb"/><text x="'+number(station.position.x)+'" y="'+number(station.position.z+unit)+'" font-size="'+number(unit*3)+'" text-anchor="middle" fill="#08222b">'+(index+1)+'</text><text x="'+number(station.position.x)+'" y="'+number(station.position.z+unit*8)+'" font-size="'+number(unit*2.5)+'" text-anchor="middle" fill="#deecea">'+esc(station.name)+'</text></g>').join('')+'<circle data-player-dot r="'+number(unit*2)+'" fill="#ffc46b" stroke="#fff" stroke-width="'+number(unit*.5)+'"/></svg>';
  updateDot();
 }
 function updateDot(){const dot=$('[data-player-dot]'),location=point();if(dot&&location){dot.setAttribute('cx',location.x);dot.setAttribute('cy',location.z);}}
 async function send(action,fields={}){
  if(busy)return;busy=true;render();
  try{const state=await command(action,fields);if(!state){status('Connect to the live room to use the factory.');return;}const id=state.selfId||Object.keys(state.players||{}).find(id=>state.players[id]===self);if(state.players?.[id])self=state.players[id];actors=state.actors||actors;factory={...factory,...self?.factory,...state.result?.factory};syncGeometry(state);status(state.result?.message||factory?.job?.message||'Factory progress synchronized.');if(action==='factory-start'||action==='factory-collect'){signalInventoryChange();window.MZKWallet?.refreshShared?.().catch(()=>{});}announce(state.result?.message||'');}
  catch(error){status(error.message);}
  finally{busy=false;signature='';render();}
 }
 function render(){
  if(!dialog.open)return;
  const crewWork=view?.crewWork;const crewStatus=$('[data-crew-work]');if(crewStatus)crewStatus.textContent=crewWork?.job?(crewWork.job.message+' · '+(crewWork.completed||0)+' shared demonstration models. '+(crewWork.job.status==='processing'?'Machine cycle: '+Math.ceil(Math.max(0,(crewWork.job.readyAt||now())-now())/1000)+'s remaining.':'')):'Ask a worker to demonstrate the live machines. Player orders have priority.';
  const job=factory?.job,active=job&&job.status!=='collected',recipe=recipes().find(recipe=>recipe.id===job?.recipeId),steps=job?.steps||recipe?.steps||[],step=steps[job?.stepIndex||0],target=factoryJobTarget(job,stations,point(),selected?.id),processing=job?.status==='processing',remaining=processing?Math.max(0,(job.readyAt||now())-now()):0,procurement=role('procurement');
  $('[data-balance]').textContent=Number.isFinite(factory?.balance)?factory.balance.toLocaleString()+' MZK':'MZK · live wallet';
  $('[data-progress]').textContent=(factory?.progress?.completedJobs||0)+' completed builds · '+(factory?.progress?.totalSpentMzk||0)+' MZK invested';
  $('[data-assist]').disabled=busy||!active||!crew.length||['ready','haul','loaded'].includes(job?.status);$('[data-assist]').textContent=job?.assisted?'Crew assistance on · disable':'Enable crew assistance';
  $('[data-recipes]').hidden=!!active;$('[data-job]').hidden=!active;
  $('[data-location]').textContent=selected?selected.name+' · '+Math.ceil(distance(selected))+' m away. '+(selected.description||selected.prompt||'Use this station on your production route.'):'Place and enable factory equipment in Builder to define your production route.';
  for(const button of dialog.querySelectorAll('[data-station]'))button.setAttribute('aria-pressed',String(button.dataset.station===selected?.id));
  const completeRoute=['procurement','fabrication','assembly','calibration','loading','dispatch'].every(kind=>stations.some(station=>station.kind===kind));
  for(const button of dialog.querySelectorAll('[data-build]'))button.disabled=busy||!self||!procurement||!completeRoute||distance(procurement)>(procurement?.interactionDistance||6)||!!self.vehicleId;
  updateDot();if(!active)return;
  $('[data-job-name]').textContent=job.name||recipe?.name||'Factory build';$('[data-job-message]').textContent=job.message||'Complete the production route to collect your item.';
  const nextSignature=JSON.stringify([job.id,job.status,job.stepIndex,job.assisted,steps,stationSignature]);
  if(nextSignature!==signature){$('[data-steps]').innerHTML=steps.map((value,index)=>'<li class="'+(index<(job.stepIndex||0)||job.status==='ready'?'done':index===(job.stepIndex||0)?'current':'')+'"><span>'+String(index+1).padStart(2,'0')+'</span><div><strong>'+esc(value.name)+'</strong><small>'+esc(stations.find(station=>station.id===value.stationId)?.name||factoryStationForRole(stations,value.kind||canonicalFactoryStation(value.canonicalStationId||value.stationId)?.kind)?.name||'Station unavailable')+'</small></div></li>').join('');signature=nextSignature;}
  const duration=(job.readyAt-job.cycleStartedAt)||step?.durationMs||1;$('[data-cycle]').value=processing?Math.max(0,Math.min(1,1-remaining/duration)):job.status==='ready'?1:0;
  $('[data-timer]').textContent=processing?(remaining>0?Math.ceil(remaining/1000)+'s · machine cycle running':'Confirming completed cycle…'):target?(job.status==='ready'?'Ready for collection · ':'Next: ')+target.name+' · '+Math.ceil(distance(target))+' m':'Required station unavailable. Restore or enable this equipment in Builder.';
  $('[data-work]').hidden=['ready','haul','loaded'].includes(job.status);$('[data-work]').disabled=busy||processing||!target||distance(target)>(target?.interactionDistance||6)||!!self?.vehicleId;
  $('[data-work]').textContent=busy?'Working…':processing?'Machine running…':'Operate '+(target?.name||'station');
  $('[data-haul]').hidden=!['haul','loaded'].includes(job.status);$('[data-haul]').textContent=job.status==='loaded'?'Deliver truck load':'Load factory truck';$('[data-haul]').disabled=busy||!target||distance(target,vehiclePosition())>(target?.vehicleInteractionDistance||9)||!self?.vehicleId;
  $('[data-collect]').hidden=job.status!=='ready';$('[data-collect]').disabled=busy||!target||distance(target)>(target?.interactionDistance||6)||!!self?.vehicleId;
 }
 $('[data-recipe-list]').innerHTML=recipes().map(recipe=>'<article><span class="factory-recipe-icon" aria-hidden="true">'+(recipe.id==='cargo-rocket'?'↑':'◇')+'</span><h4>'+esc(recipe.name)+'</h4><p>'+esc(recipe.description)+'</p><strong>'+esc(recipe.costMzk)+' MZK</strong><button type="button" data-build="'+esc(recipe.id)+'">Buy kit & start build</button></article>').join('');
 dialog.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;if(button.hasAttribute('data-close'))close();else if(button.dataset.station)select(button.dataset.station);else if(button.dataset.build)void send('factory-start',{recipeId:button.dataset.build,stationId:role('procurement')?.id});else if(button.hasAttribute('data-work')){const job=factory?.job;void send('factory-work',{jobId:job?.id,stationId:factoryJobTarget(job,stations,point(),selected?.id)?.id});}else if(button.hasAttribute('data-haul'))void send('factory-haul',{jobId:factory?.job?.id,stationId:factoryJobTarget(factory?.job,stations,point(),selected?.id)?.id});else if(button.hasAttribute('data-collect'))void send('factory-collect',{jobId:factory?.job?.id,stationId:role('dispatch')?.id});else if(button.hasAttribute('data-assist'))void send('factory-assist',{jobId:factory?.job?.id,enabled:!factory?.job?.assisted});});
 dialog.addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))document.documentElement.classList.remove('game-menu-open');toggle.setAttribute('aria-expanded','false');onClose();const focusTarget=returnFocus?.isConnected&&returnFocus.getClientRects().length&&!returnFocus.closest('[hidden]')?returnFocus:stage.querySelector('.game-view-more:not([hidden])');focusTarget?.focus({preventScroll:true});});
 toggle.addEventListener('click',()=>open());
 pollTimer=setInterval(()=>{if(!dialog.open)return;render();const job=factory?.job;if(job?.status==='processing'&&now()>=job.readyAt&&performance.now()-lastPoll>1500&&!busy){lastPoll=performance.now();void send('factory-status');}},250);
 return {open,close,near,visible:()=>dialog.open,update(snapshot,selfId,nextEnvironment){const changed=environment?.id!==nextEnvironment?.id;environment=nextEnvironment;actors=snapshot?.actors||{};self=snapshot?.players?.[selfId]||null;if(changed){factory=null;view=null;stationSignature='';selected=null;}factory=self?.factory?{...factory,...self.factory}:null;serverAt=snapshot?.serverTime||Date.now();receivedAt=performance.now();syncGeometry(snapshot);toggle.hidden=!available();if(toggle.hidden){close();return;}render();},dispose(){clearInterval(pollTimer);close();toggle.remove();dialog.remove();}};
}
