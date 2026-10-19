import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Brick Layer snaps, highlights, collides, and breaks after five hits', async () => {
  const script = await readFile('public/js/house-explorer-glb.js', 'utf8');

  assert.match(script, /toolButton\('brick','Building Materials'/, 'the Brick Layer appears in the tool picker');
  assert.match(script, /MUZIKAZ_BRICK_PLACEMENT_HIGHLIGHT/, 'the selected tool shows a placement highlight');
  assert.ok(script.includes('Math.round(point.x/(w/2))*(w/2)') && script.includes('Math.round((point.y-h/2)/h)*h+h/2'), 'brick positions snap to equal map-grid intervals');
  assert.match(script, /MUZIKAZ_CLIMBABLE_BRICK/, 'placed bricks are identified as climbable world objects');
  assert.match(script, /resolveBrickCollisions\(delta,jetpackThrust\)/, 'player movement resolves against placed bricks');
  assert.match(script, /brickMaxHits: 5/, 'bricks require exactly five hits to destroy');
  assert.match(script, /this\.damageBrick\(brickHit\.root\)/, 'laser hits damage a targeted brick');
  assert.match(script, /Brick destroyed after 5 hits/, 'the player receives destruction feedback');
  assert.match(script, /\['laser', 'pulse-rifle', 'flamethrower', 'rail-cannon', 'spray', 'bat', 'taser', 'toxin', 'dynamite', 'brick', \.\.\.Object\.keys\(EXTRA_WEAPONS\),\.\.\.Object\.keys\(UTILITY_TOOLS\)\]/, 'VR tool cycling includes the Brick Layer');
  assert.match(script, /if\(this\.tool==='brick'\)return this\.placeBrick\(null,origin,direction\)/, 'VR triggers can place bricks');
  assert.match(script, /data-color-label="Brick colors"/, 'the tools panel offers a dedicated brick paint palette');
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
  assert.match(script, /this\.showWeaponShot\(this\.tool,origin,direction,target\);if\(!hit\)return true/, 'mouse and touch misses still render and count as a fired tool');
  assert.match(script, /toxicBubbleSystem\.showWeaponShot\(toxicBubbleSystem\.tool,rangeRaycaster\.ray\.origin/, 'the firing range renders shot feedback too');
  assert.match(script, /weaponFlash:true/, 'each shot includes visible muzzle feedback');
});

test('tools use GLB, procedural, and Builder layout surfaces through one interaction set', async () => {
  const script = await readFile('public/js/house-explorer-glb.js', 'utf8');

  const source=script.split('\n').find(line=>line.trimStart().startsWith('environmentSurfaces(){'));
  assert.ok(source,'the shared surface collector exists');
  const collect=new Function(`return ({${source.trim()}}).environmentSurfaces`)();
  const mesh=(uuid,parent=null)=>({uuid,isMesh:true,parent,userData:{}}),glb=mesh('glb'),collider=mesh('collider'),floor=mesh('floor'),held=mesh('held',{userData:{collisionDisabled:true}});
  const state={environmentGeneration:1,loader:{meshes:[glb,held,{uuid:'group',isMesh:false}],collisionMeshes:[collider,glb],floorMeshes:[floor]}};
  assert.deepEqual(collect.call(state).map(item=>item.uuid),['glb','collider','floor'],'tool surfaces combine all three mesh lists, deduplicate and omit disabled descendants');
  const brick=mesh('new-builder-object');state.loader.meshes.push(brick);
  assert.ok(collect.call(state).includes(brick),'adding Builder geometry invalidates the cached candidate list');
  collider.userData.collisionDisabled=true;
  assert.ok(!collect.call(state).includes(collider),'an object held or opened after caching immediately stops blocking tool queries');
  collider.userData.collisionDisabled=false;
  assert.ok(collect.call(state).includes(collider),'releasing or closing an object restores tool queries');
  assert.match(script, /floorAt\(x,z\)[\s\S]{0,300}intersectObjects\(this\.environmentSurfaces\(\),false\)/, 'enemy, pickup, dynamite, and brick floor queries work on every environment type');
  assert.match(script, /drawAt\(pointer,origin=null,direction=null\)[\s\S]{0,650}this\.environmentSurfaces\(\)/, '3D drawing can hit procedural and Builder layout surfaces');
  assert.match(script, /surfaceAt\(pointer,origin=null,direction=null\)[\s\S]{0,300}this\.environmentSurfaces\(\)/, 'paintballs can hit procedural and Builder layout surfaces');
  assert.match(script, /brickSurfaceAt\(pointer,origin=null,direction=null\)[\s\S]{0,300}this\.environmentSurfaces\(\)/, 'brick laying can target procedural and Builder layout surfaces');
  assert.match(script, /environmentMeshes:\(\)=>this\.environmentSurfaces\(\)/, 'boss navigation receives the same complete environment surface set');
});
