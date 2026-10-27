
import {readJsonResponse} from '../json-response.js';
const PREFIX = '[MUZIKAZ Environment]';
const apiFetch = (path, options = {}) => window.MUZIKAZ_API?.fetch ? window.MUZIKAZ_API.fetch(path, options) : fetch(path, options);

export async function fetchEnvironment(id) {
  const response=await apiFetch('/api/environments/'+encodeURIComponent(id),{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000)});
  const payload=await readJsonResponse(response,{label:'The map server'});
  if(!response.ok)throw new Error(payload.message||`Map lookup failed (${response.status})`);
  const record=payload.data||payload;
  if(!record?.id)throw new Error('The map server returned an invalid map.');
  return record;
}

export async function fetchEnvironmentList() {
  let records = [];
  try {
    const response = await apiFetch('/api/environments', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Environment registry unavailable (${response.status})`);
    const payload = await readJsonResponse(response,{label:'The map server'});
    records = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  } catch (error) {
    logEnvironment('API registry unavailable; loading repository environment manifest.', error.message);
  }

  if (!records.length) {
    const fallback = await fetch('/public/models/environments/environments.json', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!fallback.ok) throw new Error(`Repository environment manifest unavailable (${fallback.status})`);
    const payload = await readJsonResponse(fallback,{label:'The saved map directory'});
    records = Array.isArray(payload) ? payload : [];
  }

  // Only advertise worlds the persistent server knows about. Remote GLB
  // discovery is not a hosted multiplayer destination and must not block travel.
  return records;
}

export async function uploadEnvironment(formData, onProgress = () => {}) {
  const landHeaders = window.MUZIKAZLandAccess?.uploadHeaders();
  if (!landHeaders) throw new Error('Backpack access is still loading. Wait a moment and try again.');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl('/api/environments/upload'));
    xhr.withCredentials = true;
    const sessionToken = window.MUZIKAZ_API?.getSessionToken?.();
    if (sessionToken) xhr.setRequestHeader('Authorization', `Bearer ${sessionToken}`);
    Object.entries(landHeaders).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const payload = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload.data || payload);
      else reject(new Error(payload.message || payload.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network interruption while uploading the environment.'));
    xhr.send(formData);
  });
}

export async function deleteEnvironment(id) {
  const response = await apiFetch(`/api/environments/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Accept:'application/json' }, retries:0 });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to delete environment.');
  return payload.data || payload;
}

export function logEnvironment(message, detail) {
  if (detail) console.info(PREFIX, message, detail);
  else console.info(PREFIX, message);
}
