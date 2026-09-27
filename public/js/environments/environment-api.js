import { fetchGitHubGlbFiles, mergeGitHubEnvironmentFiles } from '../github-glb-discovery.js';

const PREFIX = '[MUZIKAZ Environment]';
const apiFetch = (path, options = {}) => window.MUZIKAZ_API?.fetch ? window.MUZIKAZ_API.fetch(path, options) : fetch(path, options);
const settleWithin = (promise, milliseconds, label) => Promise.race([
  promise,
  new Promise((_, reject) => window.setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds))
]);

export async function fetchEnvironmentList() {
  let records = [];
  // Start the static manifest alongside the API request. A cold API or GitHub
  // discovery used to leave the registry empty until the launcher's five-second
  // timeout expired. The first Begin then had no world to open, while a second
  // click worked only because those background requests had finally completed.
  const repositoryRecords = fetch('/public/models/environments/environments.json', { headers: { Accept:'application/json' }, cache:'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Repository environment manifest unavailable (${response.status})`);
      const payload = await response.json();
      return Array.isArray(payload) ? payload : [];
    })
    .catch((error) => ({ error }));
  try {
    const response = await settleWithin(apiFetch('/api/environments', { headers: { Accept: 'application/json' }, cache: 'no-store' }), 2000, 'Environment API');
    if (!response.ok) throw new Error(`Environment registry unavailable (${response.status})`);
    const payload = await response.json();
    records = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  } catch (error) {
    logEnvironment('API registry unavailable; loading repository environment manifest.', error.message);
  }

  if (!records.length) {
    const fallback = await repositoryRecords;
    if (fallback?.error) throw fallback.error;
    records = fallback;
  }

  try {
    // Remote discovery enriches the picker, but it is not launch-critical.
    // Bound it so the known repository/API worlds are always ready on the
    // player's first Begin action.
    const githubFiles = await settleWithin(fetchGitHubGlbFiles(), 1500, 'GitHub environment discovery');
    return mergeGitHubEnvironmentFiles(records, githubFiles);
  } catch (error) {
    logEnvironment('GitHub GLB discovery unavailable; using the current environment list.', error.message);
    return records;
  }
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
