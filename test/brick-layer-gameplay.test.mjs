import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {raycastSolidSurfaces} from '../public/js/collision-surfaces.js';
import {Flamethrower} from '../public/js/flamethrower.js';

function localSystem(script, loader = {}) {
  const classSource = script.slice(script.indexOf('  class ToxicBubbleSystem {'), script.indexOf('  let viewActive'));
  const config = {drawingRange: 10, drawingRadius: .08, maxDrawingStrokes: 20};
  const System = new Function('THREE', 'raycastSolidSurfaces', 'builderDecor', 'playerRig', 'TOXIC_BUBBLE_CONFIG', 'SPRAY_COLORS', 'trackGameQuest', classSource + ';return ToxicBubbleSystem;')(THREE, raycastSolidSurfaces, new THREE.Group(), new THREE.Group(), config, [{hex: 0x9cff00, name: 'Lime'}], () => {});
  const scene = new THREE.Scene(), system = Object.create(System.prototype);
  Object.assign(system, {scene, loader, camera: new THREE.PerspectiveCamera(), raycaster: new THREE.Raycaster(), surfaceRaycaster: new THREE.Raycaster(), bricks: [], lootBlocks: [], bubbles: [], drawingStrokes: [], drawingGroup: new THREE.Group(), sprayFuel: 10, sprayColorIndex: 0, tool: 'laser',
    tone() {}, gasSound() {}, updateHud() {}, createPopParticles() {}, setState() {}, registerLaserShot() {}, showWeaponShot() {}});
  scene.add(system.drawingGroup);
  system.flameSystem = new Flamethrower({THREE, scene, colliders: () => [], damage() {}});
  system.flameColliders = () => system.bricks.map(root => ({root}));
  return system;
}

test('Brick Layer snaps, highlights, collides, and breaks after five hits', async () => {
  const script = await readFile('public/js/house-explorer-glb.js', 'utf8');

  assert.match(script, /toolButton\('brick','Building Materials'/, 'the Brick Layer appears in the tool picker');
  assert.match(script, /MUZIKAZ_BRICK_PLACEMENT_HIGHLIGHT/, 'the selected tool shows a placement highlight');
  assert.ok(script.includes('Math.round(point.x/(w/2))*(w/2)') && script.includes('Math.round((point.y-h/2)/h)*h+h/2'), 'brick positions snap to equal map-grid intervals');
  assert.match(script, /MUZIKAZ_CLIMBABLE_BRICK/, 'placed bricks are identified as climbable world objects');
  assert.match(script, /triangleGroups:walkingSurfaces\(\)/, 'placed brick faces feed the same swept movement controller as the map');
  assert.match(script, /brickMaxHits: 5/, 'bricks require exactly five hits to destroy');
  const system = localSystem(script), brick = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  brick.position.z = -2;
  brick.userData = {brick: true, hits: 0, maxHits: 5, buildScale: brick.scale.clone()};
  system.scene.add(brick); system.bricks.push(brick);
  for (let shot = 1; shot <= 5; shot++) {
    system.fireLegacyLaser(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
    assert.equal(brick.userData.hits, shot, 'the first visible brick receives each accepted shot');
    assert.equal(Boolean(brick.parent), shot < 5, 'four hits leave it solid and the fifth removes it');
  }
  assert.deepEqual(system.bricks, []);
  assert.match(script, /Brick destroyed after 5 hits/, 'the player receives destruction feedback');
  assert.match(script, /\['laser', 'pulse-rifle', 'flamethrower', 'rail-cannon', 'spray', 'bat', 'taser', 'toxin', 'dynamite', 'brick', \.\.\.Object\.keys\(EXTRA_WEAPONS\),\.\.\.Object\.keys\(UTILITY_TOOLS\)\]/, 'VR tool cycling includes the Brick Layer');
  assert.match(script, /if\(this\.tool==='brick'\)return this\.placeBrick\(null,origin,direction\)/, 'VR triggers can place bricks');
  assert.match(script, /aria-label="Building paint colors"/, 'the tools panel offers a dedicated building paint palette');
  assert.match(script, /data-brick-color=/, 'brick color swatches expose an interactive color value');
  assert.match(script, /setBrickColor\(index\)/, 'selecting a swatch updates the active brick color');
  assert.match(script, /createBrickMesh\(\{color:SPRAY_COLORS\[this\.brickColorIndex\]\.hex\}\)/, 'new bricks use the selected paint color');
  assert.match(script, /this\.applyBrickColor\(this\.brickPreview/, 'the placement preview immediately reflects the selected paint color');
});

test('Brick Layer falls back to a simple click-to-drop position', async () => {
  const script = await readFile('public/js/house-explorer-glb.js', 'utf8');

  assert.match(script, /brickDropPlacement\(origin,direction\)/, 'brick placement provides a drop-ahead fallback');
  assert.match(script, /addScaledVector\(forward,3\)/, 'a click drops the brick a short, predictable distance ahead');
  assert.match(script, /this\.updateBrickPreview\(pointer\)\|\|this\.brickDropPlacement/, 'pointer placement falls back when no map surface is directly targeted');
  assert.match(script, /if\(!hit\)return this\.brickDropPlacement\(rayOrigin,rayDirection\)/, 'XR placement uses the same forgiving fallback');
});

test('ranged weapons always render distinct shot feedback, including misses', async () => {
  const script = await readFile('public/js/house-explorer-glb.js', 'utf8');

  assert.match(script, /if\(this\.tool==='flamethrower'\)return this\.fireFlame\(origin,direction\)/, 'the converted Scatter Blaster uses physical flames rather than beam feedback');
  assert.match(script, /'pulse-rifle':\{[^}]*color:0x43d8ff/, 'the Pulse Rifle has a distinct cyan shot');
  assert.match(script, /'rail-cannon':\{[^}]*color:0xc66bff/, 'the Rail Cannon has a distinct purple shot');
  assert.match(script, /showWeaponShot\(tool,origin,direction,target=null\)/, 'one shared smooth feedback path renders every ranged weapon');
  const system = localSystem(script), feedback = [], hits = [];
  system.showWeaponShot = (...args) => feedback.push(args);
  system.registerLaserShot = hit => hits.push(hit);
  assert.equal(system.fireLegacyLaser(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)), true);
  assert.equal(feedback.length, 1, 'a miss still renders the selected weapon feedback');
  assert.equal(feedback[0][0], 'laser');
  assert.deepEqual(hits, [false], 'a miss is recorded without claiming a successful target hit');
  assert.match(script, /toxicBubbleSystem\.showWeaponShot\(toxicBubbleSystem\.tool,rangeRaycaster\.ray\.origin/, 'the firing range renders shot feedback too');
  assert.match(script, /weaponFlash:true/, 'each shot includes visible muzzle feedback');
});

test('tools use GLB, procedural, and Builder layout surfaces through one interaction set', async () => {
  const script = await readFile('public/js/house-explorer-glb.js', 'utf8');

  assert.match(script, /environmentSurfaces\(\)\{const surfaces=\[\.\.\.\(this\.loader\.meshes\|\|\[\]\),\.\.\.\(this\.loader\.collisionMeshes\|\|\[\]\),\.\.\.\(this\.loader\.floorMeshes\|\|\[\]\)\]/, 'tool surfaces include visible GLB meshes, procedural colliders, Builder objects, and verified floors');
  assert.match(script, /if\(node\.userData\?\.collisionDisabled===true\)return false/, 'held, hidden, and open Builder objects do not remain targetable surfaces');
  assert.match(script, /floorAt\(x,z\)[\s\S]{0,300}intersectObjects\(this\.environmentSurfaces\(\),true\)/, 'enemy, pickup, dynamite, and brick floor queries work on every environment type');
  for (const source of ['meshes', 'collisionMeshes', 'floorMeshes']) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial());
    wall.position.z = -2;
    const system = localSystem(script, {[source]: [wall]}), origin = new THREE.Vector3(), direction = new THREE.Vector3(0, 0, -1);
    system.scene.add(wall);
    assert.equal(system.surfaceAt(null, origin, direction).object, wall, `paintballs hit ${source}`);
    assert.equal(system.brickSurfaceAt(null, origin, direction).object, wall, `building placement hits ${source}`);
    assert.equal(system.drawAt(null, origin, direction), true);
    assert.equal(system.drawingStrokes.length, 1);
    system.surfaceRaycaster.set(origin, direction);
    assert.equal(system.solidHit(system.surfaceRaycaster).object, system.drawingStrokes[0], 'new 3D paint joins the same physical interaction set');
    assert.equal(system.sprayFuel, 9);
  }
  assert.match(script, /environmentMeshes:\(\)=>this\.environmentSurfaces\(\)/, 'boss navigation receives the same complete environment surface set');
});
