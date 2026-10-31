import * as THREE from '../vendor/three/three.module.min.js';
import {ARCADE_ATTRACTIONS, ARCADE_PARTS, arcadeSettings} from './arcade-rules.js';
import {createArcadePart, getArcadePartRuntime} from './arcade-park.js';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const bounded = (value, min, max, fallback) => Math.max(min, Math.min(max, finite(value, fallback)));
const validColor = value => /^#[\da-f]{6}$/i.test(String(value || ''));

/** Rebuild saved Builder objects without losing their authored park interactions. */
export async function loadArcadeBuilderObjects(builderScene = {}, config = {}) {
  const root = new THREE.Group();
  root.name = 'ARCADE_SAVED_BUILDER_OBJECTS';
  const clickMeshes = [], rideParts = [], interactions = new Map(), diagnostics = [];
  const definitions = new Map([...(builderScene.catalogModels || []), ...(builderScene.placedModels || [])].map(model => [model.id, model]));
  const drawings = new Map((builderScene.customModels || []).map(model => [model.id, model]));
  const templates = new Map();
  let factories;

  async function ordinaryModel(record, definition) {
    const id = record.asset?.buildAssetId || definition?.buildAssetId || record.modelId;
    const key = definition?.modelUrl || record.modelUrl || record.asset?.modelUrl || id;
    if (!templates.has(key)) templates.set(key, (async () => {
      factories ||= await import('./builder-models-3d.js?v=forge-atelier-20261031');
      let model = drawings.has(record.modelId) ? createDrawing(drawings.get(record.modelId)) : factories.createBuilderModel(id);
      if (!model && definition?.generated && definition.generator) model = factories.createGeneratedAsset(definition);
      const modelUrl = definition?.modelUrl || record.modelUrl || record.asset?.modelUrl;
      if (!model && modelUrl) {
        const url = new URL(modelUrl, location.href);
        if (!['http:', 'https:'].includes(url.protocol)) throw Error('Unsupported model URL');
        const {GLTFLoader} = await import('../vendor/three/addons/loaders/GLTFLoader.js');
        let timer;
        try {
          const gltf = await Promise.race([
            new GLTFLoader().loadAsync(url.href),
            new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Model loading timed out')), 8000); })
          ]);
          model = gltf.scene;
          if (model && definition?.targetHeight) {
            const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
            if (size.y > 0) model.scale.multiplyScalar(bounded(definition.targetHeight, .05, 100, size.y) / size.y);
          }
          if (model) model.position.y -= new THREE.Box3().setFromObject(model).min.y;
        } finally { clearTimeout(timer); }
      }
      model?.traverse(node => { delete node.userData.builderRoot; });
      return model;
    })());
    const template = await templates.get(key);
    if (!template) throw Error('This object has no supported saved model');
    const model = template.clone(true);
    model.traverse(node => {
      if (!node.material) return;
      node.material = Array.isArray(node.material) ? node.material.map(value => value.clone()) : node.material.clone();
    });
    return model;
  }

  await Promise.all((Array.isArray(builderScene.objects) ? builderScene.objects : []).slice(0, 500).map(async (record, index) => {
    try {
      const partId = String(record.modelId || '').replace(/^arcade-part-/, '');
      const isPart = String(record.modelId || '').startsWith('arcade-part-') && ARCADE_PARTS.some(part => part.id === partId);
      const partConfig = arcadeSettings(record.arcadeSettings || config);
      const instance = isPart ? createArcadePart(partId, {arcade: partConfig}) : await ordinaryModel(record, definitions.get(record.modelId));
      if (!instance) throw Error('Unable to create park part');
      const wrapper = new THREE.Group();
      wrapper.name = `Builder_${record.modelId}_${index}`;
      wrapper.userData.builderObjectId = instance.userData.builderObjectId = String(record.id || index);
      instance.userData.arcadeAnimationEnabled = record.animationState?.enabled !== false;
      instance.userData.arcadeAnimationSpeed = bounded(record.animationState?.speed, 0, 3, 1);
      // Builder records store the final root transform, including floor anchoring.
      instance.position.set(0, 0, 0); instance.rotation.set(0, 0, 0); instance.scale.set(1, 1, 1);
      wrapper.position.set(finite(record.position?.x), finite(record.position?.y, finite(record.groundOffset)), finite(record.position?.z));
      wrapper.rotation.set(finite(record.rotation?.x), finite(record.rotation?.y), finite(record.rotation?.z));
      wrapper.scale.set(...['x', 'y', 'z'].map(axis => bounded(record.scale?.[axis], .04, 20, 1)));
      wrapper.add(instance);
      root.add(wrapper);
      wrapper.updateMatrixWorld(true);
      instance.traverse(node => {
        if (!node.isMesh) return;
        node.castShadow = !['train', 'coaster'].includes(partId);
        node.receiveShadow = true;
        if (record.materialSettings?.useAccent && validColor(record.materialSettings.accent)) {
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) material?.color?.lerp(new THREE.Color(record.materialSettings.accent), .38);
        }
      });
      if (isPart) {
        const attractionIndex = ARCADE_ATTRACTIONS.findIndex(attraction => attraction.id === partId);
        const rideRuntime = getArcadePartRuntime(instance);
        if (rideRuntime) {
          rideRuntime.animationEnabled = instance.userData.arcadeAnimationEnabled;
          rideRuntime.animationSpeed = instance.userData.arcadeAnimationSpeed;
        }
        if (['train', 'coaster'].includes(partId)) rideParts.push(instance);
        if (attractionIndex >= 0) {
          const interaction = {index: attractionIndex, instance, rideRuntime, objectId: String(record.id || index), config: partConfig};
          instance.traverse(node => { if (node.isMesh) { clickMeshes.push(node); interactions.set(node, interaction); } });
        }
      }
    } catch (error) { diagnostics.push({objectId: String(record.id || index), modelId: record.modelId, message: error.message}); }
  }));
  root.updateMatrixWorld(true);
  return {root, clickMeshes, rideParts, interactions, diagnostics};
}

function createDrawing(model) {
  const root = new THREE.Group();
  const depth = bounded(model.drawingSettings?.depth, .02, 5, .3);
  const material = new THREE.MeshStandardMaterial({color: validColor(model.color) ? model.color : '#b9ff38', roughness: .55});
  const point = value => new THREE.Vector2((finite(value.x) - 240) / 100, (280 - finite(value.y)) / 100);
  for (const stroke of (model.strokes || []).slice(0, 64)) {
    const points = (stroke.points || []).slice(0, 256);
    if (points.length < 2) continue;
    if (['rectangle', 'circle'].includes(stroke.tool)) {
      const first = point(points[0]), last = point(points.at(-1)), shape = new THREE.Shape();
      if (stroke.tool === 'circle') shape.absellipse(first.x, first.y, Math.max(.04, Math.abs(last.x - first.x)), Math.max(.04, Math.abs(last.y - first.y)), 0, Math.PI * 2);
      else { shape.moveTo(first.x, first.y); shape.lineTo(last.x, first.y); shape.lineTo(last.x, last.y); shape.lineTo(first.x, last.y); shape.closePath(); }
      const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: false}), material);
      mesh.position.z = -depth / 2; root.add(mesh);
    } else {
      const vectors = points.map(value => { const p = point(value); return new THREE.Vector3(p.x, p.y, 0); });
      root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vectors), Math.max(3, vectors.length * 2), bounded(stroke.width, 5, 100, 18) / 200, 8), material));
    }
  }
  root.rotation.x = -Math.PI / 2; root.position.y = depth / 2;
  return root;
}
