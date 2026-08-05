const catalogue = document.querySelector('#catalogue');
const status = document.querySelector('#status');
const template = document.querySelector('#model-card');

function absoluteUrl(value) {
  return new URL(value, window.location.origin).href;
}

async function loadCatalogue() {
  const response = await fetch('/models/models.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Manifest request failed (${response.status})`);
  const manifest = await response.json();
  status.textContent = `${manifest.models.length} spatial game assets available · manifest v${manifest.version}`;
  for (const model of manifest.models) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector('.card');
    const viewer = fragment.querySelector('model-viewer');
    viewer.src = absoluteUrl(model.modelUrl);
    viewer.alt = `${model.name} 3D preview`;
    if (model.thumbnailUrl) viewer.poster = absoluteUrl(model.thumbnailUrl);
    fragment.querySelector('.category').textContent = model.category;
    fragment.querySelector('h2').textContent = model.name;
    fragment.querySelector('.description').textContent = model.description || `${model.placementMode} placement · ${model.realWorldHeightMeters} m reference height`;
    fragment.querySelector('.open').href = `xrealmodel://model/${encodeURIComponent(model.id)}`;
    fragment.querySelector('.preview').href = absoluteUrl(model.modelUrl);
    fragment.querySelector('.preview').download = '';
    card.dataset.modelId = model.id;
    catalogue.append(fragment);
  }
}

loadCatalogue().catch((error) => {
  console.error(error);
  status.textContent = 'The model catalogue could not be loaded.';
});
