const tokens = [
  { id: 'remix', name: 'Remix', icon: '🎧', color: '#9cff00', pattern: [1,0,1,0,1,0,1,1], tone: 220 },
  { id: 'byte', name: 'Byte', icon: '🦆', color: '#24d8ff', pattern: [1,1,0,1,0,1,0,0], tone: 330 },
  { id: 'inferno', name: 'Inferno', icon: '🔥', color: '#ff5a19', pattern: [1,0,0,1,1,0,0,1], tone: 110 },
  { id: 'luna', name: 'Luna', icon: '🌙', color: '#f05cff', pattern: [0,1,0,1,0,1,1,0], tone: 440 },
  { id: 'nexus', name: 'Nexus', icon: '🤖', color: '#b8ffef', pattern: [1,0,1,1,0,1,0,1], tone: 550 },
  { id: 'sparky', name: 'Sparky', icon: '⚡', color: '#ffda3a', pattern: [1,1,1,0,1,0,1,0], tone: 660 },
  { id: 'black-sheep', name: 'Black Sheep', icon: '🐑', color: '#ffffff', pattern: [0,0,1,0,1,1,0,1], tone: 165 },
  { id: 'ronaldo', name: 'Ronaldo', icon: '⚽', color: '#6ec400', pattern: [1,0,0,0,1,0,1,0], tone: 260 }
];
const instruments = [
  { id: 'drums', name: 'Drums', wave: 'square', gain: .12, steps: 32 },
  { id: 'bass', name: 'Bass', wave: 'sawtooth', gain: .08, steps: 32 },
  { id: 'chords', name: 'Chords', wave: 'triangle', gain: .055, steps: 32 },
  { id: 'lead', name: 'Lead', wave: 'sine', gain: .075, steps: 32 },
  { id: 'vox', name: 'Vox Chop', wave: 'triangle', gain: .06, steps: 32 },
  { id: 'fx', name: 'FX', wave: 'sawtooth', gain: .045, steps: 32 },
  { id: 'brass', name: 'Brass', wave: 'square', gain: .05, steps: 32 },
  { id: 'strings', name: 'Strings', wave: 'sine', gain: .05, steps: 32 }
];
const state = { assignments: {}, playing: false, ctx: null, timers: [] };
const $ = (selector) => document.querySelector(selector);
const tokenBank = $('#token-bank');
const lanes = $('#mixer-lanes');
const readout = $('#mixer-readout');
function initAssignments(){ instruments.forEach((inst) => state.assignments[inst.id] ||= Array(inst.steps).fill(null)); }
function renderTokenBank(){ tokenBank.innerHTML = tokens.map((token) => `<button class="nft-token" draggable="true" data-token="${token.id}" style="--token:${token.color}"><span>${token.icon}</span><strong>${token.name}</strong><small>Pattern NFT</small></button>`).join(''); }
function renderLanes(){ lanes.innerHTML = instruments.map((inst) => `<article class="mixer-lane" data-lane="${inst.id}"><header><strong>${inst.name}</strong><span>${inst.steps} bars · drop NFTs anywhere</span></header><div class="bar-slots">${state.assignments[inst.id].map((tokenId, index) => slotHtml(inst.id, index, tokenId)).join('')}</div></article>`).join(''); updateReadout(); }
function slotHtml(lane, index, tokenId){ const token = tokens.find((item) => item.id === tokenId); return `<button type="button" class="bar-slot ${token ? 'filled' : ''}" data-lane="${lane}" data-step="${index}" style="--token:${token?.color || '#315500'}">${token ? `<span>${token.icon}</span><small>${index + 1}</small>` : `<small>${index + 1}</small>`}</button>`; }
function updateReadout(){ const count = Object.values(state.assignments).flat().filter(Boolean).length; readout.value = `${$('#mixer-length').value}s · ${$('#mixer-tempo').value} BPM · ${count} tokens`; }
function tokenFromEvent(event){ return event.dataTransfer?.getData('text/plain') || event.target.closest('[data-token]')?.dataset.token; }
function placeToken(lane, step, tokenId){ if (!state.assignments[lane] || !tokens.some((token) => token.id === tokenId)) return; state.assignments[lane][step] = tokenId; renderLanes(); }
function clearTimers(){ state.timers.forEach(clearTimeout); state.timers = []; }
function stopMix(){ state.playing = false; clearTimers(); document.body.classList.remove('mix-playing'); }
function playHit(inst, token, when){ const ctx = state.ctx; const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = inst.wave; osc.frequency.setValueAtTime(token.tone * (inst.id === 'bass' ? .5 : inst.id === 'strings' ? 1.5 : 1), when); gain.gain.setValueAtTime(0.0001, when); gain.gain.exponentialRampToValueAtTime(inst.gain, when + .01); gain.gain.exponentialRampToValueAtTime(0.0001, when + .16); osc.connect(gain).connect(ctx.destination); osc.start(when); osc.stop(when + .18); }
function playMix(){ stopMix(); state.ctx ||= new (window.AudioContext || window.webkitAudioContext)(); state.ctx.resume(); state.playing = true; document.body.classList.add('mix-playing'); const tempo = Number($('#mixer-tempo').value); const maxLength = Math.min(120, Number($('#mixer-length').value)); const stepMs = 60000 / tempo / 2; const totalSteps = Math.floor((maxLength * 1000) / stepMs); const start = state.ctx.currentTime + .08; for (let i = 0; i < totalSteps; i += 1) { const timer = setTimeout(() => { if (!state.playing) return; document.querySelectorAll('.bar-slot.is-now').forEach((el) => el.classList.remove('is-now')); instruments.forEach((inst) => { const step = i % inst.steps; document.querySelector(`[data-lane="${inst.id}"][data-step="${step}"]`)?.classList.add('is-now'); const token = tokens.find((item) => item.id === state.assignments[inst.id][step]); if (token && token.pattern[i % token.pattern.length]) playHit(inst, token, state.ctx.currentTime + .01); }); }, i * stepMs); state.timers.push(timer); } state.timers.push(setTimeout(stopMix, maxLength * 1000)); }
function autoFill(){ instruments.forEach((inst, laneIndex) => { state.assignments[inst.id] = state.assignments[inst.id].map((_, step) => (step % (laneIndex % 3 + 2) === 0 ? tokens[(step + laneIndex) % tokens.length].id : null)); }); renderLanes(); }
function bindEvents(){ document.addEventListener('dragstart', (event) => { const tokenId = event.target.closest('[data-token]')?.dataset.token; if (tokenId) event.dataTransfer.setData('text/plain', tokenId); }); lanes.addEventListener('dragover', (event) => { if (event.target.closest('.bar-slot')) event.preventDefault(); }); lanes.addEventListener('drop', (event) => { const slot = event.target.closest('.bar-slot'); if (!slot) return; event.preventDefault(); placeToken(slot.dataset.lane, Number(slot.dataset.step), tokenFromEvent(event)); }); lanes.addEventListener('click', (event) => { const slot = event.target.closest('.bar-slot'); if (!slot) return; state.assignments[slot.dataset.lane][Number(slot.dataset.step)] = null; renderLanes(); }); $('#mixer-play').addEventListener('click', playMix); $('#mixer-stop').addEventListener('click', stopMix); $('#mixer-random').addEventListener('click', autoFill); $('#mixer-clear').addEventListener('click', () => { initAssignments(); Object.keys(state.assignments).forEach((lane) => state.assignments[lane].fill(null)); renderLanes(); }); ['#mixer-tempo','#mixer-length'].forEach((id) => $(id).addEventListener('input', updateReadout)); }
initAssignments(); renderTokenBank(); renderLanes(); bindEvents();
