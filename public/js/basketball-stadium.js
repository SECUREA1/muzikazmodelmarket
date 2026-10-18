// Regulation dimensions are shared by the authored court and the room rules.
// THREE is injected so browser worlds, Backpack items, and server collision use
// their existing Three instance without a second renderer or a network import.
export const BASKETBALL_COURT = Object.freeze({
  width: 15.24, length: 28.65, rimHeight: 3.05, rimRadius: .2286,
  hoopDistance: 12.75, threePointRadius: 7.239, freeThrowDistance: 5.79,
  arenaWidth: 46, arenaLength: 62
});

const HOME = 0x20c8f1;
const AWAY = 0xe9597b;

function helpers(THREE, root) {
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .15, ...extra });
  const add = (geometry, mat, position = [0, 0, 0], name = 'ARENA_STRUCTURE', decorative = false) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = name; mesh.position.set(...position); mesh.castShadow = mesh.receiveShadow = true;
    if (decorative) mesh.userData.collisionDisabled = true;
    root.add(mesh); return mesh;
  };
  const box = (size, mat, position, name, decorative) => add(new THREE.BoxGeometry(...size), mat, position, name, decorative);
  const tube = (a, b, radius, mat, name = 'ARENA_RAIL', decorative = false) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const part = add(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), mat, start.add(end).multiplyScalar(.5).toArray(), name, decorative);
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return part;
  };
  return { material, add, box, tube };
}

function canvasTexture(THREE, width, height, draw) {
  // The server builds identical physical geometry without needing a DOM.
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (!context) return null;
  draw?.(context, canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, context, texture };
}

/** A floor-standing basket whose rim is [0, 3.05, 0] and faces local +Z. */
export function createBasketballHoop(THREE, options = {}) {
  const root = new THREE.Group(); root.name = 'BASKETBALL_HOOP';
  const { material, add, box, tube } = helpers(THREE, root);
  const team = options.team === 'away' ? 'away' : 'home';
  const steel = material(0xc0cbd1, { roughness: .23, metalness: .88 });
  const navy = material(0x081b2d, { roughness: .65 });
  const pad = material(team === 'home' ? HOME : AWAY, { roughness: .87, metalness: 0 });
  const white = material(0xf8faff, { roughness: .8, metalness: 0 });
  const rimMaterial = material(0xff5a19, { roughness: .32, metalness: .7 });
  // Support equipment stays behind the baseline; the playing area below the
  // basket remains open, as it is in a professional arena.
  box([1.48, .38, 1.55], navy, [0, .19, -1.76], 'BASKETBALL_PADDED_BASE');
  box([.7, 2.1, .7], pad, [0, 1.34, -1.99], 'BASKETBALL_PADDED_STANCHION');
  tube([0, .4, -2.06], [0, 3.68, -1.65], .12, steel, 'BASKETBALL_SUPPORT');
  tube([0, 3.68, -1.65], [0, 3.55, -.43], .105, steel, 'BASKETBALL_SUPPORT');
  tube([-.49, 3.52, -.43], [.49, 3.52, -.43], .065, steel, 'BASKETBALL_SUPPORT');
  const glass = material(0xbed9e5, { roughness: .08, metalness: .1, transparent: true, opacity: .23, side: THREE.DoubleSide });
  box([1.829, 1.067, .045], glass, [0, 3.4355, -.381], 'BASKETBALL_GLASS_BACKBOARD');
  [[[-.9145, 2.902, -.345], [.9145, 2.902, -.345]], [[-.9145, 3.969, -.345], [.9145, 3.969, -.345]], [[-.9145, 2.902, -.345], [-.9145, 3.969, -.345]], [[.9145, 2.902, -.345], [.9145, 3.969, -.345]]].forEach(([a, b]) => tube(a, b, .022, white, 'BASKETBALL_BOARD_FRAME'));
  [[[-.305, 3.05, -.342], [.305, 3.05, -.342]], [[-.305, 3.507, -.342], [.305, 3.507, -.342]], [[-.305, 3.05, -.342], [-.305, 3.507, -.342]], [[.305, 3.05, -.342], [.305, 3.507, -.342]]].forEach(([a, b]) => tube(a, b, .012, white, 'BASKETBALL_TARGET_RECTANGLE', true));
  box([1.85, .12, .11], pad, [0, 2.9, -.36], 'BASKETBALL_BOARD_PADDING');
  box([.14, .08, .18], rimMaterial, [0, 3.05, -.29], 'BASKETBALL_BREAKAWAY_MOUNT');
  const rim = add(new THREE.TorusGeometry(BASKETBALL_COURT.rimRadius, .013, 10, 48), rimMaterial, [0, 3.05, 0], 'BASKETBALL_RIM');
  rim.rotation.x = Math.PI / 2;
  const net = new THREE.Group(); net.name = 'BASKETBALL_ANIMATED_NET'; net.position.y = 3.045;
  net.userData.collisionDisabled = true; root.add(net);
  const netHelpers = helpers(THREE, net);
  // Interlocking diamonds taper toward the bottom, leaving an open sleeve.
  const count = 12, rows = 4, height = .45;
  for (let row = 0; row < rows; row++) {
    const radiusA = .218 - row * .019, radiusB = .218 - (row + 1) * .019;
    for (let index = 0; index < count; index++) {
      const angle = index / count * Math.PI * 2 + (row % 2 ? Math.PI / count : 0);
      const a = [Math.sin(angle) * radiusA, -row / rows * height, Math.cos(angle) * radiusA];
      for (const direction of [-1, 1]) {
        const angleB = angle + direction * Math.PI / count;
        netHelpers.tube(a, [Math.sin(angleB) * radiusB, -(row + 1) / rows * height, Math.cos(angleB) * radiusB], .0033, white, 'BASKETBALL_NET_CORD', true);
      }
    }
  }
  root.userData.basketballHoop = { rim: [0, 3.05, 0], radius: BASKETBALL_COURT.rimRadius, team };
  let swishAt = -100;
  root.userData.swish = (elapsed = 0) => { swishAt = elapsed; };
  root.userData.updateBasketballEffects = (elapsed, reducedMotion = false) => {
    const age = elapsed - swishAt, strength = !reducedMotion && age >= 0 && age < 1.1 ? Math.exp(-age * 4) : 0;
    net.scale.y = 1 + Math.sin(age * 23) * strength * .3;
    net.rotation.z = Math.sin(age * 17) * strength * .12;
  };
  return root;
}

function courtTexture(THREE) {
  const { width, length } = BASKETBALL_COURT;
  return canvasTexture(THREE, 1024, Math.round(1024 * length / width), (ctx, canvas) => {
    const scale = canvas.width / width;
    const x = value => (value + width / 2) * scale, z = value => (value + length / 2) * scale;
    ctx.fillStyle = '#d5a869'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Deterministic maple boards, seams and fine grain remain crisp when the
    // camera is close to the floor. No repeating external texture is required.
    for (let col = 0; col < 54; col++) {
      const left = col * canvas.width / 54, plankWidth = canvas.width / 54;
      for (let row = -1; row < 13; row++) {
        const top = (row + (col % 3) / 3) * canvas.height / 11;
        const hue = 31 + Math.sin(col * 13 + row * 7) * 3, lightness = 62 + Math.sin(col * 5.1 + row * 7.3) * 5;
        ctx.fillStyle = `hsl(${hue} 53% ${lightness}%)`; ctx.fillRect(left, top, plankWidth, canvas.height / 11);
        ctx.strokeStyle = 'rgba(75,43,18,.19)'; ctx.lineWidth = .65; ctx.strokeRect(left, top, plankWidth, canvas.height / 11);
        for (let grain = 0; grain < 4; grain++) {
          ctx.strokeStyle = `rgba(98,59,24,${.025 + grain * .008})`; ctx.beginPath();
          ctx.moveTo(left + grain * plankWidth / 5, top); ctx.lineTo(left + (grain + .25) * plankWidth / 5, top + canvas.height / 11); ctx.stroke();
        }
      }
    }
    const stroke = '#f7f3df'; ctx.strokeStyle = stroke; ctx.lineWidth = .05 * scale;
    const line = (x1, z1, x2, z2) => { ctx.beginPath(); ctx.moveTo(x(x1), z(z1)); ctx.lineTo(x(x2), z(z2)); ctx.stroke(); };
    const arc = (cx, cz, radius, start, end, anticlockwise = false) => { ctx.beginPath(); ctx.arc(x(cx), z(cz), radius * scale, start, end, anticlockwise); ctx.stroke(); };
    for (const side of [-1, 1]) {
      const baseline = side * length / 2, freeThrow = side * (length / 2 - 5.79), rimZ = side * 12.75;
      ctx.fillStyle = side < 0 ? 'rgba(8,51,79,.88)' : 'rgba(145,48,27,.86)';
      ctx.fillRect(x(-2.4384), Math.min(z(baseline), z(freeThrow)), 4.8768 * scale, 5.79 * scale);
      ctx.strokeRect(x(-2.4384), Math.min(z(baseline), z(freeThrow)), 4.8768 * scale, 5.79 * scale);
      arc(0, freeThrow, 1.8288, 0, Math.PI * 2);
      const angle = Math.acos(6.706 / 7.239), joinZ = rimZ - side * Math.sin(angle) * 7.239;
      line(-6.706, baseline, -6.706, joinZ); line(6.706, baseline, 6.706, joinZ);
      arc(0, rimZ, 7.239, side < 0 ? angle : Math.PI + angle, side < 0 ? Math.PI - angle : Math.PI * 2 - angle);
      arc(0, rimZ, 1.2192, side < 0 ? 0 : Math.PI, side < 0 ? Math.PI : Math.PI * 2);
      line(-.9145, rimZ + side * .381, .9145, rimZ + side * .381);
      for (const distance of [1.22, 2.13, 3.05, 4.27]) {
        for (const laneSide of [-1, 1]) line(laneSide * 2.4384, baseline - side * distance, laneSide * 2.69, baseline - side * distance);
      }
    }
    line(-width / 2, 0, width / 2, 0); arc(0, 0, 1.8288, 0, Math.PI * 2);
    ctx.strokeRect(x(-width / 2) + .025 * scale, z(-length / 2) + .025 * scale, (width - .05) * scale, (length - .05) * scale);
    ctx.save(); ctx.translate(x(0), z(0));
    ctx.fillStyle = '#0a1b30'; ctx.beginPath(); ctx.arc(0, 0, 1.46 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#20c8f1'; ctx.lineWidth = .035 * scale; ctx.stroke();
    ctx.fillStyle = '#f4f7ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${.45 * scale}px system-ui,sans-serif`; ctx.fillText('MUZIKAZ', 0, -.12 * scale);
    ctx.fillStyle = '#20c8f1'; ctx.font = `700 ${.19 * scale}px system-ui,sans-serif`; ctx.fillText('BASKETBALL', 0, .32 * scale); ctx.restore();
    ctx.save(); ctx.translate(x(-6.95), z(0)); ctx.rotate(-Math.PI / 2); ctx.fillStyle = 'rgba(9,25,42,.65)'; ctx.font = `800 ${.3 * scale}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillText('EVERY PLAYER • EVERY GAME', 0, 0); ctx.restore();
  });
}

function scoreboard(THREE, arena) {
  const group = new THREE.Group(); group.name = 'ARENA_LIVE_JUMBOTRON';
  group.position.set(0, 10.2, 0); group.userData.collisionDisabled = true; arena.add(group);
  const { material, box, add, tube } = helpers(THREE, group);
  const dark = material(0x080f1b, { roughness: .34, metalness: .8 });
  const accent = material(HOME, { emissive: HOME, emissiveIntensity: 1.6, roughness: .3 });
  box([6.9, 3.8, 6.9], dark, [0, 0, 0], 'ARENA_JUMBOTRON_HOUSING', true);
  const display = canvasTexture(THREE, 1024, 512);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, ...(display ? { map: display.texture } : { color: 0x142b43 }), toneMapped: false });
  for (let side = 0; side < 4; side++) {
    const angle = side * Math.PI / 2;
    const screen = add(new THREE.PlaneGeometry(6.52, 3.26), screenMat, [Math.sin(angle) * 3.463, 0, Math.cos(angle) * 3.463], 'ARENA_LIVE_SCOREBOARD_SCREEN', true);
    screen.rotation.y = angle;
  }
  box([7.05, .08, 7.05], accent, [0, -1.78, 0], 'ARENA_LED_JUMBOTRON_TRIM', true);
  box([7.05, .08, 7.05], accent, [0, 1.78, 0], 'ARENA_LED_JUMBOTRON_TRIM', true);
  for (const x of [-2.7, 2.7]) for (const z of [-2.7, 2.7]) tube([x, 1.9, z], [x, 7, z], .035, dark, 'ARENA_JUMBOTRON_CABLE', true);
  let state = { state: 'ready', homeScore: 0, awayScore: 0, quarter: 1, clockMs: 720000, shotClockMs: 24000, possession: 'home', lastPlay: 'Start a game • All players welcome' }, lastKey = '';
  const clock = milliseconds => { const seconds = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
  function update(next = null, elapsed = 0, reducedMotion = false) {
    if (next) state = { ...state, ...next };
    const phase = reducedMotion ? 0 : Math.floor(elapsed * 3) % 2;
    const key = [state.state, state.homeScore, state.awayScore, state.quarter, clock(state.clockMs), Math.ceil(state.shotClockMs / 1000), state.possession, state.lastPlay, phase].join('|');
    if (!display || key === lastKey) return; lastKey = key;
    const ctx = display.context, width = display.canvas.width;
    ctx.fillStyle = '#030b15'; ctx.fillRect(0, 0, width, 512);
    const gradient = ctx.createLinearGradient(0, 0, width, 0); gradient.addColorStop(0, '#073f60'); gradient.addColorStop(.48, '#0c192b'); gradient.addColorStop(1, '#632c25');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, 76);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = '#f4f9ff'; ctx.font = '800 30px system-ui,sans-serif'; ctx.fillText('MUZIKAZ  •  BASKETBALL ARENA', 512, 39);
    ctx.font = '800 26px system-ui,sans-serif'; ctx.fillStyle = '#20c8f1'; ctx.fillText('HOME', 205, 116); ctx.fillStyle = '#ff809a'; ctx.fillText('AWAY', 819, 116);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 154px monospace'; ctx.fillText(String(state.homeScore).padStart(2, '0'), 205, 235); ctx.fillText(String(state.awayScore).padStart(2, '0'), 819, 235);
    ctx.fillStyle = '#ffc957'; ctx.font = '800 76px monospace'; ctx.fillText(clock(state.clockMs), 512, 202);
    ctx.fillStyle = '#b5c7d9'; ctx.font = '700 23px system-ui,sans-serif'; ctx.fillText((state.quarter>(state.settings?.quarters||4)?`OVERTIME ${state.quarter-(state.settings?.quarters||4)}`:`QUARTER ${state.quarter || 1}`), 512, 265);
    ctx.fillStyle = '#152738'; ctx.fillRect(417, 300, 190, 79); ctx.fillStyle = '#ff7455'; ctx.font = '800 43px monospace'; ctx.fillText(String(Math.max(0, Math.ceil(state.shotClockMs / 1000))).padStart(2, '0'), 512, 335);
    ctx.fillStyle = '#8198ad'; ctx.font = '600 17px system-ui,sans-serif'; ctx.fillText('SHOT CLOCK', 512, 369);
    const live = state.state === 'live'; ctx.fillStyle = live ? (phase ? '#4fffc2' : '#20c89e') : '#ffc957';
    ctx.font = '800 24px system-ui,sans-serif'; ctx.fillText(live ? '● LIVE' : state.state === 'finished' ? 'FINAL' : 'READY TO PLAY', 205, 342);
    ctx.fillStyle = '#bfcedd'; ctx.font = '700 20px system-ui,sans-serif'; ctx.fillText(`${state.possession === 'away' ? 'AWAY' : 'HOME'} POSSESSION`, 817, 342);
    ctx.fillStyle = live ? '#123f44' : '#263347'; ctx.fillRect(0, 407, width, 105);
    ctx.fillStyle = '#f0f7ff'; ctx.font = '700 24px system-ui,sans-serif'; ctx.fillText(String(state.lastPlay || 'Catch • Toss • Score').slice(0, 67), 512, 447, 950);
    ctx.fillStyle = '#91abc2'; ctx.font = '600 16px system-ui,sans-serif'; ctx.fillText('REGULATION COURT  •  SHARED LIVE MATCH  •  FREE TO PLAY', 512, 485);
    display.texture.needsUpdate = true;
    accent.emissiveIntensity = reducedMotion ? 1.4 : 1.3 + phase * .5;
  }
  update();
  return { update, get state() { return state; } };
}

/** A public professional arena with a regulation 94 × 50 foot playing floor. */
export function createBasketballStadium(THREE, environment = {}) {
  const root = new THREE.Group(); root.name = 'MUZIKAZ_BASKETBALL_ARENA';
  const { material, box, tube } = helpers(THREE, root);
  const navy = material(0x091523, { roughness: .72 });
  const concrete = material(0x25303d, { roughness: .92, metalness: 0 });
  const metal = material(0x536376, { roughness: .37, metalness: .8 });
  const ledBlue = material(HOME, { emissive: HOME, emissiveIntensity: 1.3, roughness: .3 });
  const ledOrange = material(AWAY, { emissive: AWAY, emissiveIntensity: 1.3, roughness: .3 });
  // All surfaces share floor Y=0 so authoritative ball physics and players
  // agree on the regulation rim height without any world-scale normalization.
  box([46, .3, 62], concrete, [0, -.15, 0], 'BUILDER_WALKABLE_FLOOR_BASKETBALL_ARENA');
  box([18.2, .08, 33], navy, [0, -.04, 0], 'BUILDER_WALKABLE_FLOOR_BASKETBALL_APRON');
  const hardwood = courtTexture(THREE);
  const floorMat = material(0xe1b878, { ...(hardwood ? { map: hardwood.texture, color: 0xffffff } : {}), roughness: .34, metalness: .02 });
  const court = new THREE.Mesh(new THREE.PlaneGeometry(BASKETBALL_COURT.width, BASKETBALL_COURT.length), floorMat);
  court.name = 'BASKETBALL_COURT_HARDWOOD_DECAL'; court.rotation.x = -Math.PI / 2; court.position.y = .004; court.receiveShadow = true;
  court.userData.collisionDisabled = true; root.add(court);
  const hoops = [];
  for (const side of [-1, 1]) {
    const hoop = createBasketballHoop(THREE, { team: side < 0 ? 'home' : 'away' });
    hoop.position.z = side * BASKETBALL_COURT.hoopDistance; if (side > 0) hoop.rotation.y = Math.PI;
    root.add(hoop); hoops.push(hoop);
  }
  // Lower and upper seating bowls have real concrete tiers and batched seats.
  // Instancing keeps several thousand seats to a handful of GPU draw calls.
  const seats = [], backs = [];
  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 11; tier++) {
      const x = side * (10.7 + tier * .92), y = .38 + tier * .48;
      box([.93, y, 42], concrete, [x, y / 2, 0], 'ARENA_SEATING_TIER');
      for (let index = 0; index < 52; index++) {
        const z = -20.4 + index * .8;
        if (Math.abs(z) < 1.35 || Math.abs(Math.abs(z) - 10) < .65) continue;
        seats.push([x, y + .27, z, side < 0 ? Math.PI / 2 : -Math.PI / 2, tier < 6 ? 0 : 1]);
        backs.push([x + side * .27, y + .57, z, side < 0 ? Math.PI / 2 : -Math.PI / 2, tier < 6 ? 0 : 1]);
      }
    }
    for (let tier = 0; tier < 9; tier++) {
      const z = side * (18.4 + tier * 1.05), y = .38 + tier * .5;
      box([20.3, y, 1.06], concrete, [0, y / 2, z], 'ARENA_SEATING_END_TIER');
      for (let index = 0; index < 25; index++) {
        const x = -9.6 + index * .8; if (Math.abs(x) < 1.25) continue;
        seats.push([x, y + .27, z, side > 0 ? Math.PI : 0, tier < 5 ? 0 : 1]);
        backs.push([x, y + .57, z + side * .27, side > 0 ? Math.PI : 0, tier < 5 ? 0 : 1]);
      }
    }
  }
  const seatMaterials = [material(0x163c60, { roughness: .8 }), material(0x941f38, { roughness: .8 })];
  const dummy = new THREE.Object3D();
  for (let color = 0; color < 2; color++) for (const [points, dimensions, label] of [[seats, [.59, .13, .58], 'SEATS'], [backs, [.59, .48, .12], 'SEAT_BACKS']]) {
    const selected = points.filter(point => point[4] === color);
    const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(...dimensions), seatMaterials[color], selected.length);
    instances.name = `ARENA_DECORATIVE_${label}`; instances.userData.collisionDisabled = true; instances.castShadow = instances.receiveShadow = true;
    selected.forEach(([x, y, z, rotation], index) => { dummy.position.set(x, y, z); dummy.rotation.y = rotation; dummy.updateMatrix(); instances.setMatrixAt(index, dummy.matrix); });
    instances.instanceMatrix.needsUpdate = true; root.add(instances);
  }
  // Continuous animated LED fascia, suite glazing, banners and roof trusses
  // make the court read as a complete indoor stadium from every spawn point.
  for (const side of [-1, 1]) {
    box([.16, .55, 43], side < 0 ? ledBlue : ledOrange, [side * 20.65, 6.25, 0], 'ARENA_LED_FASCIA', true);
    box([20.6, .55, .16], side < 0 ? ledBlue : ledOrange, [0, 5.5, side * 27.6], 'ARENA_LED_FASCIA', true);
    box([.28, 9.1, 61.8], navy, [side * 22.7, 4.55, 0], 'ARENA_EXTERIOR_WALL');
    box([45.6, 9.1, .28], navy, [0, 4.55, side * 30.7], 'ARENA_EXTERIOR_WALL');
    for (const z of [-22, -11, 0, 11, 22]) {
      box([.65, 11, .65], metal, [side * 22, 5.5, z], 'ARENA_COLUMN');
      tube([side * 22, 11, z], [0, 16, z], .12, metal, 'ARENA_ROOF_TRUSS', true);
      tube([side * 22, 10.3, z], [0, 14.7, z], .07, metal, 'ARENA_ROOF_TRUSS', true);
      box([.1, 1.55, 6], material(0x67a9c5, { transparent: true, opacity: .3, roughness: .12 }), [side * 21.5, 7.8, z], 'ARENA_SUITE_GLASS', true);
    }
    for (const x of [-7.3, 7.3]) {
      box([1.6, 2.3, .08], x < 0 ? ledBlue : ledOrange, [x, 8.3, side * 28], 'ARENA_CHAMPIONSHIP_BANNER', true);
      tube([x, 9.5, side * 28], [x, 11.2, side * 28], .025, metal, 'ARENA_BANNER_CABLE', true);
    }
    // Courtside benches and scorer's table sit outside the touchlines.
    box([.72, .38, 5.5], navy, [side * 9.4, .19, -7.3], 'ARENA_TEAM_BENCH');
    box([.12, .62, 5.5], side < 0 ? ledBlue : ledOrange, [side * 9.73, .65, -7.3], 'ARENA_TEAM_BENCH_BACK');
    box([.8, .85, 5.4], navy, [side * 9.4, .425, 4.6], 'ARENA_SCORERS_TABLE');
    box([.03, .46, 5.1], side < 0 ? ledBlue : ledOrange, [side * 8.985, .54, 4.6], 'ARENA_LED_SCORERS_TABLE', true);
    for (const z of [-19, -9, 9, 19]) tube([side * 10.15, .9, z], [side * 19.9, 6, z], .035, metal, 'ARENA_AISLE_HANDRAIL');
  }
  // Roof panels are non-colliding scenic surfaces. They cannot be mistaken for
  // a floor by the spawn raycast, and remain high above the playable basket.
  box([46, .2, 62], material(0x071019, { roughness: .95 }), [0, 16.8, 0], 'ARENA_ROOF_CEILING', true);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xe9f4ff, toneMapped: false });
  for (const x of [-7, 7]) for (const z of [-12, -4, 4, 12]) {
    box([2.6, .16, .75], lightMat, [x, 13.6, z], 'ARENA_BROADCAST_LIGHT', true);
  }
  const ambient = new THREE.HemisphereLight(0xd8edff, 0x463520, 1.55); ambient.name = 'ARENA_AMBIENT_LIGHT'; root.add(ambient);
  for (const z of [-9, 9]) {
    const light = new THREE.PointLight(0xf4f7ff, 95, 34, 2); light.position.set(0, 11, z); light.name = 'ARENA_COURT_LIGHT'; root.add(light);
  }
  const display = scoreboard(THREE, root);
  const spawn = new THREE.Object3D(); spawn.name = 'SPAWN_PLAYER'; spawn.position.set(0, .02, 7); root.add(spawn);
  let elapsed = 0, lastScoreAt = null;
  root.userData.proceduralLand = true;
  root.userData.streetHeightAt = () => 0;
  root.userData.layout = 'basketball-stadium';
  root.userData.basketball = { ...BASKETBALL_COURT, hoops: [{ x: 0, y: 3.05, z: -12.75 }, { x: 0, y: 3.05, z: 12.75 }] };
  root.userData.updateBasketballScoreboard = state => {
    display.update(state, elapsed);
    if (state?.lastScore?.at && state.lastScore.at !== lastScoreAt) {
      lastScoreAt = state.lastScore.at;
      // Scoring teams attack opposite ends; animate both sleeves if an older
      // snapshot does not include a scoring hoop identifier.
      hoops.forEach(hoop => hoop.userData.swish(elapsed));
    }
  };
  root.userData.setBasketballState = root.userData.updateBasketballScoreboard;
  root.userData.updateBasketballEffects = (time, reducedMotion = false) => {
    elapsed = Number(time) || 0; display.update(null, elapsed, reducedMotion);
    hoops.forEach(hoop => hoop.userData.updateBasketballEffects(elapsed, reducedMotion));
    ledBlue.emissiveIntensity = ledOrange.emissiveIntensity = reducedMotion ? 1 : 1.2 + Math.sin(elapsed * 1.5) * .18;
  };
  return root;
}
