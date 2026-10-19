const clock = milliseconds => {
  const seconds = Math.max(0, Math.ceil((milliseconds || 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export function mountBasketballHud({ stage, onAction, onPrimaryAction = () => onAction('basketball-auto', {}), onTriggerMode = () => {}, onOpenAim = () => {}, onOpen = () => {}, announce = () => {} }) {
  const style = document.createElement('style');
  style.textContent = `
    .basketball-match-menu{pointer-events:auto}.basketball-match-menu .basketball-game-actions{display:flex!important}.basketball-match-menu::backdrop{background:#000b}\n    .basketball-hud[hidden]{display:none!important}

    .basketball-hud{position:absolute;bottom:max(10px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:24;box-sizing:border-box;width:min(560px,calc(100% - 20px));padding:8px;border:1px solid #7c8fa3;border-radius:15px;background:#101e2dee;color:#f8f4eb;font-family:system-ui,sans-serif;pointer-events:auto;box-shadow:0 8px 30px #0005}
    .basketball-game-actions{pointer-events:auto;display:flex;justify-content:center;gap:5px;flex-wrap:wrap;margin:7px 0}
    .basketball-game-actions button[hidden],.house-stage .basketball-game-actions button[hidden]{display:none!important}
    .basketball-game-actions button{min-height:34px;border:1px solid #ffffff35;border-radius:7px;padding:6px 11px;font:bold 11px system-ui;background:#101b2eeb;color:white;cursor:pointer}
    .house-stage .basketball-game-actions button{width:auto!important;flex:0 0 auto!important;display:inline-flex!important;align-items:center;justify-content:center}
    .basketball-game-actions [data-basketball-action="basketball-start"]{background:#e9ba72;color:#172034;border-color:#ffe0ad}
    .basketball-game-actions button[aria-pressed="true"]{outline:2px solid #e9ba72;outline-offset:1px}
    .basketball-game-actions button:disabled{opacity:.5;cursor:default}
    .basketball-world .rad-tox-hud{display:none!important}
    .basketball-world .basketball-controls,.basketball-world>.builder-nearby-action{display:none!important}
    .basketball-world .game-live-connection{top:8px;right:8px;bottom:auto;left:auto;max-width:48%;font-size:9px;opacity:.8}
    .basketball-world .house-status{top:46px;bottom:auto;left:12px;right:12px;max-height:2.6em;overflow:hidden;font:11px/1.3 system-ui;padding:5px 9px;pointer-events:none}
    .basketball-world .rad-tox-reticle{border-color:#efc37c}
    .basketball-rules{box-sizing:border-box;width:min(520px,calc(100vw - 24px));max-height:85vh;overflow:auto;border:1px solid #d8b275;border-radius:12px;padding:22px;background:#101b2e;color:#f8f4eb;font:14px system-ui}
    .basketball-rules::backdrop{background:#000a}.basketball-rules h2{margin:0 0 10px;color:#f8f4eb}.basketball-rules p{font-size:12px;line-height:1.5;color:#c0cbd9}
    .basketball-rules-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.basketball-rules label{display:grid;gap:5px;font-size:12px}.basketball-rules input,.basketball-rules select{width:100%;box-sizing:border-box;min-height:44px;padding:9px;border:1px solid #50617a;border-radius:6px;background:#08101e;color:white}
    .basketball-rules details{margin-top:16px}.basketball-rules summary{cursor:pointer;padding:10px 0;color:#ead2a4}.basketball-rules [data-roster-preview]{padding:12px;border-radius:8px;background:#08101e;white-space:pre-line}.basketball-rules button{min-height:44px}.basketball-rules footer{flex-wrap:wrap;display:flex;gap:8px;margin-top:18px}.basketball-rules button{width:auto!important;padding:9px 16px;border:1px solid #d8b275;border-radius:6px;background:#e9ba72;color:#172034;cursor:pointer}
    .basketball-match-menu{width:min(620px,calc(100vw - 24px));max-height:90dvh;padding:25px;border:1px solid #bda174;border-radius:20px;background:radial-gradient(ellipse at top right,#af75301c,transparent 60%),#101b2b;box-shadow:0 24px 100px #0009}.basketball-lobby-header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:20px}.basketball-lobby-header small,.basketball-setup-eyebrow{font-size:9px;letter-spacing:.16em;font-weight:800;color:#d5ad70}.basketball-lobby-header h2{font-size:29px;line-height:1.15;letter-spacing:-.03em;margin:7px 0 8px}.basketball-lobby-header p{margin:0}.basketball-rules .basketball-lobby-header button{flex:0 0 38px;min-height:38px;padding:0;background:#1e2d41;color:#f6d5a1;font-size:24px;border:1px solid #5b6580;border-radius:10px}.basketball-lobby-section{padding:16px;border:1px solid #4c5a7055;border-radius:12px;background:#0a142155;margin-bottom:12px}.basketball-lobby-section h3{display:flex;align-items:center;gap:9px;margin:0 0 14px;font-size:14px;color:#f8e6ca}.basketball-lobby-section h3>span{display:grid;place-items:center;width:22px;height:22px;border:1px solid #b28d54;border-radius:50%;color:#e8c38a;font-size:10px}.basketball-lobby-section p{font-size:11px;margin:11px 0 0;color:#9fb1c6}.basketball-mode-row{display:flex;align-items:end;gap:9px}.basketball-mode-row label{flex:1;min-width:0}.basketball-rules .basketball-mode-row button{background:#26364d;border-color:#7c8ba0;color:#e6edf8;padding:10px;font-size:11px;white-space:nowrap}.basketball-rules .basketball-mode-row select{font-size:12px}.basketball-match-menu .basketball-game-actions.basketball-lobby-actions{display:block!important;margin:0}.basketball-team-choices,.basketball-start-choices,[data-court-actions]{display:flex;flex-wrap:wrap;gap:8px}.basketball-match-menu .basketball-team-choices button{min-height:44px;flex:1!important;font-size:12px;padding:10px!important;border:1px solid #496d93;border-radius:9px;background:#163650;color:#dcf1ff}.basketball-match-menu .basketball-team-choices [data-team=away]{background:#492d2e;border-color:#8d5956;color:#ffe0d8}.basketball-match-menu .basketball-team-choices [data-basketball-action=basketball-watch]{background:#202d3d;border-color:#5c6a7e;color:#becbdd}.basketball-match-menu .basketball-team-choices button[aria-pressed=true]{outline:2px solid #f1c47e;outline-offset:2px}.basketball-match-menu .basketball-start-choices button{min-height:44px;padding:10px 16px;font-size:12px;flex:1!important}.basketball-match-menu [data-basketball-rules]{background:#202e41;color:#dfd5c4;border-color:#7b715e}.basketball-manual-actions{margin-top:0!important;padding:0 4px}.basketball-manual-actions summary{font-size:11px;padding:8px 0!important;color:#a9bdd1!important}[data-court-actions]{padding:7px 0}.basketball-match-menu [data-court-actions] button{background:#1c2c41;color:#d3e0ef;border-color:#415671;font-size:10px}.basketball-match-menu .basketball-lobby-tip{font-size:11px;color:#95a8bd;padding:0 3px}.basketball-rules [data-return-court]{width:100%!important;background:transparent;color:#dfd2bd;border-color:#666351}.basketball-rules button:focus-visible,.basketball-rules summary:focus-visible{outline:3px solid #ffdfac;outline-offset:3px}.basketball-rules [data-solo-setup]{margin:0 0 18px;background:#1f344c;color:#e8dbbf;border-color:#6a7890}.basketball-rules [data-close-rules],.basketball-rules [data-save-rules]{background:#1e2d41;color:#d7e0ed;border-color:#566982}.basketball-rules [data-rules-status]{color:#ffdb9c}.basketball-rules label{color:#b5c6d9}.basketball-rules [data-roster-preview]{border:1px solid #4d5e74;line-height:1.9;color:#d8e3ee;font-size:11px}
    .basketball-scored .basketball-score-strip{animation:basketball-score-flash .7s ease-out}
    @keyframes basketball-score-flash{0%{box-shadow:0 0 50px #ffd47fbd;transform:scale(1.035)}100%{box-shadow:0 12px 40px #0007;transform:scale(1)}}
    @media(max-width:480px){.basketball-match-menu{padding:17px}.basketball-lobby-header h2{font-size:25px}.basketball-lobby-section{padding:12px}.basketball-mode-row{align-items:stretch;flex-direction:column}.basketball-rules .basketball-mode-row button{width:100%!important}.basketball-team-choices{gap:7px}.basketball-match-menu .basketball-team-choices [data-basketball-action=basketball-watch]{flex-basis:100%!important}.basketball-rules-fields{gap:9px}.basketball-rules footer button{flex:1}}

    /* The score, action choices and primary trigger share one dock. */
    .basketball-hud .basketball-score-strip{display:flex;align-items:center;justify-content:center;gap:12px;min-height:28px;margin-bottom:6px;border:0;border-radius:0;background:none;box-shadow:none;overflow:visible}
    .basketball-hud .basketball-team-score,.basketball-hud .basketball-team-score:last-child{display:flex;flex-direction:row;gap:6px;padding:0;border:0}.basketball-hud .basketball-team-score:last-child{flex-direction:row-reverse}.basketball-hud .basketball-team-score span{font-size:9px;letter-spacing:.1em}.basketball-hud .basketball-team-score strong{font-size:21px;line-height:1;font-variant-numeric:tabular-nums}
    .basketball-hud .basketball-clock{display:flex;align-items:center;gap:7px;padding:0;background:none}.basketball-hud .basketball-clock b{font-size:17px;color:#ffdc9a;font-variant-numeric:tabular-nums}.basketball-hud .basketball-clock small{font-size:8px;letter-spacing:.05em}
    .basketball-action-choices{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px}.basketball-hud .basketball-action-choice{display:grid!important;place-items:center;gap:3px;box-sizing:border-box;width:100%!important;min-width:0;min-height:56px;margin:0;padding:6px 2px;border:1px solid #53657a;border-radius:9px;background:#152438;color:#dce6f2;font:11px/1.15 system-ui;cursor:pointer;touch-action:manipulation}.basketball-action-choice svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.basketball-hud .basketball-action-choice[aria-pressed=true]{background:#c4f46e;color:#172b14;border-color:#d6ff9b;box-shadow:0 0 0 1px #d6ff9b33}.basketball-hud .basketball-action-choice:disabled{opacity:.45}
    .basketball-dock-footer{display:grid;grid-template-columns:minmax(0,1fr) repeat(3,44px);gap:5px;margin-top:7px}.basketball-hud .basketball-dock-footer button{display:flex!important;align-items:center;justify-content:center;box-sizing:border-box;width:100%!important;min-width:0;min-height:44px;margin:0;padding:6px;border:1px solid #52657b;border-radius:9px;background:#152438;color:#e6d6ab;font:700 11px/1.2 system-ui;cursor:pointer;touch-action:manipulation}.basketball-hud .basketball-dock-footer .basketball-primary-action{justify-content:flex-start;gap:7px;padding:8px;text-align:left}.basketball-primary-action>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.basketball-dock-footer svg{flex:0 0 21px;width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.basketball-dock-footer button:disabled{opacity:.45}.basketball-dock-footer button:focus-visible,.basketball-action-choice:focus-visible{outline:3px solid #ffdc9a;outline-offset:2px}
    .basketball-hud[data-collapsed=true] .basketball-action-choices{display:none}.basketball-hud[data-collapsed=true] .basketball-dock-footer{margin-top:0}.basketball-hud[data-collapsed=true] [data-basketball-collapse] svg{transform:rotate(180deg)}
    .house-stage .basketball-hud>.builder-nearby-action{position:static!important;inset:auto!important;transform:none!important;display:grid!important;box-sizing:border-box;width:100%!important;min-width:0!important;max-width:100%!important;min-height:44px!important;margin:7px 0 0!important;padding:6px 10px!important;grid-template-columns:20px minmax(0,1fr)!important;border-radius:9px!important;pointer-events:auto;white-space:normal;text-align:left}.house-stage .basketball-hud>.builder-nearby-action[hidden]{display:none!important}.basketball-hud>.builder-nearby-action strong{font-size:11px!important}.basketball-hud>.builder-nearby-action small{font-size:9px!important}
    .basketball-hud .basketball-caption,.basketball-hud .basketball-role{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    @media(max-width:600px){.basketball-hud{top:auto;bottom:max(8px,env(safe-area-inset-bottom));width:calc(100% - 16px);padding:7px}.basketball-hud .basketball-score-strip{gap:8px}.basketball-hud .basketball-clock{gap:5px}.basketball-hud .basketball-team-score span{font-size:8px}.basketball-hud .basketball-clock small{font-size:7px}.basketball-hud .basketball-action-choice{font-size:10px;min-height:52px}.basketball-dock-footer{grid-template-columns:minmax(0,1fr) repeat(3,42px);gap:4px}}
    @media(max-width:350px){.basketball-hud .basketball-score-strip{gap:5px}.basketball-hud .basketball-team-score{gap:3px}.basketball-hud .basketball-clock{gap:3px}.basketball-hud .basketball-team-score strong{font-size:18px}.basketball-hud .basketball-clock b{font-size:15px}.basketball-dock-footer{grid-template-columns:minmax(0,1fr) repeat(3,38px)}.basketball-action-choices{gap:3px}}

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
  const icon = paths => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  const icons = {
    auto:'<circle cx="12" cy="12" r="5"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
    shoot:'<path d="M12 17V3m-5 5 5-5 5 5M5 15v6h14v-6"/>',
    pass:'<path d="M3 12h17m-6-6 6 6-6 6"/>',
    toss:'<path d="M4 19C5 7 11 4 20 6m-4-3 4 3-4 3"/>',
    catch:'<path d="M5 12V8a1.5 1.5 0 0 1 3 0v4-7a1.5 1.5 0 0 1 3 0v7-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7l2-3a1.5 1.5 0 0 1 2 2l-4 6c-3 4-10 3-11-1l-3-5a1.5 1.5 0 0 1 2-2l2 2"/>',
    steal:'<path d="m4 20 6-6m-6 0h6v6M13 11l7-7m-6 0h6v6"/>',
    lobby:'<path d="M8 3h8v6a4 4 0 0 1-8 0V3m0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v7m-4 1h8"/>',
    aim:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
    collapse:'<path d="m6 15 6-6 6 6"/>',
    play:'<path d="m7 4 13 8-13 8z"/>'
  };
  const trigger = document.createElement('div');
  trigger.className = 'basketball-action-choices';
  trigger.id = 'basketball-action-choices';
  trigger.setAttribute('role', 'group');
  trigger.setAttribute('aria-label', 'Basketball trigger action');
  trigger.innerHTML = ['auto','shoot','pass','toss','catch','steal'].map(mode => `<button type="button" class="basketball-action-choice" data-basketball-trigger-mode="${mode}" aria-pressed="${mode==='auto'}" aria-label="${mode==='auto'?'Auto: choose the best available basketball action':`Force ${mode}${mode==='catch'?' or pick up':''}`}" title="${mode==='auto'?'Automatically grab, steal, shoot, pass or toss':`Keep ${mode} selected until you choose another action`}">${icon(icons[mode])}<span>${mode[0].toUpperCase()+mode.slice(1)}</span></button>`).join('');
  let triggerMode = 'auto', primaryPending = false;
  const selectMode = mode => {
    triggerMode = mode;
    for (const button of trigger.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.basketballTriggerMode === mode));
  };
  trigger.addEventListener('click', event => {
    const button = event.target.closest('[data-basketball-trigger-mode]');
    if (!button || button.disabled || !enabled || stage.querySelector('dialog[open]')) return;
    selectMode(button.dataset.basketballTriggerMode);
    onTriggerMode(triggerMode);
  });
  root.append(trigger);
  const dockFooter = document.createElement('div');
  dockFooter.className = 'basketball-dock-footer';
  dockFooter.innerHTML = `<button type="button" class="basketball-primary-action" data-basketball-primary aria-label="Use selected basketball action">${icon(icons.play)}<span data-trigger-action>Auto · ready for play</span></button><button type="button" data-basketball-lobby aria-label="Match lobby, teams and game setup" title="Match lobby, teams and game setup">${icon(icons.lobby)}</button><button type="button" data-basketball-aim aria-label="Aim and power settings" title="Aim and power settings">${icon(icons.aim)}</button><button type="button" data-basketball-collapse aria-label="Collapse basketball action choices" aria-controls="basketball-action-choices" aria-expanded="true" title="Collapse action choices">${icon(icons.collapse)}</button>`;
  root.append(dockFooter);
  root.addEventListener('pointerdown', event => event.stopPropagation());
  root.addEventListener('keydown', event => {
    if(event.target.closest('button')&&[' ','Enter'].includes(event.key))event.stopPropagation();
  });
  const actions=root.querySelector('.basketball-game-actions');
  const match=document.createElement('dialog');match.className='basketball-rules basketball-match-menu';match.setAttribute('aria-label','Basketball match and players');
  match.innerHTML='<header class="basketball-lobby-header"><div><small>MUZIKAZ COURTSIDE</small><h2>Your next tip-off</h2><p data-match-summary>Choose your side. AI fills the open spots.</p></div><button type="button" data-close-match aria-label="Close match lobby">×</button></header><section class="basketball-lobby-section"><h3><span>1</span> Choose how you play</h3><div class="basketball-mode-row"><label>Play mode<select data-basketball-world-mode><option value="solo">Solo · you and AI</option><option value="multiplayer">Live multiplayer · friends and AI</option></select></label><button type="button" data-open-world>Open mode →</button></div><p>Solo starts your own court. Multiplayer joins this arena’s shared server.</p></section><div data-match-actions></div><p class="basketball-lobby-tip">Auto trigger chooses the best available action. Choose Auto, Shoot, Pass, Toss, Catch or Steal from the action panel while on court.</p><button type="button" data-return-court>Return to court</button>';
  const mode=match.querySelector('[data-basketball-world-mode]');mode.value=new URL(location.href).searchParams.get('mode')==='solo'?'solo':'multiplayer';
  match.querySelector('[data-open-world]').onclick=()=>{const url=new URL(location.href);url.searchParams.set('mode',mode.value);url.searchParams.set('autoplay','1');location.assign(url.href);};
  for (const button of match.querySelectorAll('[data-close-match],[data-return-court]')) button.onclick=()=>match.close();
  const matchButton=root.querySelector('[data-basketball-lobby]');matchButton.onclick=()=>{if(!enabled)return;document.exitPointerLock?.();onOpen();if(!match.open)match.showModal();};actions.remove();
  actions.classList.add('basketball-lobby-actions');
  const actionButtons = [...actions.querySelectorAll('button')];
  actions.innerHTML='<section class="basketball-lobby-section"><h3><span>2</span> Choose your side</h3><div class="basketball-team-choices" data-team-choices></div><p>Join an available spot, or watch from the stands.</p></section><section class="basketball-lobby-section"><h3><span>3</span> Ready for tip-off</h3><div class="basketball-start-choices" data-start-choices></div><p>Set team size and difficulty before starting. AI keeps both teams full.</p></section><details class="basketball-manual-actions"><summary>On-court actions &amp; shortcuts</summary><div data-court-actions></div></details>';
  for (const button of actionButtons) actions.querySelector(button.dataset.team || button.dataset.basketballAction==='basketball-watch' ? '[data-team-choices]' : button.dataset.basketballAction==='basketball-start' || button.hasAttribute('data-basketball-rules') ? '[data-start-choices]' : '[data-court-actions]').append(button);
  match.querySelector('[data-match-actions]').replaceWith(actions);root.append(match);
  match.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();match.close();}});
  stage.append(root);
  const rules = document.createElement('dialog');rules.className='basketball-rules';rules.setAttribute('aria-labelledby','basketball-rules-title');
  rules.innerHTML='<form><small class="basketball-setup-eyebrow">MATCH SETUP</small><h2 id="basketball-rules-title">Make it your game</h2><p>Choose team size, human players and AI difficulty, then start. Both teams stay equal; AI fills every empty spot at tip-off.</p><button type="button" data-solo-setup>Solo vs AI</button><div class="basketball-rules-fields"><label>Players per team<select name="teamSize"><option value="1">1 vs 1</option><option value="2">2 vs 2</option><option value="3">3 vs 3</option><option value="4">4 vs 4</option><option value="5">5 vs 5</option></select></label><label>AI difficulty<select name="aiDifficulty"><option value="1">Tier 1 · Rookie</option><option value="2">Tier 2 · Amateur</option><option value="3">Tier 3 · Pro</option><option value="4">Tier 4 · All-Star</option><option value="5">Tier 5 · Legend</option></select></label><label>Home human slots<input name="homeHumans" type="number" min="0" max="5" step="1" required></label><label>Away human slots<input name="awayHumans" type="number" min="0" max="5" step="1" required></label></div><details><summary>Competition rules · timing &amp; scoring</summary><div class="basketball-rules-fields"><label>Minutes per period<input type="number" name="quarterMinutes" min="1" max="12" step="1" required></label><label>Number of periods<input type="number" name="quarters" min="1" max="4" step="1" required></label><label>Shot clock (seconds)<input type="number" name="shotClockSeconds" min="5" max="60" step="1" required></label><label>Score to win (0 = timed)<input type="number" name="scoreLimit" min="0" max="200" step="1" required></label><label>Win by points<input type="number" name="winBy" min="1" max="10" step="1" required></label></div></details><p data-roster-preview role="status" aria-live="polite"></p><p>Playing with friends? Save to lobby, let everyone join Home or Away, then start. AI wears numbered team jerseys. Late arrivals watch until the next game.</p><p data-rules-status role="status"></p><footer><button type="submit" name="start" value="true" data-start-match>Start game</button><button type="submit" name="save" data-save-rules>Save to lobby</button><button type="button" data-close-rules>Back to court</button></footer></form>';

  stage.append(rules);
  let score = '0:0', ready = false, enabled = false, currentGame = null, currentPlayer = null, currentPlayers = {};
  let nearbyButton = null, nearbyParent = null, nearbyNext = null;
  function placeNearbyAction() {
    if(!nearbyButton)return;
    if(enabled){if(nearbyButton.parentNode!==root)root.insertBefore(nearbyButton,dockFooter);}
    else if(nearbyButton.parentNode===root){
      if(nearbyNext?.parentNode===nearbyParent)nearbyParent.insertBefore(nearbyButton,nearbyNext);
      else nearbyParent.append(nearbyButton);
    }
  }
  let savingSetup=false, uiRevision=0;
  const defaults={quarterMinutes:12,quarters:4,shotClockSeconds:24,scoreLimit:0,winBy:1,teamSize:5,homeHumans:5,awayHumans:5,aiDifficulty:3};
  function previewRoster(){const size=Number(rules.querySelector('[name=teamSize]').value);for(const name of ['homeHumans','awayHumans']){const input=rules.querySelector(`[name=${name}]`);input.max=size;}const members=Object.values(currentPlayers).filter(p=>!p.basketballAI&&p.basketballRole!=='spectator');rules.querySelector('[data-roster-preview]').textContent=['home','away'].map(team=>{const count=members.filter(p=>p.basketballTeam===team).length;const slots=Number(rules.querySelector(`[name=${team}Humans]`).value);return `${team==='home'?'Home':'Away'}: ${slots} human slots + ${Math.max(0,size-slots)} AI · ${count} joined · ${Math.max(0,size-count)} AI at tip-off`;}).join('\n');}
  rules.addEventListener('input',event=>{if(event.target.name==='teamSize'){for(const name of ['homeHumans','awayHumans']){const input=rules.querySelector(`[name=${name}]`);input.value=Math.min(Number(input.value),Number(event.target.value));}}previewRoster();});
  const openSetup=()=>{match.close();

    document.exitPointerLock?.();onOpen();
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
    const startNow=event.submitter?.name!=='save', requestRevision=uiRevision;
    savingSetup=true;
    for(const button of rules.querySelectorAll('[type=submit],[data-solo-setup]'))button.disabled=true;
    const status=rules.querySelector('[data-rules-status]');status.textContent=startNow?'Saving setup and starting…':'Saving lobby setup…';
    try{
      const settings=Object.fromEntries(Object.keys(defaults).map(key=>[key,Number(rules.querySelector(`[name="${key}"]`).value)]));
      const result=await onAction('basketball-settings',{settings});
      if(requestRevision!==uiRevision)return;
      if(result===false){status.textContent='Setup could not be saved. Check the team slots and try again.';return;}
      if(startNow){const started=await onAction('basketball-start',{});if(requestRevision!==uiRevision)return;if(started===false){status.textContent='Game could not start. Choose a team and try again.';return;}}
      rules.close();
    }catch(error){if(requestRevision===uiRevision)status.textContent=error.message;}
    finally{if(requestRevision===uiRevision){savingSetup=false;for(const button of rules.querySelectorAll('[type=submit],[data-solo-setup]'))button.disabled=currentGame?.state==='live';}}
  });
  const blocked=button=>!ready||pending.has(button)||(currentPlayer?.basketballRole==='spectator'&&['catch','toss','basketball-shoot','basketball-steal','basketball-start'].includes(button.dataset.basketballAction));

  const pending = new Set();
  const primary = root.querySelector('[data-basketball-primary]');
  primary.addEventListener('click', async event => {
    event.stopPropagation();
    if (primary.disabled || !enabled || stage.querySelector('dialog[open]') || primaryPending) return;
    primaryPending = true;primary.disabled = true;
    try { await onPrimaryAction(); }
    catch (error) { announce(error.message); }
    finally { primaryPending = false;primary.disabled = !enabled || !ready || currentPlayer?.basketballRole === 'spectator'; }
  });
  root.querySelector('[data-basketball-aim]').onclick = () => {if(!enabled || currentPlayer?.basketballRole==='spectator')return;onOpen();onOpenAim();};
  root.querySelector('[data-basketball-collapse]').onclick = event => {
    const collapsed = root.dataset.collapsed !== 'true';
    root.dataset.collapsed = String(collapsed);
    event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
    event.currentTarget.setAttribute('aria-label', `${collapsed?'Expand':'Collapse'} basketball action choices`);
    event.currentTarget.title = `${collapsed?'Expand':'Collapse'} action choices`;
  };
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
    attachNearbyAction(button) {
      if(!button || nearbyButton)return;
      nearbyButton=button;nearbyParent=button.parentNode||stage;nearbyNext=button.nextSibling;placeNearbyAction();
    },
    setTriggerAction(label, mode) {
      const output = root.querySelector('[data-trigger-action]');
      if (mode && ['auto','shoot','pass','toss','catch','steal'].includes(mode)) selectMode(mode);
      const next = `${triggerMode==='auto'?'Auto · ':''}${label || 'Ready for play'}`;
      if (output.textContent !== next) output.textContent = next;
      primary.title = next;primary.setAttribute('aria-label', `Basketball action: ${next}`);
    },

    render(game, player, active, players={}) {
      if(enabled!==Boolean(active)||currentPlayer&&!player){uiRevision++;savingSetup=false;}
      enabled = Boolean(active);
      placeNearbyAction();
      root.hidden = !enabled;
      stage.classList.toggle('basketball-world', Boolean(enabled));
      ready = Boolean(player);
      currentGame=game;currentPlayer=player;currentPlayers=players;
      for(const button of root.querySelectorAll('[data-basketball-action]'))button.disabled=blocked(button);
      for (const button of trigger.querySelectorAll('button')) button.disabled = !ready || player?.basketballRole === 'spectator';
      primary.disabled = !ready || player?.basketballRole === 'spectator' || primaryPending;
      root.querySelector('[data-basketball-aim]').disabled = !ready || player?.basketballRole === 'spectator';
      if(!enabled&&rules.open)rules.close();
      if(!enabled&&match.open)match.close();

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
      root.querySelector('[data-match-summary]').textContent = game.state === 'live' ? 'Match in progress · join an open spot or watch live.' : game.state === 'finished' ? 'Final buzzer · get ready for the next game.' : 'The court is open · choose your side and start a game.';

      const audience=Object.values(players),watching=audience.filter(member=>member.basketballRole==='spectator').length;root.querySelector('[data-role]').textContent+=` · ${audience.filter(p=>!p.basketballAI&&p.basketballRole!=='spectator').length} HUMANS + ${audience.filter(p=>p.basketballAI).length} AI / ${watching} WATCHING`;
      const caption = root.querySelector('[data-play]'), play = game.lastPlay || 'Choose Home, Away or Watch. Game rules can be changed before tip-off.';
      if(caption.textContent!==play)caption.textContent=play;
      const nextScore = `${game.homeScore}:${game.awayScore}`;
      if (nextScore !== score) { root.classList.remove('basketball-scored'); void root.offsetWidth; root.classList.add('basketball-scored'); score = nextScore; }
    }
  };
}
