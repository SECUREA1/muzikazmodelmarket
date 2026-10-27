import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from '../vendor/three/addons/loaders/DRACOLoader.js';
import {KTX2Loader} from '../vendor/three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from '../vendor/three/addons/libs/meshopt_decoder.module.js';
import {isApiModelAssetUrl,isModelUploadReference,resolveModelAssetUrl} from './model-asset-url.js';

const browser = () => globalThis.window || globalThis;
const abortError = () => new DOMException('Model loading was cancelled.', 'AbortError');
async function waitForApi(api,signal) {
  let cancel;
  try {
    const ready = Promise.resolve(api.ready).catch(() => {});
    if (!signal) return await ready;
    await Promise.race([ready,new Promise((_,reject) => {
      cancel = () => reject(abortError());
      signal.addEventListener('abort',cancel,{once:true});
    })]);
  } finally { if (cancel) signal.removeEventListener('abort',cancel); }
}
function disposeModel(gltf) {
  const resources = new Set();
  gltf?.scene?.traverse(node => {
    if (node.geometry) resources.add(node.geometry);
    for (const material of [].concat(node.material || [])) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  for (const resource of resources) resource.dispose?.();
}

async function assetResponse(url, signal) {
  const win = browser(), api = win.MUZIKAZ_API;
  const privateService = isApiModelAssetUrl(url);
  const options = {cache:privateService ? 'no-store' : 'default', signal, credentials:privateService ? 'include' : 'same-origin'};
  const response = privateService && api?.fetch
    ? await api.fetch(url, options)
    : await (win.fetch || globalThis.fetch)(url, options);
  if (!response.ok) {
    let message;
    try { const error = await response.json(); message = error.message || error.error; } catch {}
    throw Object.assign(new Error(message || `The 3D model request failed (${response.status}).`), {status:response.status,code:'MODEL_ASSET_REQUEST_FAILED'});
  }
  if (/(?:text\/html|application\/xhtml\+xml)/i.test(response.headers?.get('content-type') || '')) {
    throw Object.assign(new Error('The 3D model service returned a web page instead of a model. Please try again.'), {code:'INVALID_MODEL_RESPONSE'});
  }
  return response;
}

async function modelBytes(response, onProgress) {
  if (!onProgress || !response.body?.getReader) return response.arrayBuffer();
  const reader = response.body.getReader(), chunks = [], total = Number(response.headers.get('content-length')) || 0;
  let loaded = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    chunks.push(value); loaded += value.byteLength;
    onProgress({loaded,total,lengthComputable:total > 0});
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

function modelDocument(bytes) {
  const view = new DataView(bytes);
  if (bytes.byteLength >= 20 && view.getUint32(0,true) === 0x46546c67) {
    if (view.getUint32(4,true) !== 2 || view.getUint32(16,true) !== 0x4e4f534a) return null;
    const end = 20 + view.getUint32(12,true);
    if (end > bytes.byteLength) return null;
    return {json:JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,end-20))),tail:new Uint8Array(bytes,end)};
  }
  return {json:JSON.parse(new TextDecoder().decode(bytes)),tail:null};
}

function repackDocument(document) {
  const encoded = new TextEncoder().encode(JSON.stringify(document.json));
  if (!document.tail) return encoded.buffer;
  const length = Math.ceil(encoded.byteLength / 4) * 4, result = new Uint8Array(20 + length + document.tail.byteLength), header = new DataView(result.buffer);
  header.setUint32(0,0x46546c67,true); header.setUint32(4,2,true); header.setUint32(8,result.byteLength,true);
  header.setUint32(12,length,true); header.setUint32(16,0x4e4f534a,true);
  result.fill(32,20,20+length); result.set(encoded,20); result.set(document.tail,20+length);
  return result.buffer;
}

// Private glTF resources need the account's API transport too. Substitute only
// trusted upload dependencies, so no member bearer is given to third-party URLs.
async function uploadedResources(bytes, base, signal, objectUrls) {
  const document = modelDocument(bytes);
  if (!document) return bytes;
  let changed = false;
  const pending = new Map();
  for (const resource of [...(document.json.buffers || []),...(document.json.images || [])]) {
    if (!resource.uri) continue;
    const url = new URL(resource.uri,base).href;
    if (!isApiModelAssetUrl(url)) continue;
    if (!pending.has(url)) pending.set(url,(async () => {
      const response = await assetResponse(url,signal), blob = await response.blob(), objectUrl = URL.createObjectURL(blob);
      objectUrls.push(objectUrl); return objectUrl;
    })());
    resource.uri = await pending.get(url); changed = true;
  }
  return changed ? repackDocument(document) : bytes;
}

export async function loadGameModel(loader, value, {onProgress,signal} = {}) {
  const win = browser(), api = win.MUZIKAZ_API, objectUrls = [];
  if (!value) throw new Error('This item has no 3D model source.');
  if (signal?.aborted) throw abortError();
  // A branded static frontend may still be discovering the persistent service.
  // Resolve upload URLs only after that discovery has selected the actual host.
  if (isModelUploadReference(value) && api?.ready) await waitForApi(api,signal);
  if (signal?.aborted) throw abortError();
  const url = resolveModelAssetUrl(value);
  const base = /^https?:/.test(url) ? new URL('.',url).href : new URL('.',win.location?.href || 'http://localhost/').href;
  try {
    const response = await assetResponse(url,signal);
    let bytes = await modelBytes(response,onProgress);
    if (isApiModelAssetUrl(url)) bytes = await uploadedResources(bytes,base,signal,objectUrls);
    if (signal?.aborted) throw abortError();
    // GLTFLoader otherwise copies requestHeader onto every external buffer and
    // texture request. Account credentials belong only to the scoped API fetches.
    const headers = loader.requestHeader;
    let parsing;
    try { loader.requestHeader = {}; parsing = loader.parseAsync(bytes,base); }
    finally { loader.requestHeader = headers; }
    const gltf = await parsing;
    if (signal?.aborted) { disposeModel(gltf); throw abortError(); }
    return gltf;
  } finally {
    for (const url of objectUrls) URL.revokeObjectURL(url);
  }
}

export function createGameModelLoader(renderer = null, manager) {
  const loader = new GLTFLoader(manager), draco = new DRACOLoader();
  draco.setDecoderPath(new URL('../vendor/three/addons/libs/draco/gltf/',import.meta.url).href);
  loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
  if (renderer) {
    const ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath(new URL('../vendor/three/addons/libs/basis/',import.meta.url).href);
    ktx2.detectSupport(renderer); loader.setKTX2Loader(ktx2);
  }
  loader.load = (url,onLoad,onProgress,onError) => {
    loadGameModel(loader,url,{onProgress}).then(onLoad).catch(onError || (error => console.error(error)));
  };
  return loader;
}
