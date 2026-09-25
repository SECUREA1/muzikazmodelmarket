const PREFIX = '[MUZIKAZ Environment]';
const apiFetch = (path, options = {}) => window.MUZIKAZ_API?.fetch ? window.MUZIKAZ_API.fetch(path, options) : fetch(path, options);

export async function fetchEnvironmentList() {
  const options = { headers: { Accept: 'application/json' }, cache: 'no-store' };
  const [repositoryResult, gamesResult] = await Promise.allSettled([
    fetch('/public/models/environments/environments.json', options).then(async (response) => {
      if (!response.ok) throw new Error(`Repository environment manifest unavailable (${response.status})`);
      const payload = await response.json();
      return Array.isArray(payload) ? payload : [];
    }),
    apiFetch('/api/custom-maps', { ...options, retries: 0 }).then(async (response) => {
      if (!response.ok) throw new Error(`Published game list unavailable (${response.status})`);
      const payload = await response.json();
      const records = payload.data || payload;
      return Array.isArray(records) ? records : [];
    })
  ]);
  if (repositoryResult.status === 'rejected' && gamesResult.status === 'rejected') throw repositoryResult.reason;
  if (repositoryResult.status === 'rejected') console.warn(PREFIX, repositoryResult.reason);
  if (gamesResult.status === 'rejected') console.warn(PREFIX, gamesResult.reason);
  const combined = [
    ...(gamesResult.status === 'fulfilled' ? gamesResult.value : []),
    ...(repositoryResult.status === 'fulfilled' ? repositoryResult.value : [])
  ];
  // A newly published game takes precedence over an older committed record.
  const unique = new Map();
  combined.forEach((record) => { if (record?.id && !unique.has(record.id)) unique.set(record.id, record); });
  return [...unique.values()];
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
