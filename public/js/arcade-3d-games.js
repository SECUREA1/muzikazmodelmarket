import * as T from '../vendor/three/three.module.min.js';
import {createArcadePart} from './arcade-park.js';
import {basketballPosition, basketballRelease} from './arcade-runtime.js';

const IDS = ['hockey', 'shooting', 'basketball', 'air-hockey', 'billiards'];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const gameId = value => typeof value === 'number' ? IDS[value] : value;
const mapping = id => id === 'hockey' ? {sx: .008, sz: .018, y: .74}
  : id === 'air-hockey' ? {sx: 5.3 / 620, sz: 2.8 / 390, y: 1.58}
  : id === 'billiards' ? {sx: 5.46 / 650, sz: 2.8 / 330, y: 1.64}
  : {sx: .008, sz: .018, y: .72};

/** Logical coordinates remain independent of frame rate and the authored map transform.
 * This mapping is shared by the rendered equipment and pointer ray intersections. */
export function arcadeGamePoint(game, x, y, target = new T.Vector3()) {
  const id = gameId(game);
  if (id === 'shooting') return target.set((finite(x, 400) - 400) * .009, .85 + (460 - finite(y, 230)) * .007, -2.15);
  const m = mapping(id);
  return target.set((finite(x, 400) - 400) * m.sx, m.y, (finite(y, 230) - 230) * m.sz);
}

export function arcadeGamePointer(game, point) {
  const id = gameId(game), m = mapping(id);
  const x = id === 'shooting' ? 400 + finite(point?.x) / .009 : 400 + finite(point?.x) / m.sx;
  const y = id === 'shooting' ? 460 - (finite(point?.y, 2.46) - .85) / .007 : 230 + finite(point?.z) / m.sz;
  return {x: clamp(x, 20, 780), y: clamp(y, 20, 440)};
}

function workshop(root) {
  const geometries = new Set(), materials = new Set(), resources = new Set();
  const sphere = new T.SphereGeometry(1, 20, 14), cube = new T.BoxGeometry(1, 1, 1);
  const cylinder = new T.CylinderGeometry(1, 1, 1, 24);
  geometries.add(sphere); geometries.add(cube); geometries.add(cylinder);
  const cache = new Map();
  function material(color, options = {}) {
    const key = color + JSON.stringify(options);
    if (!cache.has(key)) {
      const m = new T.MeshStandardMaterial({color, roughness: .52, ...options});
      materials.add(m); cache.set(key, m);
    }
    return cache.get(key);
  }
  function mesh(name, geometry, color, parent = root, options) {
    const item = new T.Mesh(geometry, material(color, options));
    item.name = name; item.receiveShadow = true; item.castShadow = false;
    parent.add(item); return item;
  }
  function box(name, x, y, z, w, h, d, color, parent = root, options) {
    const item = mesh(name, cube, color, parent, options);
    item.position.set(x, y, z); item.scale.set(w, h, d); return item;
  }
  function ball(name, x, y, z, radius, color, parent = root) {
    const item = mesh(name, sphere, color, parent);
    item.position.set(x, y, z); item.scale.setScalar(radius); return item;
  }
  function disc(name, x, y, z, radius, height, color, parent = root) {
    const item = mesh(name, cylinder, color, parent);
    item.position.set(x, y, z); item.scale.set(radius, height, radius); return item;
  }
  function ring(name, x, y, z, radius, thickness, color, parent = root) {
    const geometry = new T.TorusGeometry(radius, thickness, 5, 48); geometries.add(geometry);
    const item = mesh(name, geometry, color, parent);
    item.position.set(x, y, z); item.rotation.x = Math.PI / 2; return item;
  }
  function line(name, color, parent = root) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
    const m = new T.LineBasicMaterial({color, transparent: true, opacity: .8});
    const item = new T.Line(geometry, m); item.name = name; parent.add(item);
    geometries.add(geometry); materials.add(m); return item;
  }
  function linePoints(item, start, end) {
    const attribute = item.geometry.attributes.position;
    attribute.setXYZ(0, start.x, start.y, start.z); attribute.setXYZ(1, end.x, end.y, end.z);
    attribute.needsUpdate = true; item.geometry.computeBoundingSphere();
  }
  function equipment(id, name, parent = root) {
    const item = createArcadePart(id);
    item.name = name; parent.add(item); resources.add(item);
    item.traverse(node => {node.castShadow = false;});
    return item;
  }
  function dispose() {
    for (const resource of resources) resource.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) if (m) materials.add(m);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const m of materials) {if (!m.map?.userData?.sportsSurfaceShared) m.map?.dispose(); m.dispose();}
  }
  return {box, ball, disc, ring, line, linePoints, equipment, material, dispose};
}

function avatar(h, parent, name, color, {hockey = false, handsOnly = false} = {}) {
  const group = new T.Group(); group.name = name; parent.add(group);
  if (!handsOnly) {
    h.box(name + '_JERSEY', 0, 1.1, 0, .55, .65, .32, color, group);
    h.box(name + '_SHORTS', 0, .7, 0, .48, .24, .3, '#263a47', group);
    for (const side of [-1, 1]) {
      h.box(name + '_SLEEVE_' + side, side * .34, 1.17, 0, .2, .44, .23, color, group);
      h.box(name + '_LEG_' + side, side * .15, .4, 0, .17, .5, .19, '#c8d8dd', group);
      h.box(name + '_SHOE_' + side, side * .15, .12, .06, .2, .16, .35, '#19292d', group);
      if (hockey) h.box(name + '_SKATE_BLADE_' + side, side * .15, .025, .06, .025, .05, .36, '#dbe6ea', group);
    }
    h.ball(name + '_HEAD', 0, 1.63, 0, .21, '#d6ac8d', group);
    if (hockey) {
      const helmet = h.ball(name + '_HELMET', 0, 1.72, -.025, .24, color, group); helmet.scale.y *= .7;
      h.box(name + '_VISOR', 0, 1.66, .2, .36, .16, .025, '#bfe4e6', group, {transparent: true, opacity: .5});
    }
  }
  const left = h.ball(name + '_LEFT_GLOVE', -.33, 1.13, .2, .13, color, group);
  const right = h.ball(name + '_RIGHT_GLOVE', .33, 1.13, .2, .13, color, group);
  return {root: group, left, right};
}

function hockeyGame(root, h) {
  root.rotation.y = Math.PI / 2;
  h.box('LIVE_ICE_SURFACE', 0, .705, 0, 5.9, .025, 7.4, '#be8756').userData.sportsSurface = 'wood';
  h.box('RINK_CENTER_LINE', 0, .723, 0, 5.9, .009, .055, '#d86a7f');
  h.ring('RINK_CENTER_CIRCLE', 0, .726, 0, .8, .015, '#c65b70');
  h.disc('GOAL_CREASE', 0, .723, -2.67, .91, .008, '#9dcbd8');
  for (const side of [-1, 1]) {
    h.box('RINK_BLUE_LINE_' + side, 0, .723, side * 1.3, 5.9, .009, .065, '#719dc0');
    h.box('RINK_GOAL_LINE_' + side, 0, .723, side * 2.67, 5.9, .009, .035, '#d86a7f');
    for (const x of [-1.7, 1.7]) {
      h.ring('RINK_FACEOFF_CIRCLE_' + side + '_' + x, x, .726, side * 2.0, .43, .012, '#c65b70');
      h.disc('RINK_FACEOFF_DOT_' + side + '_' + x, x, .727, side * 2.0, .055, .008, '#c65b70');
    }
  }
  for (const side of [-1, 1]) {
    h.box('RINK_BOARDS_' + side, side * 3, 1.03, 0, .14, .6, 7.5, '#edf0df');
    h.box('RINK_KICKPLATE_' + side, side * 2.92, .78, 0, .04, .1, 7.4, '#efd978');
    h.box('RINK_GLASS_' + side, side * 3, 1.68, 0, .05, .8, 7.4, '#9acfd2', root,
      {transparent: true, opacity: .16, depthWrite: false}).userData.sportsSurface = 'glass';
  }
  const goal = h.equipment('hockey-goal', 'LIVE_HOCKEY_NET');
  goal.position.set(0, .72, -2.67); goal.scale.set(1.8, 1.25, 1.25);
  const puck = h.disc('LIVE_HOCKEY_PUCK', 0, .78, 3.06, .12, .07, '#15262d');
  const goalie = avatar(h, root, 'AI_GOALKEEPER', '#e394a8', {hockey: true});
  goalie.root.position.set(0, .72, -2.35);
  for (const side of [-1, 1]) h.box('GOALIE_PAD_' + side, side * .2, .45, .16, .29, .65, .22, '#e5e7cf', goalie.root);
  h.box('GOALIE_STICK_SHAFT', .44, .65, .3, .06, 1.35, .05, '#c0ac75', goalie.root).rotation.z = -.3;
  h.box('GOALIE_STICK_BLADE', .15, .12, .4, .75, .16, .08, '#b8ac85', goalie.root);
  const player = avatar(h, root, 'PLAYER_SKATER', '#91e5ec', {hockey: true});
  player.root.position.set(.65, .72, 3.2); player.root.rotation.y = Math.PI;
  const stick = new T.Group(); stick.name = 'PLAYER_HOCKEY_STICK'; root.add(stick);
  h.box('PLAYER_STICK_SHAFT', 0, .77, 0, .055, 1.45, .06, '#bcab7f', stick).rotation.z = -.25;
  h.box('PLAYER_STICK_BLADE', -.24, .075, -.03, .65, .12, .08, '#34474d', stick);
  const aim = h.line('HOCKEY_AIM_LINE', '#427b84');
  const a = new T.Vector3(), b = new T.Vector3();
  return state => {
    const elapsed = finite(state.gameElapsed), pointer = state.pointer || {x: 400, y: 370};
    goalie.root.position.x = Math.sin(elapsed / .6) * 145 * .008;
    goalie.left.position.y = 1.12 + Math.sin(elapsed * 3) * .13;
    const p = state.shot ? clamp(finite(state.shot.p), 0, 1) : 0;
    arcadeGamePoint('hockey', 400 + (finite(state.shot?.tx, 400) - 400) * p, 400 - 315 * p, puck.position);
    puck.position.y += .04;
    stick.position.set(.26, .74, 3.25 - Math.sin(p * Math.PI) * .25);
    stick.rotation.z = -.55 + Math.sin(p * Math.PI) * .6;
    stick.rotation.y = (finite(pointer.x, 400) - 400) * -.001;
    arcadeGamePoint('hockey', 400, 400, a); a.y += .05;
    arcadeGamePoint('hockey', pointer.x, 85, b); b.y += .05;
    h.linePoints(aim, a, b); aim.visible = !state.shot && !state.ended;
  };
}

function shootingGame(root, h) {
  h.box('SHOOTING_BACKSTOP', 0, 2.2, -2.55, 7.8, 3.5, .15, '#304451').userData.sportsSurface = 'metal';
  for (const side of [-1, 1]) {
    h.box('RANGE_SIDEWALL_' + side, side * 3.9, 1.7, -.3, .12, 2.2, 4.4, '#475266');
    h.box('RANGE_LANE_LIGHT_' + side, side * 3.8, 2.65, -.3, .035, .035, 4.3, '#a7f0da', root,
      {emissive: '#a7f0da', emissiveIntensity: .55});
  }
  const targets = Array.from({length: 5}, (_, i) => {
    const group = new T.Group(); group.name = 'LIVE_TARGET_' + i; root.add(group);
    for (const [scale, color] of [[1.2, '#768b9a'], [1, '#e69cbb'], [.65, '#213b4c'], [.28, '#e1f39a']]) {
      const disc = h.disc('TARGET_RING_' + i + '_' + scale, 0, 0, .015 * (1.2 - scale), scale, .025, color, group);
      disc.rotation.x = Math.PI / 2;
    }
    return group;
  });
  const crosshair = new T.Group(); crosshair.name = 'RANGE_CROSSHAIR'; root.add(crosshair);
  h.box('CROSSHAIR_HORIZONTAL', 0, 0, 0, .25, .018, .025, '#dbfb91', crosshair);
  h.box('CROSSHAIR_VERTICAL', 0, 0, 0, .018, .25, .025, '#dbfb91', crosshair);
  const blaster = new T.Group(); blaster.name = 'PLAYER_ARCADE_BLASTER'; root.add(blaster); blaster.position.set(.45, 1.8, 2.4);
  h.box('BLASTER_BODY', 0, 0, -.05, .24, .25, .6, '#8ac8c3', blaster).userData.sportsSurface = 'metal';
  h.box('BLASTER_GRIP', 0, -.2, .1, .15, .3, .17, '#233742', blaster).rotation.x = -.2;
  h.box('BLASTER_BARREL', 0, .015, -.5, .1, .1, .45, '#d4e17a', blaster);
  h.ball('PLAYER_TRIGGER_HAND', .11, -.13, .12, .13, '#d3ab8e', blaster);
  h.ball('PLAYER_SUPPORT_HAND', -.13, -.08, -.25, .13, '#d3ab8e', blaster);
  const tracer = h.line('ARCADE_SHOT_TRACER', '#e7fa99'); tracer.visible = false;
  const origin = new T.Vector3(), aim = new T.Vector3(); let lastAttempts = 0, flashed = -10;
  return state => {
    const elapsed = finite(state.gameElapsed), pointer = state.pointer || {x: 400, y: 230};
    targets.forEach((target, index) => {
      const t = state.targets?.[index]; target.visible = !!t;
      if (!t) return;
      const x = finite(t.dx, finite(t.x) + Math.sin(elapsed + finite(t.phase)) * 45);
      const y = finite(t.dy, finite(t.y) + Math.cos(elapsed / 1.3 + finite(t.phase)) * 48);
      arcadeGamePoint('shooting', x, y, target.position);
      target.scale.set(finite(t.r, 24) * .009, finite(t.r, 24) * .007, 1);
    });
    arcadeGamePoint('shooting', pointer.x, pointer.y, aim);
    crosshair.position.copy(aim); crosshair.position.z += .15;
    blaster.rotation.y = -(finite(pointer.x, 400) - 400) * .0007;
    blaster.rotation.x = (finite(pointer.y, 230) - 230) * .00055;
    if (finite(state.attempts) !== lastAttempts) {lastAttempts = finite(state.attempts); flashed = elapsed;}
    origin.copy(blaster.position); origin.z -= .6;
    h.linePoints(tracer, origin, aim); tracer.visible = elapsed - flashed < .12 && !state.ended;
  };
}

function basketballGame(root, h) {
  root.rotation.y = Math.PI / 2;
  for (const side of [-1, 1]) {
    h.box('COURT_SIDELINE_' + side, side * 2.76, .674, 0, .035, .01, 7.3, '#f7e4be');
    h.box('COURT_BASELINE_' + side, 0, .674, side * 3.65, 5.55, .01, .035, '#f7e4be');
    h.box('COURT_LANE_LINE_' + side, side * 1.15, .674, -2.75, .035, .01, 1.8, '#f7e4be');
  }
  h.box('COURT_FREE_THROW_LINE', 0, .674, -1.85, 2.3, .01, .035, '#f7e4be');
  h.ring('COURT_FREE_THROW_CIRCLE', 0, .674, -1.85, .7, .016, '#f7e4be');
  const hoop = h.equipment('basketball-hoop', 'LIVE_BASKETBALL_HOOP');
  hoop.position.set(0, .62, -3.3); hoop.scale.setScalar(1.2);
  const oppositeHoop=h.equipment('basketball-hoop','OPPOSITE_BASKETBALL_HOOP');oppositeHoop.position.set(0,.62,3.3);oppositeHoop.rotation.y=Math.PI;oppositeHoop.scale.setScalar(1.2);oppositeHoop.visible=false;
  const teamPlayers=Array.from({length:10},(_,i)=>avatar(h,root,'TEAM_BASKETBALL_'+i,i<5?'#6ac9ef':'#ef897a'));teamPlayers.forEach(p=>p.root.visible=false);
  const ball = h.equipment('basketball-ball', 'LIVE_BASKETBALL');
  ball.scale.setScalar(.72);
  // Builder equipment is floor-anchored. Center this reusable ball before spin
  // so its geometry rotates about the ball instead of orbiting the floor origin.
  for (const child of ball.children) child.position.y -= .35;
  const player = avatar(h, root, 'PLAYER_BASKETBALL', '#f0ab70');
  player.root.position.set(0, .62, 2.65); player.root.rotation.y = Math.PI;
  const alignment = h.line('BASKETBALL_ALIGNMENT', '#d8f88e');
  const a = new T.Vector3(0, .74, 2.7), b = new T.Vector3(0, .74, -2.7);
  h.linePoints(alignment, a, b);
  const net = hoop.getObjectByName('ARCADE_EQUIPMENT_BASKETBALL_HOOP')?.children.find(node => node.isMesh && node.geometry.type === 'CylinderGeometry');
  return state => {
    const full=state.basketball;oppositeHoop.visible=!!full;
    if(full){player.root.visible=false;alignment.visible=false;teamPlayers.forEach((rig,i)=>{const p=full.players.find(p=>p.team===Math.floor(i/5)&&p.id%full.config.teamSize===i%5);rig.root.visible=!!p;if(!p)return;rig.root.position.set((p.x-400)*.008,.62,(p.y-230)*.018);rig.root.rotation.y=Math.atan2(p.vx,p.vy);const hidden=state.cameraMode==='first-person'&&p.id===full.selfSlot;rig.root.traverse(node=>{if(node.isMesh)node.visible=!hidden||/GLOVE/.test(node.name);});rig.left.position.y=rig.right.position.y=1.1+Math.sin(finite(state.gameElapsed)*10)*.08;});ball.position.set((full.ball.x-400)*.008,.62+full.ball.height,(full.ball.y-230)*.018);ball.rotation.y=finite(state.gameElapsed)*4;return;}
    player.root.visible=true;teamPlayers.forEach(p=>p.root.visible=false);
    const elapsed = finite(state.gameElapsed), shot = state.shot;
    const movingX = basketballPosition(elapsed), startX = (finite(shot?.x, movingX) - 400) * .008;
    const p = shot ? clamp(finite(shot.p), 0, 1) : 0;
    const endX = (finite(shot?.endX, 400) - 400) * .008;
    // The release travels through a true vertical arc to the rim, not a projected flat sprite.
    ball.position.set(startX + (endX - startX) * p,
      1.9 + 1.48 * p + Math.sin(p * Math.PI) * 2.8, 2.55 - 5.37 * p);
    ball.rotation.set(p * -5, p * 3, p * 2);
    // Keep the timing ball visible beside the player in the shoulder camera.
    // Its own world position remains exactly aligned with the scoring state.
    player.root.position.x = (shot ? startX : (movingX - 400) * .008) - .55;
    player.left.position.y = player.right.position.y = 1.15 + (shot ? Math.sin(Math.min(1, p * 3) * Math.PI / 2) * .65 : .1);
    alignment.material.opacity = basketballRelease(movingX, state.difficulty).scored ? .9 : .18;
    alignment.visible = !shot && !state.ended;
    if (net) net.rotation.z = shot?.scored && p > .8 ? Math.sin(p * 35) * .06 : 0;
  };
}

function tableBorders(h, air) {
  for (const side of [-1, 1]) {
    h.box('LIVE_TABLE_RAIL_X_' + side, side * 2.85, 1.63, 0, .18, .2, 3.14, air ? '#83b5cf' : '#583f3c');
    h.box('LIVE_TABLE_RAIL_Z_' + side, 0, 1.63, side * 1.55, 5.7, .2, .15, air ? '#83b5cf' : '#583f3c');
  }
}

function airHockeyGame(root, h) {
  tableBorders(h, true);
  h.box('LIVE_AIR_TABLE_SURFACE', 0, 1.515, 0, 5.5, .018, 3, '#bddedc').userData.sportsSurface = 'court';
  h.box('AIR_TABLE_CENTER_LINE', 0, 1.533, 0, 5.5, .008, .025, '#628caa');
  h.ring('AIR_TABLE_CENTER_CIRCLE', 0, 1.535, 0, .44, .012, '#628caa');
  for (const side of [-1, 1]) h.box('AIR_HOCKEY_GOAL_' + side, 0, 1.63, side * 1.56, 1.68, .22, .19, '#203f4d');
  const player = h.equipment('air-hockey-mallet', 'PLAYER_AIR_MALLET');
  const opponent = h.equipment('air-hockey-mallet', 'AI_AIR_MALLET');
  opponent.traverse(node => {if (node.material?.color) node.material.color.set('#e39ab6');});
  const hand = h.ball('PLAYER_MALLET_HAND', 0, 1.92, 0, .18, '#d6b193');
  const sleeve = h.box('PLAYER_MALLET_SLEEVE', 0, 1.92, .35, .25, .23, .7, '#87d4d8');
  const puck = h.disc('LIVE_AIR_PUCK', 0, 1.58, 0, .115, .055, '#e0e998');
  return state => {
    const pointer = state.pointer || {x: 400, y: 370}, elapsed = finite(state.gameElapsed);
    arcadeGamePoint('air-hockey', clamp(finite(pointer.x, 400), 115, 685), clamp(finite(pointer.y, 370), 250, 400), player.position);
    player.position.y = 1.53;
    arcadeGamePoint('air-hockey', state.opponent?.x ?? 400 + Math.sin(elapsed / (state.difficulty === 'normal' ? .65 : 1)) * 190, state.opponent?.y ?? 95, opponent.position);
    opponent.position.y = 1.53;
    hand.position.set(player.position.x, 1.91, player.position.z + .06);
    sleeve.position.set(player.position.x, 1.91, player.position.z + .4);
    arcadeGamePoint('air-hockey', state.puck?.x, state.puck?.y, puck.position);
    puck.rotation.y = elapsed * 3;
  };
}

function billiardsGame(root, h) {
  tableBorders(h, false);
  h.box('LIVE_BILLIARD_FELT', 0, 1.515, 0, 5.5, .018, 3, '#267457').userData.sportsSurface = 'felt';
  const point = new T.Vector3();
  for (const [index, [x, y]] of [[80, 70], [400, 65], [720, 70], [80, 390], [400, 395], [720, 390]].entries()) {
    arcadeGamePoint('billiards', x, y, point);
    h.disc('BILLIARD_POCKET_' + index, point.x, 1.543, point.z, .175, .018, '#101e25');
  }
  const colors = ['#f2f1df', '#eabd5f', '#b09ae0', '#e78d99', '#79c8cf', '#d2e881', '#eea06e'];
  const balls = colors.map((color, index) => {
    const ball = h.ball('LIVE_BILLIARD_BALL_' + index, 0, 1.64, 0, .102, color);
    if (index) {
      const stripe = h.disc('BILLIARD_NUMBER_PATCH_' + index, 0, .1, 0, .047, .005, '#f1f0e0', ball);
      stripe.scale.divideScalar(.102); stripe.position.y = .97;
    }
    return ball;
  });
  const cue = h.equipment('billiard-cue', 'PLAYER_BILLIARD_CUE');
  cue.scale.setScalar(.55);
  const hand = h.ball('PLAYER_CUE_HAND', 0, 1.7, 0, .11, '#d4ad91');
  const aim = h.line('BILLIARD_AIM_LINE', '#dfefba'), start = new T.Vector3(), end = new T.Vector3();
  return state => {
    const records = state.balls || [], pointer = state.pointer || {x: 400, y: 370};
    let moving = false;
    for (let i = 0; i < balls.length; i++) {
      const record = records[i], ball = balls[i]; ball.visible = !!record && !record.sunk;
      if (!record) continue;
      arcadeGamePoint('billiards', record.x, record.y, ball.position);
      ball.rotation.x = finite(record.y) * .035; ball.rotation.z = finite(record.x) * -.035;
      if (Math.hypot(finite(record.vx), finite(record.vy)) >= 8) moving = true;
    }
    arcadeGamePoint('billiards', records[0]?.x, records[0]?.y, start);
    arcadeGamePoint('billiards', pointer.x, pointer.y, end);
    const angle = Math.atan2(end.z - start.z, end.x - start.x), dx = Math.cos(angle), dz = Math.sin(angle);
    cue.position.set(start.x - dx * 1.18, 1.66, start.z - dz * 1.18);
    cue.rotation.y = -angle + Math.PI;
    hand.position.set(start.x - dx * .5, 1.67, start.z - dz * .5);
    h.linePoints(aim, start, end);
    cue.visible = hand.visible = aim.visible = !moving && !state.ended;
  };
}

const builders = {hockey: hockeyGame, shooting: shootingGame, basketball: basketballGame, 'air-hockey': airHockeyGame, billiards: billiardsGame};
function stationShell(root, id, h) {
  const court = id === 'hockey' || id === 'basketball';
  h.box('LIVE_STATION_FOUNDATION', 0, .24, 0, court ? 7 : 9, .35, court ? 9 : 7, '#344c45');
  if (id === 'hockey') {
    h.box('LIVE_RINK_SLAB', 0, .55, 0, 5.9, .29, 7.4, '#7eb5ba');
  } else if (id === 'basketball') {
    h.box('LIVE_COURT_SLAB', 0, .48, 0, 5.9, .12, 7.8, '#7c644b');
    h.box('LIVE_BASKETBALL_COURT', 0, .60, 0, 5.9, .12, 7.8, '#be8756').userData.sportsSurface = 'wood';
  } else if (id === 'shooting') {
    h.box('LIVE_RANGE_FLOOR', 0, .7, 0, 8, .3, 5.8, '#3c3d4a').userData.sportsSurface = 'wood';
    h.box('LIVE_RANGE_COUNTER', 0, 1, 2.1, 8, .7, .4, '#625c66').userData.sportsSurface = 'metal';
  } else if (id === 'air-hockey' || id === 'billiards') {
    h.box('LIVE_TABLE_CABINET', 0, 1.05, 0, 6, .7, 3.5, id === 'billiards' ? '#8b759f' : '#75a5c8');
    h.box('LIVE_TABLE_TOP_SLAB', 0, 1.45, 0, 5.5, .1, 3, '#2c4e51');
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      h.box('LIVE_TABLE_LEG_' + x + '_' + z, x * 2.3, .5, z * 1.1, .25, 1, .25, '#263b36');
    }
  }
}
const cameraDefinitions = {
  hockey: {eye: [.65, 2.4, 5.4], target: [0, 1.25, -1.4], width: 6.6, depth: 8.2},
  shooting: {eye: [0, 2.45, 3.1], target: [0, 2.35, -2.15], width: 8.2, depth: 7.2},
  basketball: {eye: [-.55, 2.35, 3.8], target: [0, 2.75, -2.5], width: 6.6, depth: 8.8},
  'air-hockey': {eye: [0, 2.6, 3.4], target: [0, 1.55, -.3], width: 6.5, depth: 4.8},
  billiards: {eye: [0, 2.6, 3.4], target: [0, 1.6, -.25], width: 6.5, depth: 4.8}
};

/** Station-local poses keep every camera and aiming ray in the authored map.
 * The range uses an elevated oblique view so its vertical targets remain aimable.
 * Standing views widen and move back on narrow screens without gaining height.
 */
export function arcadeGameCameraPose(game, mode = 'first-person', {aspect = 1.6, state = {}} = {}) {
  const id = gameId(game), definition = cameraDefinitions[id];
  if (!definition) return null;
  const ratio = Math.max(.3, finite(aspect, 1.6));
  if (mode === 'top-down') {
    if (id === 'shooting') {
      const target = [0, 1.9, -1.5], eye = [0, 11.5, 6.8], distance = Math.hypot(9.6, 8.3);
      const scale = Math.max(1, definition.width / (2 * distance * Math.tan(26 * Math.PI / 180) * ratio));
      eye[1] = target[1] + (eye[1] - target[1]) * scale;eye[2] = target[2] + (eye[2] - target[2]) * scale;
      return {mode, eye, target, up: [0, 1, 0], fov: 52, width: definition.width, depth: definition.depth};
    }
    const height = Math.max(id === 'basketball' ? 13.5 : 10, definition.depth / (2 * Math.tan(26 * Math.PI / 180)), definition.width / (2 * Math.tan(26 * Math.PI / 180) * ratio));
    const y = id === 'hockey' || id === 'basketball' ? .72 : 1.55;
    return {mode, eye: [0, y + height, 0], target: [0, y, 0], up: [0, 0, -1], fov: 52,
      width: definition.width, depth: definition.depth};
  }
  const eye = [...definition.eye], target = [...definition.target], fov = 76;
  if (id === 'basketball') {
    if(state.basketball){const full=state.basketball,p=full.players[full.selfSlot??0],direction=p?.team===1?1:-1,x=(finite(p?.x,400)-400)*.008,z=(finite(p?.y,230)-230)*.018;return {mode:'first-person',eye:[x-.25,2.15,z-direction*.32],target:[x,1.9,z+direction*5],up:[0,1,0],fov:85,width:definition.width,depth:definition.depth};}
    const movingX = finite(state.shot?.x, basketballPosition(finite(state.gameElapsed)));
    eye[0] = (movingX - 400) * .008 - .55;
  }
  // Keep the entire playable width available in portrait without turning a
  // standing camera into an elevated spectator camera.
  const needed = definition.width / (2 * Math.tan(fov * Math.PI / 360) * ratio);
  const dz = eye[2] - target[2], dx = eye[0] - target[0], horizontal = Math.hypot(dx, dz);
  if (needed > horizontal) {
    const scale = needed / horizontal;
    eye[0] = target[0] + dx * scale; eye[2] = target[2] + dz * scale;
  }
  return {mode: 'first-person', eye, target, up: [0, 1, 0], fov, width: definition.width, depth: definition.depth};
}

function occlusionSamples(id) {
  const points = [];
  if (id === 'shooting') {
    for (let x = -3; x <= 3; x++) for (let y = 0; y < 5; y++) points.push(new T.Vector3(x * 1.2, 1 + y * .8, -2.15));
  } else {
    const table = id === 'air-hockey' || id === 'billiards';
    const width = table ? 2.7 : 2.8, depth = table ? 1.4 : 3.3;
    const heights = table ? [1.65, 2] : id === 'basketball' ? [.8, 2.4, 4.6] : [.8, 1.6, 2.4];
    for (let x = -3; x <= 3; x++) for (let z = -2; z <= 2; z++) for (const y of heights) {
      points.push(new T.Vector3(x * width / 3, y, z * depth / 2));
    }
  }
  return points;
}

function sceneryOccluders(world, station) {
  const candidates = [];
  world.updateMatrixWorld(true);
  world.traverse(node => {
    if (!node.isMesh || !node.geometry || node.geometry.type === 'TubeGeometry') return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (!materials.some(material => material && material.visible !== false && (!material.transparent || material.opacity > .9))) return;
    let ancestor = node;
    while (ancestor) {
      if (ancestor === station || !ancestor.visible || /ARCADE_(?:TRAIN_ENGINE|TRAIN_CARRIAGE|COASTER_CAR)/.test(ancestor.name)) return;
      ancestor = ancestor.parent;
    }
    const box = new T.Box3().setFromObject(node), size = box.getSize(new T.Vector3());
    // A narrow upright can block the shot or table. Broad floors, roofs, labels,
    // tracks and moving vehicles remain part of the surrounding park view.
    if (size.y < .45 || size.x > 4 || size.z > 4) return;
    candidates.push({mesh: node, box, visible: node.visible});
  });
  return candidates;
}

/** The minigame lives under the selected real station, so saved builder transforms,
 * other park attractions and every moving object stay in one continuous 3D scene. */
export function createArcadeGamePresentation({scene, park, config = {}} = {}) {
  let active = null;
  const ray = new T.Raycaster(), localRay = new T.Ray(), inverse = new T.Matrix4();
  const intersection = new T.Vector3(), eye = new T.Vector3(), target = new T.Vector3(), up = new T.Vector3();
  const viewRay = new T.Ray(), viewTarget = new T.Vector3(), viewDirection = new T.Vector3(), viewHit = new T.Vector3();
  const worldScale = new T.Vector3();
  function deactivate() {
    if (!active) return;
    for (const [node, visible] of active.hidden) node.visible = visible;
    for (const node of active.occlusion.candidates) node.mesh.visible = node.visible;
    active.root.removeFromParent(); active.h.dispose(); active = null;
  }
  function activate(index, options = {}) {
    const id = gameId(index), station = options.anchor || park?.parts?.[id];
    if (!builders[id] || !station) return false;
    deactivate();
    const root = new T.Group(); root.name = 'ARCADE_3D_GAME_' + id.toUpperCase().replaceAll('-', '_');
    root.userData.arcade3DGame = id;
    const hidden = [];
    // The playable shell replaces its own static station, including overhead
    // signs and support poles that would block the close player camera.
    for (const node of station.children) {hidden.push([node, node.visible]); node.visible = false;}
    station.add(root);
    const h = workshop(root), update = builders[id](root, h);
    stationShell(root, id, h);
    const plane = id === 'shooting' ? new T.Plane(new T.Vector3(0, 0, 1), 2.15)
      : new T.Plane(new T.Vector3(0, 1, 0), -mapping(id).y);
    let world = scene || station;
    if (!scene) while (world.parent) world = world.parent;
    const occlusion = {candidates: sceneryOccluders(world, station), samples: occlusionSamples(id), signature: new Float64Array(34), ready: false};
    active = {id, index: IDS.indexOf(id), root, station, hidden, h, update, plane, occlusion, config: options.config || config};
    root.updateWorldMatrix(true, true);
    update({gameElapsed: 0, pointer: {x: 400, y: 370}, difficulty: active.config.difficulty});
    return true;
  }
  function update(state = {}) {
    if (!active) return;
    active.state = state;active.update({...state, difficulty: state.difficulty || active.config.difficulty});
  }
  function clearView(camera) {
    const state = active.occlusion, signature = state.signature;
    const cameraElements = camera.matrixWorld.elements, rootElements = active.root.matrixWorld.elements;
    let changed = !state.ready || signature[32] !== camera.aspect || signature[33] !== camera.fov;
    for (let i = 0; i < 16; i++) if (signature[i] !== cameraElements[i] || signature[i + 16] !== rootElements[i]) changed = true;
    if (!changed) return;
    for (let i = 0; i < 16; i++) {signature[i] = cameraElements[i]; signature[i + 16] = rootElements[i];}
    signature[32] = camera.aspect; signature[33] = camera.fov; state.ready = true;
    active.root.getWorldScale(worldScale);
    const padding = Math.max(worldScale.x, worldScale.y, worldScale.z) * .3;
    for (const candidate of state.candidates) {
      candidate.mesh.visible = candidate.visible;
      candidate.box.setFromObject(candidate.mesh).expandByScalar(padding);
      for (const point of state.samples) {
        viewTarget.copy(point).applyMatrix4(active.root.matrixWorld);
        viewDirection.subVectors(viewTarget, camera.position);
        const distance = viewDirection.length();
        if (distance < 1e-6) continue;
        viewRay.set(camera.position, viewDirection.multiplyScalar(1 / distance));
        if (viewRay.intersectBox(candidate.box, viewHit) && viewHit.distanceTo(camera.position) < distance - padding * .25) {
          candidate.mesh.visible = false; break;
        }
      }
    }
  }
  function setCamera(camera, mode = 'first-person') {
    if (!active || !camera) return false;
    const pose = arcadeGameCameraPose(active.id, mode, {aspect: camera.aspect, state: active.state});
    active.cameraMode = pose.mode;
    eye.fromArray(pose.eye); target.fromArray(pose.target); up.fromArray(pose.up);
    active.root.updateWorldMatrix(true, false);
    active.root.localToWorld(eye); active.root.localToWorld(target);
    up.transformDirection(active.root.matrixWorld);
    if (camera.fov !== pose.fov) {camera.fov = pose.fov; camera.updateProjectionMatrix();}
    camera.position.copy(eye); camera.up.copy(up); camera.lookAt(target); camera.updateMatrixWorld(true);
    // A local player's head and torso cannot occlude their own standing view.
    active.root.traverse(node => {
      if (!/^PLAYER_(?:SKATER|BASKETBALL)_(?:HEAD|HELMET|VISOR|JERSEY|SHORTS|SLEEVE_|LEG_|SHOE_|SKATE_BLADE_)/.test(node.name)) return;
      node.visible = pose.mode !== 'first-person';
    });
    clearView(camera);
    return true;
  }

  function pointer(ndcX, ndcY, camera) {
    if (!active || !camera || !Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
    ray.setFromCamera({x: ndcX, y: ndcY}, camera);
    active.root.updateWorldMatrix(true, false); inverse.copy(active.root.matrixWorld).invert();
    localRay.copy(ray.ray).applyMatrix4(inverse);
    if (!localRay.intersectPlane(active.plane, intersection)) return null;
    return arcadeGamePointer(active.id, intersection);
  }
  function snapshot() {
    if (!active) return {active: false};
    const objects = [];
    active.root.updateWorldMatrix(true, true);
    active.root.traverse(node => {
      if (!(node.isMesh || node.isGroup) || !/^(LIVE_|PLAYER_|AI_|TEAM_|OPPOSITE_|RANGE_CROSSHAIR)/.test(node.name)) return;
      const world = node.getWorldPosition(new T.Vector3());
      let visible = true, ancestor = node;
      while (ancestor) {visible = visible && ancestor.visible; ancestor = ancestor.parent;}
      objects.push({name: node.name, position: world.toArray(), visible});
    });
    return {active: true, id: active.id, index: active.index, anchor: active.station.name, cameraMode: active.cameraMode || 'first-person',
      position: active.root.getWorldPosition(new T.Vector3()).toArray(),
      occlusion: {candidates: active.occlusion.candidates.length, hidden: active.occlusion.candidates.filter(node => !node.mesh.visible).length}, objects};
  }
  return {activate, update, setCamera, pointer, deactivate, snapshot, dispose: deactivate,
    get root() {return active?.root || null;}};
}
