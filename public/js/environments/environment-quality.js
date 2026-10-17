import * as THREE from '../../vendor/three/three.module.min.js';

export const QUALITY_PRESETS = {
  performance: { pixelRatio: 1, shadows: false, exposure: 0.95, shadowSize: 512 },
  balanced: { pixelRatio: 1.5, shadows: true, exposure: 1.05, shadowSize: 1024 },
  high: { pixelRatio: 2, shadows: true, exposure: 1.12, shadowSize: 2048 }
};

export function chooseQualityPreset(name = 'auto', renderer = null) {
  if (name !== 'auto') return QUALITY_PRESETS[name] || QUALITY_PRESETS.balanced;
  const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const limitedCpu = Number(navigator.hardwareConcurrency || 8) <= 4;
  const limitedGpu = Number(renderer?.capabilities?.maxTextureSize || 8192) < 4096;
  if (renderer?.xr?.isPresenting || mobile || limitedCpu || limitedGpu) return QUALITY_PRESETS.performance;
  return QUALITY_PRESETS.balanced;
}

export function configureRenderer(renderer, presetName = 'auto') {
  const preset = chooseQualityPreset(presetName, renderer);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = preset.exposure;
  renderer.shadowMap.enabled = preset.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
  return preset;
}

export function applyWorldQuality(root, renderer) {
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy?.() || 1;
  let lights = 0;
  const materialsSeen = new Set(), texturesSeen = new Set();
  root.traverse((object) => {
    if (object.isLight) lights += 1;
    if (!object.isMesh) return;
    object.frustumCulled = true;
    object.castShadow = !/floor|ceiling|sky/i.test(object.name || '');
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material].filter(Boolean);
    materials.forEach((material) => {
      if (materialsSeen.has(material)) return;
      materialsSeen.add(material);
      for (const value of Object.values(material)) if (value?.isTexture && !texturesSeen.has(value)) {
        texturesSeen.add(value);
        value.anisotropy = Math.min(8, maxAnisotropy);
        // Upload each shared texture once per world, rather than once per mesh.
        // Explicitly flag texture updates; Firefox otherwise may retain a stale
        // upload after a GLB material is cloned or moved between worlds.
        value.needsUpdate = true;
      }
      if (material.transparent) material.depthWrite = false;
    });
  });
  return { embeddedLights: lights };
}
