import {funhouseRideCue} from './funhouse-experience-rules.js';
import {FUNHOUSE_ADVENTURE_START,FUNHOUSE_ADVENTURE_CLUES,funhouseAdventureAvailable,funhouseAdventureNextClue,funhouseAdventureNear} from './funhouse-adventure-rules.js';
import {fullscreenPanel} from './fullscreen-panels.js';
import {gameplayOverlayOpen,loadGameMenuStyles} from './game-menu-controls.js';
import {FUNHOUSE_STATIONS,funhouseStations} from './clown-funhouse-config.js';

const stampKinds=['water','car','spinner','dressup','maze-finish','jackbox'];
const icons={water:'◉',car:'▰',spinner:'✶',dressup:'♧',mirrors:'◇','maze-finish':'◇',ballpit:'●',jackbox:'★',welcome:'☾'};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function nearestFunhouseStation(environment,position,{actors}={}){
 if(!position||!Number.isFinite(position.x)||!Number.isFinite(position.z))return null;
 let found=null,distance=6;
 for(const station of funhouseStations(environment,{actors})){const gap=Math.hypot(position.x-station.position.x,(Number(position.y)||0)-station.position.y,position.z-station.position.z);if(gap<Math.min(distance,station.interactionDistance||6.5)){distance=gap;found=station;}}
 return found;
}

export function mountClownFunhouseUI({stage,getEnvironment,getPosition,getActors=()=>({}),getImmersive=()=>false,getReducedMotion=()=>false,getServerTime=null,send,announce=()=>{},onOpen=()=>{},onPlayInWorld=()=>{},onState=()=>{},onEffect=()=>{}}){
 loadGameMenuStyles();
 if(!document.querySelector('#funhouse-ui-styles')){const link=document.createElement('link');link.id='funhouse-ui-styles';link.rel='stylesheet';link.href='/public/css/clown-funhouse.css';document.head.append(link);}
 const trigger=document.createElement('button');trigger.type='button';trigger.className='funhouse-use';trigger.hidden=true;trigger.setAttribute('aria-controls','clown-funhouse-panel');trigger.setAttribute('aria-expanded','false');stage.append(trigger);
 const passport=document.createElement('div');passport.className='funhouse-passport-hud';passport.hidden=true;passport.setAttribute('aria-label','Funhouse attraction passport');stage.append(passport);
 const experienceHUD=document.createElement('section');experienceHUD.className='funhouse-experience-hud';experienceHUD.hidden=true;experienceHUD.setAttribute('aria-label','Funhouse first-person controls');experienceHUD.innerHTML='<header><strong data-funhouse-experience-title></strong><span data-funhouse-experience-time></span><button type="button" data-funhouse-hud-toggle aria-expanded="false" aria-controls="funhouse-world-actions">Actions</button></header><div class="funhouse-experience-metrics"><span>Score <b data-funhouse-experience-score>0</b></span><span>Best <b data-funhouse-experience-best>0</b></span><span data-funhouse-experience-progress></span></div><p data-funhouse-experience-message></p><div id="funhouse-world-actions" data-funhouse-experience-actions></div><p class="funhouse-experience-help" data-funhouse-experience-help></p>';stage.append(experienceHUD);
 const adventureHUD=document.createElement('section');adventureHUD.className='funhouse-adventure-hud';adventureHUD.hidden=true;adventureHUD.setAttribute('aria-label','Funhouse adventure trail');adventureHUD.innerHTML='<header><strong>The Lost Laugh Trail</strong><span data-funhouse-adventure-time></span><button type="button" data-funhouse-adventure-toggle aria-expanded="false" aria-controls="funhouse-adventure-details">Trail</button></header><p data-funhouse-adventure-next></p><div id="funhouse-adventure-details" data-funhouse-adventure-details><p data-funhouse-adventure-hint></p><p data-funhouse-adventure-progress></p><div><button type="button" data-funhouse-adventure-inspect>Inspect clue · F</button><button type="button" data-funhouse-adventure-stop>Stop trail</button><button type="button" data-funhouse-adventure-replay>Start again</button><button type="button" data-funhouse-adventure-dismiss>Back to exploring</button></div></div>';stage.append(adventureHUD);
 const panel=document.createElement('section');panel.id='clown-funhouse-panel';panel.hidden=true;panel.className='funhouse-panel';panel.setAttribute('aria-label','Midnight Laughs Funhouse');
 panel.innerHTML='<div class="funhouse-heading"><span class="funhouse-eyebrow">MUZIKAZ · OPEN ALL NIGHT</span><h3 data-funhouse-title></h3><p data-funhouse-description></p></div><div data-funhouse-content></div><p class="funhouse-message" data-funhouse-message role="status" aria-live="polite"></p><div class="funhouse-passport" data-funhouse-passport></div><footer><span>Free carnival play · collect all six passport stamps</span><button type="button" data-funhouse-close>Back to the midway</button></footer>';
 stage.append(panel);
 let nearby=null,current=null,worldStation=null,state={},selfId=null,pending=false,generation=0,disposed=false,message='',signature='',passportSignature=null,serverOffset=0,lastSequence=-1,hudSignature='',hudExpanded=false,hudActivityId=null,adventureExpanded=false,adventureDismissed=null;
 const seenEffects=new Set();
 const $=selector=>panel.querySelector(selector),content=$('[data-funhouse-content]');
 const screen=fullscreenPanel(panel,{onOpen:()=>{document.exitPointerLock?.();onOpen();},onClose:()=>{current=null;signature='';trigger.setAttribute('aria-expanded','false');}});
 screen.dialog.classList.add('funhouse-dialog');
 const now=()=>getServerTime?getServerTime():Date.now()+serverOffset;
 const stations=(actors=getActors())=>funhouseStations(getEnvironment(),{actors});
 const near=()=>nearestFunhouseStation(getEnvironment(),getPosition(),{actors:getActors()});
 const liveFor=id=>stations().find(station=>station.id===id);
 const isActive=value=>value?.status==='active'&&(!Number.isFinite(value.endsAt)||value.endsAt>now());
 const gap=(position,station)=>Math.hypot(position.x-station.position.x,(Number(position.y)||0)-station.position.y,position.z-station.position.z);
 function render(){
  if(!current||disposed)return;
  const round=!state.round?.stationId||state.round.stationId===current.id?state.round:null,active=round?.status==='active'&&round.endsAt>now(),kind=current.kind;
  $('[data-funhouse-title]').textContent=current.name;
  const descriptions={water:'Aim your water blaster at the glowing clown. Hit three or more targets in 30 seconds to earn your stamp.',car:'Board the impossible clown car for a 20-second ride. Honk on the glowing cues to score, or give its horn a squeeze from the midway.',spinner:'Board a 15-second spinner ride. Match the left and right balance cues, choose gentle mode, and leave the ride whenever you like.',dressup:'Big shoes, big trouble. Wear both pieces to earn your dressing-room stamp. Your friends can see your outfit.',mirrors:'Start your maze visit here, then weave around the crooked mirrors in the west wing. Ring the bell at the far end to earn your stamp.','maze-finish':'You found the far end of the mirror maze. Ring the exit bell to claim your stamp.',ballpit:'Toss carnival balls into the glowing colored target in a 20-second challenge. Every correct toss earns 10 points.',jackbox:'Wind the crank three times, wait for the catch cue, then catch the surprise clown before the window closes.',welcome:'Welcome to Midnight Laughs: follow the lit midway, explore the haunted house, and fill your carnival passport.'};
  $('[data-funhouse-description]').textContent=descriptions[kind]||'';
  const next=[current.id,round?.id,active,state.costume?.hat,state.costume?.shoes,state.ride?.id,state.ride?.status,state.challenge?.id,state.challenge?.status].join(':');
  if(next!==signature){signature=next;
   if(kind==='water'){
    content.innerHTML='<div class="funhouse-gallery"><div class="funhouse-scoreboard"><span>ROUND SCORE <b data-funhouse-score>0</b></span><span>TIME <b data-funhouse-time>30s</b></span><span>PERSONAL BEST <b data-funhouse-best>0</b></span></div><div class="funhouse-targets" aria-label="Water-gun clown targets">'+Array.from({length:6},(_,id)=>'<button type="button" class="funhouse-target" data-funhouse-target="'+id+'" aria-label="Splash clown '+(id+1)+'"><span class="funhouse-clown-face" aria-hidden="true"><i class="funhouse-clown-hair"></i><i class="funhouse-clown-eyes"></i><i class="funhouse-clown-nose"></i><i class="funhouse-clown-smile"></i></span><span class="funhouse-target-label">'+(id+1)+' <small>WAIT</small></span><span class="funhouse-splash" aria-hidden="true">✳</span></button>').join('')+'</div><div class="funhouse-blaster" aria-hidden="true"><span>WATER BLASTER</span><i></i></div><p class="funhouse-gallery-help">Click / tap a clown or press <kbd>1</kbd>–<kbd>6</kbd>. Follow the cyan light.</p><button type="button" data-funhouse-start>'+(round?'Play another round':'Start 30-second round')+'</button><button type="button" class="funhouse-world-play" data-funhouse-world-play>Play in first person</button></div>';
   }else if(kind==='dressup'){
    content.innerHTML='<div class="funhouse-costume-card"><div class="funhouse-costume-art" aria-hidden="true">✶<span>◒</span><b>▰ ▰</b></div><div><button type="button" data-funhouse-dress="hat" aria-pressed="'+Boolean(state.costume?.hat)+'">'+(state.costume?.hat?'Remove':'Wear')+' propeller hat</button><button type="button" data-funhouse-dress="shoes" aria-pressed="'+Boolean(state.costume?.shoes)+'">'+(state.costume?.shoes?'Remove':'Wear')+' giant clown shoes</button><p>Use <b>View</b> to see your outfit from above.</p></div></div>';
   }else if(kind==='welcome'){
    content.innerHTML='<div class="funhouse-directory">'+FUNHOUSE_STATIONS.filter(s=>stampKinds.includes(s.kind)).map(s=>'<article><span aria-hidden="true">'+icons[s.kind]+'</span><b>'+escape(s.name)+'</b><small>'+({water:'West midway',car:'East midway',spinner:'East court',dressup:'West dressing tent','maze-finish':'Inside the haunted house',jackbox:'Inside the haunted house'}[s.kind])+'</small></article>').join('')+'</div><p class="funhouse-welcome-note">Walk with WASD / the stick. Press E or tap the attraction prompt nearby. Maps shows every attraction. Every game and costume here is free.</p>'+(funhouseAdventureAvailable(getEnvironment())?'<div class="funhouse-trail-invitation"><strong>The Lost Laugh Trail</strong><p>Follow six mysterious clues across the midway and haunted house. Inspect each discovery, unlock its surprise, and bring the lost laughs home before ten minutes pass. You can enjoy the rides along the way.</p><button type="button" data-funhouse-adventure-start>Start the adventure trail</button></div>':'');
   }else{
    const labels={car:'Honk! Release the clowns',spinner:'Start the dizzy show',mirrors:'Start the mirror maze','maze-finish':'Ring the exit bell',ballpit:'Bounce the monster',jackbox:'Wind the fright box'};
    content.innerHTML='<div class="funhouse-attraction-card" data-kind="'+kind+'"><span class="funhouse-attraction-icon" aria-hidden="true">'+icons[kind]+'</span><p>'+(kind==='mirrors'?'Follow the maze checkpoints around the crooked partitions, then ring the exit bell. The first gap is on your right.':['car','spinner'].includes(kind)?'Ride in first person with live controls and a safe exit. Gentle mode keeps the ride comfortable.':'Play the timed challenge in the world, or trigger the attraction show.')+'</p><div class="funhouse-attraction-actions">'+(['car','spinner'].includes(kind)?'<button type="button" data-funhouse-board>'+('car'===kind?'Board the clown car':'Board the dizzy spinner')+'</button>':['jackbox','ballpit','mirrors'].includes(kind)?'<button type="button" data-funhouse-challenge>'+({jackbox:'Start wind-and-catch challenge',ballpit:'Start ball-toss challenge',mirrors:'Start maze checkpoint run'}[kind])+'</button>':'')+'<button type="button" class="funhouse-secondary-action" data-funhouse-use>'+escape(labels[kind]||'Play')+'</button></div></div>';
   }
  }
  for(const button of content.querySelectorAll('button'))button.disabled=pending;
  const trailStart=content.querySelector('[data-funhouse-adventure-start]');if(trailStart){trailStart.disabled=pending||isActive(state.ride)||isActive(state.adventure)||!funhouseAdventureNear(getPosition(),FUNHOUSE_ADVENTURE_START);trailStart.textContent=isActive(state.adventure)?'Adventure trail underway':'Start the adventure trail';}
  if(kind==='water'){
   $('[data-funhouse-score]').textContent=String(round?.score||0);$('[data-funhouse-best]').textContent=String(state.bestScore||0);
   const start=$('[data-funhouse-start]');start.hidden=active;start.disabled=pending||(!round&&state.round?.status==='active'&&state.round.endsAt>now());
   const refilling=Number.isFinite(round?.lastShotAt)&&now()<round.lastShotAt+300;
   content.querySelectorAll('[data-funhouse-target]').forEach(button=>{const lit=active&&Number(button.dataset.funhouseTarget)===round.targetId;button.classList.toggle('is-lit',lit);button.setAttribute('aria-label','Splash clown '+(Number(button.dataset.funhouseTarget)+1)+(lit?', glowing target':''));button.querySelector('small').textContent=lit?(refilling?'REFILL':'SPLASH!'):'WAIT';button.disabled=pending||!active||refilling;});
   $('[data-funhouse-time]').textContent=active?Math.max(0,Math.ceil((round.endsAt-now())/1000))+'s':round?'FINISHED':'30s';
  }
  $('[data-funhouse-message]').textContent=pending?'One moment…':message||state.message||'';
  panel.setAttribute('aria-busy',String(pending));
  renderPassport();renderExperienceHUD();
 }
 function renderPassport(){
  const stamps=state.stamps||[],next=stamps.join(':');
  if(next===passportSignature&&passport.childElementCount)return;
  passportSignature=next;
  const stations=FUNHOUSE_STATIONS.filter(s=>stampKinds.includes(s.kind)),html=stations.map(s=>'<span class="funhouse-stamp'+(stamps.includes(s.id)?' is-stamped':'')+'" title="'+escape(s.name)+(stamps.includes(s.id)?' — stamped':' — visit to earn')+'" aria-label="'+escape(s.name)+(stamps.includes(s.id)?', stamped':', not stamped')+'">'+icons[s.kind]+'</span>').join('');
  passport.innerHTML='<b>LAUGH PASSPORT</b>'+html+'<small>'+stations.filter(s=>stamps.includes(s.id)).length+'/6</small>';
  $('[data-funhouse-passport]').innerHTML='<span>YOUR CARNIVAL PASSPORT</span>'+html;
 }
 function worldActivity(){
  if(!worldStation)return null;
  if(state.ride?.stationId===worldStation.id)return {...state.ride,...funhouseRideCue(state.ride,now()),type:'ride'};
  if(state.challenge?.stationId===worldStation.id)return {...state.challenge,type:'challenge'};
  if(worldStation.kind==='water'&&(!state.round?.stationId||state.round.stationId===worldStation.id)&&state.round)return {...state.round,kind:'water',type:'water'};
  return null;
 }
 function renderExperienceHUD(){
  const activity=worldActivity(),visible=Boolean(activity)&&!getImmersive()&&!screen.dialog.open&&!gameplayOverlayOpen();
  experienceHUD.hidden=!visible;experienceHUD.setAttribute('aria-busy',String(pending));if(!visible)return;
  const active=isActive(activity),kind=activity.kind,actions=experienceHUD.querySelector('[data-funhouse-experience-actions]');
  if(hudActivityId!==activity.id){hudActivityId=activity.id;hudExpanded=false;}
  experienceHUD.dataset.expanded=String(hudExpanded||!active);
  const hudToggle=experienceHUD.querySelector('[data-funhouse-hud-toggle]');hudToggle.hidden=!active;hudToggle.setAttribute('aria-expanded',String(hudExpanded));hudToggle.setAttribute('aria-label',hudExpanded?'Minimize attraction controls':'Show attraction actions');hudToggle.textContent=hudExpanded?'Minimize':'Actions';
  experienceHUD.querySelector('[data-funhouse-experience-title]').textContent=worldStation.name;
  experienceHUD.querySelector('[data-funhouse-experience-score]').textContent=String(activity.score||0);experienceHUD.querySelector('[data-funhouse-experience-best]').textContent=String(activity.kind==='water'?state.bestScore||0:state.bestScores?.[activity.kind]||0);
  experienceHUD.querySelector('[data-funhouse-experience-time]').textContent=active?Math.max(0,Math.ceil((activity.endsAt-now())/1000))+'s':activity.status==='cancelled'?'STOPPED':'FINISHED';
  let progress='',help='',status=message||activity.message||state.message||'';
  if(active&&kind==='car'){
   const cue=Number(activity.nextCueAt),until=cue-now(),cueUntil=Number(activity.cueUntil)||cue+1500;progress=(activity.hits||0)+' horn cues';
   status=Number.isFinite(cue)&&until<=0&&now()<=cueUntil?(Number.isInteger(activity.lastCueHit)&&activity.lastCueHit===activity.cueIndex?'Horn cue completed. Watch for the next light.':'HONK NOW!'):Number.isFinite(cue)&&until>0?'Next horn cue in '+Math.ceil(until/1000)+'s':status;
   help='H: honk · Escape: leave ride. Drag to look all around; a headset keeps its tracked view.';
  }else if(active&&kind==='spinner'){
   const cue=Number(activity.nextCueAt),until=cue-now(),cueUntil=Number(activity.cueUntil)||cue+3000;progress=(activity.hits||0)+' balance cues';
   status=Number.isFinite(cue)&&until<=0&&now()<=cueUntil?(Number.isInteger(activity.lastCueHit)&&activity.lastCueHit===activity.cueIndex?'Balanced! Watch for the next side.':'BALANCE '+(Number(activity.targetId)===0?'LEFT':'RIGHT')+' NOW!'):Number.isFinite(cue)&&until>0?'Next balance cue in '+Math.ceil(until/1000)+'s':status;
   help='1 / 2: balance · Escape: leave. Look all around freely; gentle mode keeps a steady heading.';
  }else if(active&&kind==='jackbox'){
   progress=(activity.windCount||0)+' / 3 winds';
   status=activity.phase==='ready'?(now()<activity.readyAt?'Wait for the clown…':now()<=activity.catchUntil?'CATCH NOW!':'The clown slipped away.'):'Wind the crank three times, then wait for the catch cue.';
   help='F: wind or catch · aim at the physical crank / clown to play in first person.';
  }else if(active&&kind==='ballpit'){
   progress=(activity.hits||0)+' hits';status='Toss into the glowing '+['red','gold','cyan','purple'][Number(activity.targetId)||0]+' target.';
   help='Aim at a target and use Shoot, or use buttons / keys 1–4 to toss.';
  }else if(active&&kind==='mirrors'){
   const index=Number(activity.checkpointIndex)||0,total=activity.checkpoints?.length||0;progress=index+' / '+total+' checkpoints';
   const checkpoint=activity.checkpoints?.[index];status=checkpoint?'Walk to '+(checkpoint.name||'checkpoint '+(index+1))+'.':'Find the exit bell.';
   help='Walk with WASD / the stick. Checkpoints confirm as you pass; F also checks the current marker.';
  }else if(active&&kind==='water'){
   progress=(activity.hits||0)+' splashes';status='Splash the glowing clown target '+(Number(activity.targetId)+1)+'.';
   help='Aim at the real targets and click / tap Shoot. Keys 1–6 are also available.';
  }
  experienceHUD.querySelector('[data-funhouse-experience-progress]').textContent=progress;
  experienceHUD.querySelector('[data-funhouse-experience-message]').textContent=pending?'One moment…':status;
  experienceHUD.querySelector('[data-funhouse-experience-help]').textContent=help;
  const key=[worldStation.id,activity.id,active,kind,kind==='mirrors'?activity.phase:''].join(':');
  if(key!==hudSignature){hudSignature=key;let html='';
   if(active){
    if(kind==='car')html+='<button type="button" data-funhouse-honk>Honk · H</button>';
    if(kind==='spinner')html+='<button type="button" data-funhouse-balance="0">Balance left · 1</button><button type="button" data-funhouse-balance="1">Balance right · 2</button>';
    if(activity.type==='ride')html+='<button type="button" data-funhouse-gentle aria-pressed="true">Gentle mode</button><button type="button" data-funhouse-ride-exit>Leave ride</button>';
    else{
     if(kind==='jackbox')html+='<button type="button" data-funhouse-wind>Wind crank · F</button><button type="button" data-funhouse-catch>Catch clown · F</button>';
     if(kind==='ballpit')html+=['Red','Gold','Cyan','Purple'].map((name,id)=>'<button type="button" data-funhouse-toss="'+id+'">'+name+' · '+(id+1)+'</button>').join('');
     if(kind==='mirrors')html+=activity.phase==='bell'?'<button type="button" data-funhouse-ring-bell>Ring exit bell · F</button>':'<button type="button" data-funhouse-check-in>Check checkpoint · F</button>';
     if(kind==='water')html+='<button type="button" data-funhouse-controls>Target buttons</button>';
     html+='<button type="button" data-funhouse-world-stop>Stop challenge</button>';
    }
   }else html='<button type="button" data-funhouse-again>Play again</button><button type="button" data-funhouse-dismiss>Return to exploring</button>';
   actions.innerHTML=html;
  }
  for(const button of actions.querySelectorAll('button'))button.disabled=pending;
  const gentle=actions.querySelector('[data-funhouse-gentle]');if(gentle){gentle.disabled=pending||getReducedMotion();gentle.setAttribute('aria-pressed',String(getReducedMotion()||activity.gentle!==false));gentle.textContent=getReducedMotion()?'Comfort motion on':'Gentle mode · '+(activity.gentle===false?'off':'on');}
  const actionRefill=Number.isFinite(activity.lastActionAt)&&now()<activity.lastActionAt+(kind==='ballpit'?350:kind==='spinner'?300:400);
  const horn=actions.querySelector('[data-funhouse-honk]');if(horn)horn.disabled=pending||actionRefill;
  const exitBell=actions.querySelector('[data-funhouse-ring-bell]');if(exitBell){const bell=nearbyExitBell();exitBell.disabled=pending||!bell;exitBell.textContent=bell?'Ring exit bell · F':'Walk to the exit bell';}
  const wind=actions.querySelector('[data-funhouse-wind]');if(wind)wind.disabled=pending||actionRefill||activity.phase!=='winding'||activity.windCount>=3;
  const catchButton=actions.querySelector('[data-funhouse-catch]');if(catchButton)catchButton.disabled=pending||activity.phase!=='ready'||now()<activity.readyAt||now()>activity.catchUntil;
  actions.querySelectorAll('[data-funhouse-toss]').forEach(button=>{const lit=Number(button.dataset.funhouseToss)===activity.targetId;button.disabled=pending||actionRefill;button.classList.toggle('is-lit',lit);button.setAttribute('aria-label',button.textContent+(lit?', glowing target':''));});
  actions.querySelectorAll('[data-funhouse-balance]').forEach(button=>{button.disabled=pending||actionRefill||activity.lastCueHit===activity.cueIndex;button.classList.toggle('is-lit',Number(button.dataset.funhouseBalance)===activity.targetId&&now()>=activity.nextCueAt&&now()<=(Number(activity.cueUntil)||activity.nextCueAt+3000));});
 }
 function adventureStation(){return stations().find(station=>station.kind==='welcome');}
 function renderAdventureHUD(){
  const adventure=state.adventure,available=funhouseAdventureAvailable(getEnvironment());
  adventureHUD.hidden=!available||!adventure||adventureDismissed===adventure.id||getImmersive()||screen.dialog.open||gameplayOverlayOpen();if(adventureHUD.hidden)return;
  const running=isActive(adventure),clue=funhouseAdventureNextClue(adventure),nearbyClue=running&&funhouseAdventureNear(getPosition(),clue)&&!isActive(state.ride);
  adventureHUD.dataset.expanded=String(adventureExpanded||!running);adventureHUD.dataset.playing=String(!experienceHUD.hidden);
  adventureHUD.querySelector('[data-funhouse-adventure-time]').textContent=running?Math.max(0,Math.ceil((adventure.endsAt-now())/1000))+'s':adventure.status==='complete'?'COMPLETE':'STOPPED';
  const toggle=adventureHUD.querySelector('[data-funhouse-adventure-toggle]');toggle.hidden=!running;toggle.setAttribute('aria-expanded',String(adventureExpanded));toggle.textContent=adventureExpanded?'Hide trail':'Trail';
  adventureHUD.querySelector('[data-funhouse-adventure-next]').textContent=running?(Number(adventure.clueIndex||0)+1)+' / '+FUNHOUSE_ADVENTURE_CLUES.length+' · '+(clue?.name||'Follow the last laugh')+(nearbyClue?' · F to inspect':''):adventure.message||'Trail ended.';
  adventureHUD.querySelector('[data-funhouse-adventure-hint]').textContent=clue?.hint||adventure.message||'Return to the welcome board for another adventure.';
  adventureHUD.querySelector('[data-funhouse-adventure-progress]').textContent=(adventure.found?.length||0)+' / '+FUNHOUSE_ADVENTURE_CLUES.length+' discoveries · '+(adventure.score||0)+' points'+(adventure.status==='complete'?' · Best '+(state.bestScores?.adventure||adventure.score||0):'');
  const inspect=adventureHUD.querySelector('[data-funhouse-adventure-inspect]');inspect.hidden=!running;inspect.disabled=pending||!nearbyClue;inspect.textContent=nearbyClue?'Inspect clue · F':'Find the next clue';
  const stop=adventureHUD.querySelector('[data-funhouse-adventure-stop]');stop.hidden=!running;stop.disabled=pending;
  const replay=adventureHUD.querySelector('[data-funhouse-adventure-replay]');replay.hidden=running;replay.disabled=pending||isActive(state.ride)||!funhouseAdventureNear(getPosition(),FUNHOUSE_ADVENTURE_START);replay.textContent=funhouseAdventureNear(getPosition(),FUNHOUSE_ADVENTURE_START)?'Start again':'Return to the welcome board';
  adventureHUD.querySelector('[data-funhouse-adventure-dismiss]').hidden=running;
 }
 function startAdventure(){const station=adventureStation();if(!station||pending||isActive(state.ride)||!funhouseAdventureNear(getPosition(),FUNHOUSE_ADVENTURE_START))return false;return command('funhouse-adventure',{operation:'start'},{station,adventure:true});}
 function inspectAdventure(){const station=adventureStation(),clue=funhouseAdventureNextClue(state.adventure);if(!station||!clue||pending||isActive(state.ride)||!funhouseAdventureNear(getPosition(),clue))return false;return command('funhouse-adventure',{operation:'inspect',adventureId:state.adventure.id,clueId:clue.id},{station});}
 function stopAdventure(){const station=adventureStation();return station&&command('funhouse-adventure',{operation:'stop',adventureId:state.adventure?.id},{station});}
 adventureHUD.addEventListener('click',event=>{if(event.target.closest('[data-funhouse-adventure-toggle]')){adventureExpanded=!adventureExpanded;renderAdventureHUD();}if(event.target.closest('[data-funhouse-adventure-inspect]'))void inspectAdventure();if(event.target.closest('[data-funhouse-adventure-stop]'))void stopAdventure();if(event.target.closest('[data-funhouse-adventure-replay]'))void startAdventure();if(event.target.closest('[data-funhouse-adventure-dismiss]')){adventureDismissed=state.adventure?.id;renderAdventureHUD();}});
 async function playInWorld(station=current||worldStation||near()){
  if(disposed||!station||getImmersive()||pending)return false;
  const live=liveFor(station.id);if(!live)return false;station=live;
  if(station.kind==='water'){
   if(isActive(state.round)&&state.round.stationId===station.id){worldStation=station;screen.close();onPlayInWorld(station);hudSignature='';renderExperienceHUD();return true;}
   return command('funhouse-start',{stationId:station.id},{station,worldMode:true});
  }
  if(['car','spinner'].includes(station.kind))return command('funhouse-ride',{stationId:station.id},{station,worldMode:true});
  if(['jackbox','ballpit','mirrors'].includes(station.kind)){if(isActive(state.challenge)&&state.challenge.stationId===station.id){worldStation=station;screen.close();onPlayInWorld(station);hudSignature='';renderExperienceHUD();return true;}return command('funhouse-challenge',{stationId:station.id},{station,worldMode:true});}
  worldStation=station;screen.close();onPlayInWorld(station);return true;
 }
 function nearbyExitBell(){return stations().find(station=>station.kind==='maze-finish'&&(!worldStation?.mazeGroup||station.mazeGroup===worldStation.mazeGroup)&&gap(getPosition(),station)<=(station.interactionDistance||6.5));}
 function ringExitBell(){const bell=nearbyExitBell();if(bell&&worldStation)return command('funhouse-use',{stationId:bell.id},{station:worldStation});return false;}
 function experienceAction(operation,fields={}){
  if(!worldStation)return false;return command('funhouse-action',{stationId:worldStation.id,operation,...fields},{station:worldStation});
 }
 function stopWorldExperience(){
  if(!worldStation)return false;const activity=worldActivity();
  if(!isActive(activity)){worldStation=null;renderExperienceHUD();return true;}
  if(activity?.type==='ride')return command('funhouse-ride-exit',{rideId:activity.id},{station:worldStation,clearWorld:true});
  if(activity?.kind==='water')return command('funhouse-stop',{roundId:activity.id},{station:worldStation,clearWorld:true});
  if(activity?.type==='challenge')return command('funhouse-action',{stationId:worldStation.id,operation:'stop',challengeId:activity.id},{station:worldStation,clearWorld:true});
  worldStation=null;renderExperienceHUD();return true;
 }
 function handleExperienceKey(event){
  const activity=worldActivity();if(!activity||experienceHUD.hidden)return false;
  const key=event.key.toLowerCase();
  if(key==='escape'){void stopWorldExperience();return true;}
  if(!isActive(activity))return false;
  if(activity.kind==='car'&&key==='h'){experienceHUD.querySelector('[data-funhouse-honk]')?.click();return true;}
  if(activity.kind==='spinner'&&/^[12]$/.test(key)){experienceHUD.querySelector('[data-funhouse-balance="'+(Number(key)-1)+'"]')?.click();return true;}
  if(activity.kind==='jackbox'&&key==='f'){const operation=activity.phase==='ready'?'catch':'wind',button=experienceHUD.querySelector('[data-funhouse-'+operation+']');if(button&&!button.disabled)void experienceAction(operation);return true;}
  if(activity.kind==='ballpit'&&/^[1-4]$/.test(key)){experienceHUD.querySelector('[data-funhouse-toss="'+(Number(key)-1)+'"]')?.click();return true;}
  if(activity.kind==='mirrors'&&key==='f'){if(activity.phase==='bell')void ringExitBell();else void experienceAction('check-in');return true;}
  if(activity.kind==='water'&&/^[1-6]$/.test(key)){if(Number.isFinite(activity.lastShotAt)&&now()<activity.lastShotAt+300)return true;void command('funhouse-squirt',{roundId:activity.id,targetId:Number(key)-1},{station:worldStation});return true;}
  return false;
 }
 experienceHUD.addEventListener('click',event=>{
  if(event.target.closest('[data-funhouse-hud-toggle]')){hudExpanded=!hudExpanded;renderExperienceHUD();}
  if(event.target.closest('[data-funhouse-honk]'))void experienceAction('honk');
  const balance=event.target.closest('[data-funhouse-balance]');if(balance)void experienceAction('balance',{targetId:Number(balance.dataset.funhouseBalance)});
  if(event.target.closest('[data-funhouse-gentle]'))void experienceAction('gentle',{enabled:state.ride?.gentle===false});
  if(event.target.closest('[data-funhouse-ride-exit],[data-funhouse-world-stop]'))void stopWorldExperience();
  if(event.target.closest('[data-funhouse-wind]'))void experienceAction('wind');
  if(event.target.closest('[data-funhouse-catch]'))void experienceAction('catch');
  const toss=event.target.closest('[data-funhouse-toss]');if(toss)void experienceAction('toss',{targetId:Number(toss.dataset.funhouseToss)});
  if(event.target.closest('[data-funhouse-check-in]'))void experienceAction('check-in');
  if(event.target.closest('[data-funhouse-ring-bell]'))void ringExitBell();
  if(event.target.closest('[data-funhouse-again]'))void playInWorld(worldStation);
  if(event.target.closest('[data-funhouse-dismiss]')){worldStation=null;renderExperienceHUD();}
  if(event.target.closest('[data-funhouse-controls]')){const station=worldStation;if(station){current=station;signature='';panel.setAttribute('aria-label',station.name+' · Midnight Laughs');render();screen.open();}}
 });
 async function command(action,fields={},options={}){
  const station=options.station||current||worldStation;if(pending||disposed||!station)return false;const token=generation;
  pending=true;message='';render();renderExperienceHUD();renderAdventureHUD();
  try{
   const snapshot=await send(action,fields);if(disposed||token!==generation||!snapshot)return false;
   if(!receive(snapshot,snapshot.selfId||selfId)){const liveActivity=[state.ride,state.challenge,state.round].find(value=>value?.stationId===station.id&&isActive(value));if(options.adventure&&isActive(state.adventure)){adventureDismissed=null;adventureExpanded=false;screen.close();onPlayInWorld(station);return true;}if(options.worldMode&&liveActivity){worldStation=station;screen.close();onPlayInWorld(station);hudSignature='';return true;}if(options.clearWorld&&!liveActivity){worldStation=null;return true;}return false;}
   message=snapshot.result?.message||state.message||'Enjoy the show!';
   if(action!=='funhouse-squirt')announce(message);
   if(options.adventure){adventureDismissed=null;adventureExpanded=false;screen.close();onPlayInWorld(station);}
   if(options.worldMode){worldStation=station;screen.close();onPlayInWorld(station);hudSignature='';}
   if(options.clearWorld)worldStation=null;
   return true;
  }catch(error){if(token===generation){message=error.message;announce(message);}return false;}
  finally{if(token===generation&&!disposed){pending=false;panel.setAttribute('aria-busy','false');render();renderExperienceHUD();renderAdventureHUD();}}
 }
 function receive(snapshot,id){
  if(disposed)return false;
  if(Number.isFinite(snapshot?.sequence)){if(snapshot.sequence<=lastSequence)return false;lastSequence=snapshot.sequence;}
  selfId=id||selfId;
  if(Number.isFinite(snapshot?.serverTime))serverOffset=snapshot.serverTime-Date.now();
  const player=snapshot?.players?.[selfId],position=player?.position;
  // Relocation must close the attraction even while its modal pauses the
  // expensive world projection and the visible walking rig is still behind.
  if(current){const live=stations(snapshot.actors).find(station=>station.id===current.id);if(!live||position&&gap(position,live)>7)screen.close();else current=live;}
  const next=player?.funhouse;
  if(next){if(next.message!==state.message)message='';state=next;onState(state,snapshot.serverTime,snapshot);const activity=isActive(state.ride)?state.ride:isActive(state.challenge)?state.challenge:null;if(activity&&(!worldStation||worldStation.id!==activity.stationId))worldStation=stations(snapshot.actors).find(station=>station.id===activity.stationId)||null;render();renderPassport();renderExperienceHUD();renderAdventureHUD();}
  for(const event of snapshot?.events||[]){
   const effect=event.funhouseEffect;if(!effect||seenEffects.has(event.id))continue;
   seenEffects.add(event.id);if(seenEffects.size>128)seenEffects.delete(seenEffects.values().next().value);
   if(Math.abs((snapshot.serverTime||now())-event.at)>4500)continue;
   const clue=effect.clueId&&FUNHOUSE_ADVENTURE_CLUES.find(value=>value.id===effect.clueId),station=effect.kind==='adventure'?{id:FUNHOUSE_ADVENTURE_START.id,kind:'adventure',position:effect.position||clue?.position||FUNHOUSE_ADVENTURE_START.position}:stations(snapshot.actors).find(station=>station.id===effect.stationId);if(station)onEffect(station,effect);
  }
  return true;
 }
 function open(){
  update();if(disposed||getImmersive()||isActive(state.ride)||!nearby||gameplayOverlayOpen())return false;
  current=nearby;signature='';message='';panel.setAttribute('aria-label',current.name+' · Midnight Laughs');render();screen.open();trigger.setAttribute('aria-expanded','true');return true;
 }
 function update(){
  if(disposed)return;const immersive=getImmersive();if(immersive&&screen.dialog.open)screen.close();const available=stations();
  if(!available.length){nearby=null;if(current)screen.close();trigger.hidden=passport.hidden=experienceHUD.hidden=adventureHUD.hidden=true;worldStation=null;return;}
  nearby=near();
  trigger.hidden=immersive||!nearby||screen.dialog.open||gameplayOverlayOpen()||isActive(state.ride);
  passport.hidden=immersive||screen.dialog.open||gameplayOverlayOpen();renderPassport();renderExperienceHUD();
  if(nearby&&trigger.dataset.station!==nearby.id){trigger.dataset.station=nearby.id;trigger.innerHTML='<kbd>E</kbd><span><small>MIDNIGHT LAUGHS</small>'+escape(nearby.name)+'</span><b aria-hidden="true">↗</b>';trigger.setAttribute('aria-label',nearby.prompt);}
  if(current){const live=available.find(station=>station.id===current.id);if(!live||gap(getPosition(),live)>7)screen.close();else current=live;}
  if(current?.kind==='water')render();
  if(worldStation&&!isActive(state.ride)&&state.challenge?.kind!=='mirrors'){const live=available.find(station=>station.id===worldStation.id);if(!live||gap(getPosition(),live)>8)worldStation=null;}
  renderExperienceHUD();renderAdventureHUD();
 }
 function reset(){generation++;pending=false;state={};selfId=null;message='';signature='';passportSignature=null;lastSequence=-1;nearby=null;worldStation=null;hudSignature='';hudActivityId=null;hudExpanded=adventureExpanded=false;adventureDismissed=null;seenEffects.clear();screen.close();current=null;trigger.hidden=passport.hidden=experienceHUD.hidden=adventureHUD.hidden=true;onState(state);}
 function keydown(event){
  if(getImmersive()||event.defaultPrevented||event.repeat||event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  if(!screen.dialog.open&&worldStation&&handleExperienceKey(event)){event.preventDefault();event.stopImmediatePropagation();return;}
  if(!screen.dialog.open&&!gameplayOverlayOpen()&&event.key.toLowerCase()==='f'&&isActive(state.adventure)){event.preventDefault();event.stopImmediatePropagation();void inspectAdventure();return;}
  if(event.key.toLowerCase()==='e'&&!screen.dialog.open&&!gameplayOverlayOpen()&&near()){event.preventDefault();event.stopImmediatePropagation();open();}
  else if(screen.dialog.open&&current?.kind==='water'&&/^[1-6]$/.test(event.key)){event.preventDefault();content.querySelector('[data-funhouse-target="'+(Number(event.key)-1)+'"]')?.click();}
 }
 trigger.onclick=open;$('[data-funhouse-close]').onclick=()=>screen.close();
 content.addEventListener('click',event=>{
  if(event.target.closest('[data-funhouse-adventure-start]')){void startAdventure();return;}
  if(event.target.closest('[data-funhouse-world-play],[data-funhouse-board],[data-funhouse-challenge]')){void playInWorld(current);return;}
  if(event.target.closest('[data-funhouse-start]'))void command('funhouse-start',{stationId:current.id});
  const target=event.target.closest('[data-funhouse-target]');
  if(target&&!target.disabled){target.classList.remove('is-splashed');void target.offsetWidth;target.classList.add('is-splashed');setTimeout(()=>target.classList.remove('is-splashed'),500);void command('funhouse-squirt',{roundId:state.round?.id,targetId:Number(target.dataset.funhouseTarget)});}
  if(event.target.closest('[data-funhouse-use]'))void command('funhouse-use',{stationId:current.id});
  const dress=event.target.closest('[data-funhouse-dress]');if(dress){const costume={hat:Boolean(state.costume?.hat),shoes:Boolean(state.costume?.shoes)};costume[dress.dataset.funhouseDress]=!costume[dress.dataset.funhouseDress];void command('funhouse-dress',{...costume,stationId:current.id});}
 });
 for(const type of ['pointerdown','click','wheel'])for(const element of [experienceHUD,adventureHUD])element.addEventListener(type,event=>event.stopPropagation());
 window.addEventListener('keydown',keydown,true);
 const timer=setInterval(update,100);
 return {open,close:()=>screen.close(),update,receive,reset,playInWorld,setExpanded:expanded=>{hudExpanded=!!expanded;renderExperienceHUD();},currentStation:()=>current||worldStation||near(),snapshot:()=>state,available:()=>!getImmersive()&&!isActive(state.ride)&&Boolean(near()),visible:()=>screen.dialog.open,dispose(){if(disposed)return;reset();disposed=true;clearInterval(timer);window.removeEventListener('keydown',keydown,true);screen.disconnect();screen.dialog.remove();trigger.remove();passport.remove();experienceHUD.remove();adventureHUD.remove();}};
}
