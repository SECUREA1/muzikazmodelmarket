const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
const cartCount = document.querySelector('#cart-count');
const modelStatus = document.querySelector('#model-status');
const modelDetail = document.querySelector('#model-detail');
const modelDetailArt = document.querySelector('#model-detail-art');
const modelDetailTitle = document.querySelector('#model-detail-title');
const modelDetailCopy = document.querySelector('#model-detail-copy');
const addModelButton = document.querySelector('[data-add-model]');
let cartItems = 0;
let selectedModel = '';


function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


function closeMenu() {
  nav?.classList.remove('is-open');
  menuButton?.setAttribute('aria-expanded', 'false');
}

function updateCart(button, label = 'Added') {
  cartItems += 1;
  if (cartCount) cartCount.textContent = String(cartItems);
  if (!button) return;
  const originalText = button.textContent;
  button.textContent = label;
  window.setTimeout(() => { button.textContent = originalText; }, 1200);
}

menuButton?.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('is-open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

nav?.addEventListener('click', (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    document.querySelectorAll('.nav a').forEach((link) => link.classList.remove('active'));
    event.target.classList.add('active');
    closeMenu();
  }
});

document.querySelectorAll('[data-model]').forEach((button) => {
  button.addEventListener('click', () => {
    selectedModel = button.dataset.model;
    const model = getModel(selectedModel);
    if (modelStatus) modelStatus.textContent = `${selectedModel} collection selected. 3D page, retail matches, and marketplace listings are connected.`;
    if (modelDetailTitle) modelDetailTitle.textContent = `${selectedModel} · ${model.character}`;
    if (modelDetailCopy) modelDetailCopy.textContent = model.copy;
    if (modelDetailArt) modelDetailArt.className = `model-detail-art ${model.css}`;
    renderLinkedData(model);
    renderMarketplace('All', selectedModel);
    if (modelDetail) modelDetail.hidden = false;
    scrollToSection('model-detail');
  });
});

addModelButton?.addEventListener('click', () => {
  if (!selectedModel) {
    if (modelStatus) modelStatus.textContent = 'Choose a model collection before adding it to cart.';
    scrollToSection('models');
    return;
  }
  updateCart(addModelButton, 'Model added');
  if (modelStatus) modelStatus.textContent = `${selectedModel} model added to your cart.`;
});

document.querySelector('[data-show-all]')?.addEventListener('click', (event) => {
  event.preventDefault();
  if (modelDetail) modelDetail.hidden = true;
  if (modelStatus) modelStatus.textContent = 'All MUZIKAZ model collections are visible.';
  scrollToSection('models');
});

document.querySelectorAll('[data-product]').forEach((button) => {
  button.addEventListener('click', () => updateCart(button));
});

document.querySelector('#model-linked-data')?.addEventListener('click', (event) => {
  if (event.target instanceof HTMLElement && selectedModel) focusMarketplaceForModel(selectedModel);
});

document.querySelector('[data-action="search"]')?.addEventListener('click', () => {
  scrollToSection('models');
  if (modelStatus) modelStatus.textContent = 'Search shortcut opened the model collections.';
});

document.querySelector('[data-action="cart"]')?.addEventListener('click', () => {
  alert(cartItems ? `Cart ready with ${cartItems} item${cartItems === 1 ? '' : 's'}.` : 'Your MUZIKAZ cart is empty. Add merch or models to begin.');
});

document.querySelector('.newsletter form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = event.currentTarget.querySelector('input');
  alert(`Welcome to the crew${input.value ? ', ' + input.value : ''}!`);
  input.value = '';
});


document.querySelectorAll('.choice-btn[data-target]').forEach((button) => {
  button.addEventListener('click', () => {
    scrollToSection(button.dataset.target);
    closeMenu();
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});

const assetCatalog = {
  models: [
    { id: 'originals', name: 'Originals', css: 'monkey', character: 'Ape', type: 'Character Models', file: 'reference.png', price: '$39.00', copy: 'Classic starter poses, mascot turnarounds, and brand-ready preview files.', merch: ['Neon Hoodie', 'Bolt Keychain'] },
    { id: 'legends', name: 'Legends', css: 'robot', character: 'Cyber Wolf', type: '3D Model Packs', file: 'futuristic_armored_wolf_humanoid.png', price: '$64.00', copy: 'Armored future icon with dramatic neon render support and creator-safe styling.', merch: ['Crew Cap', 'Beat Bottle'] },
    { id: 'beasts', name: 'Beasts', css: 'beast', character: 'Red Beast', type: '3D Model Packs', file: 'fierce_demon_hybrid_in_action.png', price: '$58.00', copy: 'Monster-power render pack connected to safe fantasy presentation rules.', merch: ['Wristband', 'Lanyard'] },
    { id: 'crew', name: 'Crew', css: 'penguin', character: 'Crew Penguin', type: 'Character Models', file: 'the_crew_banner_2x_transparent.png', price: '$44.00', copy: 'Street-smart mascot assets for friendly drops, banners, and fan pages.', merch: ['Crew Cap', 'Lanyard'] },
    { id: 'chaos', name: 'Chaos', css: 'chaos', character: 'Chaos Ape', type: '3D Model Packs', file: 'character_traits_overview_panel_2x.png', price: '$69.00', copy: 'High-energy hybrid concepts for the loudest MUZIKAZ creator collection.', merch: ['Neon Hoodie', 'Wristband'] },
  ],
  retail: [
    { id: 'hoodie', name: 'Neon Hoodie', category: 'Hoodies', price: '$64.00', asset: 'classic_favorites_banner_transparent.png', connectsTo: ['Originals', 'Chaos'] },
    { id: 'cap', name: 'Crew Cap', category: 'Headwear', price: '$28.00', asset: 'brand_name_tagline_panel_transparent.png', connectsTo: ['Legends', 'Crew'] },
    { id: 'bottle', name: 'Beat Bottle', category: 'Drinkware', price: '$22.00', asset: 'accessories_banner_transparent.png', connectsTo: ['Legends'] },
    { id: 'keychain', name: 'Bolt Keychain', category: 'Accessories', price: '$12.00', asset: 'cta_shop_collection_transparent.png', connectsTo: ['Originals'] },
    { id: 'wristband', name: 'Wristband', category: 'Accessories', price: '$16.00', asset: 'button_styles_panel_transparent.png', connectsTo: ['Beasts', 'Chaos'] },
    { id: 'lanyard', name: 'Lanyard', category: 'Accessories', price: '$14.00', asset: 'accessories_banner_2x_transparent.png', connectsTo: ['Beasts', 'Crew'] },
  ],
};

const designerCharacters = assetCatalog.models.map((model) => ({ id: model.id, name: model.character, traits: [model.name, model.type] }));
const designerProducts = assetCatalog.retail.map((product) => ({ id: product.id, name: product.name, category: product.category, price: Number(product.price.replace(/[^0-9.]/g, '')) }));
const marketplaceListings = [
  ...assetCatalog.models.map((model) => ({ type: model.type, name: `${model.name} 3D Model Pack`, price: model.price, copy: `${model.copy} Source: ${model.file}`, model: model.name })),
  ...assetCatalog.retail.map((product) => ({ type: 'Retail Pages', name: product.name, price: product.price, copy: `${product.category} connected to ${product.connectsTo.join(' + ')} model data.`, product: product.name })),
  { type: 'Custom Orders', name: 'Team Sleeve Text Run', price: 'Quote request', copy: 'Custom name, number, logo style, sleeve text, product, and character selections flow from the same catalog.' },
  { type: 'Limited Drops', name: 'Friday Connected Drop', price: 'Locks at sellout', copy: 'Bundles one model pack, one retail item, and one custom designer preset.' },
];

const productSelect = document.querySelector('#design-product');
const characterSelect = document.querySelector('#design-character');
const designerControls = document.querySelector('#designer-controls');
const marketTabs = document.querySelector('#market-tabs');
const marketGrid = document.querySelector('#market-grid');
const linkedData = document.querySelector('#model-linked-data');

function getModel(name) {
  return assetCatalog.models.find((model) => model.name === name) || assetCatalog.models[0];
}

function renderLinkedData(model) {
  if (!linkedData) return;
  const relatedMerch = assetCatalog.retail.filter((product) => product.connectsTo.includes(model.name));
  linkedData.innerHTML = `<strong>Connected repo data</strong><ul>${relatedMerch.map((product) => `<li>${product.name} · ${product.category} · ${product.price}</li>`).join('')}</ul>`;
}

function focusMarketplaceForModel(modelName) {
  renderMarketplace('All', modelName);
  scrollToSection('marketplace');
}

function seedDesigner() {
  if (!productSelect || !characterSelect) return;
  productSelect.innerHTML = designerProducts.map((product) => `<option value="${product.id}">${product.name}</option>`).join('');
  characterSelect.innerHTML = designerCharacters.map((character) => `<option value="${character.id}">${character.name}</option>`).join('');
  updatePreview();
}

function updatePreview() {
  if (!designerControls) return;
  const data = new FormData(designerControls);
  const product = designerProducts.find((item) => item.id === data.get('product')) || designerProducts[0];
  const character = designerCharacters.find((item) => item.id === data.get('character')) || designerCharacters[0];
  document.querySelector('#designer-mockup')?.style.setProperty('--design-color', data.get('color'));
  document.querySelector('#preview-character').textContent = character.name;
  document.querySelector('#preview-name').textContent = data.get('name') || 'MUZIKAZ';
  document.querySelector('#preview-number').textContent = data.get('number') || '88';
  document.querySelector('#preview-sleeve').textContent = data.get('sleeve') || 'LIVE THE BEAT';
  document.querySelector('#preview-title').textContent = `${character.name} custom ${product.category.toLowerCase()} drop`;
  document.querySelector('#preview-meta').textContent = `${product.name} · ${data.get('size')} · ${data.get('logo')} · ${character.traits.join(' / ')}`;
}

function renderMarketplace(filter = 'All', modelFocus = '') {
  if (!marketTabs || !marketGrid) return;
  const tabs = ['All', ...new Set(marketplaceListings.map((listing) => listing.type))];
  marketTabs.innerHTML = tabs.map((tab) => `<button type="button" class="${tab === filter ? 'active' : ''}" data-market-filter="${tab}">${tab}</button>`).join('');
  const listings = marketplaceListings.filter((listing) => (filter === 'All' || listing.type === filter) && (!modelFocus || listing.model === modelFocus || listing.copy.includes(modelFocus)));
  marketGrid.innerHTML = listings.map((listing) => `<article><span class="pill">${listing.type}</span><h3>${listing.name}</h3><p>${listing.copy}</p><p class="price">${listing.price}</p><button type="button" data-product="${listing.name}">Add</button></article>`).join('') || '<article><h3>No matches</h3><p>Choose another marketplace tab or model.</p></article>';
  marketTabs.querySelectorAll('[data-market-filter]').forEach((button) => button.addEventListener('click', () => renderMarketplace(button.dataset.marketFilter)));
  marketGrid.querySelectorAll('[data-product]').forEach((button) => button.addEventListener('click', () => updateCart(button)));
}

designerControls?.addEventListener('input', updatePreview);
designerControls?.addEventListener('change', updatePreview);
document.querySelector('[data-add-custom]')?.addEventListener('click', (event) => updateCart(event.currentTarget, 'Design added'));
document.querySelector('#asset-upload')?.addEventListener('change', (event) => {
  const files = [...event.currentTarget.files].map((file) => `<li>${file.name} → thumbnails, tiles, cards, previews queued</li>`).join('');
  document.querySelector('#asset-list').innerHTML = files || '<li>No files selected</li>';
});

seedDesigner();
renderMarketplace();
