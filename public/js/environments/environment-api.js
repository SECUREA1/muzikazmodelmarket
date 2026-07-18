const PREFIX = '[MUZIKAZ Environment]';
const ENVIRONMENT_CACHE_KEY = 'muzikaz:environmentRegistry';

function readEnvironmentCache() {
  try { const cached = JSON.parse(localStorage.getItem(ENVIRONMENT_CACHE_KEY) || 'null'); return Array.isArray(cached?.records) ? cached.records : []; } catch { return []; }
}
function saveEnvironmentCache(records) {
  try { localStorage.setItem(ENVIRONMENT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), records })); } catch {}
}
export function getCachedEnvironmentList() { return readEnvironmentCache(); }

export async function fetchEnvironmentList() {
  try {
    const timeoutSignal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(1200) : undefined;
    const response = await fetch('/api/environments', { headers: { Accept: 'application/json' }, cache: 'no-cache', signal: timeoutSignal });
    if (!response.ok) throw new Error(`Environment registry unavailable (${response.status})`);
    const payload = await response.json();
    const records = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    if (records.length) { saveEnvironmentCache(records); return records; }
  } catch (error) {
    logEnvironment('API registry unavailable; loading repository environment manifest.', error.message);
  }

  const fallback = await fetch('/public/models/environments/environments.json', { headers: { Accept: 'application/json' }, cache: 'force-cache' });
  if (!fallback.ok) throw new Error(`Repository environment manifest unavailable (${fallback.status})`);
  const records = await fallback.json();
  const normalized = Array.isArray(records) ? records : [];
  saveEnvironmentCache(normalized);
  return normalized.length ? normalized : readEnvironmentCache();
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
