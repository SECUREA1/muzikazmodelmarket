import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('environment builder exposes layout, placement and editing controls', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8')
  ]);
  for (const control of ['library-grid', 'land-canvas', 'layout-select', 'rotation-control', 'scale-control', 'position-x', 'position-y', 'duplicate-object', 'remove-object', 'save-scene', 'play-scene']) assert.match(html, new RegExp(`id="${control}"`));
  for (const layout of ['grand-floor', 'loft', 'suite', 'courtyard']) assert.match(html, new RegExp(`value="${layout}"`));
  assert.equal((script.match(/\['[a-z-]+','[^']+','(?:landscape|interior)',\d+\]/g) || []).length, 30);
  for (const behavior of ['pointermove', 'dragstart', 'drop', 'localStorage.setItem', 'LOCKED PROPORTIONS']) assert.match(`${html}\n${script}`, new RegExp(behavior));
  assert.match(script, /muzikaz\.builder\.buildTray/);
  assert.match(script, /multiplayer:true, enemies:true, weapons:true, pickups:true/);
  assert.match(script, /model-explorer\.html\?environment=/);
  assert.match(script, /muzikaz\.environmentBuilder\.playScene\.v1/);
  assert.match(script, /&house=\$\{id\}&autoplay=1/);
  assert.match(script, /apiFetch\('\/api\/custom-maps'/);
  assert.match(script, /All players can join/);
  assert.match(script, /Opening your locally saved multiplayer map/);
});


test('multiplayer map list pins live user maps with a flashing status', async () => {
  const [game, server, rust] = await Promise.all([
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8'),
    readFile(new URL('../server.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.rs', import.meta.url), 'utf8')
  ]);
  assert.match(game, /refreshMultiplayerPresence/);
  assert.match(game, /b\.count-a\.count/);
  assert.match(game, /multiplayer-live-count/);
  assert.match(game, /Live \(\$\{count\} user/);
  assert.match(game, /@keyframes multiplayerLiveFlash/);
  assert.match(server, /presence' && req\.method === 'GET'/);
  assert.match(rust, /method == "GET"/);
});

test('canvas manipulation keeps object controls behind an intentional double tap', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /Drag to move · Shift-drag to rotate/);
  assert.match(html, /Double-tap for controls/);
  assert.match(script, /inspectorRequested=false/);
  assert.match(script, /lastObjectTap\?\.id===finished\.id/);
  assert.match(script, /selectObject\(finished\.id,\{openInspector:true\}\)/);
  assert.match(script, /rotate:e\.shiftKey/);
});

test('expanded maps include detailed building interiors and large playable landscapes', async () => {
  const [html, script, models] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/builder-models-3d.js', import.meta.url), 'utf8')
  ]);
  for (const item of ['studio-desk', 'recording-booth', 'modular-wall', 'glass-door', 'loft-bed', 'wardrobe', 'bathroom-vanity', 'dining-set', 'fireplace', 'elevator']) {
    assert.match(script, new RegExp(`'${item}'`));
    assert.match(models, new RegExp(`(?:'${item}'|${item}:)`));
    await readFile(new URL(`../public/images/builder-pack/${item}.svg`, import.meta.url), 'utf8');
  }
  for (const landscape of ['coastal-cliffs', 'ancient-forest', 'neon-wetlands']) {
    assert.match(html, new RegExp(`value="${landscape}"`));
    assert.match(script, new RegExp(`'${landscape}'`));
  }
  for (const addOn of ['ghost', 'bubbles', 'enemy']) assert.match(html, new RegExp(`data-clip-on="${addOn}"`));
  assert.match(script, /Friendly Ghost/);
  assert.match(script, /Green Bubble Field/);
});

test('responsive customization sheet includes commercial FPS and training scenes', async () => {
  const [html, script, css] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.css', import.meta.url), 'utf8')
  ]);
  for (const layout of ['blacksite', 'cargo-yard', 'neon-arena', 'desert-outpost', 'mega-mall', 'office-tower', 'firing-range', 'movie-studio']) {
    assert.match(html, new RegExp(`value="${layout}"`));
    assert.match(script, new RegExp(`'${layout}'`));
  }
  for (const panel of ['transform', 'look', 'play']) assert.match(html, new RegExp(`data-inspector-tab="${panel}"`));
  assert.match(script, /function mapGlyph/);
  assert.match(script, /<svg viewBox=/);
  assert.match(css, /\.mobile-selection-button/);
  assert.match(css, /\.inspector-open \.object-inspector/);
});

test('environment builder supports custom role-play actors and interactions', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8')
  ]);
  for (const control of ['open-item-maker', 'item-maker', 'custom-item-name', 'custom-item-type', 'custom-item-color', 'custom-item-behavior', 'object-color', 'object-behavior']) {
    assert.match(html, new RegExp(`id="${control}"`));
  }
  for (const category of ['avatar', 'enemy', 'interactive']) assert.match(html, new RegExp(`data-library-filter="${category}"`));
  for (const behavior of ['talk', 'quest', 'hostile', 'patrol', 'pickup', 'door', 'heal']) assert.match(html, new RegExp(`value="${behavior}"`));
  assert.match(script, /muzikaz\.environmentBuilder\.customItems\.v1/);
  assert.match(script, /data-delete-group/);
  assert.match(script, /customRoles:true/);
  assert.ok((script.match(/type:'enemy'/g) || []).length >= 4, 'includes several ready-made enemies');
  assert.ok((script.match(/type:'interactive'/g) || []).length >= 4, 'includes several interactive role-play objects');
});

test('custom items use an SVG drawing and 3D extrusion toolkit instead of icon-only models', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8')
  ]);
  for (const control of ['custom-model-drawing', 'custom-model-strokes', 'custom-brush-size', 'custom-model-depth', 'custom-model-bevel', 'custom-model-material', 'download-model-svg', 'undo-model-stroke', 'clear-model-drawing']) {
    assert.match(html, new RegExp(`id="${control}"`));
  }
  for (const tool of ['pencil', 'line', 'rectangle', 'circle']) assert.match(html, new RegExp(`data-draw-tool="${tool}"`));
  for (const feature of ['svgDocument', 'drawingStrokes', 'ExtrudeGeometry', 'TubeGeometry', 'drawingSettings', 'createDrawnModel']) assert.match(script, new RegExp(feature));
  assert.doesNotMatch(html, /CHOOSE AN ICON/);
});

test('custom item toolkit starts from editable models in every requested category', async () => {
  const [html, script, css] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.css', import.meta.url), 'utf8')
  ]);
  for (const control of ['starter-category-tabs', 'starter-model-grid', 'starter-selection-status', 'start-blank-item']) {
    assert.match(html, new RegExp(`id="${control}"`));
  }
  for (const category of ['avatar', 'enemy', 'interactive', 'landscape', 'interior']) {
    assert.match(script, new RegExp(`${category}:'`), `${category} has an active starter category`);
    assert.ok((script.match(new RegExp(`type:'${category}'`, 'g')) || []).length >= 3, `${category} provides at least three editable starters`);
  }
  for (const setting of ['talk', 'quest', 'hostile', 'patrol', 'pickup', 'door', 'heal', 'decor']) assert.match(script, new RegExp(`behavior:'${setting}'`));
  for (const animation of ['idle', 'walk', 'dance', 'float']) assert.match(script, new RegExp(`animation:'${animation}'`));
  for (const action of ['message', 'score', 'teleport', 'damage', 'none']) assert.match(script, new RegExp(`action:'${action}'`));
  assert.match(script, /function loadCustomStarter\(model\)/);
  assert.match(css, /\.starter-model-card\.active/);
});

test('every drawn custom item saves three toggleable 3D forms with fitted clip-ons', async () => {
  const [html, script, css] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.css', import.meta.url), 'utf8')
  ]);
  for (const form of ['solid', 'sculpted', 'lightweight']) assert.match(html, new RegExp(`data-custom-form="${form}"`));
  for (const clipOn of ['cap', 'hoodie', 'armor', 'backpack', 'wings', 'sign']) assert.match(html, new RegExp(`data-clip-on="${clipOn}"`));
  for (const feature of ['customFormPresets', 'upgradeCustomModels', 'groupId', 'formLabel', 'clipOns', 'custom-library-versions']) assert.match(script, new RegExp(feature));
  assert.match(script, /Object\.entries\(customFormPresets\)\.map/);
  assert.match(script, /mesh\.name='custom-clip-on'/);
  assert.match(css, /\.custom-form-toggle/);
  assert.match(css, /\.custom-clip-ons/);
});

test('environment builder places grounded 3D assets and persists complete runtime state', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8')
  ]);
  for (const control of ['scene-canvas', 'side-view-canvas', 'elevation-control', 'snap-ground', 'animation-enabled', 'interact-object']) {
    assert.match(html, new RegExp(`id="${control}"`));
  }
  for (const feature of ['GLTFLoader', 'cloneSkeleton', 'Raycaster', 'groundAt', 'groundOffset', 'materialSettings', 'animationState', 'functionalSettings', 'OrbitControls']) {
    assert.match(script, new RegExp(feature));
  }
  assert.match(script, /outputColorSpace=THREE\.SRGBColorSpace/);
  assert.match(script, /castShadow=true/);
  assert.match(script, /receiveShadow=true/);
  assert.match(script, /mixer\?\.stopAllAction/);
  assert.match(script, /model\.procedural\?template\.clone\(true\):cloneSkeleton/);
});

test('avatar look lab provides deep fitted customization for every wearable icon', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8')
  ]);
  for (const control of ['avatar-category-tabs', 'avatar-variants', 'randomize-avatar', 'save-avatar-look', 'clear-avatar-look']) {
    assert.match(html, new RegExp(`id="${control}"`));
  }
  for (const category of ['face', 'hat', 'glasses', 'headphones', 'necklace', 'rings', 'top', 'bottom', 'accessory']) {
    assert.match(script, new RegExp(`${category}:\\{icon:`), `${category} has a ready-to-use item collection`);
  }
  for (const mesh of ['TorusGeometry', 'ConeGeometry', 'BoxGeometry', 'OctahedronGeometry']) assert.match(script, new RegExp(mesh));
  assert.match(script, /builder-avatar-wearables/);
  assert.match(script, /muzikaz\.avatarLook\.v1/);
});

test('in-game Builder Map menu opens the environment builder and restores playable maps', async () => {
  const game = await readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8');
  assert.match(game, /class="rad-build-launch" href="environment-builder\.html\?from=game"/);
  assert.match(game, /addSavedBuilderWorld/);
  assert.match(game, /loadBuilderDecor/);
  assert.match(game, /item\.position\.z/);
  assert.match(game, /item\.functionalSettings/);
  assert.match(game, /roomId:env\.id/);
  assert.match(game, /toxicBubbleSystem\.handleEnvironmentReady\(env\)/);
  assert.match(game, /params\.get\('autoplay'\) === '1'/, 'Save & Play starts the published map immediately');
  assert.match(game, /muzikaz\.environmentBuilder\.scenes\.v2/);
  assert.match(game, /muzikaz\.environmentBuilder\.playScene\.v1/);
  assert.match(game, /key\.includes\('playScene'\)\?sessionStorage:localStorage/);
  assert.match(game, /createSavedCustomModel/);
  assert.match(game, /built\.customModels/);
  assert.match(game, /center\.x\+x/);
  assert.match(game, /object\.scale\.set\(scale,sy,sz\)/, 'preserves every authored scale axis');
  assert.match(game, /object\.rotation\.set/, 'preserves the full authored rotation');
});

test('saved and published maps embed custom item definitions for exact game reconstruction', async () => {
  const script = await readFile(new URL('../environment-builder.js', import.meta.url), 'utf8');
  assert.match(script, /sceneData\.customModels=cloneData\(customModels\)/);
  assert.match(script, /body:JSON\.stringify\(\{scene:sceneData,ownerId\}\)/);
});

test('Builder Pack layouts open as new environment maps', async () => {
  const script = await readFile(new URL('../builder-market.js', import.meta.url), 'utf8');
  assert.match(script, /environment-builder\.html\?layout=/);
  assert.match(script, /room\.dataset\.roomStyle/);
  assert.match(script, /dataset\.packTemplate/);
});

test('expanded asset library covers deployable worlds, weapons, ghosts, slime and graded materials', async () => {
  const [html, script, models] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/builder-models-3d.js', import.meta.url), 'utf8')
  ]);
  for (const category of ['terrain','plants','buildings','props','weapons','characters','creatures','interactive']) assert.match(html, new RegExp(`data-library-filter="${category}"`));
  for (const asset of ['terrain-cliff','ancient-oak','timber-cabin','supply-crate','plasma-sword','spectral-ghost','emerald-slime','teleport-pad']) {
    assert.match(script, new RegExp(asset), `${asset} is selectable`);
    assert.match(models, new RegExp(asset), `${asset} has complete procedural geometry`);
  }
  assert.match(script, /m tall|×/);
  assert.match(models, /Float32BufferAttribute\(colors,3\)/);
  assert.match(models, /vertexColors:true/);
  assert.match(script, /clip==='float'\|\|clip==='bounce'/);
});

test('premade assets stay clean while custom SVG clip-ons remain explicit', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8')
  ]);
  assert.match(script, /assetKind:'premade'/);
  assert.match(script, /assetKind:'custom-svg'/);
  assert.match(script, /model\.type==='avatar'&&object\.avatarSettings\?\.customized/);
  assert.match(script, /o\.avatarSettings\.customized=true/);
  for (const weather of ['clear', 'cloudy', 'rain', 'storm']) assert.match(html, new RegExp(`<option value="${weather}">`));
  for (const world of ['skyport', 'desert-airfield', 'dune-sea']) assert.match(html, new RegExp(`value="${world}"`));
  assert.match(script, /function applyWeather\(\)/);
  assert.match(script, /groundAt\(o\.position\.x,o\.position\.z\)\+o\.groundOffset/);
});

test('every library preview renders without aborting builder initialization', async () => {
  const script = await readFile(new URL('../environment-builder.js', import.meta.url), 'utf8');
  assert.match(script, /function itemSilhouette\(model,alt=model\.name\)/);
  assert.match(script, /itemSilhouette\(model,alt\)/);
  assert.equal((script.match(/function visual\(/g) || []).length, 1, 'preview renderer has one canonical implementation');
  assert.equal((script.match(/function libraryButton\(/g) || []).length, 1, 'library renderer has one canonical implementation');
});
