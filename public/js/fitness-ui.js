import {FITNESS_ID,FITNESS_STATIONS,FITNESS_TRAINERS,isFitnessEnvironment,fitnessStations} from './fitness-config.js';
import {FITNESS_GAMES} from './fitness-rules.js';
import {gameplayOverlayOpen,loadGameMenuStyles} from './game-menu-controls.js';
import {requestGameInputRelease} from './game-input-release.js';

const text=(node,value)=>{value=String(value??'');if(node.textContent!==value)node.textContent=value;};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const activeRound=round=>round&&['countdown','active'].includes(round.status);
const kindOf=station=>station?.kind||station?.activity||station?.game||station?.id||'';
const isRope=kind=>/rope/.test(kind);
const isStrength=kind=>/bench|deadlift|squat/.test(kind);
const glyph={jab:'←',cross:'→',duck:'↓',left:'←',right:'→',up:'↑',down:'↓',press:'↑',lift:'↑',jump:'↟',pull:'←',recover:'→',balance:'◆',tap:'●',step:'●'};
const label=input=>({jab:'Jab',cross:'Cross',duck:'Duck',press:'Press',lift:'Lift',jump:'Jump',pull:'Pull',recover:'Recover',left:'Left',right:'Right',up:'Forward',down:'Back',tap:'Tap',balance:'Balance',step:'Step'}[input]||String(input||'Ready'));
const keyLabel=input=>({jab:'J / ←',cross:'K / →',duck:'L / ↓',press:'SPACE',lift:'SPACE',jump:'SPACE',pull:'J / ←',recover:'K / →',left:'← / A',right:'→ / D',up:'↑ / W',down:'↓ / S',tap:'SPACE',balance:'SPACE',step:'SPACE'}[input]||'SPACE');
const moveKeys={ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right',ArrowUp:'up',w:'up',ArrowDown:'down',s:'down'};

export function nearestFitnessStation(environment,position,range=4,stations=typeof environment==='string'?FITNESS_STATIONS:fitnessStations(environment)){
 if(!(typeof environment==='string'?environment===FITNESS_ID:isFitnessEnvironment(environment))||!position)return null;
 let result=null,distance=range;
 for(const station of stations){const p=station.position;if(!p)continue;const gap=Math.hypot(position.x-p.x,(position.y||0)-(p.y||0),position.z-p.z);if(gap<=Math.min(distance,station.interactionDistance||4)&&Math.abs((position.y||0)-(p.y||0))<4){distance=gap;result=station;}}
 return result;
}
export function fitnessCueAt(round,now){
 if(!round?.cues?.length)return {index:-1,cue:null,offset:0,canHit:false};
 const interval=round.intervalMs||1400,first=round.cues[0].at;
 const index=Math.max(0,Math.min(round.cues.length-1,Math.floor((now-first+interval/2)/interval))),cue=round.cues[index],offset=now-cue.at;
 return {index,cue,offset,canHit:now>=(round.startedAt||first)&&Math.abs(offset)<=(round.windowMs||420)&&!round.attempts?.[index]};
}
export function fitnessKeyboardInput(key,station){
 const kind=kindOf(station),k=key.length===1?key.toLowerCase():key;
 if(/boxing/.test(kind))return {j:'jab',k:'cross',l:'duck',ArrowLeft:'jab',ArrowRight:'cross',ArrowDown:'duck'}[k]||null;
 if(/agility/.test(kind))return moveKeys[k]||null;
 if(/balance/.test(kind))return ['left','right'].includes(moveKeys[k])?moveKeys[k]:null;
 if(/rowing/.test(kind))return {j:'pull',k:'recover',ArrowLeft:'pull',ArrowRight:'recover'}[k]||null;
 if(key===' '||key==='Spacebar'||key==='Enter')return isRope(kind)?'jump':/bench/.test(kind)?'press':/deadlift|squat/.test(kind)?'lift':'tap';
 return null;
}
function instructions(station){
 const kind=kindOf(station);
 if(/boxing/.test(kind))return 'Read the combo. Jab, cross or duck as the moving marker enters the mint zone. Keep your streak alive.';
 if(/bench/.test(kind))return 'Control every rep. Press SPACE or tap PRESS when the marker reaches the mint zone. Precision beats speed.';
 if(/deadlift|squat/.test(kind))return 'Set, brace, lift. Match each lift to the mint timing zone for a controlled set and a clean score.';
 if(/agility/.test(kind))return 'Follow the lit direction. Use arrow keys or the pads as the marker enters the mint zone. Change direction with every cue.';
 if(/rowing/.test(kind))return 'Drive, then recover. Alternate PULL and RECOVER as each cue reaches the mint zone. Use J / K, arrow keys or the buttons.';
 if(/balance/.test(kind))return 'Read the correction. Shift LEFT or RIGHT as the marker enters the mint zone. Stay centred and build a steady streak.';
 if(isRope(kind))return 'Find your rhythm. Jump with SPACE or tap JUMP when each beat reaches the mint zone. Land a clean streak.';
 return 'Match the displayed move to the mint timing zone. Each clean rep builds your score.';
}
function moves(station){return FITNESS_GAMES[kindOf(station)]?.inputs||['tap'];}
function artwork(station){
 const kind=kindOf(station),base='<svg viewBox="0 0 360 190" aria-hidden="true"><ellipse cx="180" cy="169" rx="115" ry="10" fill="#070b0c"/><path d="M38 169H322" stroke="#536260" stroke-width="2"/>';
 if(/boxing/.test(kind))return base+'<path d="M180 0V29m-23 11 23-11 23 11" stroke="#aeb9ad" stroke-width="3" fill="none"/><g class="fitness-bag"><rect x="144" y="35" width="72" height="112" rx="28" fill="#f17e64"/><path d="M147 60h66m-65 58h64" stroke="#a8463d" stroke-width="5"/><path d="M165 72h30v29h-30z" fill="#182927"/><text x="180" y="92" text-anchor="middle" fill="#d9f4c6" font-size="17" font-weight="800">M</text></g><g class="fitness-glove fitness-glove-left"><path d="M76 115q-22-28-2-43 13-9 25 5 5-13 15-3 12 14-6 42l-8 22-25-7z" fill="#d9efca"/><path d="m76 115 29 10" stroke="#668571" stroke-width="7"/></g><g class="fitness-glove fitness-glove-right"><path d="M284 115q22-28 2-43-13-9-25 5-5-13-15-3-12 14 6 42l8 22 25-7z" fill="#d9efca"/><path d="m284 115-29 10" stroke="#668571" stroke-width="7"/></g></svg>';
 if(/bench/.test(kind))return base+'<path d="M90 164V46m180 118V46M81 46h18m162 0h18" stroke="#7e9890" stroke-width="7"/><rect x="127" y="112" width="105" height="20" rx="7" fill="#c7e9b3"/><path d="M143 132v32m75-32v32" stroke="#7e9890" stroke-width="7"/><circle cx="149" cy="97" r="13" fill="#dba785"/><path d="m164 109 48-4 23 22 13 32m-33-53-9 26-20 17" fill="none" stroke="#f17e64" stroke-width="16" stroke-linecap="round"/><g class="fitness-bar"><path d="M73 69h214" stroke="#d2ddd7" stroke-width="5"/><rect x="83" y="49" width="12" height="42" rx="3" fill="#b6d5a4"/><rect x="98" y="43" width="16" height="54" rx="4" fill="#718f7c"/><rect x="246" y="43" width="16" height="54" rx="4" fill="#718f7c"/><rect x="265" y="49" width="12" height="42" rx="3" fill="#b6d5a4"/></g><path class="fitness-press-arms" d="m164 105 12-34m28 34-8-34" stroke="#dba785" stroke-width="10" stroke-linecap="round"/></svg>';
 if(/deadlift|squat/.test(kind))return base+'<path d="m162 115-12 44h-22m66-44 14 44h22" fill="none" stroke="#a6c991" stroke-width="14" stroke-linecap="round"/><g class="fitness-lifter"><circle cx="179" cy="47" r="15" fill="#c68d69"/><path d="M158 74q21-15 41 0l-5 43h-33z" fill="#f17e64"/><path d="m158 78-16 46m57-46 16 46" fill="none" stroke="#c68d69" stroke-width="11" stroke-linecap="round"/><g class="fitness-lift-bar"><path d="M82 126h196" stroke="#d2ddd7" stroke-width="5"/><rect x="97" y="107" width="14" height="39" rx="4" fill="#a6c991"/><rect x="114" y="100" width="16" height="53" rx="4" fill="#718f7c"/><rect x="230" y="100" width="16" height="53" rx="4" fill="#718f7c"/><rect x="249" y="107" width="14" height="39" rx="4" fill="#a6c991"/></g></g></svg>';
 if(/rowing/.test(kind))return base+'<path d="M78 155h202m-180 0v-14m160 14v-14" stroke="#728d7b" stroke-width="7"/><path d="M113 139h113" stroke="#c6e5b1" stroke-width="10" stroke-linecap="round"/><circle cx="265" cy="123" r="28" fill="#192d27" stroke="#8ca480" stroke-width="6"/><path d="m252 105 26 36m-32-14 38-8" stroke="#58705c" stroke-width="2"/><g class="fitness-rower"><circle cx="173" cy="66" r="13" fill="#c58b67"/><path d="m173 87 16 30-30 13-30-9" fill="none" stroke="#ee9677" stroke-width="15" stroke-linecap="round"/><path d="m180 93 35 6 27 8" stroke="#c58b67" stroke-width="10" fill="none" stroke-linecap="round"/><path d="m166 128 43 6 15-7" fill="none" stroke="#b9d99f" stroke-width="11" stroke-linecap="round"/><path d="m244 107 18 7" stroke="#cfdfbc" stroke-width="4"/></g></svg>';
 if(/balance/.test(kind))return base+'<path d="M89 146h182" stroke="#9cb78a" stroke-width="12" stroke-linecap="round"/><path d="m105 151-9 13m158-13 9 13" stroke="#607c65" stroke-width="6"/><g class="fitness-balance-person"><circle cx="181" cy="40" r="13" fill="#d5a182"/><path d="M166 62h29l-3 43h-24z" fill="#ed9678"/><path d="m169 70-39 5-24-7m86 2 38 5 24-7" stroke="#d5a182" stroke-width="9" fill="none" stroke-linecap="round"/><path d="m174 106-4 31m17-31 4 31" stroke="#a7ca90" stroke-width="10" stroke-linecap="round"/></g><path d="m74 96-13 10 13 10m212-20 13 10-13 10" stroke="#c8e8af" stroke-width="3" fill="none"/></svg>';
 if(/agility/.test(kind))return base+'<g transform="translate(180 91) rotate(-14)"><path d="m-84 16 84-58 84 58-84 59z" fill="#0d1617" stroke="#7b9586" stroke-width="2"/><path d="m0-34 33 23L0 12-33-11z" data-pad-up fill="#56715e"/><path d="m-42-5 33 23-33 23-33-23z" data-pad-left fill="#56715e"/><path d="m42-5 33 23-33 23L9 18z" data-pad-right fill="#56715e"/><path d="m0 23 33 23L0 69-33 46z" data-pad-down fill="#56715e"/></g><path d="m84 63 9-9m174 87 9-9M88 136l10 8m169-85 10 8" stroke="#f17e64" stroke-width="4" stroke-linecap="round"/></svg>';
 return base+'<g class="fitness-rope-person"><circle cx="180" cy="42" r="14" fill="#dba785"/><path d="M163 66h34l-4 48h-26z" fill="#f17e64"/><path d="m169 115-5 40m27-40 5 40" stroke="#a6c991" stroke-width="11" stroke-linecap="round"/><path d="m163 71-27 26m61-26 27 26" stroke="#dba785" stroke-width="9" stroke-linecap="round"/></g><ellipse class="fitness-jump-rope" cx="180" cy="99" rx="68" ry="65" fill="none" stroke="#d1efb8" stroke-width="3"/><circle cx="134" cy="96" r="6" fill="#b9ceae"/><circle cx="226" cy="96" r="6" fill="#b9ceae"/></svg>';
}

export function mountFitnessUI(stage,command,{onOpen=()=>{},onClose=()=>{},announce=()=>{},onWaypoint=()=>{}}={}){
 loadGameMenuStyles();
 if(!document.querySelector('#fitness-ui-styles')){const link=document.createElement('link');link.id='fitness-ui-styles';link.rel='stylesheet';link.href=new URL('../css/fitness.css',import.meta.url).href;document.head.append(link);}
 const trigger=document.createElement('button');trigger.type='button';trigger.className='fitness-toggle fitness-menu-trigger';trigger.hidden=true;trigger.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 8v8m10-8v8M4 6v12m16-12v12M7 12h10M2 9v6m20-6v6"/></svg><span>Gym</span>';trigger.setAttribute('aria-label','Open fitness centre training menu');trigger.setAttribute('aria-haspopup','dialog');
 const prompt=document.createElement('button');prompt.type='button';prompt.className='fitness-nearby';prompt.hidden=true;prompt.setAttribute('aria-haspopup','dialog');
 const dialog=document.createElement('dialog');dialog.className='fitness-dialog';dialog.setAttribute('aria-label','MZK Fitness Centre');
 dialog.innerHTML='<header class="fitness-header"><div class="fitness-logo" aria-hidden="true">M<span>+</span></div><div><span class="fitness-eyebrow">MUZIKAZ WORLD · TRAINING CLUB</span><h2>Fitness Centre<span>Make every rep count.</span></h2></div><button type="button" class="fitness-close" data-close aria-label="Close fitness centre">×</button></header><nav class="fitness-tabs" aria-label="Fitness centre views"><button type="button" data-tab="train" aria-selected="true">Training floor</button><button type="button" data-tab="map" aria-selected="false">Floor plan</button><button type="button" data-tab="coaches" aria-selected="false">Your coaches</button></nav><div class="fitness-body"><aside class="fitness-stations" aria-label="Training stations"></aside><main class="fitness-main"><section data-view="train"><div class="fitness-station-heading"><span class="fitness-eyebrow" data-category></span><span class="fitness-reward" data-reward></span></div><h3 data-title></h3><p class="fitness-description" data-description></p><div class="fitness-session" data-session><div class="fitness-session-top"><span data-round-state>OPEN SESSION</span><span data-round-clock></span></div><div class="fitness-art" data-art></div><div class="fitness-cue"><span class="fitness-cue-icon" data-cue-icon>↑</span><div><small data-cue-small>READY WHEN YOU ARE</small><strong data-cue-label>Find your rhythm</strong></div><span class="fitness-cue-key" data-cue-key>SPACE</span></div><div class="fitness-timing" aria-label="Timing zone"><div class="fitness-timing-good"></div><div class="fitness-timing-perfect"></div><span class="fitness-timing-marker" data-marker></span></div><div class="fitness-timing-labels"><span>EARLY</span><span>HIT THE MINT ZONE</span><span>LATE</span></div><div class="fitness-cue-dots" data-dots aria-label="Round attempts"></div><div class="fitness-game-inputs" data-inputs></div><div class="fitness-metrics"><div><small>SCORE</small><strong data-score>0</strong></div><div><small>CLEAN REPS</small><strong data-reps>0 / 12</strong></div><div><small>STREAK</small><strong data-combo>0×</strong></div></div><div class="fitness-round-result" data-result hidden><span data-medal></span><strong data-result-title></strong><p data-result-detail></p></div></div><p class="fitness-help" data-help></p><div class="fitness-start-row"><button type="button" class="fitness-primary" data-start>Start session <span>↗</span></button><button type="button" data-cancel hidden>End set</button><span class="fitness-distance" data-distance></span></div><div class="fitness-coach-note"><span data-coach-initial>M</span><p><strong data-coach-name>Coach Leon</strong><span data-coach-tip>Consistency makes the difference. Let’s build a clean set.</span></p></div></section><section data-view="map" hidden><span class="fitness-eyebrow">EXPLORE YOUR TRAINING GROUND</span><h3>The whole floor. Your next move.</h3><p class="fitness-description">Select a station to see its challenge. The mint dot is you.</p><div class="fitness-floorplan" data-floorplan></div><div class="fitness-map-legend"><span><i></i> You</span><span data-station-count>7 training stations</span><span>★ Coaches</span></div><p class="fitness-help">Walk to any station in the 3D gym, then use its training prompt to begin.</p></section><section data-view="coaches" hidden><span class="fitness-eyebrow">TWO COACHES. ONE STRONGER YOU.</span><h3>Good form starts here.</h3><p class="fitness-description">Meet Leon and Maya on the gym floor. Train at your pace and earn MZK through skill.</p><div class="fitness-coaches" data-coaches></div><div class="fitness-club-note"><strong>Train. Improve. Earn.</strong><p>Sessions are free to enter. Accurate, correctly timed moves earn points and MZK. Your server confirms each result and saves the reward to your existing wallet.</p></div></section></main></div><footer class="fitness-footer"><span><i></i> LIVE TRAINING FLOOR</span><p data-status role="status" aria-live="polite">Select a station to begin.</p><button type="button" data-walk>Back to exploring →</button></footer>';
 document.body.append(dialog);stage.append(trigger,prompt);
 const $=selector=>dialog.querySelector(selector),list=$('.fitness-stations'),art=$('[data-art]'),inputs=$('[data-inputs]'),dots=$('[data-dots]');
 let snapshot=null,selfId=null,environment=null,self=null,nearby=null,selected=FITNESS_STATIONS[0],round=null,busy=false,disposed=false,raf=0,serverAt=0,receivedAt=performance.now(),finishFor=null,drawnStation=null,drawnRound=null,tab='train',returnFocus=null,attempted=new Set(),lastAnnouncement='',lastRoundState=null,refreshedReward=null,pendingCancel=false,contextRevision=0,modalActive=false;
 let stations=FITNESS_STATIONS,stationSignature='';
 const cardNodes=new Map();
 const now=()=>serverAt+(performance.now()-receivedAt);
 function syncClock(serverTime,timing={}){
  if(!Number.isFinite(serverTime))return;
  const observed=performance.now(),received=Number.isFinite(timing.receivedAt)?timing.receivedAt:observed,sent=Number.isFinite(timing.sentAt)?timing.sentAt:received;
  // Project the server's sample through transport and time spent waiting for
  // this render. Late command replies must never rewind the live cue clock.
  const sample=serverTime+Math.max(0,received-sent)/2+Math.max(0,observed-received);
  serverAt=serverAt?Math.max(now(),sample):sample;receivedAt=observed;
 }

 function stationDistance(station){return self?.position&&station?.position?Math.hypot(self.position.x-station.position.x,(self.position.y||0)-(station.position.y||0),self.position.z-station.position.z):Infinity;}
 function canStart(){return !!self&&selected&&stationDistance(selected)<=(selected?.interactionDistance||4)&&!activeRound(round)&&!(round?.status==='complete'&&!round.settled)&&!busy;}
 function setTab(next){tab=next;for(const section of dialog.querySelectorAll('[data-view]'))section.hidden=section.dataset.view!==next;for(const button of dialog.querySelectorAll('[data-tab]'))button.setAttribute('aria-selected',String(button.dataset.tab===next));if(next==='map')drawFloorplan();}
 function setStatus(message){text($('[data-status]'),message);}
 function focusMenu(){if(dialog.open)return;document.exitPointerLock?.();requestGameInputRelease('fitness-open');onOpen();returnFocus=document.activeElement;(document.fullscreenElement||document.body).append(dialog);document.querySelectorAll('dialog[open]').forEach(node=>{if(node!==dialog&&node.dataset.gameplayBlocking!=='false')node.close();});dialog.showModal();modalActive=true;document.documentElement.classList.add('game-menu-open');trigger.setAttribute('aria-expanded','true');if(!raf)raf=requestAnimationFrame(animate);}
 function open(stationId){if(disposed||!self||!stations.length||!(typeof environment==='string'?environment===FITNESS_ID:isFitnessEnvironment(environment)))return false;const station=stations.find(item=>item.id===stationId)||stations.find(item=>item.id===round?.stationId)||nearby||selected;selectStation(station);setTab('train');focusMenu();render();return true;}
 const focusable=node=>node?.isConnected&&node.matches?.('button,a[href],input,select,textarea,canvas,[tabindex]')&&node.getClientRects().length&&!node.closest('[hidden],[inert]')&&!dialog.contains(node);
 function finishClose({restoreFocus=true,cancelRound=true}={}){if(!modalActive)return;modalActive=false;requestGameInputRelease('fitness-close');trigger.setAttribute('aria-expanded','false');if(raf)cancelAnimationFrame(raf);raf=0;if(cancelRound&&(busy||activeRound(round)))cancel();if(!gameplayOverlayOpen())document.documentElement.classList.remove('game-menu-open');onClose();if(restoreFocus){const target=[returnFocus,stage.querySelector('.game-view-more:not([hidden])'),stage.querySelector('canvas'),trigger].find(focusable);target?.focus({preventScroll:true});}returnFocus=null;}
 function close(options={}){if(dialog.open)dialog.close();finishClose(options);}
 function acceptResult(result,timing){
  syncClock(result?.serverTime,timing);
  if(result?.players){
   if(!Number.isFinite(snapshot?.sequence)||!Number.isFinite(result.sequence)||result.sequence>=snapshot.sequence){snapshot=result;self=result.players[selfId]||self;round=self?.fitness||null;}
  }else if(result?.fitness&&result.fitness.id)round=result.fitness;
  render();
 }

 async function request(action,payload={}){
  if(disposed||busy)return null;const revision=contextRevision;busy=true;render();
  try{const sentAt=performance.now(),result=await command(action,payload),receivedAt=performance.now();if(disposed||revision!==contextRevision)return null;if(result===null||result===false)throw new Error('Reconnect to the gym server and try again.');acceptResult(result,{sentAt,receivedAt});const message=result?.result?.message;if(message)setStatus(message);return result;}
  catch(error){if(!disposed&&revision===contextRevision)setStatus(error.message||'The session could not be confirmed.');return null;}
  finally{if(!disposed&&revision===contextRevision){busy=false;render();if(pendingCancel){pendingCancel=false;if(activeRound(round)||round?.status==='complete'&&!round.settled)cancel();}}}
 }
 async function start(){if(round?.status==='complete'&&!round.settled){finishFor=round.id;await request('fitness-finish',{roundId:round.id});return;}if(!canStart())return;const revision=contextRevision;attempted.clear();finishFor=null;setStatus('Coach is getting your set ready…');await request('fitness-start',{stationId:selected.id});if(!disposed&&revision===contextRevision&&dialog.open&&activeRound(round))inputs.querySelector('button')?.focus({preventScroll:true});}
 async function cancel(){if(busy){pendingCancel=true;return;}if(activeRound(round)||round?.status==='complete'&&!round.settled)await request('fitness-cancel',{roundId:round.id});}
 async function hit(input){
  if(!dialog.open||tab!=='train'||!activeRound(round)||busy||now()<round.startedAt)return;
  const current=fitnessCueAt(round,now());if(current.index<0||round.attempts?.[current.index]||attempted.has(current.index))return;
  // Server arrival time decides the result; the client submits only the selected move.
  attempted.add(current.index);art.dataset.move=input;art.classList.remove('is-hit');void art.offsetWidth;art.classList.add('is-hit');
  await request('fitness-input',{roundId:round.id,input,cueIndex:current.index});
 }
 function selectStation(station){if(!station)return;if(activeRound(round)&&round.stationId!==station.id){setStatus('Finish or end your current set before changing stations.');return;}selected=station;drawnStation=null;render();}
 function renderCards(){
  const signature=stations.map(station=>station.id+':'+station.name).join('|');if(signature!==stationSignature){stationSignature=signature;cardNodes.clear();list.replaceChildren();renderCoaches();}text($('[data-station-count]'),stations.length+' training stations');
  for(const [index,station]of stations.entries()){
   let card=cardNodes.get(station.id);if(!card){card=document.createElement('button');card.type='button';card.className='fitness-station-card';card.innerHTML='<span class="fitness-station-number">'+String(index+1).padStart(2,'0')+'</span><span><strong>'+esc(station.name)+'</strong><small></small></span><b>↗</b>';card.onclick=()=>{selectStation(station);setTab('train');};list.append(card);cardNodes.set(station.id,card);}
   card.setAttribute('aria-pressed',String(selected?.id===station.id));card.disabled=activeRound(round)&&round.stationId!==station.id;const distance=stationDistance(station);text(card.querySelector('small'),Number.isFinite(distance)?distance<=(station.interactionDistance||4)?'READY TO TRAIN':Math.round(distance)+' m away':'Explore the gym');
  }
 }
 function drawStation(){
  if(!selected||drawnStation===selected.id)return;drawnStation=selected.id;const kind=kindOf(selected);
  text($('[data-title]'),selected.name);text($('[data-category]'),isStrength(kind)?'STRENGTH · CONTROL':/boxing/.test(kind)?'COMBAT · REACTION':/agility/.test(kind)?'SKILL · FOOTWORK':'CONDITIONING · RHYTHM');text($('[data-description]'),selected.description||instructions(selected));text($('[data-help]'),instructions(selected));
  const reward=FITNESS_GAMES[kind]?.rewardMzk; text($('[data-reward]'),reward?'UP TO '+reward+' MZK':'EARN MZK');
  const rules=FITNESS_GAMES[kind];if(rules){$('[data-session]').style.setProperty('--fitness-zone',String(2*rules.windowMs/rules.intervalMs*100)+'%');$('[data-session]').style.setProperty('--fitness-perfect',String(280/rules.intervalMs*100)+'%');}
  art.innerHTML=artwork(selected);art.dataset.kind=kind;inputs.replaceChildren();
  for(const input of moves(selected)){const button=document.createElement('button');button.type='button';button.dataset.fitnessInput=input;button.innerHTML='<span>'+esc(glyph[input]||'●')+'</span><strong>'+esc(label(input))+'</strong><small>'+esc(keyLabel(input))+'</small>';button.setAttribute('aria-label',label(input)+' · '+keyLabel(input));button.onpointerdown=event=>{event.preventDefault();button.focus({preventScroll:true});hit(input);};button.onclick=event=>{if(event.detail===0)hit(input);};inputs.append(button);}
  const strength=isStrength(kind)||/rowing|balance/.test(kind);text($('[data-coach-initial]'),strength?'L':'M');text($('[data-coach-name]'),strength?'Coach Leon · Strength & conditioning':'Coach Maya · Boxing & movement');text($('[data-coach-tip]'),strength?'“Don’t rush the rep. Stay controlled and meet the mint zone.”':'“Eyes up, find the beat, and commit to your next move.”');
 }
 function render(){
  if(disposed)return;renderCards();if(!dialog.open)return;drawStation();
  for(const button of dialog.querySelectorAll('[data-talk-coach]')){const trainer=FITNESS_TRAINERS.find(item=>item.id===button.dataset.talkCoach),gap=stationDistance(trainer);button.disabled=busy||gap>5;button.title=gap>5?'Walk '+Math.ceil(gap)+' m to '+trainer.name:'Talk to '+trainer.name;}
  if(self?.fitnessCoach&&tab==='coaches')setStatus(self.fitnessCoach.name+': '+self.fitnessCoach.message);
  const matching=round?.stationId===selected?.id?round:null,running=activeRound(matching),completed=matching?.status==='complete';
  dialog.classList.toggle('is-playing',!!running);dialog.setAttribute('aria-busy',String(busy));
  $('[data-start]').disabled=completed&&!matching.settled?busy:!canStart();$('[data-start]').hidden=!!running;$('[data-cancel]').hidden=!running;$('[data-cancel]').disabled=busy;
  if(!running)text($('[data-start]'),completed&&!matching.settled?'Save session & claim MZK':completed?'Train again ↗':'Start session ↗');
  text($('[data-distance]'),running?'Stay in your station':stationDistance(selected)<=(selected?.interactionDistance||4)?'YOU’RE AT THE STATION':Number.isFinite(stationDistance(selected))?'Walk '+Math.ceil(stationDistance(selected))+' m to this station':'Join the world to train');
  text($('[data-score]'),matching?.score||0);text($('[data-reps]'),(matching?.hits||0)+' / '+(matching?.cues?.length||12));text($('[data-combo]'),(matching?.combo||0)+'×');
  if(drawnRound!==matching?.id){drawnRound=matching?.id;dots.replaceChildren();for(let index=0;index<(matching?.cues?.length||12);index++){const dot=document.createElement('span');dot.dataset.cue=index;dots.append(dot);}}
  for(const dot of dots.children){const attempt=matching?.attempts?.[dot.dataset.cue];dot.className=attempt?attempt.hit?'is-clean':'is-miss':'';dot.setAttribute('aria-label','Rep '+(Number(dot.dataset.cue)+1)+(attempt?attempt.hit?' clean':' missed':' waiting'));}
  const result=$('[data-result]');result.hidden=!completed;
  if(completed){text($('[data-medal]'),String(matching.medal).toLowerCase()==='gold'?'✦':String(matching.medal).toLowerCase()==='silver'?'◇':'◆');text($('[data-result-title]'),(matching.medal?matching.medal.charAt(0).toUpperCase()+matching.medal.slice(1)+' set':'Set complete')+' · '+matching.score+' points');text($('[data-result-detail]'),matching.settled?'+'+(matching.payoutMzk||0)+' MZK saved · Best streak '+(matching.bestCombo||0):matching.message||'Confirming your MZK reward…');}
  for(const button of inputs.children){button.disabled=!running;button.setAttribute('aria-disabled',String(!running||busy));}
  if(!running){text($('[data-round-state]'),completed?'SESSION COMPLETE':matching?.status==='cancelled'?'SESSION ENDED':'OPEN SESSION');text($('[data-round-clock]'),'12 MOVES · '+Math.round(12*(FITNESS_GAMES[kindOf(selected)]?.intervalMs||1400)/1000)+' SEC');text($('[data-cue-small]'),completed?'KEEP BUILDING':matching?.status==='cancelled'?'TAKE A BREATHER':'READY WHEN YOU ARE');text($('[data-cue-label]'),completed?'Good work. Go again?':'Find your rhythm');text($('[data-cue-icon]'),glyph[moves(selected)[0]]||'↑');text($('[data-cue-key]'),keyLabel(moves(selected)[0]));$('[data-marker]').style.left='50%';}
  if(matching?.settled&&refreshedReward!==matching.id){refreshedReward=matching.id;window.MZKWallet?.refreshShared?.().catch(()=>{});}
  if(matching?.status!==lastRoundState){lastRoundState=matching?.status;if(completed){setStatus(matching.message||'Session complete. Your MZK reward is being confirmed.');announce(matching.message||'Fitness set complete.');}}
 }
 function animate(){
  raf=0;if(disposed||!dialog.open)return;
  const current=round?.stationId===selected?.id&&activeRound(round)?round:null;
  if(round?.status==='complete'&&!round.settled&&!busy&&finishFor!==round.id){finishFor=round.id;request('fitness-finish',{roundId:round.id});}
  if(current){
   const time=now(),cue=fitnessCueAt(current,time),countdown=Math.max(0,Math.ceil((current.startedAt-time)/1000)),done=time>=current.endsAt;
   text($('[data-round-state]'),countdown?'GET READY · '+countdown:done?'CONFIRMING SET':'LIVE SET · '+(cue.index+1)+' / '+current.cues.length);text($('[data-round-clock]'),Math.max(0,(current.endsAt-time)/1000).toFixed(1)+' SEC');
   if(cue.cue){
    text($('[data-cue-icon]'),glyph[cue.cue.input]||'●');text($('[data-cue-label]'),countdown?'Ready in '+countdown:cue.cue.label||label(cue.cue.input));text($('[data-cue-key]'),keyLabel(cue.cue.input));
    const attempt=current.attempts?.[cue.index],feedback=attempt?attempt.hit?attempt.score>=100?'PERFECT':attempt.score>=70?'CLEAN REP':'GOOD REP':'RESET. NEXT REP.':countdown?'SET YOUR FEET':cue.canHit?'NOW · '+label(cue.cue.input).toUpperCase():'FIND THE TIMING';
    text($('[data-cue-small]'),feedback);$('[data-session]').dataset.timing=attempt?attempt.hit?'hit':'miss':cue.canHit?'ready':'wait';
    const position=Math.max(2,Math.min(98,50+cue.offset/(current.intervalMs||1400)*100));$('[data-marker]').style.left=position+'%';
    for(const dot of dots.children){const index=Number(dot.dataset.cue);dot.classList.toggle('is-current',index===cue.index);if(!current.attempts?.[index]&&time>current.cues[index].at+current.windowMs)dot.classList.add('is-miss');}
    for(const button of inputs.children)button.classList.toggle('is-expected',button.dataset.fitnessInput===cue.cue.input&&!countdown);
    art.style.setProperty('--fitness-lift',String(Math.max(0,1-Math.abs(cue.offset)/650)));art.dataset.cue=cue.cue.input;
    const announcement=countdown?'Ready in '+countdown:cue.index+':'+cue.cue.input;if(announcement!==lastAnnouncement){lastAnnouncement=announcement;text($('[data-status]'),countdown?'Get ready. Your set starts in '+countdown+'.':(cue.index+1)+' of '+current.cues.length+' · '+(cue.cue.label||label(cue.cue.input)));}
   }
  }
  raf=requestAnimationFrame(animate);
 }
 function drawFloorplan(){
  const positions=[...stations,...FITNESS_TRAINERS].map(item=>item.position).filter(Boolean),minX=Math.min(-24,...positions.map(p=>p.x))-4,maxX=Math.max(24,...positions.map(p=>p.x))+4,minZ=Math.min(-18,...positions.map(p=>p.z))-4,maxZ=Math.max(18,...positions.map(p=>p.z))+4;
  const xy=p=>({x:30+(p.x-minX)/(maxX-minX)*420,y:30+(p.z-minZ)/(maxZ-minZ)*260});
  let svg='<svg viewBox="0 0 480 320" role="img" aria-label="Fitness centre floor plan"><defs><pattern id="fitness-map-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#667965" stroke-opacity=".13"/></pattern></defs><rect x="10" y="10" width="460" height="300" rx="12" fill="#0e1b1b" stroke="#64816c" stroke-width="2"/><rect x="12" y="12" width="456" height="296" rx="10" fill="url(#fitness-map-grid)"/><path d="M207 309h66" stroke="#c5e8b2" stroke-width="4"/><text x="240" y="296" fill="#7d9b85" font-size="9" text-anchor="middle" letter-spacing="2">RECEPTION / ENTRANCE</text>';
  for(const [index,station]of stations.entries()){const p=xy(station.position);svg+='<g class="fitness-map-station" data-map-station="'+esc(station.id)+'" role="button" tabindex="0" aria-label="'+esc(station.name)+'"><rect x="'+(p.x-33)+'" y="'+(p.y-25)+'" width="66" height="50" rx="7" fill="#23362c" stroke="#90ad84"/><text x="'+p.x+'" y="'+(p.y+1)+'" text-anchor="middle" fill="#d7eccd" font-size="18" font-weight="800">'+String(index+1).padStart(2,'0')+'</text><text x="'+p.x+'" y="'+(p.y+39)+'" text-anchor="middle" fill="#c2d1bd" font-size="9">'+esc(station.name.length>21?station.name.slice(0,19)+'…':station.name)+'</text></g>';}
  for(const trainer of FITNESS_TRAINERS){if(!trainer.position)continue;const p=xy(trainer.position);svg+='<text x="'+p.x+'" y="'+p.y+'" fill="#f49c7c" font-size="20" text-anchor="middle">★</text><text x="'+p.x+'" y="'+(p.y+12)+'" fill="#f1bb9f" font-size="8" text-anchor="middle">'+esc(trainer.name||'Coach')+'</text>';}
  if(self?.position){const p=xy(self.position);svg+='<circle cx="'+p.x+'" cy="'+p.y+'" r="10" fill="#d8f7b7" fill-opacity=".15"/><circle cx="'+p.x+'" cy="'+p.y+'" r="4.5" fill="#d8f7b7" stroke="#16221c" stroke-width="2"/>';}
  $('[data-floorplan]').innerHTML=svg+'</svg>';
  for(const node of $('[data-floorplan]').querySelectorAll('[data-map-station]')){const action=()=>{selectStation(stations.find(item=>item.id===node.dataset.mapStation));setTab('train');};node.addEventListener('click',action);node.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();action();}});}
 }
 function renderCoaches(){
  $('[data-coaches]').innerHTML=FITNESS_TRAINERS.map((trainer,index)=>{
   const movement=trainer.specialties?.includes('boxing');
   return '<article class="fitness-coach-card"><div class="fitness-coach-portrait '+(movement?'is-kai':'')+'" aria-hidden="true"><svg viewBox="0 0 120 125"><circle cx="60" cy="50" r="24" fill="'+(movement?'#d6a17d':'#865b46')+'"/><path d="M35 45q-1-29 25-29t25 29l-10-13-27 6-13 8" fill="#28342b"/><path d="M19 125V99q0-29 41-30t41 30v26" fill="'+(movement?'#e79979':'#b7d8a4')+'"/><path d="m43 73 17 24 17-24" fill="#253c30"/><path d="M32 125V96m56 29V96" stroke="#48654c" stroke-width="2"/><path d="M51 53h3m12 0h3m-16 11q7 5 14 0" fill="none" stroke="#583e30" stroke-width="2" stroke-linecap="round"/></svg><span>'+String(index+1).padStart(2,'0')+'</span></div><div><small>'+esc(trainer.role.toUpperCase())+'</small><h4>Coach '+esc(trainer.name)+'</h4><p>'+esc(trainer.greeting)+'</p><div class="fitness-coach-tags">'+trainer.specialties.map(kind=>'<span>'+esc(kind.replaceAll('-',' '))+'</span>').join('')+'</div><div class="fitness-coach-actions"><button type="button" data-coach-station="'+esc(stations.find(item=>trainer.specialties.includes(item.kind))?.id)+'">Try a coached set →</button><button type="button" data-talk-coach="'+esc(trainer.id)+'">Talk on the gym floor</button></div></div></article>';
  }).join('');
  for(const button of $('[data-coaches]').querySelectorAll('[data-coach-station]'))button.onclick=()=>{selectStation(stations.find(item=>item.id===button.dataset.coachStation));setTab('train');};
  for(const button of $('[data-coaches]').querySelectorAll('[data-talk-coach]'))button.onclick=()=>request('fitness-trainer',{trainerId:button.dataset.talkCoach});
 }

 trigger.onclick=()=>open();prompt.onclick=()=>open(nearby?.id);$('[data-close]').onclick=close;$('[data-walk]').onclick=close;$('[data-start]').onclick=start;$('[data-cancel]').onclick=cancel;
 for(const button of dialog.querySelectorAll('[data-tab]'))button.onclick=()=>setTab(button.dataset.tab);
 for(const type of ['pointerdown','pointerup','click','wheel'])dialog.addEventListener(type,event=>event.stopPropagation());
 const handleKey=event=>{
  if(!dialog.open)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
  if(!activeRound(round)||tab!=='train'||event.repeat||event.target.closest?.('input,select,textarea'))return;
  const input=fitnessKeyboardInput(event.key,selected);if(input){event.preventDefault();event.stopImmediatePropagation();hit(input);}
 };
 document.addEventListener('keydown',handleKey,true);
 dialog.addEventListener('keydown',event=>event.stopPropagation());

 dialog.addEventListener('close',()=>{if(!dialog.open)finishClose();});
 renderCoaches();renderCards();
 const viewFlow=stage.querySelector('.game-display-flow-views');if(viewFlow)viewFlow.append(trigger);
 return {open,close,near:()=>nearby,visible:()=>dialog.open,refreshPosition(position){if(self&&position)self={...self,position:{x:position.x,y:position.y,z:position.z}};nearby=nearestFitnessStation(environment,self?.position,Infinity,stations);},
  update(next,id,env,timing={}){
   if(disposed)return;const nextSelf=next?.players?.[id]||null,worldId=value=>typeof value==='string'?value:value?.id,changed=worldId(environment)!==worldId(env)||selfId!==id;
   if(changed||!next||!nextSelf){contextRevision++;busy=false;pendingCancel=false;close({restoreFocus:false,cancelRound:false});round=null;finishFor=null;drawnStation=null;drawnRound=null;attempted.clear();lastAnnouncement='';lastRoundState=null;refreshedReward=null;serverAt=0;}
   snapshot=next;selfId=id;environment=env;self=nextSelf;round=self?.fitness||null;stations=next?.fitness?.stations||(typeof env==='string'?FITNESS_STATIONS:fitnessStations(env));selected=stations.find(station=>station.id===selected?.id)||stations.find(station=>station.id===round?.stationId)||stations[0]||null;syncClock(next?.serverTime,timing);
   const enabled=typeof env==='string'?env===FITNESS_ID:isFitnessEnvironment(env);trigger.hidden=!enabled;nearby=enabled?nearestFitnessStation(env,self?.position,Infinity,stations):null;prompt.hidden=!nearby||dialog.open;
   if(nearby)prompt.innerHTML='<span class="fitness-nearby-key">E</span><span><small>TRAINING STATION</small><strong>'+esc(nearby.name)+'</strong></span><b>↗</b>';
   if(!enabled){if(dialog.open)close();return;}if(!stations.length){if(dialog.open)close();trigger.disabled=true;trigger.title='Add fitness equipment in Builder to train';return;}trigger.disabled=!self;trigger.title=self?'Open fitness centre training menu':'Join the gym before opening training controls';if(activeRound(round)&&selected?.id!==round.stationId)selected=stations.find(item=>item.id===round.stationId)||selected;render();if(tab==='map'&&dialog.open)drawFloorplan();
  },dispose(){if(disposed)return;disposed=true;contextRevision++;document.removeEventListener('keydown',handleKey,true);close({restoreFocus:false,cancelRound:false});dialog.remove();trigger.remove();prompt.remove();}
 };
}
