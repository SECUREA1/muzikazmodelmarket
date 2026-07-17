import { uploadEnvironment } from './environment-api.js';

export function createEnvironmentUploadPanel({ onUploaded, setStatus }) {
  const panel = document.createElement('details');
  panel.className = 'environment-upload-panel';
  panel.innerHTML = `
    <summary>Upload Environment</summary>
    <form id="environment-upload-form" class="environment-upload-grid">
      <label>Name<input name="name" required maxlength="120" placeholder="My walkable world"></label>
      <label>Description<textarea name="description" maxlength="500" placeholder="What should visitors know?"></textarea></label>
      <label>GLB file<input name="environment" type="file" accept=".glb,model/gltf-binary,application/octet-stream" required></label>
      <label>Thumbnail<input name="thumbnail" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <label>Scale<input name="scale" type="number" min="0.001" max="100" step="0.001" value="1"></label>
      <label>Rotation X<input name="rotationX" type="number" step="0.01" value="0"></label>
      <label>Rotation Y<input name="rotationY" type="number" step="0.01" value="0"></label>
      <label>Rotation Z<input name="rotationZ" type="number" step="0.01" value="0"></label>
      <label>Spawn X<input name="spawnX" type="number" step="0.01" value="0"></label>
      <label>Spawn Y<input name="spawnY" type="number" step="0.01" value="1"></label>
      <label>Spawn Z<input name="spawnZ" type="number" step="0.01" value="2"></label>
      <label>Spawn rot Y<input name="spawnRotationY" type="number" step="0.01" value="0"></label>
      <label>Collision<select name="collisionMode"><option value="auto">Auto</option><option value="mesh">World meshes</option><option value="none">None</option></select></label>
      <label>Visibility<select name="visibility"><option value="public">Public</option><option value="private">Private</option></select></label>
      <label class="check"><input name="loadAfterUpload" type="checkbox" checked> Load after upload</label>
      <progress value="0" max="100" aria-label="Environment upload progress"></progress>
      <button type="submit">Upload GLB World</button>
      <p class="environment-upload-status">Ready to validate a .glb environment.</p>
    </form>`;
  const form = panel.querySelector('form'); const progress = panel.querySelector('progress'); const status = panel.querySelector('.environment-upload-status');
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); status.textContent = 'Validating and uploading GLB…'; progress.value = 2;
    try {
      const record = await uploadEnvironment(new FormData(form), (value) => { progress.value = value; });
      status.textContent = `Uploaded ${record.name}.`; setStatus?.(`Uploaded environment ${record.name}.`);
      await onUploaded?.(record, form.loadAfterUpload.checked); form.reset(); progress.value = 0;
    } catch (error) { status.textContent = error.message; setStatus?.(error.message); progress.value = 0; }
  });
  return panel;
}
