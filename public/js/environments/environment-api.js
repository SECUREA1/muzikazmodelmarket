import { fetchGitHubGlbFiles, mergeGitHubEnvironmentFiles } from '../github-glb-discovery.js';

const PREFIX = '[MUZIKAZ Environment]';

export async function fetchEnvironmentList() {
  let records = [];
  try {
    const response = await fetch('/api/environments', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Environment registry unavailable (${response.status})`);
    const payload = await response.json();
    records = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  } catch (error) {
    logEnvironment('API registry unavailable; loading repository environment manifest.', error.message);
  }

  if (!records.length) {
    const fallback = await fetch('/public/models/environments/environments.json', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!fallback.ok) throw new Error(`Repository environment manifest unavailable (${fallback.status})`);
    const payload = await fallback.json();
    records = Array.isArray(payload) ? payload : [];
  }

  try {
    return mergeGitHubEnvironmentFiles(records, await fetchGitHubGlbFiles());
  } catch (error) {
    logEnvironment('GitHub GLB discovery unavailable; using the current environment list.', error.message);
    return records;
  }
}

export async function uploadEnvironment(formData, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/environments/upload');
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
  const response = await fetch(`/api/environments/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || 'Unable to delete environment.');
  return payload.data || payload;
}

export function logEnvironment(message, detail) {
  if (detail) console.info(PREFIX, message, detail);
  else console.info(PREFIX, message);
}
