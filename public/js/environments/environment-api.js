const PREFIX = '[MUZIKAZ Environment]';
export const REPOSITORY_ENVIRONMENT_MANIFEST_URL = '/public/models/environments/environments.json';
const MANIFEST_TIMEOUT_MS = 4_000;
const API_TIMEOUT_MS = 3_000;

function recordsFrom(payload) {
  return Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
}

function mergeEnvironments(...lists) {
  const byId = new Map();
  lists.flat().forEach((environment) => {
    if (environment?.id) byId.set(environment.id, environment);
  });
  return [...byId.values()];
}

// A missing API route or a stalled deployment must not leave the explorer at
// "Loading environment files…" forever.  The bundled manifest is sufficient
// to start the explorer, and the API is only needed to add uploaded worlds.
async function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Request timed out after ${Math.ceil(timeoutMs / 1000)} seconds`);
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function fetchEnvironmentList() {
  // The bundled manifest is the startup source of truth.  Loading it before
  // contacting an optional API lets the house populate even when no backend is
  // running (for example in the static build) and avoids an API timeout
  // delaying the first rendered map.
  // Start the optional request in parallel. It gets a short opportunity to
  // contribute uploaded worlds, but it must never block the bundled startup.
  const apiRequest = fetchWithTimeout('/api/environments', { headers: { Accept: 'application/json' }, cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Environment registry unavailable (${response.status})`);
      return recordsFrom(await response.json());
    })
    .catch((error) => ({ error }));
  let bundled = [];
  try {
    const response = await fetchWithTimeout(REPOSITORY_ENVIRONMENT_MANIFEST_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' }, MANIFEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(`Repository environment manifest unavailable (${response.status})`);
    bundled = recordsFrom(await response.json());
  } catch (error) {
    logEnvironment('Repository environment manifest unavailable; continuing with the environment API.', error.message);
  }

  try {
    // Give a healthy local API a brief chance to respond, while allowing the
    // known-good repository worlds to render immediately when it is stalled.
    const apiRecords = await Promise.race([
      apiRequest,
      new Promise((resolve) => window.setTimeout(() => resolve(null), 500))
    ]);
    if (!apiRecords) {
      if (bundled.length) return bundled;
      const delayedRecords = await apiRequest;
      if (delayedRecords.error) throw delayedRecords.error;
      return delayedRecords;
    }
    if (apiRecords.error) throw apiRecords.error;
    const records = mergeEnvironments(bundled, apiRecords);
    if (records.length) return records;
  } catch (error) {
    if (bundled.length) {
      logEnvironment('Environment API unavailable; using bundled maps.', error.message);
      return bundled;
    }
    throw error;
  }

  throw new Error('No environment maps are available.');
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
