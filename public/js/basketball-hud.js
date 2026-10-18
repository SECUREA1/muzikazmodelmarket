const clock = milliseconds => {
  const seconds = Math.max(0, Math.ceil((milliseconds || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export function mountBasketballHud({ stage, onAction, announce = () => {} }) {
  const style = document.createElement('style');
  style.textContent = `
    .basketball-hud[hidden]{display:none!important}
    .basketball-hud{position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:24;width:min(520px,calc(100% - 28px));color:#f8f4eb;font-family:system-ui,sans-serif;pointer-events:none}
    .basketball-score-strip{display:grid;grid-template-columns:1fr 100px 1fr;background:#09101fed;border:1px solid #d8b27580;box-shadow:0 12px 40px #0007;border-radius:12px;overflow:hidden;text-align:center}
    .basketball-team-score{padding:10px 12px;border-top:3px solid #27b8ff;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .basketball-team-score:last-child{border-color:#ff5a46;flex-direction:row-reverse}
    .basketball-team-score span{font-size:11px;letter-spacing:2px;font-weight:800}.basketball-team-score strong{font-size:36px;line-height:1;font-variant-numeric:tabular-nums}
    .basketball-clock{padding:7px 4px;background:#141d2e;display:grid;gap:0}.basketball-clock b{font-size:23px;font-variant-numeric:tabular-nums;color:#ffdb94}.basketball-clock small{font-size:9px;letter-spacing:1px;color:#c0cbd9}
    .basketball-game-actions{pointer-events:auto;display:flex;justify-content:center;gap:5px;flex-wrap:wrap;margin:7px 0}
    .basketball-game-actions button[hidden],.house-stage .basketball-game-actions button[hidden]{display:none!important}
    .basketball-game-actions button{min-height:34px;border:1px solid #ffffff35;border-radius:7px;padding:6px 11px;font:bold 11px system-ui;background:#101b2eeb;color:white;cursor:pointer}
    .house-stage .basketball-game-actions button{width:auto!important;flex:0 0 auto!important;display:inline-flex!important;align-items:center;justify-content:center}
    .basketball-game-actions [data-basketball-action="basketball-start"]{background:#e9ba72;color:#172034;border-color:#ffe0ad}
    .basketball-game-actions button[aria-pressed="true"]{outline:2px solid #e9ba72;outline-offset:1px}
    .basketball-game-actions button:disabled{opacity:.5;cursor:default}
    .basketball-caption{margin:0 auto;max-width:440px;text-align:center;font-size:11px;line-height:1.4;text-shadow:0 1px 4px #000;background:#0a1222c9;border-radius:6px;padding:4px 8px}
    .basketball-world .rad-tox-hud{display:none!important}
    .basketball-world .basketball-controls{display:none!important}
    .basketball-world .rad-tox-reticle{border-color:#efc37c}
    .basketball-role{text-align:center;margin:5px 0 0;color:#ead2a4;font-size:10px;letter-spacing:1px}
    .basketball-rules{width:min(440px,calc(100vw - 32px));max-height:85vh;overflow:auto;border:1px solid #d8b275;border-radius:12px;padding:22px;background:#101b2e;color:#f8f4eb;font:14px system-ui}
    .basketball-rules::backdrop{background:#000a}.basketball-rules h2{margin:0 0 10px;color:#f8f4eb}.basketball-rules p{font-size:12px;line-height:1.5;color:#c0cbd9}
    .basketball-rules-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.basketball-rules label{display:grid;gap:5px;font-size:12px}.basketball-rules input{width:100%;box-sizing:border-box;padding:9px;border:1px solid #50617a;border-radius:6px;background:#08101e;color:white}
    .basketball-rules footer{display:flex;gap:8px;margin-top:18px}.basketball-rules button{width:auto!important;padding:9px 16px;border:1px solid #d8b275;border-radius:6px;background:#e9ba72;color:#172034;cursor:pointer}
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
  root.querySelector('.basketball-game-actions').insertAdjacentHTML('beforeend','<button type="button" data-basketball-action="basketball-watch" aria-pressed="false">Watch game</button><button type="button" data-basketball-rules>Game rules</button>');
  root.insertAdjacentHTML('beforeend','<p class="basketball-role" data-role></p>');
  stage.append(root);
  const rules = document.createElement('dialog');rules.className='basketball-rules';rules.setAttribute('aria-labelledby','basketball-rules-title');
  rules.innerHTML='<form><h2 id="basketball-rules-title">Basketball game rules</h2><p>Set the rules before tip-off. Everyone in this server plays the same match. Late arrivals watch the live game and can choose a side for the next one.</p><div class="basketball-rules-fields"><label>Minutes per period<input type="number" name="quarterMinutes" min="1" max="12" step="1" required></label><label>Number of periods<input type="number" name="quarters" min="1" max="4" step="1" required></label><label>Shot clock (seconds)<input type="number" name="shotClockSeconds" min="5" max="60" step="1" required></label><label>Score to win (0 = timed)<input type="number" name="scoreLimit" min="0" max="200" step="1" required></label><label>Win by points<input type="number" name="winBy" min="1" max="10" step="1" required></label></div><p data-rules-status role="status"></p><footer><button type="submit" data-save-rules>Save rules</button><button type="button" data-close-rules>Back to court</button></footer></form>';
  stage.append(rules);
  let score = '0:0', ready = false, currentGame = null, currentPlayer = null;
  const defaults={quarterMinutes:12,quarters:4,shotClockSeconds:24,scoreLimit:0,winBy:1};
  root.querySelector('[data-basketball-rules]').addEventListener('click',()=>{
    document.exitPointerLock?.();
    for(const [key,value] of Object.entries({...defaults,...currentGame?.settings})){const input=rules.querySelector(`[name="${key}"]`);if(input){input.value=value;input.disabled=currentGame?.state==='live';}}
    rules.querySelector('[data-save-rules]').disabled=currentGame?.state==='live';
    rules.querySelector('[data-rules-status]').textContent=currentGame?.state==='live'?'These rules are locked until the final buzzer.':'Save the settings, choose Home or Away, then start the game.';
    rules.showModal();
  });
  rules.querySelector('[data-close-rules]').onclick=()=>rules.close();
  rules.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();if(currentGame?.state==='live')return;
    const button=rules.querySelector('[data-save-rules]');button.disabled=true;
    try{const settings=Object.fromEntries(Object.keys(defaults).map(key=>[key,Number(rules.querySelector(`[name="${key}"]`).value)]));const result=await onAction('basketball-settings',{settings});if(result!==false)rules.close();}
    catch(error){rules.querySelector('[data-rules-status]').textContent=error.message;}
    finally{button.disabled=currentGame?.state==='live';}
  });
  const blocked=button=>!ready||pending.has(button)||(currentPlayer?.basketballRole==='spectator'&&['catch','toss','basketball-shoot','basketball-start'].includes(button.dataset.basketballAction));
  const pending = new Set();
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-basketball-action]');
    if (!button || button.disabled) return;
    event.stopPropagation();
    pending.add(button);button.disabled = true;
    try { await onAction(button.dataset.basketballAction, button.dataset.team ? { team: button.dataset.team } : {}); }
    catch (error) { announce(error.message); }
    finally { pending.delete(button);button.disabled = blocked(button); }
  });
  return {
    render(game, player, enabled) {
      root.hidden = !enabled;
      stage.classList.toggle('basketball-world', Boolean(enabled));
      ready = Boolean(player);
      currentGame=game;currentPlayer=player;
      for(const button of root.querySelectorAll('button'))button.disabled=blocked(button);
      if(!enabled&&rules.open)rules.close();
      if (!enabled || !game) return;
      root.querySelector('[data-home]').textContent = game.homeScore || 0;
      root.querySelector('[data-away]').textContent = game.awayScore || 0;
      root.querySelector('[data-clock]').textContent = clock(game.clockMs);
      root.querySelector('[data-shot]').textContent = Math.ceil(Math.max(0,game.shotClockMs || 0)/1000);
      const periods=game.settings?.quarters||4;
      root.querySelector('[data-period]').textContent = game.state === 'ready' ? 'PRE GAME' : game.state === 'finished' ? 'FINAL' : game.quarter > periods ? `OT ${game.quarter-periods}` : `PERIOD ${game.quarter}`;
      const start = root.querySelector('[data-basketball-action="basketball-start"]');
      start.hidden = game.state === 'live';
      start.textContent = game.state === 'finished' ? 'Start new game' : 'Start game';
      for (const button of root.querySelectorAll('[data-team]')) {button.setAttribute('aria-pressed', String(player?.basketballRole!=='spectator'&&player?.basketballTeam === button.dataset.team));button.hidden=game.state==='live';}
      const spectator=player?.basketballRole==='spectator';
      root.querySelector('[data-basketball-action="basketball-watch"]').setAttribute('aria-pressed',String(spectator));
      root.querySelector('[data-role]').textContent=spectator?(game.state==='live'?'WATCHING LIVE · CHOOSE A SIDE NEXT GAME':'SPECTATOR · WATCH OR CHOOSE A SIDE'):`PLAYING ${player?.basketballTeam==='away'?'AWAY':'HOME'} · ${game.settings?.scoreLimit?`FIRST TO ${game.settings.scoreLimit} · WIN BY ${game.settings.winBy}`:`${periods} × ${game.settings?.quarterMinutes||12} MIN`}`;
      const caption = root.querySelector('[data-play]'), play = game.lastPlay || 'Choose Home, Away or Watch. Game rules can be changed before tip-off.';
      if(caption.textContent!==play)caption.textContent=play;
      const nextScore = `${game.homeScore}:${game.awayScore}`;
      if (nextScore !== score) { root.classList.remove('basketball-scored'); void root.offsetWidth; root.classList.add('basketball-scored'); score = nextScore; }
    }
  };
}
