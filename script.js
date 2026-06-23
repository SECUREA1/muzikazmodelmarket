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

const modelCopy = {
  Originals: 'The Icons: classic crew starters, mascot poses, and brand-ready character assets.',
  Legends: 'The Unstoppable: armored future icons with neon stage presence and bold silhouettes.',
  Beasts: 'The Untamed: monster-powered renders with fantasy energy and safe presentation rules.',
  Crew: 'The Squad: street-smart mascots, fan favorites, and friendly drop-ready characters.',
  Chaos: 'The Wildcards: high-energy hybrids for creators who want the loudest MUZIKAZ look.',
};

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
    if (modelStatus) modelStatus.textContent = `${selectedModel} collection selected. Preview is open and ready to add to cart.`;
    if (modelDetailTitle) modelDetailTitle.textContent = selectedModel;
    if (modelDetailCopy) modelDetailCopy.textContent = modelCopy[selectedModel] || 'MUZIKAZ model collection ready to preview.';
    if (modelDetailArt) modelDetailArt.className = `model-detail-art ${button.closest('.card')?.classList[1] || ''}`;
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

const designerCharacters = [
  { id: 'inferno', name: 'Inferno', traits: ['Fire', 'Loud', 'Chaos'] },
  { id: 'blacksheep', name: 'Black Sheep', traits: ['Rare', 'Leader'] },
  { id: 'doge', name: 'Doge', traits: ['Loyal', 'Meme'] },
  { id: 'penguin', name: 'Penguin', traits: ['Crew', 'Cool'] },
  { id: 'ape', name: 'Ape', traits: ['Original', 'Power'] },
];

const designerProducts = [
  { id: 'hoodie', name: 'Premium Hoodie', category: 'Hoodies', price: 59.99 },
  { id: 'tee', name: 'Graphic T-Shirt', category: 'T-Shirts', price: 29.99 },
  { id: 'cap', name: 'Crew Cap', category: 'Headwear', price: 28.00 },
  { id: 'bottle', name: 'IonCore Bottle', category: 'Drinkware', price: 24.99 },
  { id: 'poster', name: 'Drop Poster', category: 'Posters', price: 19.99 },
];

const marketplaceListings = [
  { type: 'Product Listings', name: 'Inferno Hoodie', price: '$59.99', copy: 'Buy-now apparel generated from the character system.' },
  { type: 'Auctions', name: 'Black Sheep 1/1 Sample', price: 'Current bid $112', copy: 'Timed auction concept for rare production samples.' },
  { type: 'Character Merch', name: 'Penguin Crew Pack', price: '$74.00', copy: 'Bundle with cap, sticker pack, and poster.' },
  { type: 'Custom Orders', name: 'Team Sleeve Text Run', price: 'Quote request', copy: 'Custom name, number, logo style, and sleeve text.' },
  { type: 'Limited Drops', name: 'Doge Friday Drop', price: 'Locks at sellout', copy: 'Countdown-ready limited product card.' },
];

const productSelect = document.querySelector('#design-product');
const characterSelect = document.querySelector('#design-character');
const designerControls = document.querySelector('#designer-controls');
const marketTabs = document.querySelector('#market-tabs');
const marketGrid = document.querySelector('#market-grid');

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

function renderMarketplace(filter = 'All') {
  if (!marketTabs || !marketGrid) return;
  const tabs = ['All', ...new Set(marketplaceListings.map((listing) => listing.type))];
  marketTabs.innerHTML = tabs.map((tab) => `<button type="button" class="${tab === filter ? 'active' : ''}" data-market-filter="${tab}">${tab}</button>`).join('');
  const listings = filter === 'All' ? marketplaceListings : marketplaceListings.filter((listing) => listing.type === filter);
  marketGrid.innerHTML = listings.map((listing) => `<article><span class="pill">${listing.type}</span><h3>${listing.name}</h3><p>${listing.copy}</p><p class="price">${listing.price}</p><button type="button" data-product="${listing.name}">Add</button></article>`).join('');
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
