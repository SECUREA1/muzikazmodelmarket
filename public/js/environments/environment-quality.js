import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';

export const QUALITY_PRESETS = {
  performance: { pixelRatio: 1, shadows: false, exposure: 0.95, shadowSize: 512 },
  balanced: { pixelRatio: 1.5, shadows: true, exposure: 1.05, shadowSize: 1024 },
  high: { pixelRatio: 2, shadows: true, exposure: 1.12, shadowSize: 2048 }
};

export function chooseQualityPreset(name = 'auto', renderer = null) {
  if (name !== 'auto') return QUALITY_PRESETS[name] || QUALITY_PRESETS.balanced;
  const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (renderer?.xr?.isPresenting || mobile || (window.devicePixelRatio || 1) < 1.5) return QUALITY_PRESETS.performance;
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
  root.traverse((object) => {
    if (object.isLight) lights += 1;
    if (!object.isMesh) return;
    object.frustumCulled = true;
    object.castShadow = !/floor|ceiling|sky/i.test(object.name || '');
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material].filter(Boolean);
    materials.forEach((material) => {
      for (const value of Object.values(material)) if (value?.isTexture) value.anisotropy = Math.min(8, maxAnisotropy);
      if (material.transparent) material.depthWrite = false;
    });
  });
  return { embeddedLights: lights };
}
