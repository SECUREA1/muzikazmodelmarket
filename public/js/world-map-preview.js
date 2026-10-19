// Keep the map selector lightweight until a destination preview is requested.
let modules;
function previewModules() {
  modules ||= Promise.all([
    import('../vendor/three/three.module.min.js'),
    import('../vendor/three/addons/loaders/GLTFLoader.js'),
    import('../vendor/three/addons/controls/OrbitControls.js'),
    import('./environments/builder-land.js'),
    import('./builder-models-3d.js')
  ]).catch(error => { modules = null; throw error; });
  return modules;
}
const decoderModules = new Map();
function previewDecoder(name) {
  if (!decoderModules.has(name)) {
    const paths = {draco:'loaders/DRACOLoader.js',ktx2:'loaders/KTX2Loader.js',meshopt:'libs/meshopt_decoder.module.js'};
    decoderModules.set(name,import(`https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/${paths[name]}/+esm`).catch(error => { decoderModules.delete(name); throw error; }));
  }
  return decoderModules.get(name);
}
export function previewModelExtensions(data) {
  try {
    const bytes = new Uint8Array(data), view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const glb = bytes.byteLength >= 20 && view.getUint32(0,true) === 0x46546c67;
    const json = JSON.parse(new TextDecoder().decode(glb ? bytes.subarray(20,20+view.getUint32(12,true)) : bytes));
    return [...new Set([...(json.extensionsUsed || []),...(json.extensionsRequired || [])])];
  } catch { return []; }
}

export function worldPreviewSource(environment = {}) {
  const fallbackLayouts = {'basketball-arena':'basketball-stadium',basketball:'basketball-stadium','hockey-arena':'hockey-arena','neon-junction':'arcade-park','firing-range':'firing-range'};
  const layout = environment.builderScene?.layout || environment.layout || fallbackLayouts[environment.id] || (environment.basketball ? 'basketball-stadium' : {hockey:'hockey-arena',arcade:'arcade-park','firing-range':'firing-range'}[environment.game]);
  const urls = environment.modelUrls?.length ? environment.modelUrls.filter(Boolean) : [environment.modelUrl].filter(Boolean);
  const procedural = Boolean(environment.builderScene || environment.proceduralLand || (!urls.length && layout));
  return {
    environment: {...environment, rotation: {x:0,y:0,z:0,...environment.rotation}, ...(procedural ? {builderScene:{...environment.builderScene,layout}} : {})},
    procedural,
    urls: procedural ? [] : urls
  };
}

export function disposePreviewWorld(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root?.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of [].concat(node.material || [])) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture && !value.userData?.sportsSurfaceShared) textures.add(value);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

export function frameWorldPreview(THREE, root, camera, controls, aspect = 1.5) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) throw Error('This destination has no visible 3D geometry.');
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, .1);
  const halfFov = Math.atan(Math.tan(camera.fov * Math.PI / 360) * Math.min(1, aspect));
  const distance = radius / Math.sin(halfFov) * 1.08;
  camera.near = Math.max(.001, radius / 1000); camera.far = distance + radius * 12;
  camera.position.copy(center).add(new THREE.Vector3(.9,1.1,1.2).normalize().multiplyScalar(distance));
  camera.updateProjectionMatrix();
  controls.target.copy(center); controls.minDistance = radius * .15; controls.maxDistance = distance * 3;
  controls.update(); controls.saveState();
}

// Match the saved drawing geometry in the playable Builder scene.
export function createDrawnPreviewModel(THREE,model) {
  if (!model?.strokes?.length) return null;
  const root = new THREE.Group(), settings = model.drawingSettings || {};
  const preset = {solid:[1,1],sculpted:[1.65,1.8],lightweight:[.55,.35]}[model.form] || [1,1];
  const depth = (Number(settings.depth) || .3) * preset[0], bevel = Math.min((Number(settings.bevel) || 0) * preset[1],depth * .45);
  const color = new THREE.Color(model.color || '#b9ff38');
  const material = new THREE.MeshStandardMaterial({color,roughness:model.form === 'sculpted' ? .2 : .55,metalness:model.form === 'sculpted' ? .82 : .05,emissive:model.form === 'lightweight' ? color : 0x000000,emissiveIntensity:model.form === 'lightweight' ? .8 : 0});
  const point = p => new THREE.Vector2((p.x - 240) / 100,(280 - p.y) / 100);
  const addShape = shape => {
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel > 0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2}),material);
    mesh.position.z = -depth / 2; root.add(mesh);
  };
  for (const stroke of model.strokes) {
    const points = stroke.points || []; if (points.length < 2) continue;
    if (stroke.tool === 'rectangle') {
      const a = point(points[0]), b = point(points.at(-1)), shape = new THREE.Shape();
      shape.moveTo(a.x,a.y); shape.lineTo(b.x,a.y); shape.lineTo(b.x,b.y); shape.lineTo(a.x,b.y); shape.closePath(); addShape(shape);
    } else if (stroke.tool === 'circle') {
      const a = point(points[0]), b = point(points.at(-1)), shape = new THREE.Shape();
      shape.absellipse(a.x,a.y,Math.max(Math.abs(b.x-a.x),.04),Math.max(Math.abs(b.y-a.y),.04),0,Math.PI*2); addShape(shape);
    } else {
      const vectors = points.map(p => new THREE.Vector3((p.x-240)/100,(280-p.y)/100,0));
      if (vectors.length === 2) vectors.splice(1,0,vectors[0].clone().lerp(vectors[1],.5));
      root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vectors),Math.max(3,vectors.length*2),Math.max(.025,(stroke.width || 18)/200),8,false),material));
    }
  }
  root.rotation.x = -Math.PI / 2; root.position.y = depth / 2; return root;
}

/** A static, interactive preview: GPU work runs only on load, resize or orbit. */
export function mountWorldPreview(host, destination, {loadModules = previewModules,loadDecoder = previewDecoder} = {}) {
  if (!document.querySelector('[data-world-preview-style]')) {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('../assets/world-map-preview.css',import.meta.url).href;
    link.dataset.worldPreviewStyle = ''; document.head.append(link);
  }
  host.innerHTML = '<div class="world-map-preview-stage" data-preview-stage><p class="world-map-preview-status" data-preview-status role="status">Loading 3D map…</p></div><div class="world-map-preview-caption"><span data-preview-help>3D destination preview</span><button type="button" data-preview-reset hidden>Reset view</button></div>';
  const stage = host.querySelector('[data-preview-stage]'), status = host.querySelector('[data-preview-status]'), help = host.querySelector('[data-preview-help]'), reset = host.querySelector('[data-preview-reset]');
  const source = worldPreviewSource(destination), abort = new AbortController();
  let disposed = false, renderer, controls, world, scene, camera, fitPreview, resizeObserver, intersectionObserver, draco, ktx2, frame = 0, visible = true;
  function render() {
    frame = 0;
    if (disposed || !renderer || !world || !visible || document.hidden || !host.isConnected || !host.getClientRects().length) return;
    renderer.render(scene,camera);
  }
  function invalidate() { if (!disposed && !frame) frame = requestAnimationFrame(render); }
  function resize() {
    if (!renderer || disposed) return;
    const width = Math.max(1,stage.clientWidth), height = Math.max(1,stage.clientHeight);
    renderer.setSize(width,height,false); camera.aspect = width / height; camera.updateProjectionMatrix(); fitPreview?.(); invalidate();
  }
  const resetView = () => { controls?.reset(); invalidate(); };
  reset.addEventListener('click',resetView);
  document.addEventListener('visibilitychange',invalidate);
  function dispose() {
    if (disposed) return;
    disposed = true; abort.abort(); cancelAnimationFrame(frame);
    resizeObserver?.disconnect(); intersectionObserver?.disconnect();
    document.removeEventListener('visibilitychange',invalidate); window.removeEventListener('resize',resize);
    reset.removeEventListener('click',resetView); controls?.dispose();
    draco?.dispose(); ktx2?.dispose();
    disposePreviewWorld(world); world = null;
    renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
  }
  const ready = (async () => {
    try {
      const [THREE,{GLTFLoader},{OrbitControls},{createBuilderLand},{createBuilderModel,createGeneratedAsset}] = await loadModules();
      if (disposed) return;
      const mobile = typeof matchMedia === 'function' && matchMedia('(max-width: 720px), (pointer: coarse)').matches;
      renderer = new THREE.WebGLRenderer({antialias:!mobile,alpha:false,powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,mobile ? 1.25 : 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.setAttribute('aria-label',`${destination.name || destination.id} interactive 3D map preview`);
      renderer.domElement.setAttribute('role','img'); stage.prepend(renderer.domElement);
      scene = new THREE.Scene(); scene.background = new THREE.Color('#10231c');
      scene.add(new THREE.HemisphereLight(0xf4fff1,0x466154,2.7));
      const sun = new THREE.DirectionalLight(0xfff3dc,3); sun.position.set(35,70,45); scene.add(sun);
      camera = new THREE.PerspectiveCamera(38,1.5,.01,1000);
      controls = new OrbitControls(camera,renderer.domElement); controls.enableDamping = false;
      controls.maxPolarAngle = Math.PI * .49; controls.enablePan = true;
      controls.addEventListener('change',invalidate);
      const loader = new GLTFLoader(), models = new Map();
      const configured = new Set();
      async function configureDecoders(data) {
        for (const extension of previewModelExtensions(data)) {
          if (configured.has(extension)) continue;
          if (extension === 'KHR_draco_mesh_compression') {
            const {DRACOLoader} = await loadDecoder('draco'); if (disposed) return;
            draco = new DRACOLoader(); draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'); loader.setDRACOLoader(draco);
          } else if (extension === 'KHR_texture_basisu') {
            const {KTX2Loader} = await loadDecoder('ktx2'); if (disposed) return;
            ktx2 = new KTX2Loader(); ktx2.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis/'); ktx2.detectSupport(renderer); loader.setKTX2Loader(ktx2);
          } else if (extension === 'EXT_meshopt_compression') {
            const {MeshoptDecoder} = await loadDecoder('meshopt'); if (disposed) return; loader.setMeshoptDecoder(MeshoptDecoder);
          }
          configured.add(extension);
        }
      }
      async function loadModel(url) {
        const timer = setTimeout(() => abort.abort(),20000);
        let data;
        try {
          const response = await fetch(url,{signal:abort.signal});
          if (!response.ok) throw Error(`Map download unavailable (${response.status}).`);
          data = await response.arrayBuffer();
        } finally { clearTimeout(timer); }
        if (disposed) return null;
        await configureDecoders(data); if (disposed) return null;
        const absolute = new URL(url,location.href), base = absolute.href.slice(0,absolute.href.lastIndexOf('/') + 1);
        const gltf = await loader.parseAsync(data,base);
        if (disposed) { disposePreviewWorld(gltf.scene); return null; }
        return gltf.scene;
      }
      world = new THREE.Group();
      world.rotation.set(source.environment.rotation.x,source.environment.rotation.y,source.environment.rotation.z);
      world.scale.setScalar((Number(destination.scale) || 1) * (Number(destination.spaceScale) || 1));
      if (source.procedural) {
        const land = createBuilderLand(source.environment);
        // Open the stadium roof only in this isolated overview so the court
        // and hoops remain visible from the map selector's elevated camera.
        land.traverse(node => { if (/^ARENA_ROOF_(?:CEILING|TRUSS)$/.test(node.name)) node.visible = false; });
        world.add(land);
        // Authored builder objects sit on top of the same template used in play.
        const center = new THREE.Box3().setFromObject(land).getCenter(new THREE.Vector3());
        const built = destination.builderScene || {}, customModels = new Map((built.customModels || []).map(model => [model.id,model]));
        const definitions = new Map([...(built.catalogModels || []),...(built.placedModels || [])].map(model => [model.id,model]));
        for (const item of destination.builderScene?.objects || []) {
          const custom = customModels.get(item.modelId), definition = definitions.get(item.modelId);
          const modelId = String(item.asset?.buildAssetId || definition?.buildAssetId || item.modelId || '');
          let object = custom ? createDrawnPreviewModel(THREE,custom) : modelId ? createBuilderModel(modelId,{arcade:item.arcadeSettings || built.gameplay?.arcade}) : null;
          if (!object && definition?.generated && definition.generator) object = createGeneratedAsset?.(definition);
          const modelUrl = definition?.modelUrl || item.asset?.modelUrl || item.modelUrl;
          if (!object && modelUrl) {
            let source = models.get(modelUrl);
            if (!source) { source = await loadModel(modelUrl); if (disposed) return; models.set(modelUrl,source); }
            object = source.clone(true);
            const bounds = new THREE.Box3().setFromObject(object), height = bounds.getSize(new THREE.Vector3()).y;
            if (Number(definition?.targetHeight) > 0 && height > 0) { object.scale.multiplyScalar(Number(definition.targetHeight) / height); bounds.setFromObject(object); }
            object.position.y -= bounds.min.y;
          }
          if (!object) continue;
          const authored = item.position && typeof item.position === 'object';
          const x = authored ? Number(item.position.x) || 0 : ((Number(item.x) || 50) - 50) * .4;
          const z = authored ? Number(item.position.z) || 0 : ((Number(item.y) || 50) - 50) * .4;
          const y = (land.userData.streetHeightAt?.(x,z) || 0) + (Number(item.groundOffset) || 0);
          object.position.set(center.x + x,y,center.z + z);
          object.rotation.set(authored ? Number(item.rotation?.x) || 0 : 0,authored ? Number(item.rotation?.y) || 0 : (Number(item.rotation) || 0) * Math.PI / 180,authored ? Number(item.rotation?.z) || 0 : 0);
          const scale = Number(authored ? item.scale?.x : item.scale) || 1;
          object.scale.multiply(new THREE.Vector3(scale,Number(item.scale?.y) || scale,Number(item.scale?.z) || scale));
          object.updateMatrixWorld(true); const feet = new THREE.Box3().setFromObject(object).min.y;
          if (Number.isFinite(feet)) object.position.y += y - feet;
          if (item.materialSettings?.useAccent) object.traverse(child => { if (child.isMesh && child.material?.color) child.material.color.lerp(new THREE.Color(item.materialSettings.accent),.38); });
          world.add(object);
        }
      } else {
        if (!source.urls.length) throw Error('No 3D map has been published for this destination.');
        for (const url of source.urls) {
          const model = await loadModel(url); if (disposed) return; world.add(model);
        }
      }
      if (disposed) return;
      scene.add(world); resize(); fitPreview = () => frameWorldPreview(THREE,world,camera,controls,camera.aspect); fitPreview();
      status.hidden = true; reset.hidden = false; help.textContent = '3D preview · Drag to rotate · Pinch to zoom';
      if (typeof ResizeObserver !== 'undefined') { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage); }
      else window.addEventListener('resize',resize);
      if (typeof IntersectionObserver !== 'undefined') {
        intersectionObserver = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting !== false; if (visible) invalidate(); });
        intersectionObserver.observe(host);
      }
      invalidate();
    } catch (error) {
      if (disposed) return;
      disposePreviewWorld(world); world = null; controls?.dispose(); draco?.dispose(); ktx2?.dispose(); renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); controls = null; draco = null; ktx2 = null; renderer = null; fitPreview = null;
      status.textContent = '3D preview unavailable. You can still enter this destination.';
      help.textContent = 'Map preview';
      if (destination.thumbnailUrl) {
        const image = document.createElement('img'); image.src = destination.thumbnailUrl; image.alt = `${destination.name || destination.id} map preview`;
        image.addEventListener('error',() => image.remove(),{once:true}); stage.prepend(image);
      }
    }
  })();
  return {ready,dispose};
}
