import { spawn } from 'node:child_process';

const port = 4191;
const server = spawn('cargo', ['run', '--quiet'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const stop = () => server.kill('SIGTERM');
try {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { const response = await fetch(`http://127.0.0.1:${port}/api/health`); if (response.ok) break; } catch {};
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const missing = await fetch(`http://127.0.0.1:${port}/public/models/environments/not-found.glb`);
  const body = await missing.text();
  if (missing.status !== 404 || /<html/i.test(body) || /text\/html/i.test(missing.headers.get('content-type') || '')) throw new Error('A missing GLB must return a non-HTML 404.');
  const glb = await fetch(`http://127.0.0.1:${port}/public/models/environments/muzikazmain.glb`, { method: 'HEAD' });
  if (!glb.ok || glb.headers.get('content-type') !== 'model/gltf-binary') throw new Error('Bundled main GLB does not have the required MIME type.');
  console.log('Server returns a real non-HTML 404 for missing GLBs and the correct GLB MIME type.');
} finally { stop(); }
