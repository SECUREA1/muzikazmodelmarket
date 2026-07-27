/** Shared Vibe Crib lifecycle used by every game entry point. */
const ENGINE_URL = './house-explorer-glb.js';
const MULTIPLAYER_URL = './public/js/crib-multiplayer.js';
const instances = new WeakMap();

const gameMarkup = `    <section class="section-block house-explorer" id="house-explorer" aria-labelledby="house-explorer-title">
      <div class="section-title"><span></span><h2 id="house-explorer-title">🏠 Vibe Crib Explorer</h2><a href="#house-explorer-canvas">Enter the crib</a></div>
      <div class="house-explorer-shell">
        <div class="house-stage">
          <canvas id="house-explorer-canvas" width="1280" height="720" aria-label="Interactive inside-the-house canvas explorer"></canvas>
          <div class="house-reticle" aria-hidden="true">+</div>
          <div class="house-status" id="house-status" role="status">Press Begin RAD-TOX to clear level 1 toxins, then face blue ghosts in the upper-floor level 2.</div>
          <section class="house-level-loader game-overlay" id="house-level-loader" hidden aria-live="polite" aria-label="Loading game level">
            <div class="game-overlay__content">
            <div class="house-level-loader__graphic" aria-hidden="true"><i></i><i></i><i></i><b>☢</b></div>
            <p class="kicker">RAD-TOX deployment</p>
            <h3 data-level-loader-title>Preparing level 1</h3>
            <p class="house-level-loader__message" data-level-loader-message>Loading your next encounter…</p>
            <div class="house-level-loader__scale" role="progressbar" aria-label="Level loading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span data-level-loader-fill></span></div>
            <strong data-level-loader-percent>0%</strong>
            </div>
          </section>
          <section class="house-game-start game-overlay" id="house-game-start" aria-labelledby="house-game-start-title">
            <div class="game-overlay__content">
            <p class="kicker">MUZIKAZ game</p>
            <h3 id="house-game-start-title">Ready to play?</h3>
            <p id="house-game-load-status" role="status">Preparing level 1 toxins and the level 2 ghost encounter…</p>
            <p class="house-firefox-note">RAD-TOX runs in browsers with WebGL support. The game starts as soon as the interior is ready.</p>
            <button class="btn house-start-button" type="button" data-house-start>Begin</button>
            </div>
          </section>
        </div>
        <aside class="house-hud" aria-label="Vibe Crib Explorer controls">
          <p class="kicker">Muzikaz Vibe Crib</p>
          <h3>Walk the drop-ready neon crib.</h3>
          <div class="hud-pill-grid">
            <span>WASD / arrows: move</span>
            <span>Mouse drag: pan + tilt</span>
            <span>Wheel: zoom</span>
            <span>Q / E: camera height</span>
            <span id="house-presence-count">Live in the house: 1</span>
            <span>Click floor: set drop location</span>
          </div>
          <label class="house-environment-picker">Environment file
            <select id="house-environment-select" aria-label="Choose house environment file">
              <option value="">Loading environment files…</option>
            </select>
          </label>
          <div class="house-actions">
            <button type="button" id="house-reset">Reset view</button>
            <button type="button" id="house-place-person">Set person drop-in</button>
            <button type="button" id="hand-toggle" aria-pressed="false">Enable hand control</button>
          </div>
          <div class="camera-preview-panel">
            <video id="hand-preview" playsinline muted></video>
            <span id="hand-status">Camera preview inactive. MediaPipe Hands loads only when enabled.</span>
          </div>
        </aside>
        <div class="mobile-move-pad" aria-label="Mobile movement and zoom controls">
          <button class="mobile-control mobile-control-primary" type="button" data-mobile-hold="forward" aria-label="Move forward"><b>▲</b><span>Forward</span></button>
          <button class="mobile-control mobile-control-side-right" type="button" data-mobile-hold="strafe-right" aria-label="Side right"><b>▶</b><span>Side right</span></button>
          <button class="mobile-control mobile-control-avatar" type="button" data-mobile-action="avatar" aria-label="Select avatar"><b>👤</b><span>Avatar</span></button>
          <button class="mobile-control mobile-control-environment" type="button" data-mobile-action="environment" aria-label="Select environment"><b>▤</b><span>Environment</span></button>
          <button class="mobile-control mobile-control-zoom-toggle" type="button" data-mobile-zoom-toggle="out" aria-pressed="false" aria-label="Zoom out"><b>−</b><span>Zoom out</span></button>
          <button class="mobile-control" type="button" data-mobile-hold="back" aria-label="Reverse"><b>▼</b><span>Reverse</span></button>
          <button class="mobile-control mobile-control-jump" type="button" data-mobile-action="jump" aria-label="Jump"><b>⤴</b><span>Jump</span></button>
        </div>
        <aside class="crib-social" id="crib-social" aria-label="Vibe Crib players and chat">
          <button class="crib-chat-toggle" id="crib-chat-toggle" type="button" aria-expanded="false" aria-controls="crib-chat-panel"><span>💬 Chat</span><b id="crib-online-count">0 / 15</b></button>
          <section class="crib-chat-panel" id="crib-chat-panel" hidden>
            <header><div><strong>Vibe Crib live</strong><small>Names and messages appear above every avatar</small></div><button type="button" data-close-chat aria-label="Close chat">×</button></header>
            <div class="crib-player-list" id="crib-player-list" aria-label="Players online"></div>
            <ol class="crib-chat-messages" id="crib-chat-messages" aria-live="polite"></ol>
            <form id="crib-chat-form"><label class="sr-only" for="crib-chat-input">Chat message</label><input id="crib-chat-input" maxlength="140" autocomplete="off" placeholder="Message the crib…" required><button type="submit">Send</button></form>
            <p id="crib-chat-status" role="status"></p>
          </section>
        </aside>
        <section class="crib-chat-dock" aria-label="Quick game chat">
          <div class="crib-chat-dock__label"><strong>💬 Live chat</strong><small id="crib-dock-online-count">0 / 15 online</small></div>
          <ol class="crib-chat-messages crib-chat-dock__messages" id="crib-dock-messages" aria-live="polite"></ol>
          <form id="crib-dock-form"><label class="sr-only" for="crib-dock-input">Quick chat message</label><input id="crib-dock-input" maxlength="140" autocomplete="off" placeholder="Chat above your avatar…" required><button type="submit">Send</button></form>
          <p id="crib-dock-status" role="status"></p>
        </section>
        <div class="house-bottom-controls" aria-label="Game controls">
          <button class="house-bottom-control" id="house-world-button" type="button" aria-expanded="false" aria-controls="house-picker-panel"><b aria-hidden="true">▤</b><span>World</span></button>
          <button class="house-bottom-control" id="house-fullscreen" type="button"><b aria-hidden="true">⛶</b><span>Fullscreen</span></button>
          <button class="house-bottom-control" id="add-avatar" type="button" aria-expanded="false" aria-controls="house-picker-panel"><b aria-hidden="true">👤</b><span>Avatar</span></button>
          <button class="house-bottom-control house-bottom-control-begin" id="house-start-game" type="button"><b aria-hidden="true">◉</b><span>Begin</span></button>
          <small class="house-firefox-label">WebGL required</small>
          <div class="house-world-menu" id="house-world-menu" hidden aria-hidden="true"></div>
        </div>
      </div>
    </section>`;

function loadClassicScript(src, marker) {
  const existing = document.querySelector(`script[data-crib-script="${marker}"]`);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src; script.dataset.cribScript = marker;
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error(`Unable to load ${marker}.`));
    document.body.append(script);
  });
}

function normalizeUser(options) {
  const storedAvatar = JSON.parse(localStorage.getItem('muzikazDesignatedAvatar') || 'null');
  const user = options.user || {};
  const avatar = options.avatarUrl ? { ...storedAvatar, modelUrl: options.avatarUrl } : storedAvatar;
  if (avatar) { window.MUZIKAZ_DESIGNATED_AVATAR = avatar; localStorage.setItem('muzikazDesignatedAvatar', JSON.stringify(avatar)); }
  if (user.email || user.id) localStorage.setItem('muzikazBottleMemberEmail', user.email || user.id);
  window.MUZIKAZ_CRIB_MEMBER = { ...user, username: options.username || user.username, selectedAvatarUrl: avatar?.modelUrl, ownedAssets: options.ownedAssets || user.ownedAssets || [], sessionToken: options.sessionToken || user.sessionToken || '' };
  return window.MUZIKAZ_CRIB_MEMBER;
}

export async function initializeCribGame(options = {}) {
  const container = options.container;
  if (!(container instanceof HTMLElement)) throw new TypeError('A Crib game container is required.');
  if (instances.has(container)) return instances.get(container);
  if (window.cribGameInstance && !window.cribGameInstance.destroyed) return window.cribGameInstance;
  normalizeUser(options);
  container.innerHTML = gameMarkup;
  container.querySelector('#house-game-start')?.toggleAttribute('hidden', Boolean(options.autoStart));
  if (options.autoStart) container.querySelector('#house-start-game')?.remove();
  let destroyed = false;
  const instance = {
    container,
    get destroyed() { return destroyed; },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      await window.MUZIKAZ_CRIB_MULTIPLAYER?.destroy?.();
      window.MUZIKAZ_HOUSE_ENGINE?.destroy?.();
      document.exitPointerLock?.();
      container.replaceChildren();
      instances.delete(container);
      if (window.cribGameInstance === instance) window.cribGameInstance = null;
      document.documentElement.removeAttribute('data-radtox-state');
      document.body.classList.remove('crib-game-active');
    }
  };
  instances.set(container, instance); window.cribGameInstance = instance;
  try {
    await loadClassicScript('./public/js/rad-tox-launcher.js', 'launcher');
    if (options.multiplayer !== false) await loadClassicScript(MULTIPLAYER_URL, 'multiplayer');
    if (options.autoStart) {
      const trigger = document.createElement('button');
      trigger.type = 'button'; trigger.hidden = true; trigger.dataset.houseStart = '';
      container.append(trigger);
      trigger.click();
      trigger.remove();
    }
    return instance;
  } catch (error) {
    await instance.destroy();
    throw error;
  }
}

window.initializeCribGame = initializeCribGame;
