const clock = milliseconds => {
  const seconds = Math.max(0, Math.ceil((milliseconds || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export function mountBasketballHud({ stage, onAction, announce = () => {} }) {
  const style = document.createElement('style');
  style.textContent = `
    .basketball-match-toggle{pointer-events:auto;min-height:48px;background:#142305;color:#c4ff5b;border:1px solid #91ba42;border-radius:8px;margin:6px auto;display:block;padding:6px 12px;font-weight:bold}.basketball-match-menu{pointer-events:auto}.basketball-match-menu .basketball-game-actions{display:flex!important}.basketball-match-menu::backdrop{background:#000b}\n    .basketball-hud[hidden]{display:none!important}
    .basketball-hud{position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:24;width:min(520px,calc(100% - 28px));color:#f8f4eb;font-family:system-ui,sans-serif;pointer-events:none}
    .basketball-score-strip{display:grid;grid-template-columns:1fr 100px 1fr;background:#09101fed;border:1px solid #d8b27580;box-shadow:0 12px 40px #0007;border-radius:12px;overflow:hidden;text-align:center}
    .basketball-team-score{padding:10px 12px;border-top:3px solid #27b8ff;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .basketball-team-score:last-child{border-color:#ff5a46;flex-direction:row-reverse}
    .basketball-team-score span{font-size:11px;letter-spacing:2px;font-weight:800}.basketball-team-score strong{font-size:36px;line-height:1;font-variant-numeric:tabular-nums}
    .basketball-clock{padding:7px 4px;background:#141d2e;display:grid;gap:0}.basketball-clock b{font-size:23px;font-variant-numeric:tabular-nums;color:#ffdb94}.basketball-clock small{font-size:9px;letter-spacing:1px;color:#c0cbd9}
    .basketball-game-actions{pointer-events:auto;display:flex;justify-content:center;gap:5px;flex-wrap:wrap;margin:7px 0}
    .basketball-game-actions button[hidden],.house-stage .basketball-game-actions button[hidden]{display:none!important}
    .basketball-game-actions button{min-height:48px;min-width:64px;touch-action:manipulation;border:1px solid #ffffff35;border-radius:7px;padding:6px 11px;font:bold 11px system-ui;background:#101b2eeb;color:white;cursor:pointer}
    .house-stage .basketball-game-actions button{width:auto!important;flex:0 0 auto!important;display:inline-flex!important;align-items:center;justify-content:center}
    .basketball-game-actions [data-basketball-action="basketball-start"]{background:#e9ba72;color:#172034;border-color:#ffe0ad}
    .basketball-game-actions button[aria-pressed="true"]{outline:2px solid #e9ba72;outline-offset:1px}
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
    .basketball-scored .basketball-score-strip{animation:basketball-score-flash .7s ease-out}
    @keyframes basketball-score-flash{0%{box-shadow:0 0 50px #ffd47fbd;transform:scale(1.035)}100%{box-shadow:0 12px 40px #0007;transform:scale(1)}}
    @media(max-width:600px){.basketball-hud{top:8px;width:calc(100% - 16px)}.basketball-team-score{padding:7px 9px}.basketball-team-score strong{font-size:28px}.basketball-score-strip{grid-template-columns:1fr 86px 1fr}.basketball-game-actions{gap:4px}.basketball-game-actions button{padding:6px 8px;font-size:10px}.basketball-caption{font-size:10px}}
    @media(prefers-reduced-motion:reduce){.basketball-scored .basketball-score-strip{animation:none}}
  `;
  document.head.append(style);
  const root = document.createElement('section');
  root.className = 'basketball-hud';
  root.hidden = true;
  root.setAttribute('aria-label', 'Basketball game scoreboard and controls');
  root.innerHTML = `<div class="basketball-score-strip"><div class="basketball-team-score"><span>HOME</span><strong data-home>0</strong></div><div class="basketball-clock"><small data-period>PRE GAME</small><b data-clock>12:00</b><small>SHOT <span data-shot>24</span></small></div><div class="basketball-team-score"><span>AWAY</span><strong data-away>0</strong></div></div><div class="basketball-game-actions"><button type="button" data-basketball-action="basketball-start">Start game</button><button type="button" data-basketball-action="basketball-team" data-team="home" aria-pressed="false">Join Home</button><button type="button" data-basketball-action="basketball-team" data-team="away" aria-pressed="false">Join Away</button><button type="button" data-basketball-action="catch">Catch · E</button><button type="button" data-basketball-action="basketball-shoot">Shoot · R</button><button type="button" data-basketball-action="toss">Pass · T</button></div><p class="basketball-caption" role="status" aria-live="polite" data-play>Choose a team and start a game. Everyone can join.</p>`;
  root.querySelector('.basketball-game-actions').insertAdjacentHTML('beforeend','<button type="button" data-basketball-action="basketball-watch" aria-pressed="false">Watch game</button><button type="button" data-basketball-rules>Match setup</button>');
  root.insertAdjacentHTML('beforeend','<p class="basketball-role" data-role></p>');
  root.querySelector('.basketball-game-actions').insertAdjacentHTML('beforeend','<button type="button" data-basketball-action="basketball-steal">Steal · Q</button>');
  const actions=root.querySelector('.basketball-game-actions');
  actions.setAttribute('role','group');actions.setAttribute('aria-label','Basketball actions');
  const match=document.createElement('dialog');match.className='basketball-rules basketball-match-menu';match.setAttribute('aria-label','Basketball match and players');
  match.innerHTML='<h2>Basketball match</h2><label>World mode<select data-basketball-world-mode><option value="solo">Solo vs AI</option><option value="multiplayer">Live multiplayer · players and AI</option></select></label><button type="button" data-open-world>Open selected mode</button><p>Join Home or Away to take an available player spot. Watch game leaves your spot for another player or AI.</p><button type="button" data-close-match>Return to court</button>';
  const mode=match.querySelector('[data-basketball-world-mode]');mode.value=new URL(location.href).searchParams.get('mode')==='solo'?'solo':'multiplayer';
  match.querySelector('[data-open-world]').onclick=()=>{const url=new URL(location.href);url.searchParams.set('mode',mode.value);url.searchParams.set('autoplay','1');location.assign(url.href);};
  match.querySelector('[data-close-match]').onclick=()=>match.close();
  const matchButton=document.createElement('button');matchButton.type='button';matchButton.className='basketball-match-toggle';matchButton.textContent='Match · join / watch / start';matchButton.onclick=()=>{document.exitPointerLock?.();match.showModal();};actions.after(matchButton);root.append(match);
  match.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();match.close();}});
  stage.append(root);
  const rules = document.createElement('dialog');rules.className='basketball-rules';rules.setAttribute('aria-labelledby','basketball-rules-title');
  rules.innerHTML='<form><h2 id="basketball-rules-title">Quick match tuner</h2><p>Choose team size, human players and AI difficulty, then start. Both teams stay equal; AI fills every empty spot at tip-off.</p><button type="button" data-solo-setup>Solo vs AI</button><div class="basketball-rules-fields"><label>Players per team<select name="teamSize"><option value="1">1 vs 1</option><option value="2">2 vs 2</option><option value="3">3 vs 3</option><option value="4">4 vs 4</option><option value="5">5 vs 5</option></select></label><label>AI difficulty<select name="aiDifficulty"><option value="1">Tier 1 · Rookie</option><option value="2">Tier 2 · Amateur</option><option value="3">Tier 3 · Pro</option><option value="4">Tier 4 · All-Star</option><option value="5">Tier 5 · Legend</option></select></label><label>Home human slots<input name="homeHumans" type="number" min="0" max="5" step="1" required></label><label>Away human slots<input name="awayHumans" type="number" min="0" max="5" step="1" required></label></div><details><summary>Competition rules · timing &amp; scoring</summary><div class="basketball-rules-fields"><label>Minutes per period<input type="number" name="quarterMinutes" min="1" max="12" step="1" required></label><label>Number of periods<input type="number" name="quarters" min="1" max="4" step="1" required></label><label>Shot clock (seconds)<input type="number" name="shotClockSeconds" min="5" max="60" step="1" required></label><label>Score to win (0 = timed)<input type="number" name="scoreLimit" min="0" max="200" step="1" required></label><label>Win by points<input type="number" name="winBy" min="1" max="10" step="1" required></label></div></details><p data-roster-preview role="status" aria-live="polite"></p><p>Playing with friends? Save to lobby, let everyone join Home or Away, then start. AI wears numbered team jerseys. Late arrivals watch until the next game.</p><p data-rules-status role="status"></p><footer><button type="submit" name="start" value="true" data-start-match>Start game</button><button type="submit" name="save" data-save-rules>Save to lobby</button><button type="button" data-close-rules>Back to court</button></footer></form>';
  stage.append(rules);
  let score = '0:0', ready = false, currentGame = null, currentPlayer = null, currentPlayers = {};
  let savingSetup=false;
  const defaults={quarterMinutes:12,quarters:4,shotClockSeconds:24,scoreLimit:0,winBy:1,teamSize:5,homeHumans:5,awayHumans:5,aiDifficulty:3};
  function previewRoster(){const size=Number(rules.querySelector('[name=teamSize]').value);for(const name of ['homeHumans','awayHumans']){const input=rules.querySelector(`[name=${name}]`);input.max=size;}const members=Object.values(currentPlayers).filter(p=>!p.basketballAI&&p.basketballRole!=='spectator');rules.querySelector('[data-roster-preview]').textContent=['home','away'].map(team=>{const count=members.filter(p=>p.basketballTeam===team).length;const slots=Number(rules.querySelector(`[name=${team}Humans]`).value);return `${team==='home'?'Home':'Away'}: ${slots} human slots + ${Math.max(0,size-slots)} AI · ${count} joined · ${Math.max(0,size-count)} AI at tip-off`;}).join('\n');}
  rules.addEventListener('input',event=>{if(event.target.name==='teamSize'){for(const name of ['homeHumans','awayHumans']){const input=rules.querySelector(`[name=${name}]`);input.value=Math.min(Number(input.value),Number(event.target.value));}}previewRoster();});
  const openSetup=()=>{match.close();
    document.exitPointerLock?.();
    for(const [key,value] of Object.entries({...defaults,...currentGame?.settings})){const input=rules.querySelector(`[name="${key}"]`);if(input){input.value=value;input.disabled=currentGame?.state==='live';}}
    for(const button of rules.querySelectorAll('[type=submit],[data-solo-setup]'))button.disabled=currentGame?.state==='live'||savingSetup;
    rules.querySelector('[data-rules-status]').textContent=currentGame?.state==='live'?'These rules are locked until the final buzzer.':'Solo vs AI sets one human slot on your side. Adjust the difficulty to suit your game.';
    previewRoster();if(!rules.open)rules.showModal();
  };
  root.querySelector('[data-basketball-rules]').addEventListener('click',openSetup);
  rules.querySelector('[data-solo-setup]').onclick=()=>{if(currentGame?.state==='live')return;const team=currentPlayer?.basketballTeam||'home';for(const side of ['home','away'])rules.querySelector(`[name=${side}Humans]`).value=side===team?1:0;previewRoster();};
  rules.querySelector('[data-close-rules]').onclick=()=>rules.close();
  rules.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();if(currentGame?.state==='live'||savingSetup)return;
    const startNow=event.submitter?.name!=='save';
    savingSetup=true;
    for(const button of rules.querySelectorAll('[type=submit],[data-solo-setup]'))button.disabled=true;
    const status=rules.querySelector('[data-rules-status]');status.textContent=startNow?'Saving setup and starting…':'Saving lobby setup…';
    try{
      const settings=Object.fromEntries(Object.keys(defaults).map(key=>[key,Number(rules.querySelector(`[name="${key}"]`).value)]));
      const result=await onAction('basketball-settings',{settings});
      if(result===false){status.textContent='Setup could not be saved. Check the team slots and try again.';return;}
      if(startNow){const started=await onAction('basketball-start',{});if(started===false){status.textContent='Game could not start. Choose a team and try again.';return;}}
      rules.close();
    }catch(error){status.textContent=error.message;}
    finally{savingSetup=false;for(const button of rules.querySelectorAll('[type=submit],[data-solo-setup]'))button.disabled=currentGame?.state==='live';}
  });
  const blocked=button=>!ready||pending.has(button)||(currentPlayer?.basketballRole==='spectator'&&['catch','toss','basketball-shoot','basketball-steal','basketball-start'].includes(button.dataset.basketballAction));
  const pending = new Set();
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-basketball-action]');
    if (!button || button.disabled) return;
    event.stopPropagation();
    if(button.dataset.basketballAction==='basketball-start'){openSetup();return;}
    pending.add(button);button.disabled = true;
    try { await onAction(button.dataset.basketballAction, button.dataset.team ? { team: button.dataset.team } : {}); }
    catch (error) { announce(error.message); }
    finally { pending.delete(button);button.disabled = blocked(button); }
  });
  return {
    render(game, player, enabled, players={}) {
      root.hidden = !enabled;
      stage.classList.toggle('basketball-world', Boolean(enabled));
      ready = Boolean(player);
      currentGame=game;currentPlayer=player;currentPlayers=players;
      for(const button of root.querySelectorAll('button'))button.disabled=blocked(button);
      if(!enabled&&rules.open)rules.close();
      if (!enabled || !game) return;
      if(rules.open){previewRoster();if(game.state==='live'){for(const input of rules.querySelectorAll('input,select,[type=submit],[data-solo-setup]'))input.disabled=true;rules.querySelector('[data-rules-status]').textContent='Match started. Settings are locked until the final buzzer.';}}
      root.querySelector('[data-home]').textContent = game.homeScore || 0;
      root.querySelector('[data-away]').textContent = game.awayScore || 0;
      root.querySelector('[data-clock]').textContent = clock(game.clockMs);
      root.querySelector('[data-shot]').textContent = Math.ceil(Math.max(0,game.shotClockMs || 0)/1000);
      const periods=game.settings?.quarters||4;
      root.querySelector('[data-period]').textContent = game.state === 'ready' ? 'PRE GAME' : game.state === 'finished' ? 'FINAL' : game.quarter > periods ? `OT ${game.quarter-periods}` : `PERIOD ${game.quarter}`;
      const start = root.querySelector('[data-basketball-action="basketball-start"]');
      start.hidden = game.state === 'live';
      start.textContent = game.state === 'finished' ? 'Start new game' : 'Start game';
      for (const button of root.querySelectorAll('[data-team]')) {button.setAttribute('aria-pressed', String(player?.basketballRole!=='spectator'&&player?.basketballTeam === button.dataset.team));button.hidden=game.state==='live'&&player?.basketballRole!=='spectator';button.dataset.basketballAction=game.state==='live'?'basketball-join-spot':'basketball-team';}
      const spectator=player?.basketballRole==='spectator';
      root.querySelector('[data-basketball-action="basketball-watch"]').setAttribute('aria-pressed',String(spectator));
      root.querySelector('[data-role]').textContent=spectator?(game.state==='live'?'WATCHING LIVE · STANDS & BENCHES ONLY · E TO SIT / STAND':'SPECTATOR · WATCH OR CHOOSE A SIDE'):`PLAYING ${player?.basketballTeam==='away'?'AWAY':'HOME'} · ${game.settings?.scoreLimit?`FIRST TO ${game.settings.scoreLimit} · WIN BY ${game.settings.winBy}`:`${periods} × ${game.settings?.quarterMinutes||12} MIN`}`;
      const audience=Object.values(players),watching=audience.filter(member=>member.basketballRole==='spectator').length;root.querySelector('[data-role]').textContent+=` · ${audience.filter(p=>!p.basketballAI&&p.basketballRole!=='spectator').length} HUMANS + ${audience.filter(p=>p.basketballAI).length} AI / ${watching} WATCHING`;
      const caption = root.querySelector('[data-play]'), play = game.lastPlay || 'Choose Home, Away or Watch. Game rules can be changed before tip-off.';
      if(caption.textContent!==play)caption.textContent=play;
      const nextScore = `${game.homeScore}:${game.awayScore}`;
      if (nextScore !== score) { root.classList.remove('basketball-scored'); void root.offsetWidth; root.classList.add('basketball-scored'); score = nextScore; }
    }
  };
}
