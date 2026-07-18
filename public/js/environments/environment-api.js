const PREFIX = '[MUZIKAZ Environment]';
const REPOSITORY_MANIFEST_URL = '/public/models/environments/environments.json';

export async function fetchEnvironmentList() {
  // The bundled manifest is the startup source of truth.  Loading it before
  // contacting an optional API lets the house populate even when no backend is
  // running (for example in the static build) and avoids an API timeout
  // delaying the first rendered map.
  try {
    const response = await fetch(REPOSITORY_MANIFEST_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Repository environment manifest unavailable (${response.status})`);
    const records = await response.json();
    if (records.length) return records;
  } catch (error) {
    logEnvironment('Repository environment manifest unavailable; trying the environment API.', error.message);
  }

  const response = await fetch('/api/environments', { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Environment registry unavailable (${response.status})`);
  const payload = await response.json();
  const records = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  if (!records.length) throw new Error('No environments are available from the environment API.');
  return records;
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
