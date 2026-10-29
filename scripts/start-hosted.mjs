import {fileURLToPath} from 'node:url';
import {verifyBrowserModuleGraph} from './check-browser-modules.mjs';

// Older manually configured Render services compile only the Rust launcher.
// Validate the checked-out graphics and serve that same release rather than
// mixing its server with a dist directory retained from a previous build.
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const graph=await verifyBrowserModuleGraph({root});
console.log('[Hosted startup] Verified '+graph.files.length+' repository browser modules.');
process.env.MUZIKAZ_STATIC_SOURCE='repository';
await import('../server.mjs');
