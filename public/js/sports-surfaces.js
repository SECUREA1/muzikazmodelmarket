import * as THREE from '../vendor/three/three.module.min.js';

/** Vector masters are resolution independent; raster uploads are bounded per device. */
export const SPORTS_SURFACES = Object.freeze(Object.fromEntries([
  ['ice', .2, .08], ['wood', .48, .01], ['felt', .94, 0],
  ['court', .3, .04], ['metal', .38, .3], ['paving', .88, 0]
].map(([id, roughness, metalness]) => [id, Object.freeze({
  id, url: new URL(`../assets/sports-surfaces/${id}.svg`, import.meta.url).href,
  width: 2048, height: 2048, roughness, metalness
})])));

const sources = new Map(), textures = new Map();
export function sportsSurfaceResolution(maxResolution = 2048, {mobile = false, maxTextureSize = 4096} = {}) {
  const limit = Math.min(Number(maxResolution) || 2048, Number(maxTextureSize) || 4096, mobile ? 1024 : 2048);
  return limit >= 2048 ? 2048 : limit >= 1024 ? 1024 : limit >= 512 ? 512 : 256;
}

async function sourceTexture(id, size) {
  const key = `${id}:${size}`;
  if (!sources.has(key)) sources.set(key, new Promise((resolve, reject) => {
    const image = new Image(); let timer;
    image.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) throw Error('Canvas textures are unavailable');
        context.drawImage(image, 0, 0, size, size);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.userData.sportsSurfaceShared = true;
        texture.userData.sportsSurface = id;
        resolve(texture);
      } catch (error) { reject(error); }
    };
    image.onerror = () => { clearTimeout(timer); reject(Error(`Unable to load ${id} surface`)); };
    timer = setTimeout(() => reject(Error(`${id} surface timed out`)), 6000);
    image.src = SPORTS_SURFACES[id].url;
  }).catch(error => { sources.delete(key); throw error; }));
  return sources.get(key);
}

function repeatFor(node) {
  const value = node.userData.sportsSurfaceRepeat;
  return [0, 1].map(axis => Number.isFinite(Number(value?.[axis])) ? Math.max(.01, Math.min(32, Number(value[axis]))) : 1);
}

export async function applySportsSurfaces(root, {renderer, maxResolution = 2048} = {}) {
  const result = {applied: 0, failed: []};
  if (!root || typeof document === 'undefined' || typeof Image === 'undefined') return result;
  const size = sportsSurfaceResolution(maxResolution, {
    mobile: typeof matchMedia === 'function' && matchMedia('(max-width: 720px)').matches,
    maxTextureSize: renderer?.capabilities?.maxTextureSize
  });
  const anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 4);
  const nodes = [];
  root.traverse(node => { if (node.isMesh && SPORTS_SURFACES[node.userData.sportsSurface]) nodes.push(node); });
  await Promise.all(nodes.map(async node => {
    const id = node.userData.sportsSurface, repeat = repeatFor(node), key = `${id}:${size}:${repeat.join(',')}`;
    try {
      if (!textures.has(key)) textures.set(key, sourceTexture(id, size).then(source => {
        const texture = source.clone(); texture.repeat.set(...repeat);
        texture.userData = {...source.userData, sportsSurfaceShared: true};
        texture.anisotropy = anisotropy; texture.needsUpdate = true;
        return texture;
      }).catch(error => { textures.delete(key); throw error; }));
      const texture = await textures.get(key);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!material || material.wireframe || material.transparent) continue;
        material.map = texture;
        if ('roughness' in material) material.roughness = SPORTS_SURFACES[id].roughness;
        if ('metalness' in material) material.metalness = SPORTS_SURFACES[id].metalness;
        material.needsUpdate = true;
      }
      result.applied++;
    } catch (error) {
      if (!result.failed.some(value => value.surface === id)) result.failed.push({surface: id, message: error.message});
    }
  }));
  root.userData.sportsSurfaceStatus = {resolution: size, applied: result.applied, failed: result.failed.length};
  return result;
}
