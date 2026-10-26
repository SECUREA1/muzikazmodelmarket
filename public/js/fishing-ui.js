import {fullscreenPanel} from './fullscreen-panels.js';
import {mountSportsActions,sportIcon} from './sports-action-bar.js';
import {gameplayOverlayOpen} from './game-menu-controls.js';
import {FISHING_GEAR,isFishingBoat} from './fishing-config.js';
import {GAME_INPUT_RELEASE_EVENT,requestGameInputRelease} from './game-input-release.js';

export const activeFishingSession=session=>['waiting','bite','reeling','caught'].includes(session?.status);
// Arrival is a server-confirmed handoff for the currently selected route. A
// nearby zone or an old arrival marker must never take over manual boating.
export function fishingArrivalAction(snapshot,selfId,seen=new Set()){
 const self=snapshot?.players?.[selfId],boat=snapshot?.actors?.[self?.vehicleId],navigation=boat?.boating,arrival=navigation?.arrival;
 if(snapshot?.fishing?.enabled!==true||!self||self.health<=0||!isFishingBoat(boat)||boat.active===false||boat.holderId!==selfId||activeFishingSession(self.fishing?.session)||!arrival?.id||seen.has(arrival.id)||!Number.isFinite(navigation?.speed)||!Number.isFinite(arrival.at)||!Number.isFinite(snapshot.serverTime)||snapshot.serverTime-arrival.at<0||snapshot.serverTime-arrival.at>15000)return null;
 if(arrival.kind!=='fishing'||navigation.navigationType!=='fishing'||navigation.navigationRouteId!==arrival.id||navigation.navigationDestinationId!==arrival.destinationId||navigation.navigationZoneId!==arrival.destinationId||navigation.assist||navigation.assistStage!=='arrived'||!navigation.anchor||Math.abs(navigation.speed||0)>.15)return null;
 const sides=self.fishing?.availability?.sides||{},side=['starboard','port'].find(value=>sides[value]?.canCast&&sides[value].zoneId===arrival.destinationId);
 if(!side)return null;
 return {id:arrival.id,zoneId:arrival.destinationId,side,name:snapshot.fishing?.zones?.find(zone=>zone.id===arrival.destinationId)?.name||navigation.navigationName||'Fishing spot'};
}
export function nearestFishingGuide(guides,position,reach=6){
 if(!position)return null;
 return (guides||[]).map(guide=>({guide,distance:Math.hypot((guide.position?.x??guide.x)-position.x,(guide.position?.y??guide.y??0)-(position.y||0),(guide.position?.z??guide.z)-position.z)})).filter(row=>row.distance<=(row.guide.interactionDistance||reach)).sort((a,b)=>a.distance-b.distance)[0]?.guide||null;
}
export function fishingPresentation(session){
 const phase=session?.status||'ready';
 return {phase,cast:!activeFishingSession(session),hook:phase==='bite',reel:phase==='reeling',catch:phase==='caught',tension:Math.max(0,Math.min(1,Number(session?.tension)||0)),progress:Math.max(0,Math.min(1,Number(session?.progress)||0))};
}
const setText=(node,value)=>{const text=String(value??'');if(node.textContent!==text)node.textContent=text;};

/** Live fishing shares the sports controls. Only tackle and competition management
 * opens a modal; the primary experience always leaves the real sea visible. */
export function mountFishingUI({stage,command,onOpen=()=>{},onClose=()=>{},onMarket=()=>{},announce=()=>{}}){
 const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('../assets/fishing.css',import.meta.url).href;document.head.append(css);
 const trigger=document.createElement('button');trigger.type='button';trigger.className='fishing-toggle';trigger.hidden=true;trigger.setAttribute('aria-label','Fishing, tackle and tournaments');trigger.setAttribute('aria-expanded','false');trigger.innerHTML=sportIcon('cast')+'<span>Fishing</span>';stage.append(trigger);
 const root=document.createElement('section');root.id='fishing-experience';root.className='fishing-hud fishing-sports-panel';root.hidden=true;root.setAttribute('aria-label','Fishing sports actions');root.dataset.gameplayBlocking='false';
 root.innerHTML='<div class="fishing-live-readout"><strong data-phase-label>READY TO CAST</strong><span data-location>Fishing spot</span><span data-side-label>Starboard</span></div><div class="fishing-meters"><label>Line <output data-tension-text>0%</output><meter data-tension min="0" max="1" high=".8" value="0" aria-label="Fishing line tension"></meter></label><label>Catch <output data-progress-text>0%</output><progress data-progress max="1" value="0" aria-label="Fish landing progress"></progress></label></div><div class="fishing-caught" data-caught hidden><strong data-fish-name>Fish landed!</strong><span data-fish-detail></span><button type="button" data-keep>Keep catch</button><button type="button" data-release>Release fish</button></div><p class="fishing-route-status" data-route-status hidden role="status"></p><p class="fishing-status" data-status role="status" aria-live="polite">Cast from the boat’s side.</p>';
 stage.append(root);
 const panel=document.createElement('section');panel.id='fishing-tackle';panel.className='fishing-menu';panel.hidden=true;panel.setAttribute('aria-label','Fishing tackle, creel and tournaments');
 panel.innerHTML='<p class="fishing-menu-intro">Your boat and fishing view remain in the game. Close this menu to return to the water.</p><div class="fishing-cast-options"><label>Fishing side<select data-side aria-label="Fishing side"><option value="starboard">Starboard · right side</option><option value="port">Port · left side</option></select></label><label>Rod<select data-rod-select aria-label="Fishing rod"></select></label><label>Bait<select data-bait-select aria-label="Fishing bait"></select></label></div><div class="fishing-menu-grid"><section><h3>Your tackle</h3><p data-gear></p><button type="button" data-market>Open tackle market</button><p class="fishing-note">Equipment is shared with Tools and Backpack.</p></section><section><h3>Creel <span data-creel-count>0 / 10</span></h3><ul data-creel></ul><button type="button" data-sell>Sell catch at the fish market</button><p data-stats>No catches yet.</p></section><section><h3 data-tournament-title>Harbor tournament</h3><p data-tournament-clock></p><p class="fishing-note">Shared room competition · AI rivals are marked AI · prizes paid in MZK</p><ol data-leaderboard></ol><button type="button" data-join>Join tournament</button><button type="button" data-claim hidden>Claim tournament prize</button></section><section><h3>Dockside guides</h3><p data-guide>Approach a guide to chat and sell fish.</p><button type="button" data-talk disabled>Talk to fishing guide</button></section></div><p data-menu-status role="status" aria-live="polite"></p>';
 const $=selector=>root.querySelector(selector)||panel.querySelector(selector);
 let current=null,self=null,selfId=null,view=null,environment=null,sequence=-1,revision=0,pending=false,disposed=false,playing=false,hold=false,holdTimer=0,holdPointer=null,holdSession=null,pendingExit=false,lastCatch=null,claimTarget=null,requestedZoneId=null,suppressClick=false,notice='',errorMessage='';
 const seenArrivals=new Set(),state=()=>self?.fishing||{},session=()=>state().session;
 const screen=fullscreenPanel(panel,{onOpen(){stopReel();document.exitPointerLock?.();requestGameInputRelease('fishing-menu-open');},onClose(){requestGameInputRelease('fishing-menu-close');render();}});screen.dialog.classList.add('fishing-dialog');
 const actions=mountSportsActions({parent:root,modes:['auto','cast','hook','keep','release','retrieve'],onMode:()=>{},onOverride:name=>action(name),onTrigger:()=>triggerPrimary(),onOpen:()=>stopReel(),label:'Fishing quick actions'});
 actions.setCollapsed(true);
 const primary=actions.primary;primary.dataset.fishingPrimary='';
 const sideButton=document.createElement('button');sideButton.type='button';sideButton.className='sports-icon-button';sideButton.dataset.fishingSide='';sideButton.innerHTML=sportIcon('view')+'<span>Side</span>';sideButton.onclick=()=>action('side');
 const menuButton=document.createElement('button');menuButton.type='button';menuButton.className='sports-icon-button';menuButton.dataset.fishingMenu='';menuButton.innerHTML=sportIcon('lobby');menuButton.setAttribute('aria-label','Fishing tackle, creel and tournaments');menuButton.title='Tackle, creel and tournaments';menuButton.onclick=openMenu;
 const exitButton=document.createElement('button');exitButton.type='button';exitButton.className='sports-icon-button';exitButton.dataset.fishingExit='';exitButton.innerHTML=sportIcon('exit');exitButton.setAttribute('aria-label','Return to boat helm');exitButton.title='Return to boat helm';exitButton.onclick=close;
 actions.row.append(sideButton,menuButton,exitButton);
 const primaryAction=()=>{const phase=session()?.status;return phase==='waiting'?{label:'Wait for a bite',enabled:false}:phase==='bite'?{label:'Hook now!',enabled:true}:phase==='reeling'?{label:'Hold to reel',enabled:true}:phase==='caught'?{label:'Keep catch',enabled:true}:{label:availability()?.preparationRequired?'Cast & anchor':'Cast line',enabled:availability()?.canCast===true&&!navigating()&&(!requestedZoneId||availability()?.zoneId===requestedZoneId)};};
 const availability=()=>state().availability?.sides?.[$('[data-side]').value]||state().availability;
 const navigating=()=>!!current?.actors?.[self?.vehicleId]?.boating?.assist;
 function message(value){notice=String(value||'');setText($('[data-status]'),notice);setText($('[data-menu-status]'),notice);}
 function canUse(){return !disposed&&playing&&!!self&&self.health>0&&!screen.dialog.open&&!actions.popup.open&&!gameplayOverlayOpen();}
 function finishSession(){const round=session();if(activeFishingSession(round))void request(round.status==='caught'?'keep':'cancel',{sessionId:round.id},{silent:true});}
 function open(options={}){
  if(disposed||!view?.enabled||!self||self.health<=0)return false;
  const wasPlaying=playing;requestedZoneId=typeof options?.zoneId==='string'?options.zoneId:null;
  const sides=state().availability?.sides||{},side=options?.side||['starboard','port'].find(value=>sides[value]?.canCast&&(!requestedZoneId||sides[value].zoneId===requestedZoneId));if(side)$('[data-side]').value=side;
  playing=true;root.hidden=false;trigger.setAttribute('aria-expanded','true');stage.classList.add('fishing-view');
  if(!wasPlaying){document.exitPointerLock?.();requestGameInputRelease('fishing-view-open');onOpen();}
  render();void request('status',{}, {silent:true});return true;
 }
 function close(){
  if(!playing)return;playing=false;stopReel();if(screen.dialog.open)screen.close();if(actions.popup.open)actions.popup.close();root.hidden=true;trigger.setAttribute('aria-expanded','false');stage.classList.remove('fishing-view','fishing-active');requestGameInputRelease('fishing-view-close');onClose();
  if(pending)pendingExit=true;else finishSession();
 }
 function openMenu(){if(!playing&&!open())return false;stopReel();screen.open();render();return true;}
 trigger.onclick=()=>{if(!playing)open();else openMenu();};
 $('[data-side]').onchange=render;
 async function request(operation,fields={},options={}){
  if(disposed||!self||(pending&&!options.concurrent))return null;const version=revision;
  if(!options.concurrent){pending=true;if(!options.silent)errorMessage='';render();}
  try{const result=await command('fishing',{operation,...fields});if(disposed||version!==revision)return null;if(!result)throw Error('Fishing server unavailable. Reconnect and try again.');if(result.players)update(result,selfId,environment);if(result.result?.message)message(result.result.message);return result;}
  catch(error){if(!disposed&&version===revision&&!options.silent){errorMessage=error.message||'Fishing could not be confirmed.';message(errorMessage);}return null;}
  finally{if(!disposed&&version===revision&&!options.concurrent){pending=false;render();if(pendingExit){pendingExit=false;if(!playing)finishSession();}}}
 }
 function stopReel(){
  if(!hold)return;hold=false;clearInterval(holdTimer);holdTimer=0;const id=holdSession,pointer=holdPointer;holdSession=null;holdPointer=null;primary.classList.remove('is-held');primary.setAttribute('aria-pressed','false');try{if(pointer!==null&&primary.hasPointerCapture?.(pointer))primary.releasePointerCapture(pointer);}catch{}if(id)void request('reel',{sessionId:id,holding:false},{concurrent:true,silent:true});
 }
 function startReel(pointerId=null){
  if(hold||pending||!canUse()||session()?.status!=='reeling'||document.hidden)return false;
  hold=true;holdPointer=pointerId;holdSession=session().id;primary.classList.add('is-held');primary.setAttribute('aria-pressed','true');if(pointerId!==null)try{primary.setPointerCapture(pointerId);}catch{}
  const renew=()=>{if(!hold)return;if(!canUse()||session()?.id!==holdSession||session()?.status!=='reeling'||document.hidden){stopReel();return;}void request('reel',{sessionId:holdSession,holding:true},{concurrent:true,silent:true});};renew();holdTimer=window.setInterval(renew,450);return true;
 }
 function cast(){const site=availability();return request('cast',{side:$('[data-side]').value,...(requestedZoneId||site?.zoneId?{zoneId:requestedZoneId||site.zoneId}:{}),...($('[data-rod-select]').value?{rodId:$('[data-rod-select]').value}:{}),...($('[data-bait-select]').value?{baitId:$('[data-bait-select]').value}:{})});}
 function triggerPrimary(){
  if(!canUse()||pending)return false;
  switch(session()?.status){case 'waiting':case 'reeling':return false;case 'bite':return request('hook',{sessionId:session().id});case 'caught':return request('keep',{sessionId:session().id});default:return primaryAction().enabled?cast():false;}
 }
 function pressPrimary(){return session()?.status==='reeling'?startReel():triggerPrimary();}
 function releasePrimary(){stopReel();}
 function action(name,fields={}){
  if(name==='exit'||name==='helm'){close();return true;}if(name==='menu'||name==='tackle')return openMenu();
  if(!playing&&!open(fields))return false;if(pending)return false;
  if(name==='side'){if(activeFishingSession(session()))return false;const next=fields.side||($('[data-side]').value==='starboard'?'port':'starboard');if(!['port','starboard'].includes(next))return false;$('[data-side]').value=next;render();return true;}
  if(name==='rod'||name==='bait'){if(activeFishingSession(session()))return false;const id=fields.id||fields[name+'Id'];const owned=(state().gear||[]).some(item=>(typeof item==='string'?item:item.id)===id),gear=FISHING_GEAR.find(item=>item.id===id);if(!owned||!gear||(name==='rod'?gear.kind!=='rod':gear.kind!=='bait'))return false;$(name==='rod'?'[data-rod-select]':'[data-bait-select]').value=id;render();return true;}if(name==='talk'){const guide=nearestFishingGuide(view?.guides,self?.position);return guide?request('talk',{guideId:guide.id}):false;}
  if(name==='join')return request('join-tournament');if(name==='claim')return request('claim-tournament',claimTarget?{tournamentId:claimTarget.id}:{});
  if(name==='sell')return request('sell');if(!canUse())return false;
  if(name==='auto'||name==='primary')return triggerPrimary();
  const round=session();if(name==='cast')return !activeFishingSession(round)&&primaryAction().enabled?cast():false;
  if(name==='hook')return round?.status==='bite'?request('hook',{sessionId:round.id}):false;
  if(name==='reel')return startReel();if(name==='ease'){stopReel();return true;}
  if(name==='retrieve'||name==='cancel'){stopReel();return activeFishingSession(round)&&round.status!=='caught'?request('cancel',{sessionId:round.id}):false;}
  if(name==='keep'||name==='release')return round?.status==='caught'?request(name,{sessionId:round.id}):false;
  return false;
 }
 // Holds never produce the next phase's click action. This matters when a catch
 // lands just before the finger/controller is released.
 primary.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
 primary.addEventListener('pointerdown',event=>{if(event.button!==0)return;suppressClick=false;if(session()?.status==='reeling'){event.preventDefault();suppressClick=true;startReel(event.pointerId);}});
 const releasePointer=event=>{if(holdPointer===event.pointerId)stopReel();};for(const type of ['pointerup','pointercancel'])window.addEventListener(type,releasePointer,true);
 primary.addEventListener('lostpointercapture',releasePointer);primary.addEventListener('blur',stopReel);
 primary.addEventListener('keydown',event=>{if([' ','Enter'].includes(event.key)){event.stopPropagation();if(!event.repeat)suppressClick=false;if(session()?.status==='reeling'){event.preventDefault();if(!event.repeat){suppressClick=true;startReel();}}}});
 primary.addEventListener('keyup',event=>{if([' ','Enter'].includes(event.key)){event.stopPropagation();if(hold||suppressClick){event.preventDefault();stopReel();}}});
 const onBlur=()=>stopReel(),onVisibility=()=>{if(document.hidden)stopReel();};window.addEventListener('blur',onBlur);document.addEventListener('visibilitychange',onVisibility);document.addEventListener(GAME_INPUT_RELEASE_EVENT,stopReel);
 $('[data-keep]').onclick=()=>action('keep');$('[data-release]').onclick=()=>action('release');$('[data-sell]').onclick=()=>request('sell');$('[data-join]').onclick=()=>request('join-tournament');$('[data-claim]').onclick=()=>request('claim-tournament',claimTarget?{tournamentId:claimTarget.id}:{});
 $('[data-talk]').onclick=()=>{const guide=nearestFishingGuide(view?.guides,self?.position);if(guide)void request('talk',{guideId:guide.id});};
 $('[data-market]').onclick=()=>{stopReel();screen.close();onMarket();};
 function renderClock(){const tournament=view?.tournament;if(!tournament){setText($('[data-tournament-clock]'),'Join to open the next server Fishing Cup.');return;}const now=(current?.serverTime||Date.now())+performance.now()-(current?.receivedAt||performance.now()),seconds=Math.max(0,Math.ceil(((tournament.status==='open'?tournament.startsAt:tournament.endsAt)-now)/1000));setText($('[data-tournament-clock]'),tournament.status==='finished'?'Weigh-in complete · claim your result':(tournament.status==='open'?'Starts in ':'Weigh-in in ')+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'));}
 function fillGear(){
  const gear=state().gear||[],known=id=>FISHING_GEAR.find(item=>item.id===id);setText($('[data-gear]'),gear.map(item=>typeof item==='string'?known(item)?.name||item:item.name||item.id).join(' · ')||'Free starter rod and bait');
  for(const [selector,test]of [['[data-rod-select]',/rod/],['[data-bait-select]',/bait|lure/]]){const select=$(selector),selected=select.value,items=gear.map(item=>typeof item==='string'?{...known(item),id:item}:item).filter(item=>test.test(item.id||'')),signature=JSON.stringify(items.map(item=>[item.id,item.name]));if(select.dataset.signature===signature)continue;select.dataset.signature=signature;select.replaceChildren();for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=item.name||item.id;select.append(option);}if(items.some(item=>item.id===selected))select.value=selected;}
 }
 function render(){
  if(disposed)return;trigger.hidden=!view?.enabled||!self||self.health<=0;setText(trigger.querySelector('span'),playing?'Tackle':state().availability?.canCast?'Fish here':'Fishing');root.hidden=!playing;stage.classList.toggle('fishing-view',playing);stage.classList.toggle('fishing-active',playing&&activeFishingSession(session()));
  if(!playing)return;const fishing=state(),round=session(),mode=fishingPresentation(round),site=availability(),boat=current?.actors?.[self?.vehicleId],guide=nearestFishingGuide(view?.guides,self?.position),creel=fishing.creel||[],tournament=view?.tournament;
  root.dataset.phase=mode.phase;root.dataset.side=$('[data-side]').value;
  const zone=(view?.zones||[]).find(item=>item.id===(round?.zoneId||requestedZoneId||site?.zoneId));setText($('[data-location]'),zone?.name||'Fishing grounds');setText($('[data-side-label]'),$('[data-side]').value==='port'?'Port · left':'Starboard · right');
  const labels={ready:'READY TO CAST',waiting:'WATCH THE FLOAT',bite:'BITE · HOOK NOW',reeling:round?.dragEasing?'DRAG ASSIST':'FISH ON',caught:'CATCH LANDED',escaped:'FISH ESCAPED',cancelled:'LINE RETRIEVED',kept:'CATCH SAVED',released:'FISH RELEASED'};setText($('[data-phase-label]'),labels[mode.phase]||'READY TO CAST');
  $('[data-tension]').value=mode.tension;$('[data-progress]').value=mode.progress;setText($('[data-tension-text]'),Math.round(mode.tension*100)+'%');setText($('[data-progress-text]'),Math.round(mode.progress*100)+'%');
  const next=primaryAction();next.enabled=next.enabled&&!pending&&(!requestedZoneId||!mode.cast||site?.zoneId===requestedZoneId);actions.update(next.label,'auto',next.enabled);
  for(const key of ['cast','hook','reel'])delete primary.dataset[key];if(mode.cast)primary.dataset.cast='';if(mode.hook)primary.dataset.hook='';if(mode.reel)primary.dataset.reel='';primary.setAttribute('aria-pressed',String(hold));
  for(const [name,button]of [...actions.root.querySelectorAll('[data-trigger-mode]')].map(button=>[button.dataset.triggerMode,button]))button.disabled=pending||(name==='cast'?!mode.cast||!next.enabled:name==='hook'?!mode.hook:name==='keep'||name==='release'?!mode.catch:name==='retrieve'?!activeFishingSession(round)||mode.catch:false);
  sideButton.disabled=pending||activeFishingSession(round);sideButton.setAttribute('aria-label','Switch fishing side to '+($('[data-side]').value==='port'?'starboard':'port'));sideButton.title=sideButton.getAttribute('aria-label');
  for(const select of panel.querySelectorAll('select'))select.disabled=pending||activeFishingSession(round);
  $('[data-caught]').hidden=!mode.catch;if(mode.catch){setText($('[data-fish-name]'),round.fish?.name||'Fish landed!');setText($('[data-fish-detail]'),Number(round.fish?.weightKg||0).toFixed(2)+' kg · '+(round.fish?.valueMzk||0)+' MZK');if(lastCatch!==round.id){lastCatch=round.id;announce('Fish landed! '+(round.fish?.name||'Keep it or release it.'));}}
  $('[data-route-status]').hidden=!boat?.boating?.assist;if(boat?.boating?.assist)setText($('[data-route-status]'),'Sailing to '+(boat.boating.navigationName||'selected fishing spot')+' · '+Math.ceil(boat.boating.remainingDistance||0)+' m');
  const help=errorMessage|| (boat?.boating?.assist?'Your route continues. Cast after the boat stops.':mode.cast&&site?.canCast===false?site.reason:round?.message||notice||'Cast, tap Hook at the bite, then hold Reel.');setText($('[data-status]'),help);setText($('[data-menu-status]'),notice||help);
  fillGear();setText($('[data-creel-count]'),creel.length+' / '+(fishing.creelCapacity||10));const signature=JSON.stringify(creel);if($('[data-creel]').dataset.signature!==signature){$('[data-creel]').dataset.signature=signature;$('[data-creel]').replaceChildren();for(const fish of creel){const li=document.createElement('li');li.textContent=fish.name+' · '+Number(fish.weightKg||0).toFixed(2)+' kg';$('[data-creel]').append(li);}if(!creel.length){const li=document.createElement('li');li.textContent='Your creel is empty.';$('[data-creel]').append(li);}}
  $('[data-keep]').disabled=$('[data-release]').disabled=pending;$('[data-sell]').disabled=pending||!guide||!creel.length;$('[data-talk]').disabled=pending||!guide;setText($('[data-guide]'),guide?guide.name+' · ready to talk and trade':'Visit Captain Mara or Ranger Reed to chat and sell fish.');const stats=fishing.stats||{};setText($('[data-stats]'),(stats.catches||0)+' catches · '+(stats.releases||0)+' releases · Best '+Number(stats.bestKg||0).toFixed(2)+' kg');
  claimTarget=[tournament,...(view?.recentTournaments||[]).slice().reverse()].find(event=>event?.status==='finished'&&(event.members||[]).includes(selfId)&&!(event.claimedBy||[]).includes(selfId))||null;
  const joined=(tournament?.members||[]).includes(selfId);$('[data-join]').disabled=pending||joined||tournament?.status==='finished';setText($('[data-join]'),!tournament?'Join next Fishing Cup':joined?'Entered · good luck!':'Join tournament');$('[data-claim]').hidden=!claimTarget;$('[data-claim]').disabled=pending;setText($('[data-claim]'),claimTarget?.id===tournament?.id?'Claim tournament result':'Claim previous cup result');setText($('[data-tournament-title]'),tournament?.name||'Harbor tournament');
  const board=$('[data-leaderboard]'),boardKey=JSON.stringify(tournament?.leaderboard||[]);if(board.dataset.signature!==boardKey){board.dataset.signature=boardKey;board.replaceChildren();for(const entry of tournament?.leaderboard||[]){const li=document.createElement('li');li.textContent=entry.name+(entry.ai?' · AI':'')+' · '+Number(entry.weightKg||0).toFixed(2)+' kg · '+(entry.catches||0)+' fish';if(entry.actorId===selfId)li.classList.add('is-self');board.append(li);}}renderClock();
  if(hold&&(!mode.reel||round.id!==holdSession))stopReel();
 }
 function update(next,id,env){
  if(disposed)return;if(!next){reset();environment=env;return;}if(environment?.id&&env?.id&&environment.id!==env.id)reset();environment=env||environment;if(Number.isFinite(next.sequence)&&next.sequence<sequence)return;sequence=next.sequence??sequence;current={...next,receivedAt:performance.now()};selfId=id;self=next.players?.[id];view=next.fishing;
  if(!view?.enabled||!self||self.health<=0){close();stopReel();}render();const arrival=fishingArrivalAction(next,id,seenArrivals);if(arrival&&(playing||!gameplayOverlayOpen())){seenArrivals.add(arrival.id);while(seenArrivals.size>64)seenArrivals.delete(seenArrivals.values().next().value);open(arrival);announce('Arrived at '+arrival.name+'. Cast from the boat’s side.');}
 }
 function snapshot(){const next=primaryAction(),round=session(),site=availability(),zone=(view?.zones||[]).find(item=>item.id===(round?.zoneId||requestedZoneId||site?.zoneId));return {enabled:!!view?.enabled,playing,menuOpen:screen.dialog.open||actions.popup.open,phase:round?.status||'ready',side:$('[data-side]').value,zoneId:round?.zoneId||requestedZoneId||site?.zoneId||null,location:zone?.name||'Fishing grounds',primaryLabel:next.label,primaryEnabled:canUse()&&next.enabled&&!pending,canAct:canUse()&&next.enabled&&!pending,tension:Math.max(0,Math.min(1,Number(round?.tension)||0)),progress:Math.max(0,Math.min(1,Number(round?.progress)||0)),holding:hold,message:$('[data-status]').textContent,status:$('[data-status]').textContent,fish:round?.fish?{...round.fish}:null,pending,canCast:site?.canCast===true&&!navigating()&&(!requestedZoneId||site.zoneId===requestedZoneId),castPoint:round?.castPoint||site?.castPoint||null,boatId:round?.boatId||self?.vehicleId||null,tournament:view?.tournament?{...view.tournament,leaderboard:(view.tournament.leaderboard||[]).map(entry=>({...entry}))}:null,gear:(state().gear||[]).map(item=>{const id=typeof item==='string'?item:item.id;return {...FISHING_GEAR.find(gear=>gear.id===id),...(typeof item==='string'?{}:item),id};}),rodId:$('[data-rod-select]').value,baitId:$('[data-bait-select]').value,creel:(state().creel||[]).map(fish=>({...fish})),creelCapacity:state().creelCapacity||10,stats:{...state().stats},guide:nearestFishingGuide(view?.guides,self?.position),canSell:!!nearestFishingGuide(view?.guides,self?.position)&&!!state().creel?.length&&!activeFishingSession(round),claimTarget:claimTarget?{...claimTarget}:null,canJoin:playing&&!pending&&view?.tournament?.status!=='finished'&&!(view?.tournament?.members||[]).includes(selfId),canClaim:playing&&!pending&&!!claimTarget,joined:(view?.tournament?.members||[]).includes(selfId),claimed:(view?.tournament?.claimedBy||[]).includes(selfId),rules:view?.rules||null,serverTime:(current?.serverTime||Date.now())+performance.now()-(current?.receivedAt||performance.now()),biteEndsAt:round?.biteEndsAt||null};}
 function reset(){const wasPlaying=playing;stopReel();revision++;pending=false;pendingExit=false;playing=false;sequence=-1;current=null;self=null;selfId=null;view=null;lastCatch=null;requestedZoneId=null;seenArrivals.clear();if(screen.dialog.open)screen.close();if(actions.popup.open)actions.popup.close();trigger.hidden=root.hidden=true;stage.classList.remove('fishing-view','fishing-active');errorMessage=notice='';if(wasPlaying)onClose();}
 return {update,open,close,reset,openMenu,playing:()=>playing,visible:()=>playing,menuOpen:()=>screen.dialog.open||actions.popup.open,active:()=>activeFishingSession(session()),snapshot,trigger:triggerPrimary,setReeling:value=>value?startReel():stopReel(),pressPrimary,releasePrimary,action,get side(){return session()?.side||$('[data-side]').value;},dispose(){if(disposed)return;reset();disposed=true;screen.disconnect();screen.dialog.remove();actions.dispose();trigger.remove();root.remove();css.remove();for(const type of ['pointerup','pointercancel'])window.removeEventListener(type,releasePointer,true);window.removeEventListener('blur',onBlur);document.removeEventListener('visibilitychange',onVisibility);document.removeEventListener(GAME_INPUT_RELEASE_EVENT,stopReel);}};
}
