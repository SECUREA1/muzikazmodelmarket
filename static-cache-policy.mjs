// These URLs stay stable between releases, so browsers must check for new code
// and map definitions before reusing a stored response.
export const REVALIDATED_STATIC_EXTENSIONS = Object.freeze(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest']);

export function staticCacheControl(extension, {privateUpload = false} = {}) {
  if (privateUpload) return 'private, no-store';
  const suffix = String(extension).toLowerCase();
  if (REVALIDATED_STATIC_EXTENSIONS.includes(suffix)) return 'no-cache';
  if (suffix === '.glb' || suffix === '.usdz') return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

export function staticRevalidationEdgeHeaders(htmlPaths = []) {
  const paths = new Set(['/', ...REVALIDATED_STATIC_EXTENSIONS.map(extension => '/*' + extension)]);
  for (const path of htmlPaths) paths.add('/' + path.replace(/^\/+/, '').replace(/\.html$/i, ''));
  return [...paths].map(path => path + '\n  Cache-Control: no-cache\n').join('');
}
