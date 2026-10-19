import {sortWorlds} from './world-map-catalog.js';
export {sortWorlds} from './world-map-catalog.js';
import {mapWheelSvg,mapSectorKind} from './map-wheel-svg.js';
import {mountWorldAtlas} from './world-atlas.js';
import {mountWorldPreview} from './world-destination-preview.js';

const mounted = new WeakMap();

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const kindNames = {basketball:'Basketball', hockey:'Ice hockey', range:'Firing range', arcade:'Arcade', world:'World'};
const kindIcons = {basketball:'◉', hockey:'✦', range:'◎', arcade:'✧', world:'⌂'};

export function filterWorlds(worlds, query = '') {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return worlds.filter(({env}) => words.every(word => [env.name, env.id, env.category, env.description, env.ownerName, env.roomId, env.districtName, env.deedId, env.worldId, kindNames[mapSectorKind(env)]].join(' ').toLowerCase().includes(word)));
}

export function filterWorldCategory(worlds, category = 'all') {
  return worlds.filter(({env, count}) => category === 'all' || (category === 'live' ? count > 0 : category === 'games' ? mapSectorKind(env) !== 'world' : mapSectorKind(env) === category));
}

export function mountWorldMapPicker(root, worlds, options) {
  const previous = mounted.get(root);
  if (previous?.element.parentElement === root) return previous.update(worlds, options);
  previous?.dispose();
  let {currentId, onJoin, onClose} = options;
  worlds = sortWorlds(worlds);
  const selectedBefore = root.dataset.selectedWorldId || currentId;
  const query = root.dataset.worldQuery || '';
  const searchFocused = root.querySelector('[data-world-search]') === document.activeElement;
  const focusedWorldId = root.contains(document.activeElement) ? document.activeElement?.dataset.worldCard : null;
  let category = root.dataset.worldCategory || 'all';
  if (!['all', 'live', 'games', 'basketball', 'hockey', 'range', 'world'].includes(category)) category = 'all';
  root.innerHTML = `<section class="world-map-picker world-lobby" aria-label="Game and server lobby">
    <header><div><small>MUZIKAZ • WORLD NAVIGATOR</small><h3>Choose your game world</h3><p>Select a slice, preview the map in 3D, and enter your next game.</p></div><button type="button" class="world-lobby-close" data-world-close aria-label="Close game and server lobby">×</button></header>
    <div class="world-lobby-stats"><span><i aria-hidden="true"></i><strong data-world-online></strong> players online</span><span><strong data-world-total></strong> destinations</span><span>Solo &amp; multiplayer</span></div>
    <label class="world-map-search"><span>Find a game or server</span><input type="search" data-world-search placeholder="Search hockey, basketball, maps, or creators…" autocomplete="off"></label>
    <div class="world-lobby-filters" role="group" aria-label="Filter destinations"><button type="button" data-world-filter="all">All spaces</button><button type="button" data-world-filter="live">● Live now</button><button type="button" data-world-filter="basketball">Basketball</button><button type="button" data-world-filter="hockey">Ice hockey</button><button type="button" data-world-filter="range">Firing ranges</button><button type="button" data-world-filter="games">All games</button><button type="button" data-world-filter="world">Explore worlds</button></div>
    <div class="world-lobby-layout"><div class="world-lobby-browse"><div class="world-lobby-results"><h4 data-world-pie-title>Priority maps</h4><span data-world-count role="status"></span></div>
      <div class="world-map-wheel" role="group" aria-label="World map pie"><div class="world-map-center"><strong>MUZIKAZ</strong><span data-world-page></span></div><div data-world-sectors></div></div>
      <div class="world-lobby-empty" data-world-empty hidden><strong>No matches yet</strong><p>Try a different name, or clear the search and choose All spaces.</p><button type="button" data-world-reset>Show all spaces</button></div>
      <div class="world-map-pages"><button type="button" data-world-prev aria-label="Previous map pie">← Previous</button><span data-world-page-label></span><button type="button" data-world-next aria-label="Next map pie">Next →</button></div>
      <details class="world-lobby-list"><summary>Map list for this pie</summary><div class="world-lobby-cards" data-world-cards></div></details></div>
    <aside class="world-map-detail world-lobby-detail"><div data-world-preview></div><small data-world-kind></small><h3 data-world-name></h3><p data-world-description></p><p class="world-lobby-presence" data-world-live></p><dl class="world-lobby-meta"><div><dt>Server / room</dt><dd data-world-room></dd></div><div><dt>Play access</dt><dd data-world-access></dd></div></dl><button type="button" class="world-lobby-join" data-world-join>Join destination →</button><p class="world-lobby-next" data-world-next-step></p><p class="world-lobby-error" data-world-error role="status"></p></aside></div>
  </section>`;
  const search = root.querySelector('[data-world-search]');
  const sectors = root.querySelector('[data-world-sectors]');
  const cards = root.querySelector('[data-world-cards]');
  const join = root.querySelector('[data-world-join]');
  let selected = worlds.find(({env}) => env.id === selectedBefore) || worlds[0];
  let page = Math.max(0, Number(root.dataset.worldPage) || 0);
  let joining = false;
  let preview = null;
  let disposed = false;
  search.value = query;
  const filtered = () => filterWorldCategory(filterWorlds(worlds, search.value), category);

  function details() {
    if (disposed) return;
    root.dataset.selectedWorldId = selected?.env.id || '';
    const env = selected?.env;
    const kind = env ? mapSectorKind(env) : 'world';
    root.querySelector('[data-world-name]').textContent = env?.name || env?.id || 'No destinations found';
    root.querySelector('[data-world-description]').textContent = env ? `${env.description || 'A new space to explore and play.'}${env.ownerName ? ' · Built by ' + env.ownerName : ''}` : 'Try another search or choose All spaces to see every destination.';
    root.querySelector('[data-world-live]').textContent = selected ? `${selected.count} player${selected.count === 1 ? '' : 's'} here${env.id === currentId ? ' · Your current space' : selected.count > 0 ? ' · Join the action' : ' · Be the first to join'}` : '';
    root.querySelector('[data-world-room]').textContent = env?.roomId || env?.id || '—';
    root.querySelector('[data-world-access]').textContent = env ? env.multiplayer === false ? 'Solo play' : 'Live multiplayer' : '—';
    root.querySelector('[data-world-kind]').textContent = kindNames[kind];
    const previewRoot = root.querySelector('[data-world-preview]');
    previewRoot.hidden = !env;
    if (env) preview = mountWorldPreview(previewRoot, env);
    else {preview?.dispose(); preview = null; previewRoot.replaceChildren();}
    root.querySelector('[data-world-next-step]').textContent = !env ? '' : ['basketball', 'hockey'].includes(kind) ? 'Next: choose your side, tune the match, and start playing.' : kind === 'arcade' ? 'Next: choose a game and play solo or with friends.' : kind === 'range' ? 'Next: practice, enter a tournament, or visit the armory and market.' : 'Enter the world to explore, meet players, and play.';
    join.disabled = !selected || joining;
    join.textContent = joining ? 'Joining…' : env?.id === currentId ? 'Return to this space →' : kind === 'basketball' ? 'Enter the court →' : kind === 'hockey' ? 'Enter the arena →' : kind === 'arcade' ? 'Enter the arcade →' : kind === 'range' ? 'Enter the range →' : 'Join this space →';
  }

  function choose(id, focusSelector) {
    if (joining) return;
    selected = worlds.find(item => item.env.id === id);
    root.querySelector('[data-world-error]').textContent = '';
    render();
    if (focusSelector) [...root.querySelectorAll(focusSelector)].find(button => (button.dataset.worldId || button.dataset.worldCard) === id)?.focus({preventScroll:true});
  }

  function render() {
    if (disposed) return;
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / 6));
    page = Math.max(0, Math.min(page, pages - 1));
    const visible = list.slice(page * 6, page * 6 + 6);
    if (!visible.some(item => item.env.id === selected?.env.id)) selected = visible[0];
    root.dataset.worldPage = String(page);
    root.querySelector('[data-world-online]').textContent = worlds.reduce((sum, world) => sum + Math.max(0, Number(world.count) || 0), 0);
    root.querySelector('[data-world-total]').textContent = worlds.length;
    root.querySelector('[data-world-pie-title]').textContent = category !== 'all' || search.value.trim() ? 'Matching destinations' : page === 0 ? 'Priority maps' : 'More maps';
    root.querySelector('.world-map-wheel').hidden = !visible.length;
    root.querySelector('[data-world-empty]').hidden = !!visible.length;
    root.querySelector('.world-lobby-list').hidden = !visible.length;
    cards.innerHTML = visible.map(({env, count}) => {
      const kind = mapSectorKind(env);
      return `<button type="button" class="world-lobby-card" data-world-card="${escape(env.id)}" data-kind="${kind}" aria-pressed="${env.id === selected?.env.id}"><span class="world-lobby-card-icon" aria-hidden="true">${kindIcons[kind]}</span><span class="world-lobby-card-copy"><small>${kindNames[kind]}</small><strong>${escape(env.name || env.id)}</strong><span>${escape(env.category || (env.multiplayer === false ? 'Solo experience' : 'Multiplayer space'))}</span></span><span class="world-lobby-card-live${count > 0 ? ' is-live' : ''}">${count > 0 ? escape(count) + ' live' : 'Open'}${env.id === currentId ? '<small>YOU ARE HERE</small>' : ''}</span></button>`;
    }).join('');
    for (const button of cards.querySelectorAll('[data-world-card]')) button.addEventListener('click', () => choose(button.dataset.worldCard, '[data-world-card]'));
    sectors.innerHTML = mapWheelSvg(visible, selected?.env.id);
    for (const button of sectors.querySelectorAll('[data-world-id]')) {
      button.addEventListener('click', () => choose(button.dataset.worldId, '[data-world-id]'));
      button.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); choose(button.dataset.worldId, '[data-world-id]');}
        else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          const buttons = [...sectors.querySelectorAll('[data-world-id]')];
          const index = buttons.indexOf(button);
          buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }
      });
    }
    for (const button of root.querySelectorAll('[data-world-filter]')) button.setAttribute('aria-pressed', String(button.dataset.worldFilter === category));
    root.querySelector('[data-world-page]').textContent = `PIE ${page + 1} / ${pages}`;
    root.querySelector('[data-world-page-label]').textContent = `Pie ${page + 1} of ${pages}`;
    root.querySelector('[data-world-count]').textContent = `${list.length} destination${list.length === 1 ? '' : 's'}`;
    root.querySelector('[data-world-prev]').disabled = page === 0 || joining;
    root.querySelector('[data-world-next]').disabled = page === pages - 1 || joining;
    details();
  }

  search.addEventListener('input', () => {root.dataset.worldQuery = search.value; page = 0; render();});
  for (const button of root.querySelectorAll('[data-world-filter]')) button.addEventListener('click', () => {category = button.dataset.worldFilter; root.dataset.worldCategory = category; page = 0; render();});
  root.querySelector('[data-world-prev]').addEventListener('click', () => {page--; render();});
  root.querySelector('[data-world-next]').addEventListener('click', () => {page++; render();});
  root.querySelector('[data-world-reset]').addEventListener('click', () => {search.value = ''; root.dataset.worldQuery = ''; category = 'all'; root.dataset.worldCategory = category; page = 0; render(); search.focus();});
  root.querySelector('[data-world-close]').addEventListener('click', () => {controller.dispose(); onClose();});
  join.addEventListener('click', async () => {
    if (!selected || joining) return;
    joining = true;
    details();
    try {await onJoin(selected.env);}
    catch (error) {root.querySelector('[data-world-error]').textContent = error.message || 'This destination could not be opened. Please try again.';}
    finally {joining = false; details();}
  });
  const atlas = document.createElement('details');
  atlas.className = 'world-lobby-atlas';
  const summary = document.createElement('summary');
  summary.textContent = 'Public streets, live activity & meeting locations';
  const atlasRoot = document.createElement('section');
  atlas.append(summary, atlasRoot);
  root.querySelector('.world-map-picker').append(atlas);
  atlas.addEventListener('toggle', () => {
    if (atlas.open) mountWorldAtlas(atlasRoot, {onTravel:async url => {
      const destination = new URL(url, location.href);
      const id = destination.searchParams.get('environment');
      const entry = worlds.find(item => item.env.id === id);
      await onJoin({...entry?.env, id, name:entry?.env.name || id, meetingId:destination.searchParams.get('meet')});
    }});
  });
  const dialog = root.closest('dialog');
  const onDialogClose = () => {if (!dialog.open) controller.dispose();};
  const controller = {
    element: root.querySelector('.world-map-picker'),
    update(nextWorlds, nextOptions) {
      const focused = root.contains(document.activeElement) ? document.activeElement : null;
      const focusedId = focused?.dataset.worldId || focused?.dataset.worldCard;
      const focusSelector = focused?.dataset.worldId ? '[data-world-id]' : '[data-world-card]';
      worlds = sortWorlds(nextWorlds);
      ({currentId, onJoin, onClose} = nextOptions);
      selected = worlds.find(item => item.env.id === selected?.env.id);
      const selectedIndex = filtered().findIndex(item => item.env.id === selected?.env.id);
      if (selectedIndex >= 0) page = Math.floor(selectedIndex / 6);
      render();
      if (focusedId) [...root.querySelectorAll(focusSelector)].find(button => (button.dataset.worldId || button.dataset.worldCard) === focusedId)?.focus({preventScroll:true});
      return controller;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      preview?.dispose();
      preview = null;
      dialog?.removeEventListener('close', onDialogClose);
      mounted.delete(root);
    }
  };
  mounted.set(root, controller);
  dialog?.addEventListener('close', onDialogClose);
  render();
  if (searchFocused) search.focus({preventScroll:true});
  else if (focusedWorldId) [...cards.querySelectorAll('[data-world-card]')].find(button => button.dataset.worldCard === focusedWorldId)?.focus({preventScroll:true});
  return controller;
}
