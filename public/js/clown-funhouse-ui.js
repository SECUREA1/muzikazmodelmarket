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

export function mountClownFunhouseUI({stage,getEnvironment,getPosition,getActors=()=>({}),send,announce=()=>{},onOpen=()=>{},onState=()=>{},onEffect=()=>{}}){
 loadGameMenuStyles();
 if(!document.querySelector('#funhouse-ui-styles')){const link=document.createElement('link');link.id='funhouse-ui-styles';link.rel='stylesheet';link.href='/public/css/clown-funhouse.css';document.head.append(link);}
 const trigger=document.createElement('button');trigger.type='button';trigger.className='funhouse-use';trigger.hidden=true;trigger.setAttribute('aria-controls','clown-funhouse-panel');trigger.setAttribute('aria-expanded','false');stage.append(trigger);
 const passport=document.createElement('div');passport.className='funhouse-passport-hud';passport.hidden=true;passport.setAttribute('aria-label','Funhouse attraction passport');stage.append(passport);
 const panel=document.createElement('section');panel.id='clown-funhouse-panel';panel.hidden=true;panel.className='funhouse-panel';panel.setAttribute('aria-label','Midnight Laughs Funhouse');
 panel.innerHTML='<div class="funhouse-heading"><span class="funhouse-eyebrow">MUZIKAZ · OPEN ALL NIGHT</span><h3 data-funhouse-title></h3><p data-funhouse-description></p></div><div data-funhouse-content></div><p class="funhouse-message" data-funhouse-message role="status" aria-live="polite"></p><div class="funhouse-passport" data-funhouse-passport></div><footer><span>Free carnival play · collect all six passport stamps</span><button type="button" data-funhouse-close>Back to the midway</button></footer>';
 stage.append(panel);
 let nearby=null,current=null,state={},selfId=null,pending=false,generation=0,disposed=false,message='',signature='',passportSignature=null,serverOffset=0,lastSequence=-1;
 const seenEffects=new Set();
 const $=selector=>panel.querySelector(selector),content=$('[data-funhouse-content]');
 const screen=fullscreenPanel(panel,{onOpen:()=>{document.exitPointerLock?.();onOpen();},onClose:()=>{current=null;signature='';trigger.setAttribute('aria-expanded','false');}});
 screen.dialog.classList.add('funhouse-dialog');
 const now=()=>Date.now()+serverOffset;
 const stations=(actors=getActors())=>funhouseStations(getEnvironment(),{actors});
 const near=()=>nearestFunhouseStation(getEnvironment(),getPosition(),{actors:getActors()});
 const gap=(position,station)=>Math.hypot(position.x-station.position.x,(Number(position.y)||0)-station.position.y,position.z-station.position.z);
 function render(){
  if(!current||disposed)return;
  const round=!state.round?.stationId||state.round.stationId===current.id?state.round:null,active=round?.status==='active'&&round.endsAt>now(),kind=current.kind;
  $('[data-funhouse-title]').textContent=current.name;
  const descriptions={water:'Aim your water blaster at the glowing clown. Hit three or more targets in 30 seconds to earn your stamp.',car:'One tiny car. Far too many clowns. Give the horn a squeeze and watch the surprise outside.',spinner:'Set the giant propeller hat whirling. The platform and its clown passengers put on a dizzy show.',dressup:'Big shoes, big trouble. Wear both pieces to earn your dressing-room stamp. Your friends can see your outfit.',mirrors:'Start your maze visit here, then weave around the crooked mirrors in the west wing. Ring the bell at the far end to earn your stamp.','maze-finish':'You found the far end of the mirror maze. Ring the exit bell to claim your stamp.',ballpit:'A sea of candy-colored balls hides a silly monster. Make it bounce!',jackbox:'Wind the handle. Wait for the punchline. Meet the clown in the fright box.',welcome:'Welcome to Midnight Laughs: follow the lit midway, explore the haunted house, and fill your carnival passport.'};
  $('[data-funhouse-description]').textContent=descriptions[kind]||'';
  const next=[current.id,round?.id,active,state.costume?.hat,state.costume?.shoes].join(':');
  if(next!==signature){signature=next;
   if(kind==='water'){
    content.innerHTML='<div class="funhouse-gallery"><div class="funhouse-scoreboard"><span>ROUND SCORE <b data-funhouse-score>0</b></span><span>TIME <b data-funhouse-time>30s</b></span><span>PERSONAL BEST <b data-funhouse-best>0</b></span></div><div class="funhouse-targets" aria-label="Water-gun clown targets">'+Array.from({length:6},(_,id)=>'<button type="button" class="funhouse-target" data-funhouse-target="'+id+'" aria-label="Splash clown '+(id+1)+'"><span class="funhouse-clown-face" aria-hidden="true"><i class="funhouse-clown-hair"></i><i class="funhouse-clown-eyes"></i><i class="funhouse-clown-nose"></i><i class="funhouse-clown-smile"></i></span><span class="funhouse-target-label">'+(id+1)+' <small>WAIT</small></span><span class="funhouse-splash" aria-hidden="true">✳</span></button>').join('')+'</div><div class="funhouse-blaster" aria-hidden="true"><span>WATER BLASTER</span><i></i></div><p class="funhouse-gallery-help">Click / tap a clown or press <kbd>1</kbd>–<kbd>6</kbd>. Follow the cyan light.</p><button type="button" data-funhouse-start>'+(round?'Play another round':'Start 30-second round')+'</button></div>';
   }else if(kind==='dressup'){
    content.innerHTML='<div class="funhouse-costume-card"><div class="funhouse-costume-art" aria-hidden="true">✶<span>◒</span><b>▰ ▰</b></div><div><button type="button" data-funhouse-dress="hat" aria-pressed="'+Boolean(state.costume?.hat)+'">'+(state.costume?.hat?'Remove':'Wear')+' propeller hat</button><button type="button" data-funhouse-dress="shoes" aria-pressed="'+Boolean(state.costume?.shoes)+'">'+(state.costume?.shoes?'Remove':'Wear')+' giant clown shoes</button><p>Use <b>View</b> to see your outfit from above.</p></div></div>';
   }else if(kind==='welcome'){
    content.innerHTML='<div class="funhouse-directory">'+FUNHOUSE_STATIONS.filter(s=>stampKinds.includes(s.kind)).map(s=>'<article><span aria-hidden="true">'+icons[s.kind]+'</span><b>'+escape(s.name)+'</b><small>'+({water:'West midway',car:'East midway',spinner:'East court',dressup:'West dressing tent','maze-finish':'Inside the haunted house',jackbox:'Inside the haunted house'}[s.kind])+'</small></article>').join('')+'</div><p class="funhouse-welcome-note">Walk with WASD / the stick. Press E or tap the attraction prompt nearby. Maps shows every attraction. Every game and costume here is free.</p>';
   }else{
    const labels={car:'Honk! Release the clowns',spinner:'Start the dizzy show',mirrors:'Start the mirror maze','maze-finish':'Ring the exit bell',ballpit:'Bounce the monster',jackbox:'Wind the fright box'};
    content.innerHTML='<div class="funhouse-attraction-card" data-kind="'+kind+'"><span class="funhouse-attraction-icon" aria-hidden="true">'+icons[kind]+'</span><p>'+(kind==='mirrors'?'The first wall ends on your right. The next gap is on your left. Follow the zigzag to the bell.':'Activate the attraction, then return to walking to enjoy the show in the world.')+'</p><button type="button" data-funhouse-use>'+escape(labels[kind]||'Play')+'</button></div>';
   }
  }
  for(const button of content.querySelectorAll('button'))button.disabled=pending;
  if(kind==='water'){
   $('[data-funhouse-score]').textContent=String(round?.score||0);$('[data-funhouse-best]').textContent=String(state.bestScore||0);
   const start=$('[data-funhouse-start]');start.hidden=active;start.disabled=pending||(!round&&state.round?.status==='active'&&state.round.endsAt>now());
   const refilling=Number.isFinite(round?.lastShotAt)&&now()<round.lastShotAt+300;
   content.querySelectorAll('[data-funhouse-target]').forEach(button=>{const lit=active&&Number(button.dataset.funhouseTarget)===round.targetId;button.classList.toggle('is-lit',lit);button.setAttribute('aria-label','Splash clown '+(Number(button.dataset.funhouseTarget)+1)+(lit?', glowing target':''));button.querySelector('small').textContent=lit?(refilling?'REFILL':'SPLASH!'):'WAIT';button.disabled=pending||!active||refilling;});
   $('[data-funhouse-time]').textContent=active?Math.max(0,Math.ceil((round.endsAt-now())/1000))+'s':round?'FINISHED':'30s';
  }
  $('[data-funhouse-message]').textContent=pending?'One moment…':message||state.message||'';
  panel.setAttribute('aria-busy',String(pending));
  renderPassport();
 }
 function renderPassport(){
  const stamps=state.stamps||[],next=stamps.join(':');
  if(next===passportSignature&&passport.childElementCount)return;
  passportSignature=next;
  const stations=FUNHOUSE_STATIONS.filter(s=>stampKinds.includes(s.kind)),html=stations.map(s=>'<span class="funhouse-stamp'+(stamps.includes(s.id)?' is-stamped':'')+'" title="'+escape(s.name)+(stamps.includes(s.id)?' — stamped':' — visit to earn')+'" aria-label="'+escape(s.name)+(stamps.includes(s.id)?', stamped':', not stamped')+'">'+icons[s.kind]+'</span>').join('');
  passport.innerHTML='<b>LAUGH PASSPORT</b>'+html+'<small>'+stations.filter(s=>stamps.includes(s.id)).length+'/6</small>';
  $('[data-funhouse-passport]').innerHTML='<span>YOUR CARNIVAL PASSPORT</span>'+html;
 }
 async function command(action,fields={}){
  if(pending||disposed||!current)return;const token=generation;
  pending=true;message='';render();
  try{
   const snapshot=await send(action,fields);if(disposed||token!==generation||!snapshot)return;
   if(!receive(snapshot,snapshot.selfId||selfId))return;
   message=snapshot.result?.message||state.message||'Enjoy the show!';
   if(action!=='funhouse-squirt')announce(message);
  }catch(error){if(token===generation){message=error.message;announce(message);}}
  finally{if(token===generation&&!disposed){pending=false;render();}}
 }
 function receive(snapshot,id){
  if(disposed)return false;
  if(Number.isFinite(snapshot?.sequence)){if(snapshot.sequence<lastSequence)return false;lastSequence=snapshot.sequence;}
  selfId=id||selfId;
  if(Number.isFinite(snapshot?.serverTime))serverOffset=snapshot.serverTime-Date.now();
  const player=snapshot?.players?.[selfId],position=player?.position;
  // Relocation must close the attraction even while its modal pauses the
  // expensive world projection and the visible walking rig is still behind.
  if(current){const live=stations(snapshot.actors).find(station=>station.id===current.id);if(!live||position&&gap(position,live)>7)screen.close();else current=live;}
  const next=player?.funhouse;
  if(next){if(next.message!==state.message)message='';state=next;onState(state);render();renderPassport();}
  for(const event of snapshot?.events||[]){
   const effect=event.funhouseEffect;if(!effect||seenEffects.has(event.id))continue;
   seenEffects.add(event.id);if(seenEffects.size>128)seenEffects.delete(seenEffects.values().next().value);
   if(Math.abs((snapshot.serverTime||now())-event.at)>4500)continue;
   const station=stations(snapshot.actors).find(station=>station.id===effect.stationId);if(station)onEffect(station,effect);
  }
  return true;
 }
 function open(){
  update();if(disposed||!nearby||gameplayOverlayOpen())return false;
  current=nearby;signature='';message='';panel.setAttribute('aria-label',current.name+' · Midnight Laughs');render();screen.open();trigger.setAttribute('aria-expanded','true');return true;
 }
 function update(){
  if(disposed)return;const available=stations();
  if(!available.length){nearby=null;if(current)screen.close();trigger.hidden=passport.hidden=true;return;}
  nearby=near();
  trigger.hidden=!nearby||screen.dialog.open||gameplayOverlayOpen();
  passport.hidden=screen.dialog.open||gameplayOverlayOpen();renderPassport();
  if(nearby&&trigger.dataset.station!==nearby.id){trigger.dataset.station=nearby.id;trigger.innerHTML='<kbd>E</kbd><span><small>MIDNIGHT LAUGHS</small>'+escape(nearby.name)+'</span><b aria-hidden="true">↗</b>';trigger.setAttribute('aria-label',nearby.prompt);}
  if(current){const live=available.find(station=>station.id===current.id);if(!live||gap(getPosition(),live)>7)screen.close();else current=live;}
  if(current?.kind==='water')render();
 }
 function reset(){generation++;pending=false;state={};selfId=null;message='';signature='';passportSignature=null;lastSequence=-1;nearby=null;seenEffects.clear();screen.close();current=null;trigger.hidden=passport.hidden=true;onState(state);}
 function keydown(event){
  if(event.defaultPrevented||event.repeat||event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  if(event.key.toLowerCase()==='e'&&!screen.dialog.open&&!gameplayOverlayOpen()&&near()){event.preventDefault();event.stopImmediatePropagation();open();}
  else if(screen.dialog.open&&current?.kind==='water'&&/^[1-6]$/.test(event.key)){event.preventDefault();content.querySelector('[data-funhouse-target="'+(Number(event.key)-1)+'"]')?.click();}
 }
 trigger.onclick=open;$('[data-funhouse-close]').onclick=()=>screen.close();
 content.addEventListener('click',event=>{
  if(event.target.closest('[data-funhouse-start]'))void command('funhouse-start',{stationId:current.id});
  const target=event.target.closest('[data-funhouse-target]');
  if(target&&!target.disabled){target.classList.remove('is-splashed');void target.offsetWidth;target.classList.add('is-splashed');setTimeout(()=>target.classList.remove('is-splashed'),500);void command('funhouse-squirt',{roundId:state.round?.id,targetId:Number(target.dataset.funhouseTarget)});}
  if(event.target.closest('[data-funhouse-use]'))void command('funhouse-use',{stationId:current.id});
  const dress=event.target.closest('[data-funhouse-dress]');if(dress){const costume={hat:Boolean(state.costume?.hat),shoes:Boolean(state.costume?.shoes)};costume[dress.dataset.funhouseDress]=!costume[dress.dataset.funhouseDress];void command('funhouse-dress',{...costume,stationId:current.id});}
 });
 window.addEventListener('keydown',keydown,true);
 const timer=setInterval(update,100);
 return {open,update,receive,reset,available:()=>Boolean(near()),visible:()=>screen.dialog.open,dispose(){if(disposed)return;reset();disposed=true;clearInterval(timer);window.removeEventListener('keydown',keydown,true);screen.disconnect();screen.dialog.remove();trigger.remove();passport.remove();}};
}
