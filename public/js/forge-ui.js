import {fullscreenPanel} from './fullscreen-panels.js';
import {loadGameMenuStyles} from './game-menu-controls.js';
import {requestGameInputRelease} from './game-input-release.js';
import {forgeStations,isForgeEnvironment} from './forge-config.js';
import {FORGE_RECIPES,FORGE_MATERIALS,FORGE_STAGE_ORDER,FORGE_STRIKE_COOLDOWN_MS} from './forge-recipes.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const distance=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z):Infinity;
const title=value=>String(value||'').replaceAll('-',' ').replace(/^./,char=>char.toUpperCase());
const labels={heat:'Heat the billet',hammer:'Shape at the anvil',quench:'Quench the workpiece',temper:'Temper the metal',finish:'Finish & collect'};
const instructions={heat:'Bring the measured billet to the charcoal hearth and raise it to forging heat.',hammer:'Work the hot metal with deliberate hammer blows. Let each strike land before the next.',quench:'Cool the shaped workpiece in the quench bath to harden it.',temper:'Return the hardened workpiece to a controlled heat to restore toughness.',finish:'Grind, polish and inspect your finished piece. Collect it in your Backpack.'};
const actionLabels={heat:'Fire the hearth',hammer:'Strike the workpiece',quench:'Quench the metal',temper:'Begin tempering',finish:'Finish & send to Backpack'};
const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16l-4 4H8l-4-4Zm5 4-1 5m7-5 1 5M3 21h18M8 8l7-5 3 4-7 5M6 7l2-3 3 2"/></svg>';

/** Display only: the shared room validates the stage, timer and every strike. */
export function forgeJobView(job,recipe,now){
 if(!job)return {stage:null,status:'idle',remaining:0,progress:0,completed:0,total:FORGE_STAGE_ORDER.length};
 const collected=job.status==='collected',stage=FORGE_STAGE_ORDER.includes(job.stage)?job.stage:'heat';
 const processing=job.status==='processing',duration=stage==='heat'?recipe?.heatMs:stage==='temper'?recipe?.temperMs:0;
 const remaining=processing?Math.max(0,Math.ceil(((Number(job.readyAt)||0)-now)/1000)):0;
 const strikes=Math.max(0,Number(job.strikes)||0),required=Math.max(1,Number(job.requiredStrikes)||recipe?.hammerStrikes||1);
 const progress=collected?1:processing&&duration?Math.max(0,Math.min(1,1-((Number(job.readyAt)||0)-now)/duration)):stage==='hammer'?Math.min(1,strikes/required):0;
 return {stage,status:collected?'collected':processing?'processing':'awaiting',remaining,progress,strikes,required,completed:collected?FORGE_STAGE_ORDER.length:FORGE_STAGE_ORDER.indexOf(stage),total:FORGE_STAGE_ORDER.length};
}

export function mountForgeUI({stage,command,onOpen=()=>{},onClose=()=>{},announce=()=>{},onWaypoint=()=>{}}){
 loadGameMenuStyles();
 if(!document.querySelector('#forge-ui-styles')){const link=document.createElement('link');link.id='forge-ui-styles';link.rel='stylesheet';link.href=new URL('../assets/forge-ui.css',import.meta.url).href;document.head.append(link);}
 const trigger=document.createElement('button');trigger.type='button';trigger.className='forge-toggle';trigger.hidden=true;trigger.innerHTML=icon+'<span>Forge</span>';trigger.setAttribute('aria-label','Open forge workshop');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls','forge-workspace');trigger.setAttribute('aria-expanded','false');stage.append(trigger);
 const panel=document.createElement('section');panel.id='forge-workspace';panel.className='forge-workspace';panel.hidden=true;panel.setAttribute('aria-label','Emberfall Forge');
 panel.innerHTML=`<header class="forge-intro"><div><span class="forge-eyebrow">MUZIKAZ WORLD / TRADITIONAL METALLURGY</span><h3>Made in fire. Finished by you.</h3><p>Choose your metal. Work the anvil. Forge a piece worthy of your world.</p></div><div class="forge-brand" aria-hidden="true">${icon}</div></header>
 <div class="forge-live"><span data-connection>CONNECTING TO WORKSHOP</span><span data-balance></span></div>
 <div class="forge-body"><p class="forge-notice" data-offline>Join the forge to begin your workshop order.</p>
 <section class="forge-catalog"><div class="forge-section-heading"><div><span class="forge-eyebrow">01 / CHOOSE YOUR WORKPIECE</span><h4>The forge collection</h4></div><span>One measured kit. One finished piece.</span></div><div class="forge-recipes" data-recipes></div></section>
 <div class="forge-work-grid"><section class="forge-card forge-order"><div class="forge-section-heading"><div><span class="forge-eyebrow">02 / YOUR WORK ORDER</span><h4 data-job-title>Start with metal & fuel</h4></div><span class="forge-phase" data-phase>READY TO BEGIN</span></div>
 <ol class="forge-stages" aria-label="Forging stages" data-stages></ol>
 <div class="forge-workpiece" data-workpiece><div class="forge-workpiece-icon" aria-hidden="true">${icon}</div><div><h5 data-stage-name>Choose a recipe</h5><p data-stage-description>Select a piece above, then collect its metal and fuel kit at the stock rack.</p></div></div>
 <div class="forge-meter" data-meter hidden><progress max="1" value="0" data-progress aria-label="Current forging stage progress"></progress><span data-timer></span></div>
 <p class="forge-location" data-location></p><div class="forge-actions"><button class="forge-primary" type="button" data-work-action>Buy material kit</button><button type="button" data-find-required>Find stock rack ↗</button></div>
 <p class="forge-help" data-work-help>Kit prices cover the counted metal and coal used in this workpiece.</p><div class="forge-collected" data-collected hidden><strong>Forged. Finished. Yours.</strong><p>Your piece is saved in your Backpack, ready to place in your game or Builder map. Pick it up with E / Use, then use the fire control to swing a weapon or raise the shield.</p><a href="builder-market.html#backpack" target="_blank" rel="noopener">Open Builder Backpack ↗</a></div>
 </section><aside class="forge-card forge-stations"><span class="forge-eyebrow">THE WORKSHOP FLOOR</span><h4>Follow the fire</h4><p class="forge-help">Visit each station in order. Close this workshop to walk, or choose a station below.</p><nav aria-label="Forge stations" data-stations></nav><div class="forge-record"><span class="forge-eyebrow">YOUR SMITHING RECORD</span><strong data-record>0 pieces forged</strong><div data-badges></div><p data-recipe-progress></p></div></aside></div>
 <section class="forge-crew-note"><span aria-hidden="true">✦</span><p><strong>Learn from the forge crew.</strong> Talk to Brann Emberhand at the anvil, Dr. Sera Vale by the heat-treatment line, and Kade Ironledger near the stock rack. Open Quests for workshop routes and challenges.</p></section>
 </div><footer class="forge-footer"><p data-status role="status" aria-live="polite">Choose a recipe to begin.</p><button type="button" data-close>Return to forge →</button></footer>`;
 const $=selector=>panel.querySelector(selector);
 let environment=null,snapshot=null,self=null,selfId=null,personal=null,stations=[],selectedRecipeId=FORGE_RECIPES[0]?.id,selectedStationId=null,busy=false,disposed=false,revision=0,serverAt=0,receivedAt=performance.now(),timer=null,lastPoll=0,lastStrike=0,balance=null;
 const cache=new Map();
 const screen=fullscreenPanel(panel,{onOpen(){document.exitPointerLock?.();requestGameInputRelease('forge-open');onOpen();},onClose(){trigger.setAttribute('aria-expanded','false');clearInterval(timer);timer=null;onClose();}});screen.dialog.classList.add('forge-dialog');
 const text=(selector,value)=>{const node=$(selector),next=String(value??'');if(node.textContent!==next)node.textContent=next;};
 const html=(key,selector,value)=>{if(cache.get(key)!==value){cache.set(key,value);$(selector).innerHTML=value;}};
 const now=()=>serverAt+Math.max(0,performance.now()-receivedAt);
 const recipeFor=id=>FORGE_RECIPES.find(value=>value.id===id);
 const selectedRecipe=()=>recipeFor(selectedRecipeId)||FORGE_RECIPES[0];
 const activeJob=()=>personal?.job&&personal.job.status!=='collected'?personal.job:null;
 const enabled=()=>!disposed&&isForgeEnvironment(environment);
 const ready=()=>enabled()&&!!self&&self.health>0&&!!personal;
 const stationary=()=>!self?.vehicleId&&!self?.seatedId&&!self?.heldId&&self?.grounded!==false;
 const stationDistance=station=>distance(self?.position,station?.approach||station?.position);
 const stationFor=kind=>stations.filter(station=>station.kind===kind).sort((a,b)=>Number(b.id===selectedStationId)-Number(a.id===selectedStationId)||stationDistance(a)-stationDistance(b))[0];
 const within=station=>stationary()&&station&&stationDistance(station)<=station.interactionDistance;
 function near(){return !ready()||!stationary()?null:stations.filter(within).sort((a,b)=>stationDistance(a)-stationDistance(b))[0]||null;}
 function requiredStation(){return stationFor(activeJob()?.stage||'sourcing');}
 function message(value,error=false){text('[data-status]',value);$('[data-status]').dataset.error=String(error);if(error)announce(value);}
 function route(station){if(!station)return;close();onWaypoint({id:station.id,stationId:station.id,name:station.name,position:station.approach||station.position});}
 function renderRecipes(){
  const job=activeJob();
  html('recipes','[data-recipes]',FORGE_RECIPES.map(recipe=>`<button type="button" class="forge-recipe" data-recipe="${esc(recipe.id)}" aria-pressed="${recipe.id===selectedRecipeId}"${job?' disabled':''}><span class="forge-recipe-category">${esc(recipe.id.includes('shield')?'DEFENSE':'FORGED COLLECTION')}</span><strong>${esc(recipe.name)}</strong><span class="forge-recipe-price">${recipe.costMzk.toLocaleString()} <small>MZK / KIT</small></span><span class="forge-recipe-description">${esc(recipe.description)}</span><span class="forge-materials">${recipe.materials.map(material=>esc(material.quantity+' × '+(FORGE_MATERIALS[material.id]?.name||title(material.id)))).join(' · ')}</span></button>`).join(''));
 }
 function renderStations(){
  const required=requiredStation();
  html('stations','[data-stations]',stations.map((station,index)=>`<button type="button" data-route="${esc(station.id)}" data-current="${station.id===required?.id}"><span class="forge-station-number">${String(index+1).padStart(2,'0')}</span><span><strong>${esc(station.name.replace(/^\d+\s*·\s*/,''))}</strong><small>${within(station)?'You are here':Number.isFinite(stationDistance(station))?Math.round(stationDistance(station))+' m away':'Find on the map'}</small></span><span aria-hidden="true">↗</span></button>`).join(''));
 }
 function render(){
  if(disposed)return;
  trigger.hidden=!enabled();text('[data-connection]',ready()?'WORKSHOP CONNECTED':'CONNECTING TO WORKSHOP');text('[data-balance]',Number.isFinite(balance)?balance.toLocaleString()+' MZK':'');$('[data-offline]').hidden=ready();
  if(!screen.dialog.open)return;
  const job=personal?.job,active=activeJob(),recipe=recipeFor(active?.recipeId)||selectedRecipe(),view=forgeJobView(active,recipe,now()),required=requiredStation(),inReach=within(required),collected=job?.status==='collected';
  renderRecipes();renderStations();
  text('[data-job-title]',active?.name||recipe?.name||'Start with metal & fuel');
  text('[data-phase]',view.status==='processing'?'IN THE FIRE':active?'STAGE '+(view.completed+1)+' / '+view.total:collected?'PIECE COLLECTED':'READY TO BEGIN');
  html('stages','[data-stages]',FORGE_STAGE_ORDER.map((id,index)=>`<li data-state="${active?(index<view.completed?'complete':id===view.stage?'current':'pending'):'pending'}"${active&&id===view.stage?' aria-current="step"':''}><span>${index<view.completed?'✓':String(index+1).padStart(2,'0')}</span>${esc(title(id))}</li>`).join(''));
  text('[data-stage-name]',active?labels[view.stage]:'Metal & fuel · '+recipe?.costMzk+' MZK');
  text('[data-stage-description]',active?instructions[view.stage]:'Collect the measured '+recipe?.name+' kit at the stock rack. Your materials will be committed to one workpiece.');
  $('[data-meter]').hidden=!active||view.status!=='processing'&&view.stage!=='hammer';$('[data-progress]').value=view.progress;
  text('[data-timer]',view.status==='processing'?(view.remaining?view.remaining+' s remaining':'Heat cycle complete · checking workpiece…'):view.stage==='hammer'?view.strikes+' / '+view.required+' hammer strikes':'');
  text('[data-location]',!required?'This map needs an enabled '+(active?title(view.stage):'stock rack')+' station.':!stationary()?'Stand on the workshop floor with your hands free to work.':inReach?'At '+required.name.replace(/^\d+\s*·\s*/,'')+' · ready to work':'Walk to '+required.name.replace(/^\d+\s*·\s*/,'')+(Number.isFinite(stationDistance(required))?' · '+Math.round(stationDistance(required))+' m away':''));
  const working=view.status==='processing',strikeCooling=active?.stage==='hammer'&&now()-lastStrike<FORGE_STRIKE_COOLDOWN_MS;
  text('[data-work-action]',busy?'Working…':working?'Heat treatment in progress…':active?actionLabels[view.stage]:'Buy kit · '+recipe?.costMzk+' MZK');
  $('[data-work-action]').disabled=busy||!ready()||!inReach||working||strikeCooling||!active&&Number.isFinite(balance)&&balance<recipe.costMzk;
  text('[data-find-required]','Find '+(required?.name.replace(/^\d+\s*·\s*/,'')||'station')+' ↗');$('[data-find-required]').disabled=!required;
  text('[data-work-help]',active?active.message||'Your workpiece stays with your account. Return here to continue forging.':Number.isFinite(balance)&&balance<recipe.costMzk?'Your balance is below this kit price. Add MZK or select another recipe.':'Kit price covers '+recipe?.materials.map(material=>material.quantity+' × '+(FORGE_MATERIALS[material.id]?.name||title(material.id))).join(', ')+'.');
  $('[data-collected]').hidden=!collected;
  const progress=personal?.progress||{},count=Number(progress.completedItems)||0;text('[data-record]',count+' '+(count===1?'piece':'pieces')+' forged');
  html('badges','[data-badges]',(progress.badges||[]).map(badge=>'<span class="forge-badge">✦ '+esc(title(typeof badge==='string'?badge:badge.name||badge.id))+'</span>').join(''));
  text('[data-recipe-progress]',FORGE_RECIPES.filter(recipe=>(progress.byRecipe?.[recipe.id]||0)>0).length+' / '+FORGE_RECIPES.length+' designs mastered');
 }
 function update(next,id,env){
  if(disposed)return;
  if(env?.id!==environment?.id||id!==selfId){revision++;busy=false;balance=null;selectedStationId=null;cache.clear();if(screen.dialog.open)close();}
  environment=env;snapshot=next;selfId=id;self=next?.players?.[id]||null;
  const result=next?.result?.forge;
  personal=self?.forge?{...self.forge,...(result||{})}:result||null;
  if(Number.isFinite(personal?.balance))balance=personal.balance;
  serverAt=Number(next?.serverTime)||Date.now();receivedAt=performance.now();
  stations=forgeStations(env||{}).flatMap(station=>{
   const actor=next?.actors?.[station.objectId||station.id];if(actor&&(actor.active===false||actor.health<=0))return [];
   if(!actor?.position)return [station];
   const delta={x:actor.position.x-station.position.x,y:(actor.position.y||0)-station.position.y,z:actor.position.z-station.position.z};
   return [{...station,position:actor.position,approach:{x:station.approach.x+delta.x,y:station.approach.y+delta.y,z:station.approach.z+delta.z}}];
  });
  if(activeJob())selectedRecipeId=activeJob().recipeId;
  if(!enabled())close();render();
 }
 async function send(action,fields={}){
  if(busy||!ready())return null;const issued=revision;busy=true;render();
  try{const response=await command(action,fields);if(disposed||issued!==revision)return null;if(!response)throw Error('The forge could not confirm your work. Try again.');if(response.players)update(response,response.selfId||selfId,environment);else if(response.forge){personal=response.forge;if(Number.isFinite(personal.balance))balance=personal.balance;}message(response.result?.message||response.message||'Workshop updated.');return response;}
  catch(error){if(!disposed&&issued===revision)message(error.message||'The workshop could not confirm your work.',true);return null;}
  finally{if(!disposed&&issued===revision){busy=false;render();}}
 }
 function tick(){
  if(disposed||!screen.dialog.open)return;render();
  const job=activeJob();if(job?.status==='processing'&&Number(job.readyAt)<=now()&&!busy&&now()-lastPoll>=1200){lastPoll=now();void send('forge-status');}
 }
 function open(stationId){
  if(!enabled())return false;selectedStationId=typeof stationId==='string'?stationId:stationId?.id||stationId?.stationId||null;trigger.setAttribute('aria-expanded','true');screen.open();render();if(!timer)timer=setInterval(tick,250);if(ready())void send('forge-status');return true;
 }
 function close(){screen.close();clearInterval(timer);timer=null;}
 trigger.addEventListener('click',()=>open());$('[data-close]').addEventListener('click',close);
 panel.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.recipe){selectedRecipeId=button.dataset.recipe;render();return;}
  if(button.dataset.route){route(stations.find(station=>station.id===button.dataset.route));return;}
  if(button.hasAttribute('data-find-required')){route(requiredStation());return;}
  if(button.hasAttribute('data-work-action')){const job=activeJob(),station=requiredStation();if(job){if(job.stage==='hammer')lastStrike=now();void send('forge-'+job.stage,{jobId:job.id,stationId:station?.id});}else void send('forge-start',{recipeId:selectedRecipeId,stationId:station?.id});}
 });
 return {update,open,close,near,visible:()=>screen.dialog.open,dispose(){if(disposed)return;close();disposed=true;revision++;screen.disconnect();trigger.remove();screen.dialog.remove();}};
}
