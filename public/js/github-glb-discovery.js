const GITHUB_API = 'https://api.github.com';
const DEFAULT_MODEL_DIRECTORY = 'public/models/';
const DEFAULT_ENVIRONMENT_DIRECTORY = 'public/models/environments/';

function configuredRepository() {
  const meta = typeof document !== 'undefined' ? document.querySelector('meta[name="muzikaz-github-repository"]')?.content : '';
  const configured = globalThis.MUZIKAZ_GITHUB_REPOSITORY || (typeof document !== 'undefined' ? document.documentElement.dataset.githubRepository : '') || meta || '';
  if (/^[\w.-]+\/[\w.-]+$/.test(configured.trim())) return configured.trim();

  // GitHub Pages exposes enough information to discover project repositories
  // without any deployment-specific configuration.
  if (typeof location !== 'undefined' && /^[\w-]+\.github\.io$/i.test(location.hostname)) {
    const owner = location.hostname.split('.')[0];
    const repository = location.pathname.split('/').filter(Boolean)[0];
    return repository ? `${owner}/${repository}` : `${owner}/${owner}.github.io`;
  }
  return '';
}

function configuredBranch() {
  const meta = typeof document !== 'undefined' ? document.querySelector('meta[name="muzikaz-github-branch"]')?.content : '';
  return globalThis.MUZIKAZ_GITHUB_BRANCH || (typeof document !== 'undefined' ? document.documentElement.dataset.githubBranch : '') || meta || 'HEAD';
}

function slug(value) {
  return String(value).replace(/\.[^.]+$/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'glb-model';
}

function displayName(path) {
  return path.split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function githubRepositoryConfig() {
  const repository = configuredRepository();
  return repository ? { repository, branch: configuredBranch() } : null;
}

export async function fetchGitHubGlbFiles({ fetchImpl = fetch } = {}) {
  const config = githubRepositoryConfig();
  if (!config) return [];
  const branch = encodeURIComponent(config.branch);
  const response = await fetchImpl(`${GITHUB_API}/repos/${config.repository}/git/trees/${branch}?recursive=1`, {
    headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store'
  });
  if (!response.ok) throw new Error(`GitHub GLB discovery failed (${response.status})`);
  const tree = await response.json();
  if (tree.truncated) console.warn('[MUZIKAZ GitHub GLB] Repository tree was truncated; keep GLB assets under the configured model directories.');
  return (tree.tree || []).filter((entry) => entry.type === 'blob' && /\.(glb|gltf)$/i.test(entry.path || '') && entry.path.startsWith(DEFAULT_MODEL_DIRECTORY)).map((entry) => ({
    path: entry.path,
    format: entry.path.split('.').pop().toLowerCase(),
    size: entry.size || 0,
    url: `https://raw.githubusercontent.com/${config.repository}/${config.branch}/${entry.path.split('/').map(encodeURIComponent).join('/')}`
  }));
}

function urlPath(value = '') {
  try {
    const path = new URL(value, typeof location !== 'undefined' ? location.origin : 'https://muzikaz.invalid').pathname.replace(/^\//, '');
    const modelPathIndex = path.indexOf(DEFAULT_MODEL_DIRECTORY);
    return modelPathIndex >= 0 ? path.slice(modelPathIndex) : path;
  } catch { return String(value).replace(/^\//, ''); }
}

export function mergeGitHubAvatarFiles(records, files) {
  const known = new Set(records.map((record) => urlPath(record.modelUrl || record.model_url)));
  const additions = files.filter((file) => !file.path.startsWith(DEFAULT_ENVIRONMENT_DIRECTORY) && !known.has(file.path)).map((file) => ({
    id: `github-${slug(file.path)}`,
    name: displayName(file.path),
    owner: 'MUZIKAZ GitHub',
    modelUrl: file.url,
    format: file.format,
    visibility: 'public',
    status: 'active',
    source: 'github-repository',
    fileSize: file.size
  }));
  return [...records, ...additions];
}

export function mergeGitHubEnvironmentFiles(records, files) {
  const known = new Set(records.flatMap((record) => [record.modelUrl, ...(record.modelUrls || [])]).map(urlPath));
  const additions = files.filter((file) => file.path.startsWith(DEFAULT_ENVIRONMENT_DIRECTORY) && !known.has(file.path)).map((file) => ({
    id: `github-${slug(file.path)}`,
    name: displayName(file.path),
    description: 'Environment discovered from the configured GitHub repository.',
    modelUrl: file.url,
    format: file.format,
    fileSize: file.size,
    visibility: 'public',
    source: 'github-repository'
  }));
  return [...records, ...additions];
}
