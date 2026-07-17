import { stat } from 'node:fs/promises';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: npm run optimize:environment -- input.glb output.glb');
  process.exit(1);
}

async function size(path) { return (await stat(path)).size; }
try {
  const [{ NodeIO }, functions, extensions, meshoptimizer] = await Promise.all([
    import('@gltf-transform/core'),
    import('@gltf-transform/functions'),
    import('@gltf-transform/extensions'),
    import('meshoptimizer')
  ]);
  const { dedup, prune, weld, reorder, textureResize, inspect } = functions;
  const { MeshoptEncoder } = meshoptimizer;
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions([extensions.KHRMeshQuantization, extensions.EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const document = await io.read(input);
  const before = await size(input);
  const reportBefore = inspect(document);
  await document.transform(dedup(), prune(), weld(), reorder({ encoder: MeshoptEncoder }), textureResize({ size: [Number(process.env.MUZIKAZ_ENVIRONMENT_TEXTURE_MAX || 2048), Number(process.env.MUZIKAZ_ENVIRONMENT_TEXTURE_MAX || 2048)] }));
  await io.write(output, document);
  const after = await size(output);
  const reportAfter = inspect(document);
  console.log(JSON.stringify({ input, output, beforeBytes: before, afterBytes: after, savedBytes: before - after, before: reportBefore, after: reportAfter }, null, 2));
} catch (error) {
  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('Install optional optimizer dependencies first: npm install --save-dev @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer');
  } else {
    console.error(error.message || error);
  }
  process.exit(1);
}
