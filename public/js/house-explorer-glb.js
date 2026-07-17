import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/DRACOLoader.js/+esm';
import { Octree } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/math/Octree.js/+esm';
import { Capsule } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/math/Capsule.js/+esm';
import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/webxr/VRButton.js/+esm';
import { XRControllerModelFactory } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/webxr/XRControllerModelFactory.js/+esm';

const HOUSE_ENVIRONMENTS = Object.freeze([
  {
    id: 'muzimakz-main',
    name: 'MUZIKAZ Main Floor',
    description: 'Committed main-floor MUZIKAZ house GLB.',
    files: ['/public/models/environments/muzimakzmain.glb'],
    spawn: { x: 0, y: 1, z: 2 }
  },
  {
    id: 'muzikaz-upper',
    name: 'MUZIKAZ Upper Floor',
    description: 'Committed upper-floor MUZIKAZ house GLB.',
    files: ['/public/models/environments/muzikazupper.glb'],
    spawn: { x: 0, y: 1, z: 2 }
  },
  {
    id: 'muzikaz-full-house',
    name: 'MUZIKAZ Full House',
    description: 'Main and upper house GLBs loaded together as one walkthrough world.',
    files: [
      '/public/models/environments/muzimakzmain.glb',
      '/public/models/environments/muzikazupper.glb'
    ],
    spawn: { x: 0, y: 1, z: 2 }
  }
]);

const legacyCanvas = document.querySelector('#house-explorer-canvas');
const stage = legacyCanvas?.closest('.house-stage');
const hud = document.querySelector('.house-hud');

if (legacyCanvas instanceof HTMLCanvasElement && stage && hud) {
  const oldStatus = document.querySelector('#house-status');
  const status = oldStatus?.cloneNode(true);
  if (oldStatus && status) oldStatus.replaceWith(status);

  legacyCanvas.width = 1;
  legacyCanvas.height = 1;
  const canvas = legacyCanvas.cloneNode(false);
  canvas.width = 1280;
  canvas.height = 720;
  canvas.setAttribute('aria-label', 'Walkable MUZIKAZ GLB house environment');
  legacyCanvas.replaceWith(canvas);

  const oldSelect = document.querySelector('#house-environment-select');
  const environmentSelect = oldSelect?.cloneNode(false);
  if (oldSelect && environmentSelect) oldSelect.replaceWith(environmentSelect);

  const uploadLabel = document.querySelector('#house-environment-upload')?.closest('label');
  uploadLabel?.remove();

  const oldReset = document.querySelector('#house-reset');
  const resetButton = oldReset?.cloneNode(true);
  if (oldReset && resetButton) oldReset.replaceWith(resetButton);

  document.querySelector('#hand-toggle')?.setAttribute('hidden', '');
  document.querySelector('#add-avatar')?.setAttribute('hidden', '');
  document.querySelector('.camera-preview-panel')?.setAttribute('hidden', '');

  const pillGrid = hud.querySelector('.hud-pill-grid');
  if (pillGrid) {
    pillGrid.innerHTML = [
      '<span>WASD / arrows: walk</span>',
      '<span>Click: mouse-look mode</span>',
      '<span>Wheel: field of view</span>',
      '<span>Q / E: eye height</span>'
    ].join('');
  }

  const environmentLabel = environmentSelect?.closest('label');
  if (environmentLabel) {
    const textNode = [...environmentLabel.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = 'Walkable house GLB ';
  }

  const fileLocation = document.createElement('div');
  fileLocation.className = 'house-glb-location';
  fileLocation.innerHTML = '<strong>Repository file</strong><code id="house-glb-file-path">Loading…</code><small id="house-glb-description"></small>';
  environmentLabel?.after(fileLocation);

  const walkButton = document.createElement('button');
  walkButton.type = 'button';
  walkButton.id = 'house-walk-mode';
  walkButton.textContent = 'Enter walk mode';
  resetButton?.after(walkButton);

  const style = document.createElement('style');
  style.textContent = `
    .house-stage #house-explorer-canvas { display:block; width:100%; height:100%; min-height:420px; background:#050807; touch-action:none; cursor:grab; }
    .house-stage #house-explorer-canvas:active { cursor:grabbing; }
    .house-glb-location { display:grid; gap:.35rem; padding:.75rem; border:1px solid rgba(156,255,0,.25); border-radius:.75rem; background:rgba(0,0,0,.28); }
    .house-glb-location strong { color:#9cff00; }
    .house-glb-location code { display:block; overflow-wrap:anywhere; color:#fff; font-size:.78rem; }
    .house-glb-location small { color:rgba(255,255,255,.7); }
    .house-stage .house-vr-button { position:absolute !important; right:14px !important; bottom:14px !important; left:auto !important; z-index:8 !important; }
    .house-loading-meter { position:absolute; left:12px; right:12px; bottom:12px; height:5px; z-index:7; overflow:hidden; border-radius:999px; background:rgba(255,255,255,.15); }
    .house-loading-meter > span { display:block; width:0; height:100%; background:#9cff00; transition:width .18s ease; }
  `;
  document.head.append(style);

  const loadingMeter = document.createElement('div');
  loadingMeter.className = 'house-loading-meter';
  loadingMeter.hidden = true;
  const loadingFill = document.createElement('span');
  loadingMeter.append(loadingFill);
  stage.append(loadingMeter);

  const setStatus = (message) => {
    if (status) status.textContent = message;
  };

  const updateFileLabel = (definition) => {
    const path = document.querySelector('#house-glb-file-path');
    const description = document.querySelector('#house-glb-description');
    if (path) path.textContent = definition.files.join(' + ');
    if (description) description.textContent = definition.description;
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050807);
  scene.fog = new THREE.Fog(0x050807, 35, 160);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true;

  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.05, 500);
  const playerRig = new THREE.Group();
  playerRig.name = 'MUZIKAZ_PLAYER_RIG';
  playerRig.add(camera);
  scene.add(playerRig);

  const clock = new THREE.Clock();
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(dracoLoader);

  scene.add(new THREE.HemisphereLight(0xbfe6ff, 0x15170d, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const player = {
    height: 1.65,
    radius: 0.34,
    speed: 3.5,
    yaw: 0,
    pitch: 0,
    eyeHeight: 1.65,
    velocity: new THREE.Vector3(),
    onGround: false,
    spawn: new THREE.Vector3(0, 0, 2)
  };

  let playerCollider = new Capsule(
    new THREE.Vector3(0, player.radius, 2),
    new THREE.Vector3(0, player.height, 2),
    player.radius
  );
  let worldOctree = new Octree();
  let currentWorld = null;
  let currentMixers = [];
  let currentMeshes = [];
  let loadToken = 0;
  let dragPointer = null;
  let turnReady = true;

  const keys = new Set();
  const mobile = new Set();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);

  const disposeMaterial = (material) => {
    if (!material) return;
    for (const value of Object.values(material)) {
      if (value?.isTexture) value.dispose();
    }
    material.dispose?.();
  };

  const disposeWorld = () => {
    currentMixers.forEach((mixer) => mixer.stopAllAction());
    currentMixers = [];
    currentMeshes = [];
    if (!currentWorld) return;
    scene.remove(currentWorld);
    currentWorld.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
      else disposeMaterial(object.material);
    });
    currentWorld = null;
    worldOctree = new Octree();
  };

  const loadGltf = (url, partIndex, partCount) => new Promise((resolve, reject) => {
    loader.load(
      url,
      resolve,
      (event) => {
        const local = event.total ? event.loaded / event.total : 0.35;
        const overall = ((partIndex + local) / partCount) * 100;
        loadingFill.style.width = `${Math.max(4, Math.min(98, overall))}%`;
      },
      reject
    );
  });

  const findSpawnNode = (root) => {
    let match = null;
    root.traverse((object) => {
      const name = String(object.name || '').toUpperCase();
      if (!match && (name === 'SPAWN_PLAYER' || name.startsWith('SPAWN_') || name === 'SPAWN')) match = object;
    });
    return match;
  };

  const resolveFloorHeight = (candidate, box) => {
    if (!currentMeshes.length) return candidate.y;
    const top = Number.isFinite(box.max.y) ? box.max.y + 4 : candidate.y + 10;
    raycaster.set(new THREE.Vector3(candidate.x, top, candidate.z), down);
    const hit = raycaster.intersectObjects(currentMeshes, true).find((item) => item.face?.normal);
    return hit ? hit.point.y : candidate.y;
  };

  const resetPlayer = (spawn = player.spawn) => {
    player.spawn.copy(spawn);
    player.velocity.set(0, 0, 0);
    player.yaw = 0;
    player.pitch = 0;
    player.eyeHeight = player.height;
    playerCollider = new Capsule(
      new THREE.Vector3(spawn.x, spawn.y + player.radius, spawn.z),
      new THREE.Vector3(spawn.x, spawn.y + player.height, spawn.z),
      player.radius
    );
    playerRig.position.copy(spawn);
    playerRig.rotation.set(0, 0, 0);
    camera.position.set(0, player.eyeHeight, 0);
    camera.rotation.set(0, 0, 0);
  };

  const chooseSpawn = (definition, root, box) => {
    const spawnNode = findSpawnNode(root);
    const candidate = spawnNode
      ? spawnNode.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(definition.spawn.x, definition.spawn.y, definition.spawn.z);
    candidate.y = resolveFloorHeight(candidate, box) + 0.04;
    return candidate;
  };

  const loadEnvironment = async (definition) => {
    const token = ++loadToken;
    loadingMeter.hidden = false;
    loadingFill.style.width = '4%';
    setStatus(`Loading ${definition.name} from its committed GLB file…`);
    updateFileLabel(definition);

    const nextWorld = new THREE.Group();
    nextWorld.name = `WORLD_${definition.id}`;
    const nextMixers = [];

    try {
      for (let index = 0; index < definition.files.length; index += 1) {
        const file = definition.files[index];
        const gltf = await loadGltf(file, index, definition.files.length);
        if (token !== loadToken) return;
        gltf.scene.name = `GLB_${definition.id}_${index + 1}`;
        nextWorld.add(gltf.scene);
        if (gltf.animations.length) {
          const mixer = new THREE.AnimationMixer(gltf.scene);
          gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
          nextMixers.push(mixer);
        }
      }

      nextWorld.updateMatrixWorld(true);
      const meshes = [];
      nextWorld.traverse((object) => {
        if (!object.isMesh || !object.geometry) return;
        object.castShadow = !/FLOOR|CEILING/i.test(object.name);
        object.receiveShadow = true;
        meshes.push(object);
      });
      if (!meshes.length) throw new Error('The GLB loaded but did not contain any visible meshes.');

      const nextOctree = new Octree();
      nextOctree.fromGraphNode(nextWorld);
      const box = new THREE.Box3().setFromObject(nextWorld);

      disposeWorld();
      currentWorld = nextWorld;
      currentMixers = nextMixers;
      currentMeshes = meshes;
      worldOctree = nextOctree;
      scene.add(currentWorld);

      currentWorld.traverse((object) => {
        if (/COLLIDER|COLLISION|NAVMESH/i.test(object.name)) object.visible = false;
      });

      const spawn = chooseSpawn(definition, currentWorld, box);
      resetPlayer(spawn);
      loadingFill.style.width = '100%';
      setTimeout(() => { loadingMeter.hidden = true; }, 300);
      setStatus(`Ready: ${definition.name} is loaded as a walkable GLB world. Click the view or use Enter walk mode.`);

      const url = new URL(window.location.href);
      url.searchParams.set('house', definition.id);
      history.replaceState({}, '', url);
    } catch (error) {
      console.error('[MUZIKAZ GLB House Explorer]', error);
      nextMixers.forEach((mixer) => mixer.stopAllAction());
      nextWorld.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
        else disposeMaterial(object.material);
      });
      loadingMeter.hidden = true;
      setStatus(`Unable to load ${definition.name}. Confirm the repository file exists at ${definition.files.join(' and ')}.`);
    }
  };

  if (environmentSelect) {
    environmentSelect.replaceChildren(...HOUSE_ENVIRONMENTS.map((definition) => {
      const option = document.createElement('option');
      option.value = definition.id;
      option.textContent = definition.name;
      return option;
    }));
    environmentSelect.addEventListener('change', () => {
      const selected = HOUSE_ENVIRONMENTS.find((item) => item.id === environmentSelect.value) || HOUSE_ENVIRONMENTS[0];
      loadEnvironment(selected);
    });
  }

  const getInput = () => {
    const input = new THREE.Vector2();
    if (keys.has('w') || keys.has('arrowup') || mobile.has('forward')) input.y += 1;
    if (keys.has('s') || keys.has('arrowdown') || mobile.has('back')) input.y -= 1;
    if (keys.has('a') || keys.has('arrowleft') || mobile.has('left')) input.x -= 1;
    if (keys.has('d') || keys.has('arrowright') || mobile.has('right')) input.x += 1;

    const session = renderer.xr.getSession();
    if (session) {
      for (const source of session.inputSources) {
        const axes = source.gamepad?.axes || [];
        const axisX = Number(axes[2] ?? axes[0] ?? 0);
        const axisY = Number(axes[3] ?? axes[1] ?? 0);
        if (source.handedness === 'left') {
          input.x += Math.abs(axisX) > 0.15 ? axisX : 0;
          input.y += Math.abs(axisY) > 0.15 ? -axisY : 0;
        }
        if (source.handedness === 'right') {
          if (Math.abs(axisX) > 0.72 && turnReady) {
            player.yaw -= Math.sign(axisX) * Math.PI / 6;
            turnReady = false;
          } else if (Math.abs(axisX) < 0.25) {
            turnReady = true;
          }
        }
      }
    }
    return input.lengthSq() > 1 ? input.normalize() : input;
  };

  const updatePlayer = (delta) => {
    const input = getInput();
    forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    move.copy(forward).multiplyScalar(input.y).addScaledVector(right, input.x);
    if (move.lengthSq()) move.normalize().multiplyScalar(player.speed * delta);

    playerCollider.translate(move);
    if (!player.onGround) player.velocity.y -= 18 * delta;
    playerCollider.translate(new THREE.Vector3(0, player.velocity.y * delta, 0));

    const collision = worldOctree.capsuleIntersect(playerCollider);
    player.onGround = false;
    if (collision) {
      player.onGround = collision.normal.y > 0;
      if (player.onGround) player.velocity.y = 0;
      playerCollider.translate(collision.normal.multiplyScalar(collision.depth));
    }

    const base = playerCollider.end.clone();
    base.y -= player.height;
    playerRig.position.copy(base);
    playerRig.rotation.y = player.yaw;

    if (!renderer.xr.isPresenting) {
      camera.position.set(0, player.eyeHeight, 0);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(player.pitch, 0, 0);
    }

    if (playerRig.position.y < -30) resetPlayer();
  };

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    keys.add(key);
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
    if (key === 'q') player.eyeHeight = Math.max(1.1, player.eyeHeight - 0.08);
    if (key === 'e') player.eyeHeight = Math.min(2.25, player.eyeHeight + 0.08);
    if (key === 'r') resetPlayer();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('click', () => {
    if (!renderer.xr.isPresenting && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  });
  document.addEventListener('pointerlockchange', () => {
    walkButton.textContent = document.pointerLockElement === canvas ? 'Exit walk mode' : 'Enter walk mode';
  });
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== canvas) return;
    player.yaw -= event.movementX * 0.0025;
    player.pitch = THREE.MathUtils.clamp(player.pitch - event.movementY * 0.002, -1.25, 1.15);
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (document.pointerLockElement === canvas) return;
    dragPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragPointer || dragPointer.id !== event.pointerId || document.pointerLockElement === canvas) return;
    player.yaw -= (event.clientX - dragPointer.x) * 0.006;
    player.pitch = THREE.MathUtils.clamp(player.pitch - (event.clientY - dragPointer.y) * 0.005, -1.25, 1.15);
    dragPointer.x = event.clientX;
    dragPointer.y = event.clientY;
  });
  const releasePointer = (event) => {
    if (dragPointer?.id === event.pointerId) dragPointer = null;
  };
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    camera.fov = THREE.MathUtils.clamp(camera.fov + Math.sign(event.deltaY) * 2, 42, 86);
    camera.updateProjectionMatrix();
  }, { passive: false });

  walkButton.addEventListener('click', () => {
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    else canvas.requestPointerLock?.();
  });
  resetButton?.addEventListener('click', () => resetPlayer());

  document.querySelectorAll('[data-mobile-move]').forEach((oldButton) => {
    const button = oldButton.cloneNode(true);
    oldButton.replaceWith(button);
    const direction = button.dataset.mobileMove;
    const begin = (event) => { event.preventDefault(); mobile.add(direction); };
    const end = (event) => { event.preventDefault(); mobile.delete(direction); };
    button.addEventListener('pointerdown', begin);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('pointerleave', end);
  });

  const controllerFactory = new XRControllerModelFactory();
  for (let index = 0; index < 2; index += 1) {
    const controller = renderer.xr.getController(index);
    const grip = renderer.xr.getControllerGrip(index);
    grip.add(controllerFactory.createControllerModel(grip));
    playerRig.add(controller, grip);
  }

  const vrButton = VRButton.createButton(renderer, {
    optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
  });
  vrButton.classList.add('house-vr-button');
  stage.append(vrButton);

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(420, Math.floor(rect.height || width * 0.56));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  renderer.setAnimationLoop(() => {
    const delta = Math.min(0.05, clock.getDelta());
    updatePlayer(delta);
    currentMixers.forEach((mixer) => mixer.update(delta));
    renderer.render(scene, camera);
  });

  const requested = new URLSearchParams(window.location.search).get('house');
  const initial = HOUSE_ENVIRONMENTS.find((item) => item.id === requested) || HOUSE_ENVIRONMENTS[0];
  if (environmentSelect) environmentSelect.value = initial.id;
  loadEnvironment(initial);
}
