import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('environment builder exposes layout, placement and editing controls', async () => {
  const [html, script, launcher] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/rad-tox-launcher.js', import.meta.url), 'utf8')
  ]);
  for (const control of ['library-grid', 'land-canvas', 'layout-select', 'rotation-control', 'scale-control', 'position-x', 'position-y', 'duplicate-object', 'remove-object', 'save-scene', 'play-scene']) assert.match(html, new RegExp(`id="${control}"`));
  for (const layout of ['grand-floor', 'loft', 'suite', 'courtyard']) assert.match(html, new RegExp(`value="${layout}"`));
  assert.equal((script.match(/\['[a-z-]+','[^']+','(?:landscape|interior)',\d+\]/g) || []).length, 31);
  assert.match(html, /value="seat"/);
  for (const behavior of ['pointermove', 'dragstart', 'drop', 'localStorage.setItem', 'LOCKED PROPORTIONS']) assert.match(`${html}\n${script}`, new RegExp(behavior));
  assert.match(script, /muzikaz\.builder\.buildTray/);
  assert.match(html,/id="publish-scene"/);
  assert.match(script,/inventory.api\('\/api\/custom-maps'/);
  assert.match(script,/window.location.assign\(result.playUrl\)/);
  const launch=script.slice(script.indexOf('function testGameLocally()'),script.indexOf('function screenRay'));
  assert.match(launch,/publishAndPlay/);
  assert.doesNotMatch(launch,/sessionStorage|sandbox|localFallback/);
  assert.match(launcher,/get\('autoplay'\) === '1'\) begin\(\)/);

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
  const picker=await readFile(new URL('../public/js/world-map-picker.js',import.meta.url),'utf8');
  assert.match(picker, /mapWheelSvg/);
  const {mapWheelSvg}=await import('../public/js/map-wheel-svg.js');
  const wheel=mapWheelSvg([{env:{id:'live-world',name:'Live world'},count:3}],'live-world');
  assert.match(wheel,/3 LIVE/);assert.match(wheel,/has-players/);
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
  assert.match(script, /Force Training Range/);
  assert.match(script, /reactiveTarget=true/);
  assert.match(script, /rangeTrainee=true/);
  assert.match(html, /ACTIVE TARGETS ONLINE/);
  assert.match(html, /Tournament · 3 rounds/);
  assert.match(html, /id="range-result"/);
  assert.match(script, /function startRangeCourse/);
  assert.match(script, /function fireRangeShot/);
  assert.match(script, /RANGE_BEST_KEY/);
  assert.match(css, /\.range-game-panel/);
});

test('playable firing range supports unlimited free play and real desktop, mobile, and VR target hits', async () => {
  const [game, loader, index] = await Promise.all([
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8'),
    Promise.all([readFile(new URL('../public/js/environments/environment-loader.js', import.meta.url), 'utf8'),readFile(new URL('../public/js/environments/builder-land.js',import.meta.url),'utf8')]).then(parts=>parts.join('\n')),
    readFile(new URL('../index.html', import.meta.url), 'utf8')
  ]);
  assert.match(game, /data-range-mode="freeplay"/);
  assert.match(game, /Unlimited time · unlimited shots/);
  assert.match(game, /function handleRangeShot/);
  assert.match(game, /rangeRaycaster\.intersectObject\(envLoader\.world,true\)/, 'range scoring raycasts the actual loaded world');
  assert.match(game, /handleRangeShot\(\{event\}\)/, 'touch and unlocked-pointer shots use their screen position');
  assert.match(game, /handleRangeShot\(\{centre:true\}\)/, 'pointer-lock and mobile shoot controls use the reticle');
  assert.match(game, /radToxStickMarkup/, 'firing range uses the shared RAD-TOX controller');
  assert.match(await readFile(new URL('../public/js/rad-tox-controller.js',import.meta.url),'utf8'), /Move \/ shoot/, 'shared movement stick retains tap-to-shoot');
  assert.match(game, /if \(name === 'left'\) shootAtReticle\(\)/, 'tapping the movement stick shoots the range reticle');
  assert.doesNotMatch(game, /data-mobile-(?:fire|jump)/, 'the replacement Fire and Jump buttons stay removed');
  assert.doesNotMatch(game, /data-mobile-action=/, 'duplicate action buttons are not rendered beneath the thumbsticks');
  for (const control of ['house-world-button','house-fullscreen','house-begin-reset']) assert.match(index, new RegExp(`id="${control}"`), 'library, fullscreen, and begin/reset remain available in the main controls');
  assert.match(game, /handleRangeShot\(\{origin,direction\}\)/, 'WebXR triggers use each controller aim ray');
  assert.match(game, /pulse-rifle/);
  assert.match(game, /flamethrower/);
  assert.match(game, /rail-cannon/);
  assert.match(game, /RANGE_WEAPONS/);
  assert.match(game, /muzikaz:range-session-complete/, 'qualification results connect to the wider game event system');
  assert.match(game, /localStorage\.setItem\(RANGE_BEST_KEY/, 'qualification personal bests persist across game worlds');
  assert.match(game, /rangeScore\.toLocaleString\(\).*PTS.*accuracy/, 'points and accuracy remain visible on the in-frame Range ops button');
  assert.match(game, /RANGE_WEAPONS\[toxicBubbleSystem\.tool\]\|\|RANGE_WEAPONS\.laser/, 'non-range tools cannot disable firing-range scoring');
  assert.match(game, /the range and the regular game/, 'range weapons explicitly remain equipped in regular gameplay');
  assert.match(loader, /mesh\.userData\.rangeTarget=true/);
  for (const zone of ['outer','body','bullseye']) assert.match(loader, new RegExp(`'${zone}'`));
});

test('builder maze group is playable, grounded, and only recovers true world falls', async () => {
  const [html, builder, loader, game] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    Promise.all([readFile(new URL('../public/js/environments/environment-loader.js', import.meta.url), 'utf8'),readFile(new URL('../public/js/environments/builder-land.js',import.meta.url),'utf8')]).then(parts=>parts.join('\n')),
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /optgroup label="MAZE WORLDS"/);
  for (const maze of ['hedge-maze', 'neon-maze', 'dungeon-maze']) {
    assert.match(html, new RegExp(`value="${maze}"`));
    assert.match(builder, new RegExp(`'${maze}'`));
    assert.match(loader, new RegExp(`'${maze}'`));
  }
  assert.match(builder, /mazeSegments/);
  assert.match(loader, /BUILDER_WALKABLE_FLOOR_/);
  assert.match(loader, /terrain\.userData\.colliderShape = 'mesh'/);
  assert.match(builder, /feetLockedToFloor=true/);
  assert.match(game, /visualFeet/);
  assert.match(game, /droppedFeet/);
  assert.match(game, /fellThroughWorld=base\.y<mapFloorLimit/);
  assert.doesNotMatch(game, /safeFloorLimit/, 'ordinary jumps and terrain steps must not trigger a respawn');
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
  assert.match(script, /multiplayer:\$\('#play-mode'\)\.value!=='solo'/);
  assert.ok((script.match(/type:'enemy'/g) || []).length >= 4, 'includes several ready-made enemies');
  assert.ok((script.match(/type:'interactive'/g) || []).length >= 4, 'includes several interactive role-play objects');
});

test('custom item game mechanics use accessible option toggles for every function group', async () => {
  const [html, script, css] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.css', import.meta.url), 'utf8')
  ]);
  for (const group of ['behavior', 'animation', 'action']) assert.match(html, new RegExp(`data-mechanic-group="${group}"`));
  assert.equal((html.match(/role="radiogroup"/g) || []).length >= 3, true);
  assert.match(script, /function setMechanicOption\(group,value\)/);
  assert.match(script, /setMechanicOption\('behavior',model\.behavior\)/, 'starter mechanics update the visible toggle state');
  assert.match(css, /\.mechanic-toggle-group button\[aria-pressed=true\]/);
});

test('portal assets expose a locked tuner for local and cross-map destinations', async () => {
  const [html, builder, pipeline, game] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/builder-gameplay-pipeline.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8')
  ]);
  for (const control of ['portal-tuner', 'portal-enabled', 'portal-destination-type', 'portal-target-location', 'portal-target-map']) assert.match(html, new RegExp(`id="${control}"`));
  assert.match(builder, /portal=\{enabled:false,destinationType:'location'/, 'new portal routes are safe and disabled by default');
  assert.match(builder, /renderPortalTuner/);
  assert.match(pipeline, /Portal path is locked in the Portal Tuner/);
  assert.match(pipeline, /this\.effects\.teleport/);
  assert.match(game, /destinationType==='map'/);
  assert.match(game, /resetPlayer\(new THREE\.Vector3/);
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

test('item forge includes editable weapons, loot, tools and vehicles', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /ITEM \+ WEAPON FORGE/);
  for (const category of ['weapon', 'interactive', 'vehicle']) {
    assert.match(script, new RegExp(`${category}:'`));
    assert.ok((script.match(new RegExp(`type:'${category}'`, 'g')) || []).length >= 3, `${category} has at least three editable forge starters`);
  }
  for (const starter of ['Pulse Rifle', 'Plasma Blade', 'Arc Hammer', 'Guardian Shield', 'Field Med Kit', 'Loot Crate', 'Shock Trap', 'Hover Bike', 'Dune Buggy', 'Cargo Drone']) {
    assert.match(script, new RegExp(starter));
  }
  assert.match(script, /category=type==='weapon'\?'weapons'/, 'custom weapons are routed back into the Weapons library filter');
  assert.match(script, /renderLibrary\(category\)/, 'the forge reveals the newly saved asset in its matching library category');
  assert.match(html, /button type="button" value="vehicle"[^>]*>Drive \/ fly/);
  assert.match(html, /button type="button" value="pulse"[^>]*>Energy pulse/);
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

test('builder maps use resilient linked textures and a tabletop presentation', async () => {
  const [html, script, css] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.css', import.meta.url), 'utf8')
  ]);
  assert.match(html, /id="texture-credit"/);
  assert.match(script, /cdn\.jsdelivr\.net\/gh\/mrdoob\/three\.js@r180\/examples\/textures/);
  for (const feature of ['terrainTextureSets', 'applyTerrainTexture', 'RepeatWrapping', 'TABLETOP_MAP_BASE', 'TABLETOP_BRASS_RIM']) assert.match(script, new RegExp(feature));
  assert.match(script, /Procedural texture fallback/);
  assert.match(css, /\.texture-credit\.ready/);
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
  assert.match(game,/connectAuthoritativeRoom/);
  assert.match(game,/const localSandbox = false/);
  assert.match(game,/function addSavedBuilderWorld\(\)\{return null;/);
  assert.doesNotMatch(game,/Locally saved Builder Map/);
  assert.match(game,/built\.customModels/);
  assert.match(game,/object\.scale\.multiply\(new THREE\.Vector3\(scale,sy,sz\)\)/);

});

test('builder lands and placed items retain verified collision floors', async () => {
  const [loader, game, server] = await Promise.all([
    Promise.all([readFile(new URL('../public/js/environments/environment-loader.js', import.meta.url), 'utf8'),readFile(new URL('../public/js/environments/builder-land.js',import.meta.url),'utf8')]).then(parts=>parts.join('\n')),
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8'),
    readFile(new URL('../server.mjs', import.meta.url), 'utf8')
  ]);
  assert.match(loader, /createBuilderLand\(environment\)/);
  assert.match(loader, /environment\.builderScene \|\| environment\.proceduralLand/);
  assert.match(loader, /new THREE\.PlaneGeometry\(size,size,segments,segments\)/);
  assert.match(loader, /terrain\.userData\.colliderShape = 'mesh'/, 'builder map terrain keeps an explicit mesh collider');
  assert.match(loader, /BUILDER_TEMPLATE_\$\{layout\}/, 'the playable map reconstructs the template set dressing instead of loading an empty terrain');
  assert.match(loader, /root\.add\(mesh\)/, 'template buildings and props join the world root and its collision pass');
  assert.match(loader, /buildCollision\(nextWorld, environment\.collisionMode,\[\],\{buildOctree:!this\.serverAuthoritative\(\)\}\)/, 'procedural terrain enters the normal collision pipeline');
  assert.match(loader, /resolveSafeSpawn\(nextWorld, collision\.floorMeshes, environment\.spawn\)/, 'the initial player position is resolved against verified collision floors');
  assert.match(game, /const spawn=builderRuntime\?\.worldSpawn\|\|result\.spawn;activeWorldSpawn=\{position:spawn\.position\.clone\(\),rotationY:Number\(spawn\.rotationY\)\|\|0\};resetPlayer\(activeWorldSpawn\.position,activeWorldSpawn\.rotationY\)/, 'map loading places the player directly at an authored or safe resolved spawn');
  assert.match(loader, /setSupplementalCollisionRoots\(roots = \[\]\)/, 'the loader can safely include placed Builder items in its collision octree');
  assert.match(game, /function refreshBuilderCollision\(\)/, 'placed Builder items batch their collision refresh instead of rebuilding once per asset');
  assert.match(game, /window\.setTimeout/, 'collision rebuilding yields to the browser so the map can open first');
  assert.match(game, /worldX=center\.x\+x,worldZ=center\.z\+z,ground=floorPointAt/, 'every placed object is grounded at its authored horizontal position');
  assert.match(game, /spawnFloor\.y\+FLOOR_ENTRY_OFFSET/, 'the player spawn begins just above the verified floor with the full body capsule above it');
  assert.match(server, /proceduralLand:true/);
  assert.match(server, /modelUrl:'', modelUrls:\[\]/, 'published builder maps no longer borrow a repository GLB');
});

test('collision floors protect spawn, teleport and low-frame-rate falls', async () => {
  const [collision, loader, game] = await Promise.all([
    readFile(new URL('../public/js/environments/environment-collision.js', import.meta.url), 'utf8'),
    Promise.all([readFile(new URL('../public/js/environments/environment-loader.js', import.meta.url), 'utf8'),readFile(new URL('../public/js/environments/builder-land.js',import.meta.url),'utf8')]).then(parts=>parts.join('\n')),
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8')
  ]);
  assert.match(collision, /\(COLLIDER\|COLLISION\|NAVMESH\)/, 'standard collider names are recognized anywhere in exported node names');
  assert.match(collision, /colliderShape === 'mesh'/, 'explicit mesh colliders are recognized');
  assert.match(collision, /const floorMeshes = collisionMeshes\.filter/, 'floor references come from physical collision meshes, including hidden dedicated colliders');
  assert.match(collision, /const raw = spawnNode \?/, 'authored player spawn nodes take precedence over automatic floor sampling');
  assert.doesNotMatch(collision, /const largestFloorPoint = findLargestWalkableFloorPoint/, 'authored spawns do not trigger the expensive fallback floor scan');
  assert.match(collision, /Math\.ceil\(Math\.sqrt\(meshes\.length\)\), 7, 15/, 'fallback floor sampling remains bounded on detailed maps');
  assert.match(loader, /this\.floorMeshes = collision\.floorMeshes/g, 'floor references survive loading and world scaling');
  assert.match(game, /teleportRay\.intersectObjects\(envLoader\.floorMeshes/, 'teleporting verifies a collision floor');
  assert.match(game, /alignPointAboveFloor\(spawn\.clone\(\), envLoader\.floorMeshes/, 'spawn and respawn align to collision floors');
  assert.match(game, /const previousFootY=playerCollider\.start\.y-player\.radius/);
  assert.match(game, /floorSweepRay\.intersectObjects\(envLoader\.floorMeshes,true\)/, 'a downward frame sweep catches thin floors crossed during a fall');
  assert.doesNotMatch(game, /PLAYER_ENTRY_DROP_HEIGHT|dropIntoMap/, 'map entry never adds an aerial offset above the resolved floor');
  assert.doesNotMatch(game, /playerDropRecoveryActive|groundedRecoveryFrames/, 'the drop is not re-armed from the animation loop');
  assert.match(game, /const lastSafePlayerPosition = new THREE\.Vector3\(\)/, 'every map shares a last-known-good floor position');
  assert.match(game, /const fellThroughWorld=base\.y<mapFloorLimit/, 'recovery only begins after the player has fallen below the complete world bounds');
  assert.doesNotMatch(game, /safeFloorLimit/, 'jumping or walking down to a lower valid floor cannot be mistaken for falling through the world');
  assert.match(game, /playerCollider\.start\.set\(recovery\.x,recovery\.y\+player\.radius,recovery\.z\)/, 'a missed floor collider restores the capsule to safe ground');
  assert.match(game, /floorLockCooldown=\.35/, 'floor recovery is rate limited instead of repeatedly resetting each frame');
  for (const layout of ['blacksite','cargo-yard','neon-arena','desert-outpost','mega-mall','office-tower','firing-range','movie-studio']) assert.match(loader, new RegExp(`'${layout}'`));
});

test('world ground and solid scenery always participate in gameplay collision', async () => {
  const [collision, game] = await Promise.all([
    readFile(new URL('../public/js/environments/environment-collision.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8')
  ]);
  const excluded = collision.match(/const EXCLUDE_RE = \/\(([^\n]+)\)\/i/)?.[1] || '';
  assert.doesNotMatch(excluded, /FOLIAGE|LEAF|LEAVES/);
  assert.doesNotMatch(excluded, /LIGHT|LAMP/);
  assert.doesNotMatch(collision, /mode !== 'none'/, 'legacy none metadata cannot disable playable map collision');
  assert.match(collision, /material\?\.visible !== false/);
  assert.doesNotMatch(game, /function resolveBuilderPropCollisions\(delta\)/, 'walking does not rebuild every Builder mesh bound on every frame');
  assert.match(game, /envLoader\.setSupplementalCollisionRoots\(builderDecor\.children\.length/, 'placed bushes, lamps, and other props join the shared collision octree');
  assert.match(game, /ground=floorPointAt\(/, 'dropped items settle against the active map ground');
});

test('saved sandbox maps embed custom item definitions for exact game reconstruction', async () => {
  const [script, game] = await Promise.all([
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/house-explorer-glb.js', import.meta.url), 'utf8')
  ]);
  assert.match(script, /sceneData\.customModels=cloneData\(customModels\)/);
  assert.match(script, /sceneData\.placedModels=cloneData/, 'every placed asset definition travels with the local sandbox scene');
  assert.match(script,/inventory.api\('\/api\/custom-maps'/);
  assert.match(script,/scene:cloneData\(sceneData\)/);
  assert.match(game, /built\.placedModels/);
  assert.match(game, /prepareAuthoredBuilderModel/);
  assert.match(game, /createGeneratedAsset\(definition\)/);
  assert.match(game, /object\.scale\.multiply/, 'gameplay preserves the model normalization and the exact authored instance scale');
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
  const [script, models] = await Promise.all([
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/builder-models-3d.js', import.meta.url), 'utf8')
  ]);
  assert.match(script, /function itemSilhouette\(model,alt=model\.name\)/);
  assert.match(script, /itemSilhouette\(model,alt\)/);
  assert.equal((script.match(/function visual\(/g) || []).length, 1, 'preview renderer has one canonical implementation');
  assert.equal((script.match(/function libraryButton\(/g) || []).length, 1, 'library renderer has one canonical implementation');
  assert.match(script, /from '\.\/public\/vendor\/three\/three\.module\.min\.js'/);
  assert.doesNotMatch(script, /from 'https:\/\//, 'Firefox does not depend on cross-origin modules to populate the library');
  assert.match(models, /from '\.\.\/vendor\/three\/three\.module\.min\.js'/);
  assert.doesNotMatch(models, /from 'https:\/\//, 'the procedural model dependency is also same-origin');
  assert.ok(
    script.indexOf('renderLibrary();') < script.indexOf('new THREE.WebGLRenderer'),
    'the Firefox library is populated before WebGL initialization can fail'
  );
});

test('workspace panels toggle and custom drawing accepts any model type with quality certification', async () => {
  const [html, script, css] = await Promise.all([
    readFile(new URL('../environment-builder.html', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.js', import.meta.url), 'utf8'),
    readFile(new URL('../environment-builder.css', import.meta.url), 'utf8')
  ]);
  for (const panel of ['library', 'details', 'inspector', 'quality']) assert.match(html, new RegExp(`data-workspace-panel="${panel}"`));
  assert.match(html, /id="model-type-options"/);
  assert.match(html, /id="custom-item-type" list="model-type-options"/);
  assert.match(html, /id="online-model-type" list="model-type-options"/);
  for (const control of ['quality-panel', 'quality-score', 'quality-checks', 'certify-scene']) assert.match(html, new RegExp(`id="${control}"`));
  assert.match(script, /function setWorkspacePanel/);
  assert.match(script, /function qualityResults/);
  assert.match(script, /sceneData\.certification=/);
  assert.match(css, /\.environment-workspace\.details-collapsed/);
  assert.match(css, /\.quality-panel/);
});
