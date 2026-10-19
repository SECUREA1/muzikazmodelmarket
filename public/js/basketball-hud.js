import {mountGameMatchBrowser} from './game-match-browser.js';
import {basketballSoloSettings} from './basketball-rules.js';
import {bindGameActionSelection} from './rad-tox-controller.js';

const milliseconds=value=>Number.isFinite(value)?Math.max(0,value):0;
const clock=value=>{
  const remaining=milliseconds(value);
  if(remaining>0&&remaining<60000){const tenths=Math.min(599,Math.ceil(remaining/100));return `0:${String(Math.floor(tenths/10)).padStart(2,'0')}.${tenths%10}`;}
  const seconds=Math.ceil(remaining/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
};
export function basketballScoreboardState(game={}){
  const quarters=Math.max(1,Math.floor(Number(game.settings?.quarters)||4)),quarter=Math.max(1,Math.floor(Number(game.quarter)||1)),overtime=Math.max(0,quarter-quarters);
  const phase=game.state==='ready'?'PRE GAME':game.state==='finished'?(overtime?`FINAL · OT ${overtime}`:'FINAL'):overtime?`OT ${overtime}`:`Q${quarter}`;
  const shot=milliseconds(game.shotClockMs),score=value=>Number.isFinite(value)?Math.max(0,Math.floor(value)):0;
  return {home:score(game.homeScore),away:score(game.awayScore),phase,gameClock:clock(game.clockMs),shotClock:shot>0&&shot<5000?(Math.ceil(shot/100)/10).toFixed(1):String(Math.ceil(shot/1000)),possession:['home','away'].includes(game.possession)?game.possession:null};
}

export function basketballLobbySummary(game={}, players={}) {
  const size=Math.max(1,Math.min(5,Number(game.settings?.teamSize)||5));
  const members=Object.values(players).filter(player=>!player.basketballAI&&player.basketballRole!=='spectator');
  return ['home','away'].map(team=>{
    const humans=members.filter(player=>player.basketballTeam===team);
    const configured=game.settings?.[`${team}Humans`];
    const capacity=game.state==='live'||configured===undefined?size:Math.max(0,Math.min(size,Number(configured)||0));
    return {team,label:team==='home'?'Home':'Away',humans:humans.length,capacity,open:Math.max(0,capacity-humans.length),aiAtTipoff:Math.max(0,size-humans.length),names:humans.map(player=>player.username||player.name||'Player')};
  });
}

export function mountBasketballHud({ stage, actionParent=stage.parentElement, onAction, onTriggerChange=()=>{}, announce = () => {} }) {
  const style = document.createElement('style');
  style.textContent = `
    .basketball-match-toggle{pointer-events:auto;min-height:38px;background:#142305;color:#c4ff5b;border:1px solid #91ba42;border-radius:8px;margin:6px auto;display:block;padding:6px 12px;font-weight:bold}.basketball-match-menu{pointer-events:auto}.basketball-match-menu .basketball-game-actions{display:flex!important}.basketball-match-menu::backdrop{background:#000b}\n    .basketball-hud[hidden]{display:none!important}
    .basketball-hud{color:#f8f4eb;font-family:system-ui,sans-serif;pointer-events:none}
    .basketball-world{--basketball-scoreboard-height:56px}
    .basketball-scoreboard{position:absolute;top:var(--basketball-scoreboard-top,8px);left:50%;transform:translateX(-50%);z-index:24;width:min(460px,calc(100% - 16px));height:var(--basketball-scoreboard-height,56px);color:#f8f4eb;font-family:system-ui,sans-serif;pointer-events:none}
    .basketball-scoreboard[hidden]{display:none!important}
    .basketball-score-strip{box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) 108px minmax(0,1fr);height:100%;background:#09101ff2;border:1px solid #d8b27580;box-shadow:0 3px 12px #0006;border-radius:8px;overflow:hidden;text-align:center}
    .basketball-team-score{min-width:0;padding:5px 10px;border-top:3px solid #27b8ff;display:flex;align-items:center;justify-content:space-between;gap:8px}
    .basketball-team-score:last-child{border-color:#ff5a46;flex-direction:row-reverse}
    .basketball-team-score span{font-size:11px;letter-spacing:1px;font-weight:800}.basketball-team-score strong{font-size:30px;line-height:1;font-variant-numeric:tabular-nums}
    .basketball-team-score.has-possession span{color:#ffdb94}
    .basketball-clock{padding:3px 4px;background:#141d2e;display:grid;align-content:center;gap:0;line-height:1.1}.basketball-clock b{font-size:20px;font-variant-numeric:tabular-nums;color:#ffdb94;white-space:nowrap}.basketball-clock small{font-size:9px;letter-spacing:.6px;color:#c0cbd9}.basketball-clock [data-shot]{font-variant-numeric:tabular-nums;color:#ffdb94;font-weight:800}
    .basketball-game-actions{pointer-events:auto;display:flex;justify-content:center;gap:5px;flex-wrap:wrap;margin:7px 0}
    .basketball-game-actions button[hidden],.house-stage .basketball-game-actions button[hidden]{display:none!important}
    .basketball-game-actions button{min-height:44px;touch-action:manipulation;border:1px solid #ffffff35;border-radius:7px;padding:6px 11px;font:bold 11px system-ui;background:#101b2eeb;color:white;cursor:pointer}
    .house-stage .basketball-game-actions button{width:auto!important;flex:0 0 auto!important;display:inline-flex!important;align-items:center;justify-content:center}
    .basketball-game-actions [data-basketball-action="basketball-start"]{background:#e9ba72;color:#172034;border-color:#ffe0ad}
    .basketball-game-actions button[aria-pressed="true"],.basketball-screen-actions button.is-selected{outline:2px solid #e9ba72;outline-offset:1px;background:#34501b;color:#e1ffb4}
    .basketball-game-actions button:disabled{opacity:.5;cursor:default}
    .basketball-caption{margin:0 auto;max-width:440px;text-align:center;font-size:11px;line-height:1.4;text-shadow:0 1px 4px #000;background:#0a1222c9;border-radius:6px;padding:4px 8px}
    .basketball-world .rad-tox-hud{display:none!important}
    .basketball-world .basketball-controls{display:none!important}
    .basketball-world .rad-tox-reticle{border-color:#efc37c}
    .basketball-role{text-align:center;margin:5px 0 0;color:#ead2a4;font-size:10px;letter-spacing:1px}
    .basketball-rules{box-sizing:border-box;width:min(520px,calc(100vw - 24px));max-height:85vh;overflow:auto;border:1px solid #d8b275;border-radius:12px;padding:22px;background:#101b2e;color:#f8f4eb;font:14px system-ui}
    .basketball-rules::backdrop{background:#000a}.basketball-rules h2{margin:0 0 10px;color:#f8f4eb}.basketball-rules p{font-size:12px;line-height:1.5;color:#c0cbd9}
    .basketball-rules-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.basketball-rules label{display:grid;gap:5px;font-size:12px}.basketball-rules input,.basketball-rules select{width:100%;box-sizing:border-box;min-height:44px;padding:9px;border:1px solid #50617a;border-radius:6px;background:#08101e;color:white}
    .basketball-rules details{margin-top:16px}.basketball-rules summary{cursor:pointer;padding:10px 0;color:#ead2a4}.basketball-rules [data-roster-preview]{padding:12px;border-radius:8px;background:#08101e;white-space:pre-line}.basketball-rules button{min-height:44px}.basketball-rules footer{flex-wrap:wrap;display:flex;gap:8px;margin-top:18px}.basketball-rules button{width:auto!important;padding:9px 16px;border:1px solid #d8b275;border-radius:6px;background:#e9ba72;color:#172034;cursor:pointer}
    .basketball-lobby-status{padding:10px;border:1px solid #91ba4270;border-radius:8px;background:#142305;color:#d9f5b4!important;font-weight:600}.basketball-lobby-roster{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.basketball-lobby-team{min-width:0;padding:10px;border:1px solid #50617a;border-radius:8px;background:#08101e}.basketball-lobby-team h3{margin:0;font-size:13px}.basketball-lobby-team p{margin:6px 0 0;font-size:11px;overflow-wrap:anywhere;white-space:pre-line}.basketball-lobby-help{margin:10px 0}
    .basketball-scored .basketball-score-strip{animation:basketball-score-flash .7s ease-out}
    @keyframes basketball-score-flash{0%{box-shadow:0 0 50px #ffd47fbd;transform:scale(1.035)}100%{box-shadow:0 12px 40px #0007;transform:scale(1)}}
    @media(max-width:600px){.basketball-world{--basketball-scoreboard-height:50px}.basketball-team-score{padding:4px 7px;gap:5px}.basketball-team-score strong{font-size:26px}.basketball-team-score span{font-size:10px;letter-spacing:.5px}.basketball-score-strip{grid-template-columns:minmax(0,1fr) 96px minmax(0,1fr)}.basketball-clock b{font-size:18px}.basketball-clock small{font-size:8px}.basketball-game-actions{gap:4px}.basketball-game-actions button{padding:6px 8px;font-size:10px}.basketball-caption{font-size:10px}}
    .basketball-hud.basketball-hud-docked{position:relative;inset:auto;transform:none;width:100%;box-sizing:border-box;padding:6px 8px;background:#0c1b08;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;align-items:center}
    .basketball-hud-docked .basketball-match-toggle{grid-column:2;grid-row:1;margin:0;max-width:140px;min-height:44px;font-size:11px}
    .basketball-hud-docked .basketball-caption{grid-column:1;grid-row:1;max-width:100%;margin:0;font-size:11px;padding:2px 4px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .basketball-hud-docked .basketball-role{grid-column:1/-1;max-width:100%;margin:0;font-size:11px;padding:2px 4px}
    .basketball-hud-docked.is-playing .basketball-role{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%)}
    @media(prefers-reduced-motion:reduce){.basketball-scored .basketball-score-strip{animation:none}}
  `;
  document.head.append(style);
  const root = document.createElement('section');
  root.className = 'basketball-hud';
  root.hidden = true;
  root.setAttribute('aria-label', 'Basketball match controls and status');
  root.innerHTML = `<div class="basketball-score-strip"><div class="basketball-team-score"><span>HOME</span><strong data-home>0</strong></div><div class="basketball-clock"><small data-period>PRE GAME</small><b data-clock>12:00</b><small>SHOT <span data-shot>24</span></small></div><div class="basketball-team-score"><span>AWAY</span><strong data-away>0</strong></div></div><div class="basketball-game-actions"><button type="button" data-basketball-action="basketball-start">Start game</button><button type="button" data-basketball-action="basketball-team" data-team="home" aria-pressed="false">Join Home</button><button type="button" data-basketball-action="basketball-team" data-team="away" aria-pressed="false">Join Away</button><button type="button" data-basketball-action="catch">Catch · E</button><button type="button" data-basketball-action="basketball-shoot">Shoot · R</button><button type="button" data-basketball-action="toss">Pass · T</button></div><p class="basketball-caption" role="status" aria-live="polite" data-play>Choose a team and start a game. Everyone can join.</p>`;
  const scoreboard=document.createElement('section');scoreboard.className='basketball-scoreboard';scoreboard.hidden=true;scoreboard.setAttribute('aria-label','Basketball scoreboard');scoreboard.append(root.querySelector('.basketball-score-strip'));stage.append(scoreboard);
  root.querySelector('.basketball-game-actions').insertAdjacentHTML('beforeend','<button type="button" data-basketball-action="basketball-watch" aria-pressed="false">Watch game</button><button type="button" data-basketball-rules>Match setup</button>');
  root.insertAdjacentHTML('beforeend','<p class="basketball-role" data-role></p>');
  root.querySelector('.basketball-game-actions').insertAdjacentHTML('beforeend','<button type="button" data-basketball-action="basketball-steal">Steal · Q</button>');
  const actions=root.querySelector('.basketball-game-actions');
  const match=document.createElement('dialog');match.className='basketball-rules basketball-match-menu';match.setAttribute('aria-label','Basketball match and players');
  match.innerHTML='<h2>Basketball match lobby</h2><p class="basketball-lobby-status" data-lobby-status role="status" aria-live="polite">Waiting for players · join a team before tip-off.</p><div class="basketball-lobby-roster"><section class="basketball-lobby-team"><h3 data-lobby-home-count>Home</h3><p data-lobby-home-roster></p></section><section class="basketball-lobby-team"><h3 data-lobby-away-count>Away</h3><p data-lobby-away-roster></p></section></div><p class="basketball-lobby-help">Choose Home or Away and let friends join this lobby. The host sets up the match and presses Start match when everyone is here. AI fills empty places at tip-off.</p><label>World mode<select data-basketball-world-mode><option value="solo">Solo vs AI</option><option value="multiplayer">Live multiplayer · players and AI</option></select></label><button type="button" data-open-world>Open selected mode</button><p>Watch game leaves your spot for another player or AI.</p><section data-game-match-browser></section><button type="button" data-close-match>Return to court</button>';
  const mode=match.querySelector('[data-basketball-world-mode]');mode.value=new URL(location.href).searchParams.get('mode')==='solo'?'solo':'multiplayer';
  match.querySelector('[data-open-world]').onclick=()=>{const url=new URL(location.href);url.searchParams.set('mode',mode.value);url.searchParams.set('autoplay','1');location.assign(url.href);};
  match.querySelector('[data-close-match]').onclick=()=>match.close();
  const openMatch=()=>{if(root.hidden)return;document.exitPointerLock?.();if(!match.open)match.showModal();};
  const matchButton=document.createElement('button');matchButton.type='button';matchButton.className='basketball-match-toggle';matchButton.textContent='Match · join / watch / start';matchButton.onclick=openMatch;actions.replaceWith(matchButton);match.insertBefore(actions,match.querySelector('[data-game-match-browser]'));root.append(match);
  match.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();match.close();}});
  stage.append(root);
  mountGameMatchBrowser(match.querySelector('[data-game-match-browser]'),{game:'basketball',currentMapId:()=>new URL(location.href).searchParams.get('environment')||new URL(location.href).searchParams.get('house')});
  const screenBar=document.createElement('div');screenBar.className='game-screen-actions basketball-screen-actions';screenBar.hidden=true;screenBar.setAttribute('role','group');screenBar.setAttribute('aria-label','Basketball gameplay actions');
  for(const action of ['basketball-shoot','toss','catch','basketball-steal'])screenBar.append(root.querySelector(`[data-basketball-action="${action}"]`));
  actionParent.prepend(root,screenBar);root.classList.add('basketball-hud-docked');
  const rules = document.createElement('dialog');rules.className='basketball-rules';rules.setAttribute('aria-labelledby','basketball-rules-title');
  rules.innerHTML='<form><h2 id="basketball-rules-title">Quick match tuner</h2><p>Choose team size, human players and AI difficulty, then start. Both teams stay equal; AI fills every empty spot at tip-off.</p><button type="button" data-solo-setup>Solo vs AI</button><div class="basketball-rules-fields"><label>Players per team<select name="teamSize"><option value="1">1 vs 1</option><option value="2">2 vs 2</option><option value="3">3 vs 3</option><option value="4">4 vs 4</option><option value="5">5 vs 5</option></select></label><label>AI difficulty<select name="aiDifficulty"><option value="1">Tier 1 · Rookie</option><option value="2">Tier 2 · Amateur</option><option value="3">Tier 3 · Pro</option><option value="4">Tier 4 · All-Star</option><option value="5">Tier 5 · Legend</option></select></label><label>Home human slots<input name="homeHumans" type="number" min="0" max="5" step="1" required></label><label>Away human slots<input name="awayHumans" type="number" min="0" max="5" step="1" required></label></div><details><summary>Competition rules · timing &amp; scoring</summary><div class="basketball-rules-fields"><label>Minutes per period<input type="number" name="quarterMinutes" min="1" max="12" step="1" required></label><label>Number of periods<input type="number" name="quarters" min="1" max="4" step="1" required></label><label>Shot clock (seconds)<input type="number" name="shotClockSeconds" min="5" max="60" step="1" required></label><label>Score to win (0 = timed)<input type="number" name="scoreLimit" min="0" max="200" step="1" required></label><label>Win by points<input type="number" name="winBy" min="1" max="10" step="1" required></label></div></details><p data-roster-preview role="status" aria-live="polite"></p><p>Playing with friends? Save to lobby, let everyone join Home or Away, then start. AI wears numbered team jerseys. Late arrivals watch until the next game.</p><p data-rules-status role="status"></p><footer><button type="submit" name="start" value="true" data-start-match>Start game</button><button type="submit" name="save" data-save-rules>Save to lobby</button><button type="button" data-close-rules>Back to court</button></footer></form>';
  stage.append(rules);
  let score = '0:0', ready = false, currentGame = null, currentPlayer = null, currentPlayers = {};
  let savingSetup=false,actionContext='';
  const selection=bindGameActionSelection(screenBar,{selector:'[data-basketball-action]',defaultAction:'basketball-shoot',enabled:()=>ready&&Boolean(currentPlayer)&&!screenBar.hidden&&currentPlayer.basketballRole!=='spectator',onChange:onTriggerChange});
  const solo=()=>new URL(location.href).searchParams.get('mode')==='solo';
  const isHost=()=>{
    if(!currentPlayer||currentPlayer.basketballRole==='spectator')return false;
    const selfId=currentPlayer.actorId||currentPlayer.id||Object.entries(currentPlayers).find(([,player])=>player===currentPlayer)?.[0];
    return currentGame?.hostId?currentGame.hostId===selfId:solo();
  };
  const defaults={quarterMinutes:12,quarters:4,shotClockSeconds:24,scoreLimit:0,winBy:1,teamSize:5,homeHumans:5,awayHumans:5,aiDifficulty:3};
  function previewRoster(){const size=Number(rules.querySelector('[name=teamSize]').value);for(const name of ['homeHumans','awayHumans']){const input=rules.querySelector(`[name=${name}]`);input.max=size;}const members=Object.values(currentPlayers).filter(p=>!p.basketballAI&&p.basketballRole!=='spectator');rules.querySelector('[data-roster-preview]').textContent=['home','away'].map(team=>{const count=members.filter(p=>p.basketballTeam===team).length;const slots=Number(rules.querySelector(`[name=${team}Humans]`).value);return `${team==='home'?'Home':'Away'}: ${slots} human slots + ${Math.max(0,size-slots)} AI · ${count} joined · ${Math.max(0,size-count)} AI at tip-off`;}).join('\n');}
  rules.addEventListener('input',event=>{if(event.target.name==='teamSize'){for(const name of ['homeHumans','awayHumans']){const input=rules.querySelector(`[name=${name}]`);input.value=Math.min(Number(input.value),Number(event.target.value));}}previewRoster();});
  const openSetup=()=>{match.close();
    document.exitPointerLock?.();
    const settings=solo()?basketballSoloSettings(currentGame?.settings,currentPlayer?.basketballTeam):{...defaults,...currentGame?.settings},locked=currentGame?.state==='live'||!isHost();
    for(const [key,value] of Object.entries(settings)){const input=rules.querySelector(`[name="${key}"]`);if(input){input.value=value;input.disabled=locked||(solo()&&['homeHumans','awayHumans'].includes(key));}}
    for(const button of rules.querySelectorAll('[type=submit],[data-solo-setup]'))button.disabled=locked||savingSetup;
    rules.querySelector('[data-rules-status]').textContent=currentGame?.state==='live'?'These rules are locked until the final buzzer.':!isHost()?`${currentGame?.hostName||'The host'} controls match setup. Join a team and wait for tip-off.`:solo()?'Solo mode reserves your spot; all other players are AI. Adjust the difficulty to suit your game.':'Save the setup to keep this lobby open, then press Start match when everyone has joined.';
    previewRoster();if(!rules.open)rules.showModal();
  };
  root.querySelector('[data-basketball-rules]').addEventListener('click',openSetup);
  rules.querySelector('[data-solo-setup]').onclick=()=>{if(currentGame?.state==='live'||!isHost())return;const team=currentPlayer?.basketballTeam||'home';for(const side of ['home','away'])rules.querySelector(`[name=${side}Humans]`).value=side===team?1:0;previewRoster();};
  rules.querySelector('[data-close-rules]').onclick=()=>rules.close();
  rules.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();if(currentGame?.state==='live'||savingSetup||!isHost())return;
    const startNow=event.submitter?.name!=='save';
    savingSetup=true;
    for(const button of rules.querySelectorAll('[type=submit],[data-solo-setup]'))button.disabled=true;
    const status=rules.querySelector('[data-rules-status]');status.textContent=startNow?'Saving setup and starting…':'Saving lobby setup…';
    try{
      const values=Object.fromEntries(Object.keys(defaults).map(key=>[key,Number(rules.querySelector(`[name="${key}"]`).value)]));
      const settings=solo()?basketballSoloSettings(values,currentPlayer?.basketballTeam):values;
      const result=await onAction('basketball-settings',{settings});
      if(result===false){status.textContent='Setup could not be saved. Check the team slots and try again.';return;}
      if(startNow){const started=await onAction('basketball-start',{});if(started===false){status.textContent='Game could not start. Choose a team and try again.';return;}}
      rules.close();
    }catch(error){status.textContent=error.message;}
    finally{savingSetup=false;for(const button of rules.querySelectorAll('[type=submit],[data-solo-setup]'))button.disabled=currentGame?.state==='live'||!isHost();}
  });
  const blocked=button=>!ready||pending.has(button)||(button.dataset.basketballAction==='basketball-start'&&!isHost())||(currentPlayer?.basketballRole==='spectator'&&['catch','toss','basketball-shoot','basketball-steal','basketball-start'].includes(button.dataset.basketballAction));
  const pending = new Set();
  const handleAction=async event => {
    const button = event.target.closest('[data-basketball-action]');
    if (!button || button.disabled) return;
    event.stopPropagation();
    match.close();
    pending.add(button);button.disabled = true;
    try {
      if(button.dataset.basketballAction==='basketball-start'&&solo()){
        const configured=await onAction('basketball-settings',{settings:basketballSoloSettings(currentGame?.settings,currentPlayer?.basketballTeam)});
        if(configured===false)return;
      }
      await onAction(button.dataset.basketballAction, button.dataset.team ? { team: button.dataset.team } : {});
    }
    catch (error) { announce(error.message); }
    finally { pending.delete(button);button.disabled = blocked(button);selection.sync(); }
  };
  root.addEventListener('click',handleAction);screenBar.addEventListener('click',handleAction);
  return {
    openMatch,
    triggerSelected:()=>selection.trigger(),
    selectedAction:()=>selection.selected,
    render(game, player, enabled, players={}) {
      root.hidden = !enabled;scoreboard.hidden=!enabled||!game;screenBar.hidden=!enabled;root.classList.toggle('is-playing',game?.state==='live');
      stage.classList.toggle('basketball-world', Boolean(enabled));
      ready = Boolean(player);
      currentGame=game;currentPlayer=player;currentPlayers=players;
      const context=`${enabled}:${game?.matchId||game?.state||''}:${player?.basketballRole||''}`;if(context!==actionContext){actionContext=context;selection.reset();}
      for(const button of [...root.querySelectorAll('button'),...screenBar.querySelectorAll('button')])if(!button.closest('.game-match-browser'))button.disabled=blocked(button);
      if(!enabled&&rules.open)rules.close();
      if(!enabled&&match.open)match.close();
      selection.sync();
      if (!enabled || !game) return;
      if(rules.open){previewRoster();if(game.state==='live'||!isHost()){for(const input of rules.querySelectorAll('input,select,[type=submit],[data-solo-setup]'))input.disabled=true;rules.querySelector('[data-rules-status]').textContent=game.state==='live'?'Match started. Settings are locked until the final buzzer.':`${game.hostName||'The host'} controls match setup.`;}}
      const board=basketballScoreboardState(game);
      scoreboard.querySelector('[data-home]').textContent=board.home;
      scoreboard.querySelector('[data-away]').textContent=board.away;
      scoreboard.querySelector('[data-clock]').textContent=board.gameClock;
      scoreboard.querySelector('[data-shot]').textContent=board.shotClock;
      scoreboard.querySelector('[data-period]').textContent=board.phase;
      scoreboard.dataset.state=game.state;scoreboard.dataset.possession=board.possession||'';
      const teamScores=scoreboard.querySelectorAll('.basketball-team-score');teamScores[0].classList.toggle('has-possession',board.possession==='home');teamScores[1].classList.toggle('has-possession',board.possession==='away');
      scoreboard.querySelector('[data-home]').setAttribute('aria-label',`Home score ${board.home}`);scoreboard.querySelector('[data-away]').setAttribute('aria-label',`Away score ${board.away}`);
      scoreboard.querySelector('[data-clock]').setAttribute('aria-label',`Game clock ${board.gameClock}`);scoreboard.querySelector('[data-shot]').setAttribute('aria-label',`Shot clock ${board.shotClock} seconds`);
      const periods=game.settings?.quarters||4;
      const start = root.querySelector('[data-basketball-action="basketball-start"]');
      start.hidden = game.state === 'live';
      start.textContent = game.state === 'finished' ? 'Host · start new match' : isHost()?`Start match · ${Object.values(players).filter(member=>!member.basketballAI&&member.basketballRole!=='spectator'&&member.basketballTeam).length} joined`:'Waiting for host';
      start.disabled=blocked(start);
      const lobby=basketballLobbySummary(game,players);
      const lobbyStatus=match.querySelector('[data-lobby-status]');
      const lobbyMessage=game.state==='live'?'Game in progress · open human spots can be joined; watch to spectate.':game.state==='finished'?`Final buzzer · join a team for the next match. ${game.hostName||'The host'} starts when players are ready.`:solo()?'Solo lobby ready · one human player with AI teammates and opponents. Press Start match when ready.':`${game.hostName?game.hostName+' is hosting':'Lobby open'} · waiting for players before tip-off. ${isHost()?'You start the match when everyone is here.':'Join a side and wait for the host to start.'}`;
      if(lobbyStatus.textContent!==lobbyMessage)lobbyStatus.textContent=lobbyMessage;
      for(const team of lobby){
        const heading=match.querySelector(`[data-lobby-${team.team}-count]`),roster=match.querySelector(`[data-lobby-${team.team}-roster]`);
        const count=`${team.label} · ${team.humans} / ${team.capacity} humans`;
        const names=`${team.names.join('\n')||'No players joined yet'}\n${team.open} human ${team.open===1?'spot':'spots'} open · ${team.aiAtTipoff} AI ${game.state==='live'?'playing':'at tip-off'}`;
        if(heading.textContent!==count)heading.textContent=count;if(roster.textContent!==names)roster.textContent=names;
        const button=root.querySelector(`[data-team="${team.team}"]`),selected=player?.basketballRole!=='spectator'&&player?.basketballTeam===team.team;
        button.setAttribute('aria-pressed',String(selected));button.hidden=game.state==='live'&&player?.basketballRole!=='spectator';button.dataset.basketballAction=game.state==='live'?'basketball-join-spot':'basketball-team';
        button.textContent=selected?`${team.label} · joined`:`Join ${team.label} · ${team.open} open`;
        button.disabled=blocked(button)||(!selected&&team.open===0);
      }
      const spectator=player?.basketballRole==='spectator';
      root.querySelector('[data-basketball-action="basketball-watch"]').setAttribute('aria-pressed',String(spectator));
      root.querySelector('[data-role]').textContent=spectator?(game.state==='live'?'WATCHING LIVE · STANDS & BENCHES ONLY · E TO SIT / STAND':'SPECTATOR · WATCH OR CHOOSE A SIDE'):`PLAYING ${player?.basketballTeam==='away'?'AWAY':'HOME'} · ${game.settings?.scoreLimit?`FIRST TO ${game.settings.scoreLimit} · WIN BY ${game.settings.winBy}`:`${periods} × ${game.settings?.quarterMinutes||12} MIN`}`;
      const audience=Object.values(players),watching=audience.filter(member=>member.basketballRole==='spectator').length;root.querySelector('[data-role]').textContent+=` · ${audience.filter(p=>!p.basketballAI&&p.basketballRole!=='spectator').length} HUMANS + ${audience.filter(p=>p.basketballAI).length} AI / ${watching} WATCHING`;
      const caption = root.querySelector('[data-play]'), play = game.lastPlay || 'Choose Home, Away or Watch. Game rules can be changed before tip-off.';
      if(caption.textContent!==play)caption.textContent=play;
      const nextScore = `${board.home}:${board.away}`;
      if (nextScore !== score) { scoreboard.classList.remove('basketball-scored'); void scoreboard.offsetWidth; scoreboard.classList.add('basketball-scored'); score = nextScore; }
    }
  };
}
