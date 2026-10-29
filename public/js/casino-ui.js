import {fullscreenPanel} from './fullscreen-panels.js';
import {gameplayOverlayOpen,loadGameMenuStyles} from './game-menu-controls.js';
import {CASINO_ID,CASINO_STATIONS,CASINO_ROOMS} from './casino-config.js';

const GAME_NAMES={poker:'Five-card draw poker',blackjack:'Blackjack',roulette:'Roulette',slots:'Starlight slots',dice:'Hosted dice',baccarat:'Baccarat',threecard:'Three-card poker'};
const SYMBOLS=['🍒','◆','7','♠','★','♛'];
const money=value=>Number(value||0).toLocaleString()+' MZK';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const isGame=kind=>Object.hasOwn(GAME_NAMES,kind);
const authenticationError=error=>[401,403].includes(error?.status)||[401,403].includes(error?.statusCode)||/CSRF|UNAUTHENTICATED|SESSION_EXPIRED/i.test(String(error?.code||''));
const friendly=value=>String(value||'').replaceAll('-',' ').replaceAll('_',' ').replace(/\b\w/g,char=>char.toUpperCase());
const actionLabel=kind=>kind==='slots'?'Spin reels':kind==='roulette'?'Spin wheel':kind==='dice'?'Roll dice':kind==='baccarat'?'Deal baccarat':kind==='threecard'?'Place ante & deal':'Deal cards';
export function casinoStationLimits(station,game,round){
 const source=round?.phase==='playing'&&round.limits?round.limits:station||{};
 return {tier:source.tier||station?.tier||'standard',minBetMzk:Number(source.minBetMzk??game?.minBetMzk??1),maxBetMzk:Number(source.maxBetMzk??game?.maxBetMzk??100),betStepMzk:Number(source.betStepMzk??game?.betStepMzk??1)};
}
export const casinoRoundMatchesStation=(round,station)=>Boolean(round)&&(!round.stationId||round.stationId===station?.id);
const tierLabel=tier=>/vip|high/i.test(tier)?'VIP · High-limit table':/premier|salon/i.test(tier)?'Royal Card Room · Premier salon':'Main-floor table';
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
function cardsMarkup(cards,options={}){return '<div class="casino-cards">'+cards.map((card,index)=>cardFace(card,index,{...options,selected:options.holds?.has(index)||false})).join('')+'</div>';}
function resultMarkup(round,receipt){
 if(round?.phase!=='complete')return '';
 const total=round.totalStakeMzk??round.betMzk;
 let html='<div class="casino-result"><strong>'+escape(round.outcome||'Round complete')+'</strong><span>Total staked '+money(total)+' · Returned '+money(round.payoutMzk)+'</span>';
 if(Number.isFinite(receipt?.netMzk))html+='<span class="casino-result__net">Net '+(receipt.netMzk>0?'+':'')+money(receipt.netMzk)+'</span>';
 if(round.game==='baccarat'&&Number(round.commissionMzk)>0)html+='<span class="casino-result__commission">Banker commission withheld: '+money(round.commissionMzk)+' · whole-MZK rounding applied</span>';
 if(round.game==='threecard')html+='<dl class="casino-settlement"><div><dt>Ante returned</dt><dd>'+money(round.anteReturnMzk)+'</dd></div><div><dt>Play returned</dt><dd>'+money(round.playReturnMzk)+'</dd></div><div><dt>Ante bonus</dt><dd>'+money(round.anteBonusMzk)+'</dd></div></dl>';
 return html+'</div>';
}
function tableMarkup(kind,round,active,holds,receipt){
 let html='<div class="casino-table" data-game="'+kind+'">';
 if(kind==='baccarat'){
  html+='<p class="casino-table-label">BACCARAT · AUTOMATIC DRAWING RULES</p><div class="casino-baccarat-hands">';
  for(const [label,cards,total]of [['Player',round?.hand,round?.playerTotal],['Banker',round?.dealerHand,round?.dealerTotal]])html+='<section class="casino-hand-lane"><h4>'+label+(total!==undefined&&total!==null?' <span>'+escape(total)+'</span>':'')+'</h4>'+cardsMarkup(cards?.length?cards:[null,null])+'</section>';
  html+='</div>'+(round?.winner?'<span class="casino-hand-badge">'+(round.winner==='tie'?'Tie':escape(friendly(round.winner))+' wins')+'</span>':'')+(round?.natural?'<span class="casino-hand-badge">Natural</span>':'')+'<p class="casino-note">Choose Player, Banker or Tie. Both hands finish automatically.</p>';
 }else if(['blackjack','poker','threecard'].includes(kind)){
  if(kind==='blackjack'||kind==='threecard'){
   const hidden=kind==='threecard'&&active,dealer=hidden?[null,null,null]:round?.dealerHand?.length?round.dealerHand:Array(kind==='threecard'?3:2).fill(null);
   html+='<p class="casino-table-label">DEALER'+(kind==='blackjack'&&round?.dealerTotal!==null&&round?.dealerTotal!==undefined?' · '+escape(round.dealerTotal):'')+'</p>'+cardsMarkup(dealer);
   if(kind==='threecard'&&round?.phase==='complete')html+='<p class="casino-hand-rank">'+escape(round.dealerRank?.label||'Dealer hand')+(typeof round.dealerQualified==='boolean'?' · '+(round.dealerQualified?'Dealer qualifies':'Dealer does not qualify'):'')+'</p>';
  }else html+='<p class="casino-table-label">DRAW POKER · JACKS OR BETTER</p>';
  html+='<p class="casino-table-label">YOUR HAND'+(kind==='blackjack'&&round?.playerTotal!==undefined?' · '+escape(round.playerTotal):'')+(kind==='poker'&&active?' · SELECT CARDS TO HOLD':'')+'</p>'+cardsMarkup(round?.hand?.length?round.hand:Array(kind==='blackjack'?2:kind==='threecard'?3:5).fill(null),{hold:kind==='poker'&&active,holds});
  if(kind==='threecard'&&round?.handRank)html+='<p class="casino-hand-rank">'+escape(round.handRank.label)+'</p>';
 }else if(kind==='slots')html+='<p class="casino-table-label">STARLIGHT TRIPLE REELS</p><div class="casino-reels" aria-label="Slot reels">'+(round?.reels||[2,2,2]).map(reel=>'<span>'+SYMBOLS[reel%SYMBOLS.length]+'</span>').join('')+'</div><p>Match three symbols to win. Two matching symbols return your stake.</p>';
 else if(kind==='roulette')html+='<div class="casino-wheel" aria-hidden="true"><div class="casino-wheel__rotor"></div><span class="casino-wheel__number '+escape(round?.color||'')+'">'+(round?.number===undefined?'◈':escape(round.number))+'</span></div><p class="casino-table-label">EUROPEAN ROULETTE · SINGLE ZERO</p>';
 else html+='<p class="casino-table-label">HOSTED HIGH / LOW DICE</p><div class="casino-dice" aria-label="Dice">'+(round?.dice||[1,6]).map(value=>'<span>'+['','⚀','⚁','⚂','⚃','⚄','⚅'][value]+'</span>').join('')+'</div><p>Low: 2–6 · Seven: 7 · High: 8–12</p>';
 return html+resultMarkup(round,receipt)+'</div>';
}

export function mountCasinoUI({stage,getEnvironment,getPosition,request,announce=()=>{},onOpen=()=>{},onBalance=()=>{},onOutcome=()=>{},onConversations=()=>{}}){
 loadGameMenuStyles();
 if(!document.querySelector('#casino-ui-styles')){const link=document.createElement('link');link.id='casino-ui-styles';link.rel='stylesheet';link.href='/public/css/casino.css';document.head.append(link);}
 const trigger=document.createElement('button');trigger.type='button';trigger.className='casino-use game-nearby-prompt';trigger.hidden=true;trigger.setAttribute('aria-controls','muzikaz-casino-panel');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');stage.append(trigger);
 const panel=document.createElement('section');panel.id='muzikaz-casino-panel';panel.className='casino-panel';panel.hidden=true;panel.setAttribute('aria-label','MUZIKAZ Casino');
 panel.innerHTML='<div class="casino-panel__top"><div><span class="casino-eyebrow">STARLIGHT GRAND · MUZIKAZ CASINO</span><h3 data-casino-title></h3><p data-casino-subtitle></p></div><div class="casino-balance"><small>WALLET BALANCE</small><strong data-casino-balance>— MZK</strong></div></div><div data-casino-content></div><p class="casino-message" data-casino-message role="status" aria-live="polite"></p><div class="casino-panel__footer"><span>All bets and winnings settle in MZK.</span><button type="button" data-casino-people>Meet staff &amp; find a favor</button><button type="button" data-casino-close>Return to walking</button></div>';
 stage.append(panel);
 let nearby=null,current=null,state=null,pending=false,loading=false,disposed=false,holds=new Set(),bet=5,selection='red',rounds={},message='',failedCommand=null,loadToken=0,commandGeneration=0,lastReceipt=null;const stationBets=new Map();
 const currentCommand=generation=>!disposed&&generation===commandGeneration;
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
  if(disposed)return;
  const token=++loadToken;loading=true;render();
  try{const next=await api('/api/casino/state');if(disposed||token!==loadToken)return;state=next;for(const kind of Object.keys(GAME_NAMES)){const round=next.activeRounds?.[kind]||next.history?.find(item=>item.game===kind);if(round)rounds[kind]=round;else delete rounds[kind];}if(failedCommand?.path==='/api/casino/play'){const observed=[...Object.values(next.activeRounds||{}),...(next.history||[])],body=failedCommand.body,settled=observed.some(round=>round.game===body.game&&casinoRoundMatchesStation(round,{id:body.stationId})&&(body.operation==='bet'?!failedCommand.knownRoundIds.includes(round.id):round.id===body.roundId&&round.revision>body.revision));if(settled)failedCommand=null;}syncBetToStation();onBalance(next.balance);message='';}
  catch(error){if(!disposed&&token===loadToken){if(authenticationError(error))clearAccount();message=error.message;}}
  finally{if(!disposed&&token===loadToken){loading=false;render();}}
 }
 function setBalance(balance){if(Number.isFinite(balance)){state={...state,balance};onBalance(balance);window.MZKWallet?.refreshShared?.().catch(()=>{});}}
 function clearAccount(){state=null;rounds={};holds.clear();failedCommand=null;lastReceipt=null;}
 function stationRound(){const round=rounds[current?.kind];if(casinoRoundMatchesStation(round,current))return round;return state?.history?.find(item=>item.game===current?.kind&&casinoRoundMatchesStation(item,current));}
 function syncBetToStation(){if(!current||!isGame(current.kind))return;const game=state?.games?.find(item=>item.id===current.kind),round=stationRound(),limits=casinoStationLimits(current,game,round);if(round?.phase==='playing')bet=round.betMzk;else if(!Number.isSafeInteger(bet)||bet<limits.minBetMzk||bet>limits.maxBetMzk||(bet-limits.minBetMzk)%limits.betStepMzk!==0)bet=limits.minBetMzk;}
 function title(){return GAME_NAMES[current?.kind]||current?.name||'Welcome to Starlight Grand';}
 function render(){
  if(!current||disposed)return;
  const kind=current.kind,round=stationRound(),active=round?.phase==='playing',game=state?.games?.find(item=>item.id===kind),limits=casinoStationLimits(current,game,round),foreign=rounds[kind]?.phase==='playing'&&!casinoRoundMatchesStation(rounds[kind],current)?rounds[kind]:null,receipt=lastReceipt&&lastReceipt.roundId===round?.id?lastReceipt.receipt:null;
  const room=CASINO_ROOMS.find(item=>item.id===current.roomId);$('[data-casino-title]').textContent=title();$('[data-casino-subtitle]').textContent=isGame(kind)?current.name+' · '+(room?.name||tierLabel(limits.tier)):kind==='vault'?'BANK VAULT · AUTHORIZED STAFF ONLY':'Welcome to the casino floor.';
  $('[data-casino-balance]').textContent=state?money(state.balance):'— MZK';
  panel.classList.toggle('is-busy',pending);panel.classList.toggle('is-high-limit',isGame(kind)&&/vip|high/i.test(limits.tier));panel.setAttribute('aria-busy',String(pending||loading));
  let html='';
  if(isGame(kind)){
   html='<div class="casino-table-limits"><span>'+escape(tierLabel(limits.tier))+'</span><strong>'+money(limits.minBetMzk)+' – '+money(limits.maxBetMzk)+'</strong><small>Wager step: '+money(limits.betStepMzk)+'</small></div>';
   if(foreign){const place=CASINO_STATIONS.find(station=>station.id===foreign.stationId);html+='<p class="casino-round-location" data-round-location>Your open '+escape(GAME_NAMES[kind])+' hand is at '+escape(place?.name||foreign.stationId)+'. Return to that table to finish it.</p>';}
   html+=tableMarkup(kind,round,active,holds,receipt);
   if(kind==='threecard')html+='<div class="casino-stake-plan" data-stake-exposure><span><small>ANTE '+(active?'COMMITTED':'NOW')+'</small><b>'+money(round?.phase==='playing'?round.anteMzk??round.betMzk:bet)+'</b></span><span><small>PLAY ADDS</small><b>'+money(round?.phase==='playing'?round.anteMzk??round.betMzk:bet)+'</b></span><span><small>MAXIMUM STAKE</small><b>'+money((round?.phase==='playing'?round.anteMzk??round.betMzk:bet)*2)+'</b></span></div>';
   html+='<form class="casino-bet-form" data-bet-form><label>'+(kind==='threecard'?'Ante in MZK':'Bet in MZK')+'<input type="number" inputmode="numeric" data-bet min="'+limits.minBetMzk+'" max="'+limits.maxBetMzk+'" step="'+limits.betStepMzk+'" value="'+bet+'" '+(active?'disabled':'')+' required></label>';
   if(kind==='roulette')html+='<label>Place your bet<select data-selection>'+[['red','Red · 2×'],['black','Black · 2×'],['odd','Odd · 2×'],['even','Even · 2×'],...Array.from({length:37},(_,index)=>[String(index),index+' · 36×'])].map(([value,name])=>'<option value="'+value+'"'+(String(selection)===value?' selected':'')+'>'+name+'</option>').join('')+'</select></label>';
   if(kind==='dice')html+='<label>Call the roll<select data-selection>'+[['low','Low · 2×'],['seven','Seven · 5×'],['high','High · 2×']].map(([value,name])=>'<option value="'+value+'"'+(selection===value?' selected':'')+'>'+name+'</option>').join('')+'</select></label>';
   if(kind==='baccarat')html+='<label>Back a hand<select data-selection>'+[['player','Player'],['banker','Banker'],['tie','Tie']].map(([value,name])=>'<option value="'+value+'"'+(selection===value?' selected':'')+'>'+name+'</option>').join('')+'</select></label>';
   html+='<div class="casino-bet-actions">';
   if(active&&kind==='blackjack')html+='<button type="button" data-command="hit">Hit</button><button type="button" data-command="stand">Stand</button>'+(round.canDouble?'<button type="button" data-command="double" '+(Number(state?.balance)<round.betMzk?'data-unaffordable':'')+'>Double · add '+money(round.betMzk)+'</button>':'');
   else if(active&&kind==='threecard')html+='<button type="button" data-command="play" '+(Number(state?.balance)<(round.anteMzk??round.betMzk)?'data-unaffordable':'')+'>Play · add '+money(round.anteMzk??round.betMzk)+'</button><button type="button" class="casino-fold" data-command="fold">Fold · forfeit ante</button>';
   else if(active)html+='<button type="button" data-command="draw">Draw cards</button>';
   else html+='<button type="submit" data-wager>'+actionLabel(kind)+' · '+money(bet)+'</button>';
   html+='</div></form>';
   if(active)html+='<p class="casino-note">Your open hand is saved. You can return to this table to finish it.</p>';
   if(kind==='threecard'&&Number(state?.balance)<(active?round.anteMzk??round.betMzk:bet*2))html+='<p class="casino-note">'+(active?'Your wallet needs another '+money(round.anteMzk??round.betMzk)+' to Play. Fold adds no further stake.':'Your wallet covers less than both stakes. Playing after the deal requires a second equal ante.')+'</p>';
   html+='<details class="casino-rules"><summary>Rules &amp; payouts</summary><p>'+escape(game?.rules||'Choose a wager within the posted table limits. Winnings settle to your MZK wallet.')+'</p><p>'+escape(typeof game?.payouts==='string'?game.payouts:game?.payouts?JSON.stringify(game.payouts):'The game paytable will load with your wallet.')+'</p></details><button type="button" class="casino-refresh" data-refresh>Refresh table &amp; wallet</button>';
  }else if(kind==='vendor'){
   html='<div class="casino-services">'+(state?.vendors||[]).map(item=>'<article><span class="casino-service-icon">'+(item.id.includes('coffee')?'☕':item.id.includes('water')?'◉':'♨')+'</span><div><h4>'+escape(item.name)+'</h4><p>'+escape(item.description||'Freshly served at the casino bar.')+'</p><small>Served now · '+escape(item.effect?.stat||'refreshment')+' +'+escape(item.effect?.amount||0)+'</small></div><button type="button" data-vendor="'+escape(item.id)+'">'+money(item.priceMzk)+'</button></article>').join('')+'</div>';
  }else if(kind==='cashier'||kind==='atm'){
   html='<div class="casino-service-card"><span class="casino-service-icon">'+(kind==='atm'?'▣':'◈')+'</span><h4>Your MZK wallet is ready at every table.</h4><p>The casino uses your existing MZK balance directly. Winnings return to the same wallet after each completed round.</p><button type="button" data-refresh>Refresh wallet balance</button></div><div class="casino-history"><h4>Recent casino activity</h4>'+(state?.history?.length?state.history.slice(0,8).map(item=>'<p><span>'+escape(GAME_NAMES[item.game]||item.game)+' · '+escape(item.outcome||item.phase)+'</span><strong>'+money(item.payoutMzk)+' returned</strong></p>').join(''):'<p>Your completed rounds will appear here.</p>')+'</div>';
  }else if(kind==='vault'){
   html='<div class="casino-service-card"><span class="casino-service-icon">▣</span><h4>Vault secured</h4><p>The reinforced safe door is locked. The casino reserves this bank vault for authorized staff. Both security guards can help with questions on the public floor.</p><p class="casino-note">Security system online · Access restricted</p></div>';
  }else{
   const vip=CASINO_STATIONS.find(station=>station.kind==='baccarat'),salon=CASINO_STATIONS.find(station=>station.kind==='threecard');
   html='<div class="casino-welcome"><p>Welcome to Starlight Grand. Follow the central promenade into the gaming wings, card salon and VIP room. Press <kbd>E</kbd> or tap <b>Use</b> beside a table or service.</p><div class="casino-directory"><article><b>WEST WING</b><span>Five-card draw poker<br>Roulette<br>Slot machines</span></article><article><b>EAST WING</b><span>Blackjack<br>Hosted high / low dice<br>Slot machines</span></article><article><b>LOBBY</b><span>Refreshment bar<br>Cashier &amp; ATM<br>Hosts &amp; security</span></article>'+(salon?'<article class="casino-directory__salon"><b>CARD SALON</b><span>Three-card poker<br>Ante, then Play or Fold<br>'+money(salon.minBetMzk||10)+' – '+money(salon.maxBetMzk||500)+'</span></article>':'')+(vip?'<article class="casino-directory__vip"><b>VIP · HIGH LIMITS</b><span>Baccarat · Player / Banker / Tie<br>Automatic drawing rules<br>'+money(vip.minBetMzk||100)+' – '+money(vip.maxBetMzk||2500)+'</span></article>':'')+'</div><p>Your MZK wallet funds every game. Each table posts its limits and paytable. Visit the hosts for a tour or a local favor, and explore the lounge between hands. The bank vault remains locked.</p></div>';
  }
  if(failedCommand){const station=CASINO_STATIONS.find(item=>item.id===failedCommand.body.stationId),here=!failedCommand.body.stationId||failedCommand.body.stationId===current.id;html='<div class="casino-recovery" data-casino-recovery><p>The last action is waiting for its receipt. '+(here?'Retry the same action or refresh the table to recover its result.':'Return to '+escape(station?.name||failedCommand.body.stationId)+' to recover it.')+'</p><button type="button" data-retry-casino '+(!here?'data-unaffordable':'')+'>Retry last action</button></div>'+html;}
  content.innerHTML=html;
  for(const button of content.querySelectorAll('button')){const originalRetry=failedCommand&&failedCommand.body.stationId===current.id&&(button.hasAttribute('data-wager')&&failedCommand.body.operation==='bet'||button.dataset.command===failedCommand.body.operation&&button.hasAttribute('data-command')||button.dataset.vendor===failedCommand.body.itemId&&button.hasAttribute('data-vendor'));button.disabled=pending||loading||button.hasAttribute('data-unaffordable')||(!state&&isGame(kind)&&!button.hasAttribute('data-refresh'))||Boolean((foreign||failedCommand&&!originalRetry)&&button.matches('[data-wager],[data-command],[data-vendor],[data-hold]'));}
  for(const control of content.querySelectorAll('input,select'))if(pending||loading||foreign||failedCommand)control.disabled=true;
  $('[data-casino-message]').textContent=loading?'Loading your MZK wallet…':pending?'Dealer is resolving your action…':message;
  content.querySelector('[data-bet-form]')?.addEventListener('submit',event=>{event.preventDefault();command('bet');});
  content.querySelector('[data-bet]')?.addEventListener('input',event=>{bet=Number(event.target.value);stationBets.set(current.id,bet);const button=content.querySelector('[data-wager]');if(button)button.textContent=actionLabel(kind)+' · '+money(bet);content.querySelectorAll('[data-stake-exposure] b').forEach((node,index)=>{node.textContent=money(index===2?bet*2:bet);});});
  content.querySelector('[data-selection]')?.addEventListener('change',event=>{selection=event.target.value;});
  content.querySelectorAll('[data-hold]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.hold);holds.has(index)?holds.delete(index):holds.add(index);button.setAttribute('aria-pressed',String(holds.has(index)));button.classList.toggle('is-held',holds.has(index));button.querySelector('small').textContent=holds.has(index)?'HELD':'HOLD';});
  content.querySelectorAll('[data-command]').forEach(button=>button.onclick=()=>command(button.dataset.command));
  content.querySelectorAll('[data-vendor]').forEach(button=>button.onclick=()=>purchase(button.dataset.vendor));
  content.querySelector('[data-refresh]')?.addEventListener('click',refresh);
  content.querySelector('[data-retry-casino]')?.addEventListener('click',()=>{const recovery=failedCommand;if(!recovery)return;if(recovery.path==='/api/casino/vendor')void purchase(recovery.body.itemId,recovery.body);else void command(recovery.body.operation,recovery.body);});
 }
 async function mutate(path,body,generation){
  if(!currentCommand(generation))return null;
  const signature=JSON.stringify({path,body}),retry=failedCommand?.signature===signature?failedCommand:null;
  const payload=retry?.payload||{...body,requestId:crypto.randomUUID()};failedCommand=retry||{signature,payload,body,path,knownRoundIds:[...Object.values(rounds),...(state?.history||[])].map(round=>round.id)};
  try{const session=await api('/api/market/session');if(!currentCommand(generation))return null;const result=await api(path,{method:'POST',headers:{'X-CSRF-Token':session.csrfToken},body:JSON.stringify(payload)});if(!currentCommand(generation))return null;failedCommand=null;return result;}
  catch(error){if(currentCommand(generation)&&((error.status>=400&&error.status<500&&error.status!==408)||(error.statusCode>=400&&error.statusCode<500&&error.statusCode!==408)))failedCommand=null;throw error;}
 }
 async function command(operation,retryBody=null){
  if(disposed||pending||!current||!isGame(current.kind))return;
  const generation=commandGeneration;
  const station=current,game=current.kind,round=stationRound(),metadata=state?.games?.find(item=>item.id===game),limits=casinoStationLimits(station,metadata,round),body=retryBody||{game,operation,stationId:station.id};
  if(!retryBody&&operation==='bet'){
   if(!Number.isSafeInteger(bet)||bet<limits.minBetMzk||bet>limits.maxBetMzk||(bet-limits.minBetMzk)%limits.betStepMzk!==0){message='Choose a wager from '+money(limits.minBetMzk)+' to '+money(limits.maxBetMzk)+' in steps of '+money(limits.betStepMzk)+'.';render();return;}
   Object.assign(body,{betMzk:bet,selection:game==='roulette'&&/^\d+$/.test(String(selection))?Number(selection):selection});
  }else if(!retryBody){if(!round||round.phase!=='playing'||!casinoRoundMatchesStation(round,station))return;Object.assign(body,{roundId:round.id,revision:round.revision});if(operation==='draw')body.holds=[...holds].sort((a,b)=>a-b);}
  pending=true;message='';render();
  try{const result=await mutate('/api/casino/play',body,generation);if(!currentCommand(generation)||!result)return;rounds[game]=result.round;lastReceipt={roundId:result.round.id,receipt:result.receipt};setBalance(result.balance);state.activeRounds={...state.activeRounds};if(result.round.phase==='playing')state.activeRounds[game]=result.round;else{delete state.activeRounds[game];state.history=[result.round,...(state.history||[]).filter(item=>item.id!==result.round.id)].slice(0,20);}onOutcome(station,result);holds.clear();message=result.message||'Round updated.';if(result.round?.phase==='complete')announce(message);}
  catch(error){if(currentCommand(generation)){if(authenticationError(error))clearAccount();message=error.message;announce(message);}}
  finally{if(currentCommand(generation)){pending=false;render();}}
 }
 async function purchase(itemId,retryBody=null){
  if(disposed||pending||!current)return;const generation=commandGeneration;pending=true;message='';render();
  try{const result=await mutate('/api/casino/vendor',retryBody||{itemId,stationId:current.id},generation);if(!currentCommand(generation)||!result)return;setBalance(result.balance);message=result.message||'Your refreshment is served.';announce(message);}
  catch(error){if(currentCommand(generation)){if(authenticationError(error))clearAccount();message=error.message;}}
  finally{if(currentCommand(generation)){pending=false;render();}}
 }
 function close(){screen.close();}
 function open(){
  if(disposed)return false;update();if(!nearby||gameplayOverlayOpen()||pending)return false;
  current=nearby;holds.clear();bet=stationBets.get(current.id)??5;syncBetToStation();selection=current.kind==='dice'?'low':current.kind==='baccarat'?'player':'red';message='';panel.setAttribute('aria-label','Starlight Grand · '+title());render();screen.open();trigger.setAttribute('aria-expanded','true');void refresh();return true;
 }
 function update(){
  if(disposed)return;nearby=nearestCasinoStation(getEnvironment(),getPosition());
  const visible=Boolean(nearby)&&!screen.dialog.open&&!gameplayOverlayOpen();trigger.hidden=!visible;
  if(nearby){const label=(isGame(nearby.kind)?'Play ':nearby.kind==='vault'?'Inspect ':'Use ')+(GAME_NAMES[nearby.kind]||nearby.name);if(trigger.dataset.station!==nearby.id){trigger.dataset.station=nearby.id;trigger.innerHTML='<span class="casino-use__key game-nearby-prompt__key" aria-hidden="true">E</span><span class="game-nearby-prompt__copy"><strong>'+escape(label)+'</strong><small>Starlight Grand</small></span>';trigger.setAttribute('aria-label',label);}}
  if(current){const pos=getPosition(),env=getEnvironment();if((typeof env==='string'?env:env?.id)!==CASINO_ID){reset();return;}if(Math.hypot(pos.x-current.position.x,pos.z-current.position.z)>8)close();}
 }
 function reset(){loadToken++;commandGeneration++;loading=pending=false;clearAccount();message='';close();nearby=null;trigger.hidden=true;}
 trigger.onclick=open;$('[data-casino-close]').onclick=close;$('[data-casino-people]').onclick=()=>{const station=current;close();onConversations(station);};
 for(const type of ['pointerdown','click','wheel'])panel.addEventListener(type,event=>event.stopPropagation());
 return {update,open,available(){update();return !disposed&&Boolean(nearby)&&!screen.dialog.open&&!gameplayOverlayOpen()&&!pending;},reset,dispose(){if(disposed)return;reset();disposed=true;screen.disconnect();screen.dialog.remove();trigger.remove();}};
}
