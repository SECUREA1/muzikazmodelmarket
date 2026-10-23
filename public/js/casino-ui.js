import {fullscreenPanel} from './fullscreen-panels.js';
import {gameplayOverlayOpen,loadGameMenuStyles} from './game-menu-controls.js';
import {CASINO_ID,CASINO_STATIONS} from './casino-config.js';

const GAME_NAMES={poker:'Five-card draw poker',blackjack:'Blackjack',roulette:'Roulette',slots:'Starlight slots',dice:'Hosted dice'};
const SYMBOLS=['🍒','◆','7','♠','★','♛'];
const money=value=>Number(value||0).toLocaleString()+' MZK';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const isGame=kind=>Object.hasOwn(GAME_NAMES,kind);
const authenticationError=error=>[401,403].includes(error?.status)||[401,403].includes(error?.statusCode)||/CSRF|UNAUTHENTICATED|SESSION_EXPIRED/i.test(String(error?.code||''));
export function nearestCasinoStation(environment,position){
 if((typeof environment==='string'?environment:environment?.id)!==CASINO_ID||!position||Number(position.y)>5)return null;
 let nearest=null,distance=6.5;
 for(const station of CASINO_STATIONS){const gap=Math.hypot(position.x-station.position.x,position.z-station.position.z);if(gap<distance){distance=gap;nearest=station;}}
 return nearest;
}
function cardFace(card,index,{hold=false,selected=false}={}){
 if(card===null||card===undefined)return '<span class="casino-card is-back" aria-label="Dealer card face down">M</span>';
 const suit=['♠','♥','♣','♦'][Math.floor(card/13)],rank=['2','3','4','5','6','7','8','9','10','J','Q','K','A'][card%13],face='<b>'+rank+'</b><span>'+suit+'</span>';
 return hold?'<button type="button" class="casino-card'+(suit==='♥'||suit==='♦'?' is-red':'')+(selected?' is-held':'')+'" data-hold="'+index+'" aria-pressed="'+selected+'" aria-label="'+rank+' '+suit+(selected?', held':', hold card')+'">'+face+'<small>'+(selected?'HELD':'HOLD')+'</small></button>':'<span class="casino-card'+(suit==='♥'||suit==='♦'?' is-red':'')+'" aria-label="'+rank+' '+suit+'">'+face+'</span>';
}

export function mountCasinoUI({stage,getEnvironment,getPosition,request,announce=()=>{},onOpen=()=>{},onBalance=()=>{},onOutcome=()=>{},onConversations=()=>{}}){
 loadGameMenuStyles();
 if(!document.querySelector('#casino-ui-styles')){const link=document.createElement('link');link.id='casino-ui-styles';link.rel='stylesheet';link.href='/public/css/casino.css';document.head.append(link);}
 const trigger=document.createElement('button');trigger.type='button';trigger.className='casino-use';trigger.hidden=true;trigger.setAttribute('aria-controls','muzikaz-casino-panel');stage.append(trigger);
 const panel=document.createElement('section');panel.id='muzikaz-casino-panel';panel.className='casino-panel';panel.hidden=true;panel.setAttribute('aria-label','MUZIKAZ Casino');
 panel.innerHTML='<div class="casino-panel__top"><div><span class="casino-eyebrow">STARLIGHT GRAND · MUZIKAZ CASINO</span><h3 data-casino-title></h3><p data-casino-subtitle></p></div><div class="casino-balance"><small>WALLET BALANCE</small><strong data-casino-balance>— MZK</strong></div></div><div data-casino-content></div><p class="casino-message" data-casino-message role="status" aria-live="polite"></p><div class="casino-panel__footer"><span>All bets and winnings settle in MZK.</span><button type="button" data-casino-people>Meet staff &amp; find a favor</button><button type="button" data-casino-close>Return to walking</button></div>';
 stage.append(panel);
 let nearby=null,current=null,state=null,pending=false,loading=false,disposed=false,holds=new Set(),bet=5,selection='red',rounds={},message='',failedCommand=null,loadToken=0;
 const $=selector=>panel.querySelector(selector),content=$('[data-casino-content]');
 const screen=fullscreenPanel(panel,{onOpen:()=>{document.exitPointerLock?.();onOpen();},onClose:()=>{current=null;holds.clear();trigger.setAttribute('aria-expanded','false');}});
 screen.dialog.classList.add('casino-dialog');
 async function api(path,options={}){
  const run=request||window.MUZIKAZ_API?.fetch?.bind(window.MUZIKAZ_API)||window.fetch.bind(window),result=await run(path,{credentials:'include',cache:'no-store',retries:0,...options,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  if(typeof result?.json==='function'){const payload=await result.json();if(!result.ok||payload.success===false)throw Object.assign(new Error(payload.message||'The casino could not complete that request.'),{status:result.status,code:payload.code});return payload.data;}
  if(result?.success===false)throw Object.assign(new Error(result.message||'The casino could not complete that request.'),{status:result.status,code:result.code});
  return result?.success===true&&Object.hasOwn(result,'data')?result.data:result;
 }
 async function refresh(){
  const token=++loadToken;loading=true;render();
  try{const next=await api('/api/casino/state');if(disposed||token!==loadToken)return;state=next;for(const kind of Object.keys(GAME_NAMES)){const round=next.activeRounds?.[kind]||next.history?.find(item=>item.game===kind);if(round)rounds[kind]=round;else delete rounds[kind];}onBalance(next.balance);message='';}
  catch(error){if(!disposed&&token===loadToken){if(authenticationError(error))clearAccount();message=error.message;}}
  finally{if(!disposed&&token===loadToken){loading=false;render();}}
 }
 function setBalance(balance){if(Number.isFinite(balance)){state={...state,balance};onBalance(balance);window.MZKWallet?.refreshShared?.().catch(()=>{});}}
 function clearAccount(){state=null;rounds={};holds.clear();failedCommand=null;}
 function title(){return GAME_NAMES[current?.kind]||current?.name||'Welcome to Starlight Grand';}
 function render(){
  if(!current||disposed)return;
  const kind=current.kind,round=rounds[kind],active=round?.phase==='playing',game=state?.games?.find(item=>item.id===kind);
  $('[data-casino-title]').textContent=title();$('[data-casino-subtitle]').textContent=isGame(kind)?'Take your seat. Your dealer is ready.':kind==='vault'?'BANK VAULT · AUTHORIZED STAFF ONLY':'Welcome to the casino floor.';
  $('[data-casino-balance]').textContent=state?money(state.balance):'— MZK';
  panel.classList.toggle('is-busy',pending);panel.setAttribute('aria-busy',String(pending||loading));
  let html='';
  if(isGame(kind)){
   html='<div class="casino-table" data-game="'+kind+'">';
   if(kind==='blackjack'||kind==='poker'){
    if(kind==='blackjack')html+='<p class="casino-table-label">DEALER'+(round?.dealerTotal!==null&&round?.dealerTotal!==undefined?' · '+escape(round.dealerTotal):'')+'</p><div class="casino-cards">'+(round?.dealerHand?.length?round.dealerHand:[null,null]).map((card,index)=>cardFace(card,index)).join('')+'</div>';
    else html+='<p class="casino-table-label">DRAW POKER · JACKS OR BETTER</p>';
    html+='<p class="casino-table-label">YOUR HAND'+(kind==='blackjack'&&round?.playerTotal!==undefined?' · '+escape(round.playerTotal):'')+(kind==='poker'&&active?' · SELECT CARDS TO HOLD':'')+'</p><div class="casino-cards">'+(round?.hand?.length?round.hand:[null,null,null,null,null].slice(0,kind==='blackjack'?2:5)).map((card,index)=>cardFace(card,index,{hold:kind==='poker'&&active,selected:holds.has(index)})).join('')+'</div>';
   }else if(kind==='slots')html+='<p class="casino-table-label">STARLIGHT TRIPLE REELS</p><div class="casino-reels" aria-label="Slot reels">'+(round?.reels||[2,2,2]).map(reel=>'<span>'+SYMBOLS[reel%SYMBOLS.length]+'</span>').join('')+'</div><p>Match three symbols to win. Two matching symbols return your stake.</p>';
   else if(kind==='roulette')html+='<div class="casino-wheel" aria-hidden="true"><div class="casino-wheel__rotor"></div><span class="casino-wheel__number '+escape(round?.color||'')+'">'+(round?.number===undefined?'◈':escape(round.number))+'</span></div><p class="casino-table-label">EUROPEAN ROULETTE · SINGLE ZERO</p>';
   else html+='<p class="casino-table-label">HOSTED HIGH / LOW DICE</p><div class="casino-dice" aria-label="Dice">'+(round?.dice||[1,6]).map(value=>'<span>'+['','⚀','⚁','⚂','⚃','⚄','⚅'][value]+'</span>').join('')+'</div><p>Low: 2–6 · Seven: 7 · High: 8–12</p>';
   if(round?.phase==='complete')html+='<div class="casino-result"><strong>'+escape(round.outcome||'Round complete')+'</strong><span>Bet '+money(round.betMzk)+' · Returned '+money(round.payoutMzk)+'</span></div>';
   html+='</div><form class="casino-bet-form" data-bet-form><label>Bet in MZK<input type="number" inputmode="numeric" data-bet min="'+(game?.minBetMzk||1)+'" max="'+(game?.maxBetMzk||100)+'" step="1" value="'+bet+'" '+(active?'disabled':'')+' required></label>';
   if(kind==='roulette')html+='<label>Place your bet<select data-selection>'+[['red','Red · 2×'],['black','Black · 2×'],['odd','Odd · 2×'],['even','Even · 2×'],...Array.from({length:37},(_,index)=>[String(index),index+' · 36×'])].map(([value,name])=>'<option value="'+value+'"'+(String(selection)===value?' selected':'')+'>'+name+'</option>').join('')+'</select></label>';
   if(kind==='dice')html+='<label>Call the roll<select data-selection>'+[['low','Low · 2×'],['seven','Seven · 5×'],['high','High · 2×']].map(([value,name])=>'<option value="'+value+'"'+(selection===value?' selected':'')+'>'+name+'</option>').join('')+'</select></label>';
   html+='<div class="casino-bet-actions">'+(active?kind==='blackjack'?'<button type="button" data-command="hit">Hit</button><button type="button" data-command="stand">Stand</button>':'<button type="button" data-command="draw">Draw cards</button>':'<button type="submit" data-wager>'+(kind==='slots'?'Spin reels':kind==='roulette'?'Spin wheel':kind==='dice'?'Roll dice':'Deal cards')+' · '+money(bet)+'</button>')+'</div></form>';
   if(active)html+='<p class="casino-note">Your open hand is saved. You can return to this table to finish it.</p>';
   html+='<details class="casino-rules"><summary>Rules &amp; payouts</summary><p>'+escape(game?.rules||'Choose a whole-number bet from 1 to 100 MZK. Your bet is deducted once when the round begins. A payout includes your returned stake.')+'</p><p>'+escape(typeof game?.payouts==='string'?game.payouts:game?.payouts?JSON.stringify(game.payouts):'Payouts include the stake. The server deals, rolls and settles every round.')+'</p></details>';
  }else if(kind==='vendor'){
   html='<div class="casino-services">'+(state?.vendors||[]).map(item=>'<article><span class="casino-service-icon">'+(item.id.includes('coffee')?'☕':item.id.includes('water')?'◉':'♨')+'</span><div><h4>'+escape(item.name)+'</h4><p>'+escape(item.description||'Freshly served at the casino bar.')+'</p><small>Served now · '+escape(item.effect?.stat||'refreshment')+' +'+escape(item.effect?.amount||0)+'</small></div><button type="button" data-vendor="'+escape(item.id)+'">'+money(item.priceMzk)+'</button></article>').join('')+'</div>';
  }else if(kind==='cashier'||kind==='atm'){
   html='<div class="casino-service-card"><span class="casino-service-icon">'+(kind==='atm'?'▣':'◈')+'</span><h4>Your MZK wallet is ready at every table.</h4><p>The casino uses your existing MZK balance directly. Winnings return to the same wallet after each completed round.</p><button type="button" data-refresh>Refresh wallet balance</button></div><div class="casino-history"><h4>Recent casino activity</h4>'+(state?.history?.length?state.history.slice(0,8).map(item=>'<p><span>'+escape(GAME_NAMES[item.game]||item.game)+' · '+escape(item.outcome||item.phase)+'</span><strong>'+money(item.payoutMzk)+' returned</strong></p>').join(''):'<p>Your completed rounds will appear here.</p>')+'</div>';
  }else if(kind==='vault'){
   html='<div class="casino-service-card"><span class="casino-service-icon">▣</span><h4>Vault secured</h4><p>The reinforced safe door is locked. The casino reserves this bank vault for authorized staff. Both security guards can help with questions on the public floor.</p><p class="casino-note">Security system online · Access restricted</p></div>';
  }else{
   html='<div class="casino-welcome"><p>Welcome to Starlight Grand. Walk the wide central promenade and choose a table or machine. Press <kbd>E</kbd> or tap <b>Use</b> when you are nearby.</p><div class="casino-directory"><article><b>WEST WING</b><span>Five-card draw poker<br>Roulette<br>Slot machines</span></article><article><b>EAST WING</b><span>Blackjack<br>Hosted high / low dice<br>Slot machines</span></article><article><b>LOBBY</b><span>Refreshment bar<br>Cashier &amp; ATM<br>Hosts &amp; security</span></article></div><p>Your MZK wallet funds bets and refreshments. Watch the dealers and guests, talk with residents, or explore the lounge. The vault at the back is locked.</p></div>';
  }
  content.innerHTML=html;
  for(const button of content.querySelectorAll('button'))button.disabled=pending||loading||(!state&&isGame(kind));
  for(const control of content.querySelectorAll('input,select'))if(pending||loading)control.disabled=true;
  $('[data-casino-message]').textContent=loading?'Loading your MZK wallet…':pending?'Dealer is resolving your action…':message;
  content.querySelector('[data-bet-form]')?.addEventListener('submit',event=>{event.preventDefault();command('bet');});
  content.querySelector('[data-bet]')?.addEventListener('input',event=>{bet=Number(event.target.value);const button=content.querySelector('[data-wager]');if(button)button.textContent=(kind==='slots'?'Spin reels':kind==='roulette'?'Spin wheel':kind==='dice'?'Roll dice':'Deal cards')+' · '+money(bet);});
  content.querySelector('[data-selection]')?.addEventListener('change',event=>{selection=event.target.value;});
  content.querySelectorAll('[data-hold]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.hold);holds.has(index)?holds.delete(index):holds.add(index);button.setAttribute('aria-pressed',String(holds.has(index)));button.classList.toggle('is-held',holds.has(index));button.querySelector('small').textContent=holds.has(index)?'HELD':'HOLD';});
  content.querySelectorAll('[data-command]').forEach(button=>button.onclick=()=>command(button.dataset.command));
  content.querySelectorAll('[data-vendor]').forEach(button=>button.onclick=()=>purchase(button.dataset.vendor));
  content.querySelector('[data-refresh]')?.addEventListener('click',refresh);
 }
 async function mutate(path,body){
  const signature=JSON.stringify({path,body}),retry=failedCommand?.signature===signature?failedCommand:null;
  const payload=retry?.payload||{...body,requestId:crypto.randomUUID()};failedCommand={signature,payload};
  const session=await api('/api/market/session');
  const result=await api(path,{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify(payload)});failedCommand=null;return result;
 }
 async function command(operation){
  if(pending||!current||!isGame(current.kind))return;
  const station=current,game=current.kind,round=rounds[game],body={game,operation};
  if(operation==='bet'){
   if(!Number.isInteger(bet)||bet<1||bet>100){message='Choose a whole-number bet from 1 to 100 MZK.';render();return;}
   Object.assign(body,{betMzk:bet,selection:game==='roulette'&&/^\d+$/.test(String(selection))?Number(selection):selection});
  }else{if(!round)return;Object.assign(body,{roundId:round.id,revision:round.revision});if(operation==='draw')body.holds=[...holds].sort((a,b)=>a-b);}
  pending=true;message='';render();
  try{const result=await mutate('/api/casino/play',body);if(disposed)return;rounds[game]=result.round;setBalance(result.balance);onOutcome(station,result);holds.clear();message=result.message||'Round updated.';if(result.round?.phase==='complete')announce(message);}
  catch(error){if(!disposed){if(authenticationError(error))clearAccount();message=error.message;announce(message);}}
  finally{if(!disposed){pending=false;render();}}
 }
 async function purchase(itemId){
  if(pending)return;pending=true;message='';render();
  try{const result=await mutate('/api/casino/vendor',{itemId});if(disposed)return;setBalance(result.balance);message=result.message||'Your refreshment is served.';announce(message);}
  catch(error){if(!disposed){if(authenticationError(error))clearAccount();message=error.message;}}
  finally{if(!disposed){pending=false;render();}}
 }
 function close(){screen.close();}
 function open(){
  update();if(!nearby||gameplayOverlayOpen()||pending)return false;
  current=nearby;holds.clear();selection=current.kind==='dice'?'low':'red';message='';panel.setAttribute('aria-label','Starlight Grand · '+title());render();screen.open();trigger.setAttribute('aria-expanded','true');void refresh();return true;
 }
 function update(){
  if(disposed)return;nearby=nearestCasinoStation(getEnvironment(),getPosition());
  const visible=Boolean(nearby)&&!screen.dialog.open&&!gameplayOverlayOpen();trigger.hidden=!visible;
  if(nearby){const label=(isGame(nearby.kind)?'Play ':nearby.kind==='vault'?'Inspect ':'Use ')+(GAME_NAMES[nearby.kind]||nearby.name);if(trigger.dataset.station!==nearby.id){trigger.dataset.station=nearby.id;trigger.innerHTML='<span class="casino-use__key">E</span><span><small>STARLIGHT GRAND</small>'+escape(label)+'</span>';trigger.setAttribute('aria-label',label);}}
  if(current){const pos=getPosition(),env=getEnvironment();if((typeof env==='string'?env:env?.id)!==CASINO_ID||Math.hypot(pos.x-current.position.x,pos.z-current.position.z)>8)close();}
 }
 trigger.onclick=open;$('[data-casino-close]').onclick=close;$('[data-casino-people]').onclick=()=>{const station=current;close();onConversations(station);};
 for(const type of ['pointerdown','click','wheel'])panel.addEventListener(type,event=>event.stopPropagation());
 return {update,open,available(){update();return Boolean(nearby)&&!screen.dialog.open&&!gameplayOverlayOpen()&&!pending;},reset(){loadToken++;loading=false;close();nearby=null;trigger.hidden=true;},dispose(){if(disposed)return;disposed=true;loadToken++;screen.close();screen.disconnect();screen.dialog.remove();trigger.remove();}};
}
