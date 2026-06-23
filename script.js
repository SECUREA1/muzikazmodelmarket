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


const siteTwoCharacters = [
  {name:'Sparky', role:'The Inventor', file:'sparky', group:'New Legends', bio:'Brilliant, chaotic, and unstoppable for inventor-themed merch drops.'},
  {name:'Nexus', role:'The Sentinel', file:'nexus', group:'New Legends', bio:'Future-forward sentinel for premium apparel and high-tech product presentation.'},
  {name:'Inferno', role:'The Unleashed', file:'inferno', group:'New Legends', bio:'Raw heat and chaos for aggressive campaign art and darker merch designs.'},
  {name:'Rumble', role:'The Brute', file:'rumble', group:'New Legends', bio:'Big strength and big attitude for statement hoodies and event banners.'},
  {name:'Chillz', role:'The Strategist', file:'chillz', group:'New Legends', bio:'Cool, calm, and three steps ahead for caps, stickers, and confidence gear.'},
  {name:'Bax', role:'The Rebel', file:'bax', group:'The Crew', bio:'A red-hot rebel mascot for loud streetwear and underground promo drops.'},
  {name:'Ion Wolf', role:'The Night Runner', file:'ion-wolf', group:'The Crew', bio:'A neon wolf with night-runner style for jackets, hats, and limited drops.'},
  {name:'Flick', role:'The Spark', file:'flick', group:'The Crew', bio:'Bright and fan-friendly for youth gear, stickers, and family events.'},
  {name:'Byte', role:'The Signal', file:'byte', group:'The Crew', bio:'Tech duck mascot for audio culture, digital promos, and signal-themed merch.'},
  {name:'Luna', role:'The Soft Power', file:'luna', group:'The Crew', bio:'A softer mascot for cozy hoodies, plush ideas, and lifestyle products.'},
  {name:'Muz Cat', role:'The Producer', file:'muz-cat', group:'The Crew', bio:'Studio cat built for creator merch, desk mats, posters, and music drops.'},
  {name:'Grump', role:'The Enforcer', file:'grump', group:'The Crew', bio:'A serious heavy-hitter for classic tees and no-nonsense campaigns.'},
  {name:'Sharko', role:'The Finisher', file:'sharko', group:'The Crew', bio:'Sharp mascot for performance gear, bold posters, and aggressive launches.'},
  {name:'Buzz', role:'The Hype Bee', file:'buzz', group:'The Crew', bio:'Bright bee mascot for stickers, kid-friendly merch, and social campaigns.'},
  {name:'Wild', role:'The Pilot Pug', file:'wild', group:'The Crew', bio:'Adventure dog for hats, keychains, pins, and travel-themed event mascots.'},
  {name:'Grok', role:'The Survivor', file:'grok', group:'New Additions', bio:'Rugged mascot for outdoor-style apparel, patches, and tough accessories.'},
  {name:'Buzz Jr.', role:'The Mini Hype', file:'buzz-jr', group:'New Additions', bio:'Mini hype mascot for stickers, small accessories, and family bundles.'}
];

const siteTwoProducts = [
  {id:'tee', name:'Graphic Tee', price:29.99, desc:'Front print tee with character art and optional back hit.', sizes:['XS','S','M','L','XL','2XL','3XL'], colors:['Black','Acid Green','White','Stone Grey']},
  {id:'hoodie', name:'Premium Hoodie', price:59.99, desc:'Heavy fleece hoodie with oversized artwork and sleeve logo detailing.', sizes:['S','M','L','XL','2XL','3XL'], colors:['Black','Shadow Purple','Army Green','Ash Grey']},
  {id:'poster', name:'Poster Print', price:19.99, desc:'Promotional art poster for booths, launches, and room decor.', sizes:['11x17','18x24','24x36'], colors:['Full Color','Monochrome Green','Blackout Edition']},
  {id:'hat', name:'Snapback Cap', price:27.99, desc:'Structured cap with mascot logo, icon mark, or side detail.', sizes:['One Size'], colors:['Black','Charcoal','Neon Green','Cream']},
  {id:'bottle', name:'Water Bottle', price:24.99, desc:'Matte bottle with vertical graphic and slogan placement.', sizes:['20 oz','24 oz'], colors:['Black','Lime Fade','Steel Grey','Purple Haze']},
  {id:'lanyard', name:'Lanyard', price:12.99, desc:'Event-ready woven lanyard with repeat logos and mascot color cues.', sizes:['Standard'], colors:['Black / Green','Purple / Lime','Grey / Green']},
  {id:'pin', name:'Enamel Pin', price:9.99, desc:'Collectible character icon pin for jackets, hats, and accessories.', sizes:['1.25 in','1.5 in'], colors:['Signature Colors','Blackout Metal','Glow Green']},
  {id:'sticker', name:'Sticker Pack', price:7.99, desc:'Mascot sticker bundle with logo hits, slogans, and collectible extras.', sizes:['5-Pack','8-Pack','12-Pack'], colors:['Mixed Set','Green Monochrome','Character Palette']}
];

const assetCatalog = {
  models: [
    { id: 'originals', name: 'Originals', css: 'monkey', character: 'Ape', type: 'Character Models', file: 'reference.png', price: '$39.00', copy: 'Classic starter poses, mascot turnarounds, and brand-ready preview files.', merch: ['Neon Hoodie', 'Bolt Keychain'] },
    { id: 'legends', name: 'Legends', css: 'robot', character: 'Cyber Wolf', type: '3D Model Packs', file: 'futuristic_armored_wolf_humanoid.png', price: '$64.00', copy: 'Armored future icon with dramatic neon render support and creator-safe styling.', merch: ['Crew Cap', 'Beat Bottle'] },
    { id: 'beasts', name: 'Beasts', css: 'beast', character: 'Red Beast', type: '3D Model Packs', file: 'fierce_demon_hybrid_in_action.png', price: '$58.00', copy: 'Monster-power render pack connected to safe fantasy presentation rules.', merch: ['Wristband', 'Lanyard'] },
    { id: 'crew', name: 'Crew', css: 'penguin', character: 'Crew Penguin', type: 'Character Models', file: 'the_crew_banner_2x_transparent.png', price: '$44.00', copy: 'Street-smart mascot assets for friendly drops, banners, and fan pages.', merch: ['Crew Cap', 'Lanyard'] },
    { id: 'chaos', name: 'Chaos', css: 'chaos', character: 'Chaos Ape', type: '3D Model Packs', file: 'character_traits_overview_panel_2x.png', price: '$69.00', copy: 'High-energy hybrid concepts for the loudest MUZIKAZ creator collection.', merch: ['Neon Hoodie', 'Wristband'] },
    { id: 'new-legends', name: 'New Legends', css: 'new-legends', character: 'Unlocked Crew', type: 'Character Models', file: 'new_legends_unlocked_2x_transparent.png', price: '$52.00', copy: 'Expanded platform collection art for fresh mascot launches and hero tiles.', merch: ['Hero Banner', 'Tagline Tee'] },
    { id: 'trait-avatars', name: 'Trait Avatars', css: 'trait-avatars', character: 'Avatar Lineup', type: 'Character Models', file: 'trait_avatars_row_1_2x.png', price: '$46.00', copy: 'Row-ready mascot avatars built for picker graphics, social posts, and profile drops.', merch: ['Avatar Sticker Sheet', 'Crew Cap'] },
    { id: 'online-events', name: 'Online Events', css: 'online-events', character: 'Event Crew', type: 'Event Model Packs', file: 'available_online_events_banner_2x_transparent.png', price: '$55.00', copy: 'Event-ready visual set for stream drops, ticket pages, and online campaigns.', merch: ['Event Pass', 'Lanyard'] },
    { id: 'brand-kit', name: 'Brand Kit', css: 'brand-kit', character: 'Logo System', type: 'Brand Asset Packs', file: 'logo_panel_2x_transparent.png', price: '$36.00', copy: 'Built-in MUZIKAZ logo graphics packaged for badges, cards, and marketplace pages.', merch: ['Logo Patch', 'Bolt Keychain'] },
  ],
  retail: [
    { id: 'hoodie', name: 'Neon Hoodie', category: 'Hoodies', price: '$64.00', asset: 'classic_favorites_banner_transparent.png', connectsTo: ['Originals', 'Chaos'] },
    { id: 'cap', name: 'Crew Cap', category: 'Headwear', price: '$28.00', asset: 'brand_name_tagline_panel_transparent.png', connectsTo: ['Legends', 'Crew'] },
    { id: 'bottle', name: 'Beat Bottle', category: 'Drinkware', price: '$22.00', asset: 'accessories_banner_transparent.png', connectsTo: ['Legends'] },
    { id: 'keychain', name: 'Bolt Keychain', category: 'Accessories', price: '$12.00', asset: 'cta_shop_collection_transparent.png', connectsTo: ['Originals'] },
    { id: 'wristband', name: 'Wristband', category: 'Accessories', price: '$16.00', asset: 'button_styles_panel_transparent.png', connectsTo: ['Beasts', 'Chaos'] },
    { id: 'lanyard', name: 'Lanyard', category: 'Accessories', price: '$14.00', asset: 'accessories_banner_2x_transparent.png', connectsTo: ['Beasts', 'Crew', 'Online Events'] },
    { id: 'hero-banner', name: 'Hero Banner', category: 'Wall Art', price: '$34.00', asset: 'hero_banner_full_2x_transparent.png', connectsTo: ['New Legends'] },
    { id: 'tagline-tee', name: 'Tagline Tee', category: 'Tees', price: '$32.00', asset: 'tagline_crop_2x_transparent.png', connectsTo: ['New Legends'] },
    { id: 'avatar-stickers', name: 'Avatar Sticker Sheet', category: 'Stickers', price: '$18.00', asset: 'trait_avatars_row_2_2x.png', connectsTo: ['Trait Avatars'] },
    { id: 'event-pass', name: 'Event Pass', category: 'Collectibles', price: '$20.00', asset: 'available_online_events_banner_transparent.png', connectsTo: ['Online Events'] },
    { id: 'logo-patch', name: 'Logo Patch', category: 'Patches', price: '$15.00', asset: 'logo_symbol_crop_2x_transparent.png', connectsTo: ['Brand Kit'] },
    { id: 'wordmark-print', name: 'Wordmark Print', category: 'Wall Art', price: '$24.00', asset: 'muzikaz_wordmark_crop_2x_transparent.png', connectsTo: ['Brand Kit'] },
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


function renderModelCards() {
  const collectionGrid = document.querySelector('.collection-grid');
  if (!collectionGrid) return;
  collectionGrid.innerHTML = assetCatalog.models.map((model) => `
    <article class="card ${model.css}" style="--card-art:url('${model.file}')">
      <div><h3>${model.name}</h3><p>${model.character}</p><button type="button" data-model="${model.name}">View</button></div>
    </article>`).join('');
}

function renderMerchOptions() {
  const productGrid = document.querySelector('.products');
  if (!productGrid) return;
  productGrid.innerHTML = assetCatalog.retail.map((product, index) => `
    <article>
      ${index < 3 ? `<i>${index === 0 ? 'Hot' : index === 1 ? 'New' : 'Drop'}</i>` : ''}
      <div class="product-img" style="--product-art:url('${product.asset}')" role="img" aria-label="${product.name} graphic"></div>
      <strong>${product.name}</strong><p>${product.price}</p><button type="button" data-product="${product.name}">Add</button>
    </article>`).join('');
}

function selectModel(modelName) {
  selectedModel = modelName;
  const model = getModel(selectedModel);
  if (modelStatus) modelStatus.textContent = `${selectedModel} collection selected. 3D page, retail matches, and marketplace listings are connected.`;
  if (modelDetailTitle) modelDetailTitle.textContent = `${selectedModel} · ${model.character}`;
  if (modelDetailCopy) modelDetailCopy.textContent = model.copy;
  if (modelDetailArt) {
    modelDetailArt.className = `model-detail-art ${model.css}`;
    modelDetailArt.style.setProperty('--model-art', `url('${model.file}')`);
  }
  renderLinkedData(model);
  renderMarketplace('All', selectedModel);
  if (modelDetail) modelDetail.hidden = false;
  scrollToSection('model-detail');
}

document.addEventListener('click', (event) => {
  const modelButton = event.target.closest('[data-model]');
  if (modelButton) {
    selectModel(modelButton.dataset.model);
    return;
  }
  const productButton = event.target.closest('[data-product]');
  if (productButton) updateCart(productButton);
});

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
}

designerControls?.addEventListener('input', updatePreview);
designerControls?.addEventListener('change', updatePreview);
document.querySelector('[data-add-custom]')?.addEventListener('click', (event) => updateCart(event.currentTarget, 'Design added'));
document.querySelector('#asset-upload')?.addEventListener('change', (event) => {
  const files = [...event.currentTarget.files].map((file) => `<li>${file.name} → thumbnails, tiles, cards, previews queued</li>`).join('');
  document.querySelector('#asset-list').innerHTML = files || '<li>No files selected</li>';
});


function characterImage(character) {
  return `muzikaz_site 2/assets/characters/${character.file}.jpg`;
}

function money(amount) {
  return `$${amount.toFixed(2)}`;
}

function seedCharacterCheckout() {
  const characterSelect = document.querySelector('#checkout-character-select');
  const productSelect = document.querySelector('#checkout-product-select');
  const catalog = document.querySelector('#character-catalog');
  const productCatalog = document.querySelector('#checkout-product-catalog');
  if (!characterSelect || !productSelect || !catalog || !productCatalog) return;
  characterSelect.innerHTML = siteTwoCharacters.map((character, index) => `<option value="${index}">${character.name}</option>`).join('');
  productSelect.innerHTML = siteTwoProducts.map((product, index) => `<option value="${index}">${product.name}</option>`).join('');
  catalog.innerHTML = siteTwoCharacters.map((character, index) => `
    <button class="character-tile" type="button" data-checkout-character="${index}">
      <img src="${characterImage(character)}" alt="${character.name}">
      <span>${character.group}</span><strong>${character.name}</strong><small>${character.role}</small>
    </button>`).join('');
  productCatalog.innerHTML = siteTwoProducts.map((product, index) => `
    <button class="checkout-product-tile" type="button" data-checkout-product="${index}">
      <span>${product.name}</span><strong>${money(product.price)}</strong><small>${product.desc}</small>
    </button>`).join('');
  updateCharacterCheckout();
}

function updateCharacterCheckout() {
  const characterSelect = document.querySelector('#checkout-character-select');
  const productSelect = document.querySelector('#checkout-product-select');
  if (!characterSelect || !productSelect) return;
  const character = siteTwoCharacters[Number(characterSelect.value)] || siteTwoCharacters[0];
  const product = siteTwoProducts[Number(productSelect.value)] || siteTwoProducts[0];
  document.querySelector('#checkout-character-name').textContent = `${character.name} · ${product.name}`;
  document.querySelector('#checkout-character-copy').textContent = `${character.bio} Choose a ${product.name.toLowerCase()}, colorway, format, and quantity, then add the exact character-product combo to checkout.`;
  const image = document.querySelector('#checkout-character-img');
  if (image) image.src = characterImage(character);
  const sizeSelect = document.querySelector('#checkout-size-select');
  const colorSelect = document.querySelector('#checkout-color-select');
  if (sizeSelect) sizeSelect.innerHTML = product.sizes.map((size) => `<option>${size}</option>`).join('');
  if (colorSelect) colorSelect.innerHTML = product.colors.map((color) => `<option>${color}</option>`).join('');
  updateCheckoutTotal();
  document.querySelectorAll('[data-checkout-character]').forEach((button) => button.classList.toggle('active', button.dataset.checkoutCharacter === characterSelect.value));
  document.querySelectorAll('[data-checkout-product]').forEach((button) => button.classList.toggle('active', button.dataset.checkoutProduct === productSelect.value));
}

function updateCheckoutTotal() {
  const product = siteTwoProducts[Number(document.querySelector('#checkout-product-select')?.value)] || siteTwoProducts[0];
  const qty = Math.max(1, Number(document.querySelector('#checkout-qty')?.value) || 1);
  document.querySelector('#checkout-total').textContent = money(product.price * qty);
}

document.querySelector('#checkout-character-select')?.addEventListener('change', updateCharacterCheckout);
document.querySelector('#checkout-product-select')?.addEventListener('change', updateCharacterCheckout);
document.querySelector('#checkout-qty')?.addEventListener('input', updateCheckoutTotal);
document.querySelector('#checkout-add')?.addEventListener('click', (event) => {
  const character = siteTwoCharacters[Number(document.querySelector('#checkout-character-select')?.value)] || siteTwoCharacters[0];
  const product = siteTwoProducts[Number(document.querySelector('#checkout-product-select')?.value)] || siteTwoProducts[0];
  updateCart(event.currentTarget, 'Checkout added');
  alert(`${character.name} ${product.name} is in your cart. Connect this demo checkout to Shopify, Stripe, WooCommerce, or your preferred product checkout.`);
});
document.addEventListener('click', (event) => {
  const characterButton = event.target.closest('[data-checkout-character]');
  if (characterButton) {
    document.querySelector('#checkout-character-select').value = characterButton.dataset.checkoutCharacter;
    updateCharacterCheckout();
  }
  const productButton = event.target.closest('[data-checkout-product]');
  if (productButton) {
    document.querySelector('#checkout-product-select').value = productButton.dataset.checkoutProduct;
    updateCharacterCheckout();
  }
});

renderModelCards();
renderMerchOptions();
seedDesigner();
renderMarketplace();
seedCharacterCheckout();
