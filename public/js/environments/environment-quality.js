import * as THREE from '../../vendor/three/three.module.min.js';

export const QUALITY_PRESETS = {
  performance: { pixelRatio: 1, shadows: false, exposure: 0.95, shadowSize: 512 },
  balanced: { pixelRatio: 1.5, shadows: true, exposure: 1.05, shadowSize: 1024 },
  high: { pixelRatio: 2, shadows: true, exposure: 1.12, shadowSize: 2048 }
};

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|swrast|software rasterizer|microsoft basic render driver|\bwarp\b/i;
// A low-power map context can select a different adapter from the main view.
const softwarePreflight = new Map();

function softwareContext(context) {
  if (!context?.getParameter) return false;
  try {
    let debug = null;
    try { debug = context.getExtension('WEBGL_debug_renderer_info'); } catch { /* Privacy settings may mask this extension. */ }
    const name = context.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER);
    return SOFTWARE_RENDERER.test(String(name || ''));
  } catch { return false; }
}

// Antialiasing is chosen when the renderer's context is created. Discover a
// software adapter first so automatic desktop mode uses the complete existing
// performance path, rather than only disabling shadows after creation.
export function softwareRendererRequiresPerformance({powerPreference = 'high-performance'} = {}) {
  if (softwarePreflight.has(powerPreference)) return softwarePreflight.get(powerPreference);
  if (typeof document === 'undefined' || !document.createElement) return false;
  let context = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const options = {alpha: false, antialias: false, powerPreference};
    context = canvas.getContext('webgl2', options) || canvas.getContext('webgl', options);
    softwarePreflight.set(powerPreference, softwareContext(context));
  } catch { softwarePreflight.set(powerPreference, false); }
  finally {
    try { context?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* The temporary context may already be lost. */ }
  }
  return softwarePreflight.get(powerPreference);
}

function softwareRenderer(renderer) {
  try { return softwareContext(renderer?.getContext?.()); } catch { return false; }
}

export function chooseQualityPreset(name = 'auto', renderer = null) {
  if (name !== 'auto') return QUALITY_PRESETS[name] || QUALITY_PRESETS.balanced;
  const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const limitedCpu = Number(navigator.hardwareConcurrency || 8) <= 4;
  const limitedGpu = Number(renderer?.capabilities?.maxTextureSize || 8192) < 4096;
  if (renderer?.xr?.isPresenting || mobile || limitedCpu || limitedGpu || softwareRenderer(renderer)) return QUALITY_PRESETS.performance;
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
  let lights = 0,meshCount=0,triangleCount=0;
  const materialsSeen = new Set(), texturesSeen = new Set();
  root.traverse((object) => {
    if (object.isLight) lights += 1;
    if (!object.isMesh) return;
    meshCount++;triangleCount+=Math.floor((object.geometry?.index?.count||object.geometry?.attributes?.position?.count||0)/3)*(object.isInstancedMesh?object.count:1);
    // Skinning moves vertices outside the pose used for the cached bounds.
    // Keep animated characters visible and retain explicit no-cull flags on
    // dynamic instance batches; ordinary static meshes retain their culling.
    if (object.isSkinnedMesh) object.frustumCulled = false;
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
  return { embeddedLights: lights, meshCount, triangleCount, materialCount:materialsSeen.size };
}
