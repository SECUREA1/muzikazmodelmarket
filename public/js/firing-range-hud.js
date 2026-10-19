import { RANGED_WEAPONS } from './game-weapons.js';
import { FIRING_RANGE_DEFAULTS, firingRangeTeamScores } from './firing-range.js';
import { mountFiringRangeScope } from './firing-range-scope.js';

export const FIRING_RANGE_SETUP_DEFAULTS = FIRING_RANGE_DEFAULTS;
const modes = Object.freeze({ freeplay: 'Open practice', precision: 'Precision', rapid: 'Rapid fire', endurance: 'Endurance', moving: 'Moving targets' });
const lockedStates = new Set(['countdown', 'live', 'intermission']);
const sections = Object.freeze({ play: 'Practice & lanes', tournament: 'Tournament', armory: 'Armory & scope', results: 'Scores & results' });
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export function firingRangeClock(milliseconds) {
  const seconds = Math.ceil(Math.max(0, number(milliseconds)) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function firingRangeAccuracy(participant = {}) {
  const shots = Math.max(0, number(participant.shots)), hits = Math.max(0, number(participant.hits));
  return shots ? `${Math.min(100, Math.round(hits / shots * 100))}%` : '—';
}

export function firingRangeControlState(game, actorId, enabled = true) {
  const participant = game?.participants?.[actorId] || Object.values(game?.participants || {}).find(member => (member.id || member.actorId) === actorId);
  const player = participant?.role === 'player', active = lockedStates.has(game?.state);
  const host = Boolean(actorId) && player && (!game?.hostId || game.hostId === actorId);
  const practice = game?.settings?.mode === 'freeplay' && game?.state === 'live';
  return {
    participant, player, active, host, practice,
    canSetup: Boolean(enabled && host && !active),
    canChooseWeapon: Boolean(enabled && actorId && player && (!active || practice)),
    tournamentWeaponLocked: Boolean(enabled && active && !practice),
    canJoin: Boolean(enabled && actorId && (!active || practice)),
    canShoot: Boolean(enabled && actorId && player && game?.state === 'live' && !participant.completed),
    showPractice: Boolean(enabled && (!active || practice)),
    canPractice: Boolean(enabled && actorId && (practice ? !player : !active && host)),
    practiceLabel: practice ? player ? 'Practice live' : 'Join open practice' : 'Start open practice'
  };
}

export function mountFiringRangeHud({ stage, onAction, announce = () => {}, onWeapon = () => {}, onScope = () => {}, onOpen = () => {}, onMarket = () => {}, onBackpack = () => {} }) {
  const style = document.createElement('style');
  style.textContent = `
    .firing-range-active-area .rad-tox-hud{display:none!important}
    .firing-range-hud[hidden],.firing-range-panel [hidden]{display:none!important}
    .firing-range-hud{position:absolute;top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:24;width:min(560px,calc(100% - 24px));color:#eff9f4;font:12px system-ui,sans-serif;pointer-events:none}
    .firing-range-strip{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:10px 14px;border:1px solid #78b79a6e;border-radius:12px;background:#081912ec;box-shadow:0 12px 28px #0005;backdrop-filter:blur(10px)}
    .firing-range-strip small{display:block;color:#afcbbd;font-size:9px;font-weight:700;letter-spacing:1.3px}.firing-range-strip strong{display:block;font-size:14px;margin-top:2px}.firing-range-strip [data-clock]{font-size:25px;font-variant-numeric:tabular-nums;color:#d9f4b3;text-align:center;line-height:1.1}.firing-range-strip [data-score]{text-align:right;font-variant-numeric:tabular-nums}
    .firing-range-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:6px;pointer-events:auto}.house-stage .firing-range-actions button,.firing-range-actions button{width:auto!important;flex:0 0 auto!important;min-height:36px;padding:7px 12px;border:1px solid #78b79a70;border-radius:7px;background:#10271eee;color:#edf9f0;font:700 11px system-ui;cursor:pointer}.firing-range-actions button[aria-pressed=true],.firing-range-actions button.primary{background:#d2eeb1;color:#122319}.firing-range-actions button:disabled{opacity:.5;cursor:default}.firing-range-actions button[hidden]{display:none!important}
    .firing-range-caption{padding:5px 8px;margin:4px auto 0;width:fit-content;max-width:100%;box-sizing:border-box;border-radius:5px;background:#081912bf;color:#d4e6db;text-align:center;font-size:10px;text-shadow:0 1px 3px #000}
    .firing-range-panel{width:min(690px,calc(100vw - 24px));max-height:calc(100dvh - 32px);box-sizing:border-box;margin:auto;overflow:auto;overscroll-behavior:contain;touch-action:pan-y;padding:22px;border:1px solid #83ae91;border-radius:14px;background:#0b1c15;color:#eff9f4;font:13px system-ui;box-shadow:0 24px 90px #0009;color-scheme:dark}
    .firing-range-panel::backdrop{background:#020b08bb;backdrop-filter:blur(3px)}.firing-range-panel *{box-sizing:border-box}.firing-range-panel h2{font:800 23px system-ui;margin:0;color:#eefbe7}.firing-range-panel h3{font-size:13px;margin:17px 0 9px;color:#dbedca}.firing-range-panel p{font-size:12px;line-height:1.5;color:#bdd1c4;margin:8px 0}.firing-range-panel header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.firing-range-panel button{width:auto!important;min-height:39px;padding:8px 13px;border:1px solid #648b71;border-radius:7px;background:#19372a;color:#eff9f4;font:700 12px system-ui;cursor:pointer}.firing-range-panel button:disabled{opacity:.45;cursor:default}.firing-range-panel button[data-range-close]{min-width:39px;font-size:19px;line-height:1;padding:4px}.firing-range-panel button.primary{background:#d2eeb1;color:#172819;border-color:#d2eeb1}.firing-range-panel button[aria-pressed=true]{outline:2px solid #d2eeb1;outline-offset:2px}.firing-range-panel button[hidden]{display:none!important}
    .firing-range-settings{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}.firing-range-panel label{display:grid;gap:5px;min-width:0;font-size:11px;font-weight:600;color:#c4d6ca}.firing-range-panel input,.firing-range-panel select{min-width:0;width:100%;min-height:38px;padding:8px;border:1px solid #4a6c58;border-radius:6px;background:#07150e;color:#f0f8ed;font:12px system-ui}.firing-range-panel input[type=range]{padding:0;accent-color:#bfe89e;touch-action:pan-x}.firing-range-field-wide{grid-column:span 2}.firing-range-panel select:disabled,.firing-range-panel input:disabled{opacity:.6}.firing-range-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.firing-range-row label{flex:1;min-width:110px}.firing-range-row button{flex:0 0 auto}.firing-range-panel [data-range-status]{min-height:18px;color:#e1edb2}.firing-range-panel footer{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:18px;padding-top:14px;border-top:1px solid #456351}
    .firing-range-scoretable{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}.firing-range-scoretable th{text-align:right;color:#9eb6a7;font-size:9px;text-transform:uppercase;letter-spacing:.7px;font-weight:600;padding:7px 5px;border-bottom:1px solid #456351}.firing-range-scoretable th:first-child,.firing-range-scoretable td:first-child{text-align:left}.firing-range-scoretable td{padding:8px 5px;border-bottom:1px solid #263f31;text-align:right;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.firing-range-scoretable tr[data-self=true]{color:#ddf4b6;background:#bbef8510}.firing-range-results{margin:5px 0;padding-left:22px;max-height:320px;overflow:auto;color:#cfddcf;font-size:11px}.firing-range-results li{padding:4px}.firing-range-table-wrap{overflow:auto;max-height:200px;overscroll-behavior:contain}.firing-range-navigation{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:16px 0}.firing-range-navigation button{min-width:0;padding:9px 5px;font-size:11px}.firing-range-navigation button[aria-selected=true]{background:#d2eeb1;color:#172819;border-color:#d2eeb1}.firing-range-section{scroll-margin-top:12px}.firing-range-armory-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.firing-range-armory-grid button{text-align:left;min-width:0;min-height:74px}.firing-range-armory-grid strong,.firing-range-armory-grid small{display:block}.firing-range-armory-grid small{font-weight:400;color:#bed1c3;font-size:10px;margin-top:5px;line-height:1.4}.firing-range-market-links{padding:12px;border:1px solid #456351;border-radius:8px;margin-top:16px}.firing-range-panel [data-weapon-lock]{color:#e1edb2}.firing-range-session-info{border-left:2px solid #bfe89e;padding-left:10px}.firing-range-scope-settings{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:end}.firing-range-panel :focus-visible,.firing-range-hud :focus-visible{outline:2px solid #dcfba8;outline-offset:3px}
    @media(max-width:600px){.firing-range-hud{top:8px;width:calc(100% - 16px)}.firing-range-strip{padding:7px 10px;gap:8px}.firing-range-strip strong{font-size:11px}.firing-range-strip small{font-size:8px;letter-spacing:.8px}.firing-range-strip [data-clock]{font-size:21px}.firing-range-actions button{min-height:38px;padding:7px 10px}.firing-range-caption{font-size:9px}.firing-range-panel{padding:16px;max-height:calc(100dvh - 20px)}.firing-range-panel h2{font-size:20px}.firing-range-settings{grid-template-columns:repeat(2,minmax(0,1fr))}.firing-range-armory-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.firing-range-navigation{grid-template-columns:repeat(2,minmax(0,1fr))}.firing-range-scope-settings{grid-template-columns:1fr 1fr}.firing-range-scope-settings button{grid-column:span 2}.firing-range-panel footer{justify-content:stretch}.firing-range-panel footer button{flex:1;min-width:120px}}
  `;
  document.head.append(style);
  const root = document.createElement('section');
  root.className = 'firing-range-hud';
  root.hidden = true;
  root.setAttribute('aria-label', 'Live firing range tournament');
  root.innerHTML = '<div class="firing-range-strip"><div><small data-phase>RANGE READY</small><strong data-mode>Precision</strong></div><div><small data-round>ROUND 1 / 3</small><strong data-clock>1:00</strong></div><div data-score><small>YOUR SCORE</small><strong data-self-score>0</strong></div></div><div class="firing-range-actions"><button type="button" data-range-open aria-haspopup="dialog">Range operations</button><button type="button" class="primary" data-range-action="range-practice">Start open practice</button><button type="button" data-range-aim aria-pressed="false">Aim · 2×</button><button type="button" class="primary" data-range-action="range-fire" aria-label="Shoot at the center reticle" hidden>Shoot</button></div><p class="firing-range-caption" data-caption>Start open practice, or set up a tournament in Range operations.</p>';
  stage.append(root);
  const panel = document.createElement('dialog');
  panel.className = 'firing-range-panel';
  panel.setAttribute('aria-labelledby', 'firing-range-operations-title');
  panel.innerHTML = `<header><div><h2 id="firing-range-operations-title">Firing range operations</h2><p>Animated targets · free practice weapons · live tournaments</p></div><button type="button" data-range-close aria-label="Close firing range operations">×</button></header>
    <p class="firing-range-session-info" data-session-info></p>
    <nav class="firing-range-navigation" role="tablist" aria-label="Range operations">${Object.entries(sections).map(([id, label]) => `<button type="button" role="tab" id="range-tab-${id}" data-range-nav="${id}" aria-controls="range-section-${id}" aria-selected="${id === 'play'}" tabindex="${id === 'play' ? 0 : -1}">${label}</button>`).join('')}</nav>
    <section class="firing-range-section" id="range-section-play" role="tabpanel" aria-labelledby="range-tab-play" data-range-section="play">
      <h3>Open practice</h3><div class="firing-range-row"><button type="button" class="primary" data-range-action="range-practice">Start open practice</button><p data-practice-help>Unlimited time and shots. Borrow a weapon in Armory & scope.</p></div>
      <h3>Choose your lane</h3><div class="firing-range-row"><label>Range location<select name="range-location" aria-label="Firing range location"></select></label><label>Firing lane<select name="range-lane" aria-label="Firing lane"><option value="0">Lane 1</option><option value="1">Lane 2</option><option value="2">Lane 3</option><option value="3">Lane 4</option><option value="4">Lane 5</option></select></label><label data-team-field>Team<select name="range-team" aria-label="Firing range team"><option value="red">Red team</option><option value="blue">Blue team</option></select></label><button type="button" data-range-action="range-join">Join lane</button><button type="button" data-range-action="range-watch">Watch</button></div>
      <h3>On the firing line</h3><p>Aim at the center reticle and use Shoot, your mouse, touch fire control, or VR trigger. Your own lane scores paper rings and animated silhouette targets. Practice is unlimited; tournament targets follow the selected event and speed.</p><div class="firing-range-row"><button type="button" data-range-link="armory">Choose a practice weapon</button><button type="button" data-range-link="tournament">Set up a tournament</button><button type="button" data-range-link="results">View live scores</button></div>
    </section>
    <section class="firing-range-section" id="range-section-tournament" role="tabpanel" aria-labelledby="range-tab-tournament" data-range-section="tournament" hidden>
      <form data-range-settings><h3>Tournament setup</h3><p data-setup-help>Choose your event, then start. Your displayed settings are saved before the tournament begins.</p><div class="firing-range-settings"><label class="firing-range-field-wide">Event mode<select name="mode">${Object.entries(modes).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label><label>Round seconds<input name="durationSeconds" type="number" min="10" max="600" step="1" required></label><label>Rounds<input name="rounds" type="number" min="1" max="10" step="1" required></label><label>Shots per round<input name="shotLimit" type="number" min="1" max="200" step="1" required></label><label>Target speed<select name="targetSpeed"><option value="0.25">0.25× · beginner</option><option value="0.5">0.5× · slow</option><option value="1">1× · standard</option><option value="1.5">1.5× · fast</option><option value="2">2× · expert</option><option value="3">3× · challenge</option></select></label><label>Start countdown<input name="countdownSeconds" type="number" min="0" max="10" step="1" required></label><label>Competition<select name="teamMode"><option value="false">Individual</option><option value="true">Red vs Blue</option></select></label><label class="firing-range-field-wide">Tournament weapon<select name="weapon">${Object.entries(RANGED_WEAPONS).map(([id, weapon]) => `<option value="${id}">${weapon.label}</option>`).join('')}</select></label><div class="firing-range-row"><button type="submit" data-save-settings>Save setup</button></div></div><p>Precision uses still targets. Rapid fire, endurance and moving targets animate the silhouettes. All timed modes use the round and shot limits above. Open practice has unlimited time and shots.</p></form>
      <p data-tournament-progress></p><div class="firing-range-row"><button type="button" data-range-link="play">Choose lane or team</button><button type="button" data-range-link="results">View scores & completed rounds</button></div>
    </section>
    <section class="firing-range-section" id="range-section-armory" role="tabpanel" aria-labelledby="range-tab-armory" data-range-section="armory" hidden>
      <h3>Free range weapon loans</h3><p>Borrow any of these nine weapons for open practice. Range loans cost nothing and stay in the range; they do not add permanent items to your Backpack.</p><p data-weapon-lock></p><div class="firing-range-armory-grid" role="group" aria-label="Borrow a range weapon">${Object.entries(RANGED_WEAPONS).map(([id, weapon]) => `<button type="button" data-range-loan="${id}" aria-pressed="false"><strong>${weapon.label}</strong><small>${weapon.description || `${weapon.range} m range · ${weapon.pellets === 1 ? 'single shot' : `${weapon.pellets} projectiles`}`} · free loan</small></button>`).join('')}</div>
      <h3>Adjustable scope</h3><div class="firing-range-scope-settings"><label><span>Magnification <span data-scope-zoom>2×</span></span><input type="range" name="range-scope-zoom" aria-label="Scope magnification" min="1" max="8" step="0.5" value="2"></label><label>Reticle<select name="range-scope-reticle" aria-label="Scope reticle"><option value="cross">Crosshair</option><option value="dot">Precision dot</option><option value="ring">Target ring</option></select></label><button type="button" data-panel-aim aria-pressed="false">Aim through scope</button></div>
      <div class="firing-range-market-links"><h3>Permanent weapons & your items</h3><p>Buy permanent equipment with MZK in the Market. Review prices and ownership there before purchasing. Your owned equipment and purchases appear in Backpack.</p><div class="firing-range-row"><button type="button" data-range-market>Open Market</button><button type="button" data-range-buy>Buy selected weapon permanently</button><button type="button" data-range-backpack>Open Backpack</button></div></div>
    </section>
    <section class="firing-range-section" id="range-section-results" role="tabpanel" aria-labelledby="range-tab-results" data-range-section="results" hidden>
      <h3>Live leaderboard</h3><p data-team-score hidden></p><div class="firing-range-table-wrap"><table class="firing-range-scoretable"><thead><tr><th scope="col">Competitor</th><th scope="col">Score</th><th scope="col">Hits / shots</th><th scope="col">Accuracy</th><th scope="col">Bulls</th></tr></thead><tbody data-leaderboard></tbody></table></div><p data-no-players>No competitors yet. Join a lane to get started.</p>
      <h3 data-results-heading hidden>Completed rounds & final results</h3><ol class="firing-range-results" data-results hidden></ol><p data-results-empty>Round results will appear here as the tournament progresses.</p><div class="firing-range-row"><button type="button" data-range-link="tournament">Set up next tournament</button></div>
    </section>
    <p role="status" aria-live="polite" data-range-status></p>
    <footer><button type="button" class="primary" data-range-action="range-start">Start tournament</button><button type="button" data-range-action="range-stop" hidden>End tournament</button><button type="button" data-range-close>Back to range</button></footer>`;
  stage.append(panel);
  let game = null, selfId = null, enabled = false, sessionEpoch = 0, settingsDirty = false, statusText = '', busy = false, lastLeaderboard = '', lastResults = '', locationsKey = '', section = 'play', loanWeapon = FIRING_RANGE_SETUP_DEFAULTS.weapon;
  const query = selector => panel.querySelector(selector);
  const settingForm = query('[data-range-settings]');
  const field = name => settingForm.elements.namedItem(name);
  const locked = () => lockedStates.has(game?.state);
  const self = () => game?.participants?.[selfId] || Object.values(game?.participants || {}).find(member => (member.id || member.actorId) === selfId);
  const host = () => Boolean(selfId) && self()?.role === 'player' && (!game?.hostId || game.hostId === selfId);
  const scope = mountFiringRangeScope({ stage, onChange: options => { updateScope(options); onScope(options); } });
  function updateScope(options) {
    root.querySelector('[data-range-aim]').textContent = `${options.active ? 'Unscope' : 'Aim'} · ${options.zoom}×`;
    for (const button of [root.querySelector('[data-range-aim]'), query('[data-panel-aim]')]) button.setAttribute('aria-pressed', String(options.active));
    query('[data-panel-aim]').textContent = options.active ? 'Leave scope' : 'Aim through scope';
    query('[name="range-scope-zoom"]').value = options.zoom;
    query('[name="range-scope-reticle"]').value = options.reticle;
    query('[data-scope-zoom]').textContent = `${options.zoom}×`;
  }
  function close() { if (panel.open) panel.close(); }
  function writeSettings() {
    const settings = { ...FIRING_RANGE_SETUP_DEFAULTS, ...game?.settings };
    for (const name of Object.keys(FIRING_RANGE_SETUP_DEFAULTS)) {
      const control = field(name);
      if (control instanceof HTMLSelectElement && !Array.from(control.options).some(option => option.value === String(settings[name]))) {
        const option = document.createElement('option'); option.value = String(settings[name]); option.textContent = String(settings[name]); control.append(option);
      }
      control.value = String(settings[name]);
    }
    settingsDirty = false;
  }
  function selectSection(requested = 'play', focus = false) {
    section = Object.hasOwn(sections, requested) ? requested : 'play';
    if (section === 'tournament' && !locked() && !settingsDirty && field('mode').value === 'freeplay') { field('mode').value = 'precision'; settingsDirty = true; }
    for (const view of panel.querySelectorAll('[data-range-section]')) view.hidden = view.dataset.rangeSection !== section;
    for (const tab of panel.querySelectorAll('[data-range-nav]')) {
      const selected = tab.dataset.rangeNav === section;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    }
    refreshControls();
  }
  function open(requested = 'play', locationId = null) {
    if (!enabled) return;
    onOpen();
    document.exitPointerLock?.();
    if (!panel.open || !settingsDirty) writeSettings();
    const own = self(), location = query('[name="range-location"]');
    if (locationId != null && Array.from(location.options).some(option => option.value === String(locationId))) location.value = String(locationId);
    else if (!panel.open && own?.locationId) location.value = own.locationId;
    if (!panel.open && Number.isInteger(own?.lane)) query('[name="range-lane"]').value = own.lane;
    if (!panel.open && own?.team) query('[name="range-team"]').value = own.team;
    const container = document.fullscreenElement || stage;
    if (panel.parentElement !== container) container.append(panel);
    if (!panel.open) panel.showModal();
    selectSection(requested, true);
  }
  function setStatus(message) {
    statusText = String(message || '');
    query('[data-range-status]').textContent = statusText;
  }
  function refreshLanes() {
    const select = query('[name="range-lane"]'), locationId = query('[name="range-location"]').value || game?.activeLocationId;
    for (const option of select.options) {
      const occupied = Object.values(game?.participants || {}).find(member => member.role === 'player' && member.online !== false && (member.id || member.actorId) !== selfId && member.locationId === locationId && member.lane === Number(option.value));
      option.disabled = Boolean(occupied);
      option.textContent = `Lane ${Number(option.value) + 1}${occupied ? ` · ${occupied.name || 'Occupied'}` : ''}`;
    }
    if (select.selectedOptions[0]?.disabled) select.value = Array.from(select.options).find(option => !option.disabled)?.value || '';
  }
  function refreshControls() {
    const controls = firingRangeControlState(game, selfId, enabled), { active, practice } = controls, canSetup = controls.canSetup && !busy;
    for (const control of settingForm.elements) control.disabled = !canSetup;
    refreshLanes();
    for (const control of [query('[name="range-lane"]'), query('[name="range-team"]'), query('[name="range-location"]')]) control.disabled = !enabled || (active && !practice) || busy;
    query('[data-team-field]').hidden = !(settingsDirty ? field('teamMode').value === 'true' : game?.settings?.teamMode);
    for (const button of [...panel.querySelectorAll('[data-range-action]'), ...root.querySelectorAll('[data-range-action]')]) {
      const action = button.dataset.rangeAction;
      button.hidden = action === 'range-practice' ? !controls.showPractice : action === 'range-fire' ? !controls.canShoot : action === 'range-stop' ? !active || !host() : action === 'range-start' ? active || section !== 'tournament' : false;
      button.disabled = !enabled || !selfId || busy || (['range-start', 'range-stop'].includes(action) && !host()) || (action === 'range-join' && (!controls.canJoin || query('[name="range-lane"]').value === '')) || (action === 'range-practice' && !controls.canPractice) || (action === 'range-fire' && !controls.canShoot);
      if (action === 'range-practice') button.textContent = controls.practiceLabel;
      if (action === 'range-watch') button.setAttribute('aria-pressed', String(self()?.role === 'spectator'));
    }
    query('[data-practice-help]').textContent = practice ? controls.player ? 'Practice is live. Aim at your targets and use Shoot. You can change lanes or watch without restarting the session.' : 'Open practice is live. Select an available lane and join without interrupting anyone.' : host() ? 'Start shooting now with unlimited time and shots. Tournament settings are below.' : 'Join an available lane to host open practice, or wait for the current host to start.';
    query('[data-practice-help]').hidden = active && !practice;
    query('[data-range-action="range-join"]').textContent = practice ? controls.player ? 'Change practice lane' : 'Join open practice' : active ? 'Join next tournament' : self()?.role === 'player' ? 'Update lane' : 'Join lane';
    query('[data-range-action="range-watch"]').textContent = self()?.role === 'spectator' ? 'Watching' : practice ? 'Watch practice' : 'Watch';
    query('[data-range-action="range-start"]').textContent = field('mode').value === 'freeplay' ? 'Start open practice' : game?.state === 'finished' ? 'Start new tournament' : 'Start tournament';
    query('[data-range-action="range-stop"]').textContent = practice ? 'End practice · unlock tournament setup' : 'End tournament';
    query('[data-setup-help]').textContent = practice ? host() ? 'End open practice below to unlock tournament settings, then choose your event and start.' : 'The host must end open practice before setting up a tournament.' : active ? 'The tournament setup and lanes are locked until this event finishes. The host can end the event below.' : host() ? 'Choose your event, then start. Your displayed settings are saved before the tournament begins.' : 'Join a lane to become host, or ask the current host to configure and start this tournament.';
    query('[data-tournament-progress]').textContent = practice ? 'Open practice · unlimited time and shots' : `${modes[game?.settings?.mode] || 'Precision'} · round ${Math.max(1, number(game?.round))} of ${number(game?.settings?.rounds || FIRING_RANGE_SETUP_DEFAULTS.rounds)} · ${game?.state || 'ready'}`;
    const selectedWeapon = controls.tournamentWeaponLocked ? game?.settings?.weapon : loanWeapon;
    for (const button of panel.querySelectorAll('[data-range-loan]')) {
      button.disabled = !controls.canChooseWeapon || busy;
      button.setAttribute('aria-pressed', String(button.dataset.rangeLoan === selectedWeapon));
    }
    query('[data-weapon-lock]').textContent = controls.tournamentWeaponLocked ? `Tournament weapon locked: ${RANGED_WEAPONS[selectedWeapon]?.label || 'Marksman'}. Every competitor uses the host’s weapon until the event finishes.` : controls.player ? `Practice weapon: ${RANGED_WEAPONS[loanWeapon]?.label || 'Marksman'}. Select any free loan below.` : 'Join a lane in Practice & lanes to borrow a weapon. Spectators can browse the Market and Backpack.';
    query('[data-range-buy]').textContent = `Buy ${RANGED_WEAPONS[selectedWeapon]?.label || 'weapon'} permanently`;
    root.querySelector('[data-range-aim]').disabled = !enabled || self()?.role === 'spectator';
    query('[data-panel-aim]').disabled = !enabled || self()?.role === 'spectator';
    if (!statusText) query('[data-range-status]').textContent = practice ? controls.player ? 'Practice live. Aim at the center reticle and tap Shoot. Scores remain live as others join.' : 'Select a free lane and join open practice now, or keep watching.' : active ? 'The event is live. New arrivals can watch and join the next tournament.' : host() ? 'Tap Start open practice to shoot now, or save the setup below and start a tournament.' : !game?.hostId ? 'Join a lane to host open practice or a tournament.' : 'Choose a lane or watch. The host can start open practice or a tournament.';
  }
  function readSettings() {
    return Object.fromEntries(Object.keys(FIRING_RANGE_SETUP_DEFAULTS).map(name => [name, ['mode', 'weapon'].includes(name) ? field(name).value : name === 'teamMode' ? field(name).value === 'true' : Number(field(name).value)]));
  }
  function requireAccepted(result) {
    if (result === false) throw new Error('The action was not accepted. Check your lane and the current event.');
    return result;
  }
  async function action(name, extra = {}) {
    if (busy || !enabled || !selfId) return;
    if (['range-settings', 'range-start'].includes(name) && (!host() || locked() || !settingForm.reportValidity())) return;
    // Keep one busy guard across saving and starting so a second click cannot start with stale settings.
    const startingSettings = name === 'range-start' ? readSettings() : null, endingPractice = name === 'range-stop' && game?.settings?.mode === 'freeplay';
    const epoch = sessionEpoch, currentSession = () => epoch === sessionEpoch;
    busy = true; setStatus(''); refreshControls();
    try {
      if (startingSettings) {
        const previous = { ...FIRING_RANGE_SETUP_DEFAULTS, ...game?.settings };
        if (settingsDirty || Object.keys(FIRING_RANGE_SETUP_DEFAULTS).some(key => previous[key] !== startingSettings[key])) {
          const saved = await onAction('range-settings', { settings: startingSettings });
          if (!currentSession()) return;
          requireAccepted(saved);
          settingsDirty = false;
        }
      }
      const result = await onAction(name, extra);
      if (!currentSession()) return;
      requireAccepted(result);
      if (name === 'range-join') { onWeapon(game?.settings?.mode === 'freeplay' || !locked() ? loanWeapon : game?.settings?.weapon || 'marksman'); setStatus('Lane selected. Your free range weapon is ready.'); if (game?.settings?.mode === 'freeplay' && game.state === 'live') close(); }
      if (name === 'range-settings') { settingsDirty = false; setStatus('Tournament setup saved.'); }
      if (name === 'range-watch') { scope.set({ active: false }); setStatus('Watching the range. Join a lane when the event allows it.'); }
      if (name === 'range-start') { onWeapon(startingSettings.mode === 'freeplay' ? loanWeapon : startingSettings.weapon); close(); }
      if (name === 'range-practice') { onWeapon(loanWeapon); setStatus('Open practice is live. Aim at the targets and use Shoot.'); close(); }
      if (name === 'range-stop') { writeSettings(); setStatus('Session ended. Configure the next tournament or start open practice.'); if (endingPractice) { field('mode').value = 'precision'; settingsDirty = true; selectSection('tournament', true); } }
    } catch (error) {
      if (!currentSession()) return;
      setStatus(error?.message || 'The server could not complete this range action.'); announce(statusText);
    } finally { if (currentSession()) { busy = false; refreshControls(); } }
  }
  root.querySelector('[data-range-open]').addEventListener('click', () => open());
  for (const button of panel.querySelectorAll('[data-range-close]')) button.addEventListener('click', close);
  for (const button of panel.querySelectorAll('[data-range-nav], [data-range-link]')) button.addEventListener('click', () => selectSection(button.dataset.rangeNav || button.dataset.rangeLink, true));
  query('[role="tablist"]').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const ids = Object.keys(sections), index = ids.indexOf(section);
    selectSection(event.key === 'Home' ? ids[0] : event.key === 'End' ? ids.at(-1) : ids[(index + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length], true);
  });
  for (const button of panel.querySelectorAll('[data-range-loan]')) button.addEventListener('click', () => {
    if (button.disabled || !firingRangeControlState(game, selfId, enabled).canChooseWeapon || busy) return;
    const weapon = button.dataset.rangeLoan;
    if (onWeapon(weapon) === false) { setStatus('Join a firing lane before borrowing a range weapon.'); return; }
    loanWeapon = weapon;
    setStatus(`${RANGED_WEAPONS[weapon].label} borrowed for the range. No purchase or MZK charge.`);
    refreshControls();
  });
  query('[data-range-market]').addEventListener('click', () => { close(); onMarket({ category: 'weapons', intent: 'browse' }); });
  query('[data-range-buy]').addEventListener('click', () => { const weaponId = firingRangeControlState(game, selfId, enabled).tournamentWeaponLocked ? game?.settings?.weapon : loanWeapon; close(); onMarket({ category: 'weapons', weaponId, intent: 'buy' }); });
  query('[data-range-backpack]').addEventListener('click', () => { close(); onBackpack(); });
  const aim = () => { scope.set({ active: !scope.options().active }); close(); };
  root.querySelector('[data-range-aim]').addEventListener('click', aim);
  query('[data-panel-aim]').addEventListener('click', aim);
  query('[name="range-scope-zoom"]').addEventListener('input', event => scope.set({ zoom: Number(event.target.value) }));
  query('[name="range-scope-reticle"]').addEventListener('change', event => scope.set({ reticle: event.target.value }));
  for (const button of [...panel.querySelectorAll('[data-range-action]'), ...root.querySelectorAll('[data-range-action]')]) button.addEventListener('click', () => {
    const name = button.dataset.rangeAction;
    if (button.disabled) return;
    const payload = ['range-join', 'range-practice'].includes(name) ? { ...((name !== 'range-practice' || self()?.role === 'player') && query('[name="range-lane"]').value !== '' ? { lane: Number(query('[name="range-lane"]').value) } : {}), team: query('[name="range-team"]').value, locationId: query('[name="range-location"]').value || game?.activeLocationId } : {};
    action(name, payload);
  });
  query('[name="range-location"]').addEventListener('change', refreshControls);
  settingForm.addEventListener('input', () => { settingsDirty = true; refreshControls(); });
  settingForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!host() || locked() || !settingForm.reportValidity()) return;
    action('range-settings', { settings: readSettings() });
  });
  // Focused controls retain their own keyboard behavior without also moving or firing in the world.
  for (const container of [root, panel]) {
    for (const name of ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup']) container.addEventListener(name, event => event.stopPropagation());
  }
  panel.addEventListener('keydown', event => {
    const control = query('[name="range-scope-zoom"]');
    if (event.target !== control || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.key.startsWith('Page') ? 1 : .5, direction = ['ArrowRight', 'ArrowUp', 'PageUp'].includes(event.key) ? 1 : -1;
    const zoom = event.key === 'Home' ? 1 : event.key === 'End' ? 8 : scope.options().zoom + step * direction;
    scope.set({ zoom });
  });
  updateScope(scope.options());
  function renderLeaderboard() {
    const participants = Object.values(game?.participants || {}), players = participants.filter(member => member.role !== 'spectator');
    const entries = Array.isArray(game?.leaderboard) ? game.leaderboard : participants.filter(member => member.role === 'player' || member.enrolled).sort((a, b) => number(b.score) - number(a.score) || number(b.bullseyes) - number(a.bullseyes));
    const key = JSON.stringify({ entries, selfId, teamMode: game?.settings?.teamMode });
    query('[data-no-players]').hidden = entries.length > 0;
    if (key !== lastLeaderboard) {
      lastLeaderboard = key;
      const fragment = document.createDocumentFragment();
      for (const [index, participant] of entries.entries()) {
        const row = document.createElement('tr'), id = participant.id || participant.actorId;
        row.dataset.self = String(id === selfId);
        const name = `${index + 1}. ${participant.name || 'Player'}${participant.team && game?.settings?.teamMode ? ` · ${participant.team}` : ''}${participant.completed ? ' ✓' : ''}`;
        for (const value of [name, number(participant.score).toLocaleString(), `${number(participant.hits)} / ${number(participant.shots)}`, firingRangeAccuracy(participant), number(participant.bullseyes)]) { const cell = document.createElement('td'); cell.textContent = String(value); row.append(cell); }
        fragment.append(row);
      }
      query('[data-leaderboard]').replaceChildren(fragment);
    }
    const watching = participants.filter(member => member.role === 'spectator' && member.online !== false).length;
    const playing = players.filter(member => member.online !== false).length;
    const teamScore = query('[data-team-score]');
    teamScore.hidden = !game?.settings?.teamMode;
    if (game?.settings?.teamMode) { const scores = firingRangeTeamScores(game.participants); teamScore.textContent = `RED ${scores.red.toLocaleString()} · BLUE ${scores.blue.toLocaleString()}`; }
    const own = self(), status = game?.state || 'ready';
    const ownRole = own?.role === 'player' ? `Lane ${number(own.lane) + 1}${own.completed ? ' · round complete' : ''}` : 'Watching';
    const practice = game?.settings?.mode === 'freeplay' && status === 'live';
    const stateMessage = status === 'countdown' ? 'Stand by for the start' : status === 'intermission' ? 'Round complete · next round soon' : status === 'finished' ? 'Tournament complete' : practice ? 'Open practice live' : status === 'live' ? 'Live competition' : 'Ready to shoot';
    const instruction = practice ? own?.role === 'player' ? 'Aim at the reticle · tap Shoot' : 'Join open practice to shoot now' : status === 'live' && own?.role === 'player' ? own.completed ? 'Round complete · watch the scores' : 'Aim at the reticle · tap Shoot' : !lockedStates.has(status) ? host() ? 'Tap Start open practice, or set up a tournament' : 'Open Range operations to choose a lane' : 'Watch the event · join next tournament';
    root.querySelector('[data-caption]').textContent = `${instruction} · ${ownRole} · ${playing} ${practice ? 'practicing' : 'competing'} / ${watching} watching`;
    query('[data-session-info]').textContent = `${stateMessage}. ${players.length} ${practice ? 'practicing' : `competitor${players.length === 1 ? '' : 's'}`} and ${watching} watching. ${own?.role === 'player' ? `You are in lane ${number(own.lane) + 1}. ${instruction}.` : practice ? 'Select a free lane and join at any time, or watch from the viewing area.' : 'Choose a lane before the start, or watch from the viewing area.'}`;
  }
  function renderResults() {
    const final = game?.results && !Array.isArray(game.results) ? game.results : null;
    const results = Array.isArray(game?.results) ? [...game.results] : Array.isArray(final?.rounds) ? [...final.rounds] : Array.isArray(game?.roundResults) ? [...game.roundResults] : [];
    if (final?.leaderboard?.length) {
      const winners = final.leaderboard.filter(member => final.winnerIds?.includes(member.id)).map(member => member.name || 'Player');
      const summary = final.winningTeam === 'draw' ? `Team draw · ${number(final.teams?.red).toLocaleString()} points each` : final.winningTeam ? `${String(final.winningTeam).toUpperCase()} team wins · ${number(final.teams?.[final.winningTeam]).toLocaleString()} points` : `${winners.join(' & ') || final.leaderboard[0].name || 'Player'} ${winners.length > 1 ? 'tie' : 'wins'} · ${number(final.leaderboard[0].score).toLocaleString()} points`;
      results.push({ summary, leaderboard: final.leaderboard, final: true });
    }
    const key = JSON.stringify(results);
    query('[data-results]').hidden = results.length === 0;
    query('[data-results-heading]').hidden = results.length === 0;
    query('[data-results-empty]').hidden = results.length > 0;
    if (key === lastResults) return;
    lastResults = key;
    const fragment = document.createDocumentFragment();
    for (const result of results.slice(-12).reverse()) {
      const item = document.createElement('li');
      const score = member => number(result.final ? member?.score : member?.roundScore ?? member?.score);
      const leaders = Array.isArray(result.leaderboard) ? [...result.leaderboard].sort((a, b) => score(b) - score(a)) : [];
      const winners = leaders.filter(member => result.winnerIds?.includes(member.id || member.actorId)).map(member => member.name || 'Player');
      const winner = result.winnerName || result.winner?.name || result.name || winners.join(' & ') || leaders[0]?.name;
      const summary = result.summary || (result.winningTeam === 'draw' ? `Team draw · ${number(result.teams?.red).toLocaleString()} points each` : result.winningTeam ? `${String(result.winningTeam).toUpperCase()} team wins · ${number(result.teams?.[result.winningTeam]).toLocaleString()} points` : winner ? `${winner}${winners.length > 1 ? ' tie' : ''} · ${number(result.score ?? result.winner?.score ?? score(leaders[0])).toLocaleString()} points` : 'Round completed');
      item.textContent = `${result.round ? `Round ${result.round}: ` : ''}${summary}`;
      for (const [index, participant] of leaders.entries()) {
        const detail = document.createElement('div');
        detail.textContent = `${index + 1}. ${participant.name || 'Player'} · ${score(participant).toLocaleString()} pts · ${number(participant.hits)} / ${number(participant.shots)} hits · ${firingRangeAccuracy(participant)}`;
        item.append(detail);
      }
      fragment.append(item);
    }
    query('[data-results]').replaceChildren(fragment);
  }
  return {
    render(state, actorId, available) {
      const previousState = game?.state;
      const incoming = state?.firingRange || state?.simulation?.firingRange || state;
      const nextGame = incoming && typeof incoming === 'object' ? incoming : null, nextEnabled = Boolean(available && nextGame);
      if (nextEnabled !== enabled || actorId !== selfId || nextGame?.revision !== game?.revision) {
        sessionEpoch++; busy = false; settingsDirty = false; setStatus('');
      }
      game = nextGame;
      selfId = actorId;
      enabled = nextEnabled;
      root.hidden = !enabled;
      stage.classList.toggle('firing-range-world', enabled);
      scope.render(enabled && self()?.role !== 'spectator');
      if (!enabled) { close(); return; }
      const settings = { ...FIRING_RANGE_SETUP_DEFAULTS, ...game.settings }, status = game.state || 'ready';
      root.querySelector('[data-phase]').textContent = settings.mode === 'freeplay' && status === 'live' ? 'OPEN PRACTICE' : ({ ready: 'RANGE READY', countdown: 'GET READY', live: 'LIVE TOURNAMENT', intermission: 'INTERMISSION', finished: 'FINAL RESULTS' })[status] || 'FIRING RANGE';
      root.querySelector('[data-mode]').textContent = modes[settings.mode] || 'Tournament';
      root.querySelector('[data-round]').textContent = settings.mode === 'freeplay' ? 'OPEN SESSION' : `ROUND ${Math.max(1, number(game.round))} / ${settings.rounds}`;
      const remaining = status === 'intermission' ? Math.max(0, number(game.nextRoundAt) - number(game.serverTime || Date.now())) : game.remainingMs ?? Math.max(0, number(game.endsAt) - Date.now());
      root.querySelector('[data-clock]').textContent = status === 'finished' ? 'FINAL' : settings.mode === 'freeplay' && status !== 'countdown' ? '∞' : status === 'ready' ? firingRangeClock(settings.durationSeconds * 1000) : firingRangeClock(remaining);
      root.querySelector('[data-self-score]').textContent = self()?.role === 'spectator' ? 'WATCHING' : `${number(self()?.score).toLocaleString()} pts`;
      const locationList = Array.isArray(game.locations) ? game.locations : Object.values(game.locations || {});
      const nextLocationsKey = JSON.stringify(locationList);
      if (locationsKey !== nextLocationsKey) {
        locationsKey = nextLocationsKey;
        const select = query('[name="range-location"]');
        select.replaceChildren();
        for (const [index, location] of locationList.entries()) { const option = document.createElement('option'); option.value = String(location.id || location.locationId || index); option.textContent = location.name || location.label || `Range ${index + 1}`; select.append(option); }
        if (!locationList.length) { const option = document.createElement('option'); option.value = game.activeLocationId || ''; option.textContent = 'Main firing range'; select.append(option); }
        select.value = game.activeLocationId || select.options[0]?.value || '';
      }
      if (previousState !== game.state && !busy) setStatus('');
      if (panel.open && !settingsDirty && !busy) writeSettings();
      if (game.state === 'finished' && previousState && previousState !== 'finished' && panel.open) selectSection('results');
      refreshControls(); renderLeaderboard(); renderResults();
    },
    open,
    close,
    scope: () => scope.options(),
    setScope: options => scope.set(options),
    destroy() { sessionEpoch++; enabled = false; close(); scope.destroy(); root.remove(); panel.remove(); style.remove(); stage.classList.remove('firing-range-world'); }
  };
}
