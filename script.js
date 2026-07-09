const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
const cartCount = document.querySelector('#cart-count');
const modelStatus = document.querySelector('#model-status');
const modelDetail = document.querySelector('#model-detail');
const modelDetailArt = document.querySelector('#model-detail-art');
const modelDetailTitle = document.querySelector('#model-detail-title');
const modelDetailCopy = document.querySelector('#model-detail-copy');
const addModelButton = document.querySelector('[data-add-model]');
const modelPageLink = document.querySelector('#model-page-link');
let cartItems = 0;
const CART_KEY = 'muzikazCheckoutCart';

function parsePrice(value) {
  return Number(String(value || '').replace(/[^0-9.]/g, '')) || 0;
}

function readCart() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

function writeCart(items) {
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  syncCartCount();
}

function syncCartCount() {
  cartItems = readCart().reduce((total, item) => total + (Number(item.quantity) || 1), 0);
  if (cartCount) cartCount.textContent = String(cartItems);
}

function addCartLine(name, price, meta = '') {
  if (!name) return;
  const items = readCart();
  const key = `${name}|${meta}`;
  const existing = items.find((item) => item.key === key);
  if (existing) {
    existing.quantity += 1;
  } else {
    items.push({ key, name, price: Number(price) || 0, meta, quantity: 1 });
  }
  writeCart(items);
}
let selectedModel = '';
const ownedProfilesSeed = {
  'crew@muzikaz.example': ['Originals 3D Model Pack', 'Neon Hoodie', 'Beat Bottle'],
  'collector@muzikaz.example': ['Legends 3D Model Pack', 'Crew Cap', 'Hero Banner'],
};
let currentMemberEmail = window.localStorage.getItem('muzikazBottleMemberEmail') || '';


function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


function closeMenu() {
  nav?.classList.remove('is-open');
  menuButton?.setAttribute('aria-expanded', 'false');
}

function updateCart(button, label = 'Added') {
  syncCartCount();
  if (!button) return;
  const originalText = button.textContent;
  button.textContent = label;
  window.setTimeout(() => { button.textContent = originalText; }, 1200);
}

function normalizeMemberEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function readOwnedProfiles() {
  const saved = window.localStorage.getItem('muzikazOwnedProfiles');
  if (saved) {
    try {
      return { ...ownedProfilesSeed, ...JSON.parse(saved) };
    } catch (error) {
      return { ...ownedProfilesSeed };
    }
  }
  return { ...ownedProfilesSeed };
}

function writeOwnedProfiles(profiles) {
  window.localStorage.setItem('muzikazOwnedProfiles', JSON.stringify(profiles));
}

function claimOwnedAsset(assetName, source = 'Marketplace claim') {
  const owner = normalizeMemberEmail(currentMemberEmail);
  if (!owner || !assetName) return;
  const profiles = readOwnedProfiles();
  const owned = profiles[owner] || [];
  const item = `${assetName} · ${source}`;
  if (!owned.some((entry) => entry.startsWith(assetName))) {
    owned.push(item);
    profiles[owner] = owned;
    writeOwnedProfiles(profiles);
  }
  renderOwnedCollection(owner);
}

function ownedAssetDetail(assetName) {
  const model = assetCatalog.models.find((item) => assetName.includes(item.name));
  if (model) return { title: assetName, type: model.type, image: model.file, copy: model.copy };
  const product = assetCatalog.retail.find((item) => assetName.includes(item.name));
  if (product) return { title: assetName, type: product.category, image: product.asset, copy: `Connected to ${product.connectsTo.join(' + ')} and tied to the owner's account.` };
  return { title: assetName, type: 'Uploaded asset', image: 'logo_panel_2x_transparent.png', copy: 'Member-uploaded file saved to this account collection.' };
}

function renderOwnedCollection(preferredOwner = currentMemberEmail) {
  const current = document.querySelector('#owned-current-user');
  const copy = document.querySelector('#owned-current-copy');
  const select = document.querySelector('#owned-profile-select');
  const summary = document.querySelector('#owned-assets-summary');
  const grid = document.querySelector('#owned-assets-grid');
  if (!current || !copy || !select || !summary || !grid) return;
  const profiles = readOwnedProfiles();
  const owner = normalizeMemberEmail(preferredOwner || currentMemberEmail);
  if (!currentMemberEmail) {
    current.textContent = 'Login required';
    copy.textContent = 'Log in above to tie purchased, uploaded, and claimed assets to your account.';
    summary.innerHTML = '<article><strong>Locked</strong><span>Member collections unlock after login.</span></article>';
    grid.innerHTML = '';
    return;
  }
  if (!profiles[currentMemberEmail]) {
    profiles[currentMemberEmail] = ['Brand Kit 3D Model Pack · Starter owner asset'];
    writeOwnedProfiles(profiles);
  }
  const owners = Object.keys(profiles).sort((a, b) => (a === currentMemberEmail ? -1 : b === currentMemberEmail ? 1 : a.localeCompare(b)));
  select.disabled = false;
  select.innerHTML = owners.map((profile) => `<option value="${profile}" ${profile === owner ? 'selected' : ''}>${profile}${profile === currentMemberEmail ? ' (you)' : ''}</option>`).join('');
  current.textContent = currentMemberEmail;
  copy.textContent = owner === currentMemberEmail ? 'Your login is connected to every claimed product, model pack, and upload below.' : `Viewing ${owner}'s shared account assets while logged in as ${currentMemberEmail}.`;
  const assets = profiles[owner] || [];
  summary.innerHTML = `<article><strong>${assets.length}</strong><span>Total owned assets</span></article><article><strong>${owner === currentMemberEmail ? 'Owner' : 'Viewer'}</strong><span>${owner}</span></article><article><strong>Shared</strong><span>Logged-in members can view account collections.</span></article>`;
  grid.innerHTML = assets.map((asset) => {
    const detail = ownedAssetDetail(asset);
    return `<article><img src="${detail.image}" alt="${detail.title}"><span class="pill">${detail.type}</span><h3>${detail.title}</h3><p>${detail.copy}</p></article>`;
  }).join('') || '<article><h3>No assets yet</h3><p>Add marketplace drops, checkout character products, or upload graphics to build this account collection.</p></article>';
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
  const model = getModel(selectedModel);
  addCartLine(`${selectedModel} 3D Model Pack`, parsePrice(model.price), model.type);
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
  if (cartItems) {
    window.location.href = 'checkout.html';
  } else {
    alert('Your MUZIKAZ cart is empty. Add merch or models to begin.');
  }
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
  const card = event.target instanceof HTMLElement ? event.target.closest('[data-preview-model]') : null;
  if (card && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    selectModel(card.dataset.previewModel);
  }
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
    { id: 'originals', page: 'originals.html', name: 'Originals', css: 'monkey', character: 'Ape', type: 'Character Models', file: 'reference.png', price: '$39.00', copy: 'Classic starter poses, mascot turnarounds, and brand-ready preview files.', merch: ['Neon Hoodie', 'Bolt Keychain'] },
    { id: 'legends', page: 'legends.html', name: 'Legends', css: 'robot', character: 'Cyber Wolf', type: '3D Model Packs', file: 'futuristic_armored_wolf_humanoid.png', price: '$64.00', copy: 'Armored future icon with dramatic neon render support and creator-safe styling.', merch: ['Crew Cap', 'Beat Bottle'] },
    { id: 'beasts', page: 'beasts.html', name: 'Beasts', css: 'beast', character: 'Red Beast', type: '3D Model Packs', file: 'fierce_demon_hybrid_in_action.png', price: '$58.00', copy: 'Monster-power render pack connected to safe fantasy presentation rules.', merch: ['Wristband', 'Lanyard'] },
    { id: 'crew', page: 'crew-market.html', name: 'Crew', css: 'penguin', character: 'Crew Penguin', type: 'Character Models', file: 'the_crew_banner_2x_transparent.png', price: '$44.00', copy: 'Street-smart mascot assets for friendly drops, banners, and fan pages.', merch: ['Crew Cap', 'Lanyard'] },
    { id: 'chaos', page: 'chaos.html', name: 'Chaos', css: 'chaos', character: 'Chaos Ape', type: '3D Model Packs', file: 'character_traits_overview_panel_2x.png', price: '$69.00', copy: 'High-energy hybrid concepts for the loudest MUZIKAZ creator collection.', merch: ['Neon Hoodie', 'Wristband'] },
    { id: 'new-legends', page: 'new-legends.html', name: 'New Legends', css: 'new-legends', character: 'Unlocked Crew', type: 'Character Models', file: 'new_legends_unlocked_2x_transparent.png', price: '$52.00', copy: 'Expanded platform collection art for fresh mascot launches and hero tiles.', merch: ['Hero Banner', 'Tagline Tee'] },
    { id: 'trait-avatars', page: 'trait-avatars.html', name: 'Trait Avatars', css: 'trait-avatars', character: 'Avatar Lineup', type: 'Character Models', file: 'trait_avatars_row_1_2x.png', price: '$46.00', copy: 'Row-ready mascot avatars built for picker graphics, social posts, and profile drops.', merch: ['Avatar Sticker Sheet', 'Crew Cap'] },
    { id: 'online-events', page: 'online-events.html', name: 'Online Events', css: 'online-events', character: 'Event Crew', type: 'Event Model Packs', file: 'available_online_events_banner_2x_transparent.png', price: '$55.00', copy: 'Event-ready visual set for stream drops, ticket pages, and online campaigns.', merch: ['Event Pass', 'Lanyard'] },
    { id: 'brand-kit', page: 'brand-kit.html', name: 'Brand Kit', css: 'brand-kit', character: 'Logo System', type: 'Brand Asset Packs', file: 'logo_panel_2x_transparent.png', price: '$36.00', copy: 'Built-in MUZIKAZ logo graphics packaged for badges, cards, and marketplace pages.', merch: ['Logo Patch', 'Bolt Keychain'] },
  ],
  retail: [
    { id: 'hoodie', name: 'Neon Hoodie', category: 'Hoodies', price: '$64.00', asset: 'muzikaz_high_level_image_pack1/05_merch/hoodie_tile_2x.png', connectsTo: ['Originals', 'Chaos'] },
    { id: 'cap', name: 'Crew Cap', category: 'Headwear', price: '$28.00', asset: 'muzikaz_high_level_image_pack1/05_merch/cap_tile_2x.png', connectsTo: ['Legends', 'Crew'] },
    { id: 'bottle', name: 'Beat Bottle', category: 'Drinkware', price: '$22.00', asset: 'muzikaz_high_level_image_pack1/05_merch/bottle_tile_2x.png', connectsTo: ['Legends'] },
    { id: 'keychain', name: 'Bolt Keychain', category: 'Accessories', price: '$12.00', asset: 'muzikaz_high_level_image_pack1/05_merch/keychain_tile_2x.png', connectsTo: ['Originals'] },
    { id: 'wristband', name: 'Wristband', category: 'Accessories', price: '$16.00', asset: 'muzikaz_high_level_image_pack1/05_merch/wristband_tile_2x.png', connectsTo: ['Beasts', 'Chaos'] },
    { id: 'lanyard', name: 'Lanyard', category: 'Accessories', price: '$14.00', asset: 'muzikaz_high_level_image_pack1/05_merch/lanyard_tile_2x.png', connectsTo: ['Beasts', 'Crew', 'Online Events'] },
    { id: 'hero-banner', name: 'Hero Banner', category: 'Wall Art', price: '$34.00', asset: 'hero_banner_full_2x_transparent.png', connectsTo: ['New Legends'] },
    { id: 'tagline-tee', name: 'Tagline Tee', category: 'Tees', price: '$32.00', asset: 'tagline_crop_2x_transparent.png', connectsTo: ['New Legends'] },
    { id: 'avatar-stickers', name: 'Avatar Sticker Sheet', category: 'Stickers', price: '$18.00', asset: 'trait_avatars_row_2_2x.png', connectsTo: ['Trait Avatars', 'Chaos'] },
    { id: 'event-pass', name: 'Event Pass', category: 'Collectibles', price: '$20.00', asset: 'available_online_events_banner_transparent.png', connectsTo: ['Online Events'] },
    { id: 'logo-patch', name: 'Logo Patch', category: 'Patches', price: '$15.00', asset: 'logo_symbol_crop_2x_transparent.png', connectsTo: ['Brand Kit'] },
    { id: 'wordmark-print', name: 'Wordmark Print', category: 'Wall Art', price: '$24.00', asset: 'muzikaz_wordmark_crop_2x_transparent.png', connectsTo: ['Brand Kit'] },
  ],
};

const designerCharacters = assetCatalog.models.map((model) => ({ id: model.id, name: model.character, traits: [model.name, model.type] }));
const designerProducts = assetCatalog.retail.map((product) => ({ id: product.id, name: product.name, category: product.category, price: Number(product.price.replace(/[^0-9.]/g, '')) }));
const marketplaceListings = [
  ...assetCatalog.models.map((model) => ({ type: model.type, category: model.name, quality: 'curated', name: `${model.name} 3D Model Pack`, price: model.price, copy: `${model.copy} Source: ${model.file}`, model: model.name })),
  ...assetCatalog.retail.map((product) => ({ type: 'Retail Pages', category: product.category, quality: 'curated', name: product.name, price: product.price, copy: `${product.category} connected to ${product.connectsTo.join(' + ')} model data.`, product: product.name })),
  { type: 'Custom Orders', category: 'Custom Builds', quality: 'curated', name: 'Team Sleeve Text Run', price: 'Quote request', copy: 'Custom name, number, logo style, sleeve text, product, and character selections flow from the same catalog.' },
  { type: 'Limited Drops', category: 'Drop Bundles', quality: 'review', name: 'Friday Connected Drop', price: 'Locks at sellout', copy: 'Bundles one model pack, one retail item, and one custom designer preset.' },
];

const marketplaceState = { type: 'All', category: 'All', modelFocus: '', curatedOnly: true };


function renderModelCards() {
  const collectionGrid = document.querySelector('.collection-grid');
  if (!collectionGrid) return;
  const visibleModels = document.body.classList.contains('members-page') ? assetCatalog.models : assetCatalog.models.filter((model) => !['new-legends', 'trait-avatars', 'online-events'].includes(model.id));
  collectionGrid.innerHTML = visibleModels.map((model) => `
    <article class="card ${model.css}" style="--card-art:url('${model.file}')" data-preview-model="${model.name}" tabindex="0" aria-label="Preview ${model.name} collection">
      <div><h3>${model.name}</h3><p>${model.character}</p><a class="card-link" href="${model.page}">View</a></div>
    </article>`).join('');
}

function renderMerchOptions() {
  const productGrid = document.querySelector('.products');
  if (!productGrid) return;
  const gatedProductIds = new Set(['hero-banner', 'tagline-tee', 'event-pass']);
  const visibleProducts = document.body.classList.contains('members-page')
    ? assetCatalog.retail
    : assetCatalog.retail.filter((product) => !gatedProductIds.has(product.id));
  productGrid.innerHTML = visibleProducts.map((product, index) => `
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
  if (modelPageLink) modelPageLink.href = model.page;
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
  const modelCard = event.target.closest('[data-preview-model]');
  if (modelButton || (modelCard && !(event.target instanceof HTMLAnchorElement))) {
    const modelName = modelButton?.dataset.model || modelCard?.dataset.previewModel;
    if (modelName) selectModel(modelName);
    return;
  }
  const productButton = event.target.closest('[data-product]');
  if (productButton) {
    const productName = productButton.dataset.product;
    const product = assetCatalog.retail.find((item) => item.name === productName) || marketplaceListings.find((item) => item.name === productName);
    addCartLine(productName, parsePrice(product?.price), product?.category || product?.type || 'Store item');
    updateCart(productButton);
    claimOwnedAsset(productName, 'Added from storefront');
  }
});

const productSelect = document.querySelector('#design-product');
const characterSelect = document.querySelector('#design-character');
const designerControls = document.querySelector('#designer-controls');
const marketTabs = document.querySelector('#market-tabs');
const marketCategories = document.querySelector('#market-categories');
const marketQualityToggle = document.querySelector('#market-quality-toggle');
const marketStatus = document.querySelector('#market-status');
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
  marketplaceState.type = 'All';
  marketplaceState.category = 'All';
  marketplaceState.modelFocus = modelName;
  renderMarketplace();
  scrollToSection('marketplace');
}

const uploadState = { layers: [], activeId: null, saved: null };
const allowedDesignTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];

function seedDesigner() {
  if (!productSelect || !characterSelect) return;
  productSelect.innerHTML = designerProducts.map((product) => `<option value="${product.id}">${product.name}</option>`).join('');
  characterSelect.innerHTML = designerCharacters.map((character) => `<option value="${character.id}">${character.name}</option>`).join('');
  productSelect.value = 'avatar-stickers';
  characterSelect.value = 'chaos';
  updatePreview();
}

function designerData() {
  const data = new FormData(designerControls);
  const product = designerProducts.find((item) => item.id === data.get('product')) || designerProducts.find((item) => item.id === 'avatar-stickers') || designerProducts[0];
  const character = designerCharacters.find((item) => item.id === data.get('character')) || designerCharacters.find((item) => item.id === 'chaos') || designerCharacters[0];
  return { data, product, character };
}

function updatePreview() {
  if (!designerControls) return;
  const { data, product, character } = designerData();
  const mockup = document.querySelector('#designer-mockup');
  mockup?.style.setProperty('--design-color', data.get('color'));
  mockup?.setAttribute('data-product-template', product.id);
  document.querySelector('#preview-character').textContent = character.name;
  document.querySelector('#preview-name').textContent = data.get('name') || 'MUZIKAZ';
  document.querySelector('#preview-number').textContent = data.get('number') || '88';
  document.querySelector('#preview-sleeve').textContent = data.get('sleeve') || 'LIVE THE BEAT';
  const isSticker = product.id === 'avatar-stickers';
  document.querySelector('#preview-title').textContent = isSticker ? `${character.name} custom stickers drop` : `${character.name} custom ${product.category.toLowerCase()} drop`;
  document.querySelector('#preview-meta').textContent = `${product.name} · ${data.get('size')} · ${data.get('logo')} · ${data.get('layout') || character.traits.join(' / ')}`;
  const values = [character.name, data.get('name') || 'MUZIKAZ', data.get('number') || '88', data.get('sleeve') || 'LIVE THE BEAT', `${product.name} · ${data.get('size')} · ${data.get('logo')} · ${data.get('layout') || character.traits.join(' / ')}`];
  const previewValues = document.querySelector('#preview-values');
  if (previewValues) previewValues.innerHTML = values.map((value) => `<li>${value}</li>`).join('');
  renderOrderSummary();
}

function renderOrderSummary() {
  const summary = document.querySelector('#designer-order-summary');
  if (!summary || !designerControls) return;
  const { data, product, character } = designerData();
  const quantity = Number(data.get('quantity') || 1);
  const total = product.price * quantity;
  const uploads = uploadState.layers.length ? uploadState.layers.map((layer) => layer.name).join(', ') : 'No custom upload yet';
  summary.innerHTML = `<strong>${product.name} custom order</strong><span>${character.name} · ${data.get('size')} · Qty ${quantity} · $${total.toFixed(2)}</span><span>Text: ${data.get('name')} / ${data.get('number')} / ${data.get('sleeve')}</span><span>Uploaded art: ${uploads}</span><span>Notes: ${data.get('notes') || 'None'}</span>`;
}

function renderMarketplace(type = marketplaceState.type, modelFocus = marketplaceState.modelFocus) {
  if (!marketTabs || !marketGrid) return;
  marketplaceState.type = type || 'All';
  marketplaceState.modelFocus = modelFocus || '';
  marketplaceState.curatedOnly = marketQualityToggle ? marketQualityToggle.checked : marketplaceState.curatedOnly;
  const types = ['All', ...new Set(marketplaceListings.map((listing) => listing.type))];
  const categories = ['All', ...new Set(marketplaceListings.map((listing) => listing.category))];
  marketTabs.innerHTML = types.map((tab) => `<button type="button" class="${tab === marketplaceState.type ? 'active' : ''}" aria-pressed="${tab === marketplaceState.type}" data-market-filter="${tab}">${tab}</button>`).join('');
  if (marketCategories) {
    marketCategories.innerHTML = categories.map((category) => `<button type="button" class="${category === marketplaceState.category ? 'active' : ''}" aria-pressed="${category === marketplaceState.category}" data-market-category="${category}">${category}</button>`).join('');
  }
  const listings = marketplaceListings.filter((listing) => {
    const typeMatch = marketplaceState.type === 'All' || listing.type === marketplaceState.type;
    const categoryMatch = marketplaceState.category === 'All' || listing.category === marketplaceState.category;
    const focusMatch = !marketplaceState.modelFocus || listing.model === marketplaceState.modelFocus || listing.copy.includes(marketplaceState.modelFocus);
    const qualityMatch = !marketplaceState.curatedOnly || listing.quality === 'curated';
    return typeMatch && categoryMatch && focusMatch && qualityMatch;
  });
  marketGrid.innerHTML = listings.map((listing) => `<article><span class="pill">${listing.type}</span><span class="pill category-pill">${listing.category}</span><h3>${listing.name}</h3><p>${listing.copy}</p><p class="price">${listing.price}</p><button type="button" data-product="${listing.name}">Add</button></article>`).join('') || '<article><h3>No matches</h3><p>Choose another category, type, or turn off curated quality only.</p></article>';
  if (marketStatus) {
    const focusCopy = marketplaceState.modelFocus ? ` for ${marketplaceState.modelFocus}` : '';
    marketStatus.textContent = `${listings.length} listing${listings.length === 1 ? '' : 's'} shown${focusCopy}. Category: ${marketplaceState.category}. Type: ${marketplaceState.type}.`;
  }
  marketTabs.querySelectorAll('[data-market-filter]').forEach((button) => button.addEventListener('click', () => renderMarketplace(button.dataset.marketFilter, marketplaceState.modelFocus)));
  marketCategories?.querySelectorAll('[data-market-category]').forEach((button) => button.addEventListener('click', () => {
    marketplaceState.category = button.dataset.marketCategory || 'All';
    marketplaceState.modelFocus = '';
    renderMarketplace(marketplaceState.type);
  }));
}


function setDesignerStatus(message) {
  const status = document.querySelector('#designer-status');
  if (status) status.textContent = message;
}

function activeUploadLayer() {
  return document.querySelector(`.uploaded-design-layer[data-layer-id="${uploadState.activeId}"]`) || document.querySelector('.uploaded-design-layer');
}

function applyLayerTransform(layer) {
  if (!layer) return;
  const scale = Number(layer.dataset.scale || 1);
  const rotate = Number(layer.dataset.rotate || 0);
  const flipX = layer.dataset.flipX === 'true' ? -1 : 1;
  const flipY = layer.dataset.flipY === 'true' ? -1 : 1;
  layer.style.transform = `translate(-50%, -50%) rotate(${rotate}deg) scale(${scale * flipX}, ${scale * flipY})`;
}

function selectUploadLayer(layer) {
  document.querySelectorAll('.uploaded-design-layer').forEach((item) => item.classList.remove('active'));
  if (!layer) return;
  layer.classList.add('active');
  uploadState.activeId = layer.dataset.layerId;
  document.querySelector('#upload-scale').value = Math.round(Number(layer.dataset.scale || 1) * 100);
  document.querySelector('#upload-rotate').value = Number(layer.dataset.rotate || 0);
}

function makeUploadLayer(src, name) {
  const zone = document.querySelector('#upload-layer-zone');
  if (!zone) return;
  const id = `upload-${Date.now()}-${uploadState.layers.length}`;
  const layer = document.createElement('img');
  layer.className = 'uploaded-design-layer sticker-cutline';
  layer.dataset.layerId = id;
  layer.dataset.scale = '1';
  layer.dataset.rotate = '0';
  layer.dataset.flipX = 'false';
  layer.dataset.flipY = 'false';
  layer.alt = `${name} custom uploaded design`;
  layer.src = src;
  layer.style.left = '50%';
  layer.style.top = '50%';
  layer.draggable = false;
  zone.appendChild(layer);
  uploadState.layers.push({ id, name, src });
  selectUploadLayer(layer);
  applyLayerTransform(layer);
  renderOrderSummary();
  setDesignerStatus(`${name} added. Drag it, resize it, rotate it, flip it, duplicate it, or include it in the custom order.`);
}

function handleDesignUpload(event) {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  if (!allowedDesignTypes.includes(file.type)) {
    setDesignerStatus('Upload failed: use PNG, JPG, JPEG, or SVG artwork. Transparent PNG is preferred.');
    event.currentTarget.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    setDesignerStatus('Upload failed: keep custom design files under 5 MB for this live preview.');
    event.currentTarget.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => makeUploadLayer(reader.result, file.name);
  reader.readAsDataURL(file);
}

function handleLayerAction(action) {
  const layer = activeUploadLayer();
  if (!layer) {
    setDesignerStatus('Upload a custom design before using layer controls.');
    return;
  }
  if (action === 'center') { layer.style.left = '50%'; layer.style.top = '50%'; }
  if (action === 'front') layer.style.zIndex = String((Number(layer.style.zIndex) || 10) + 1);
  if (action === 'back') layer.style.zIndex = String(Math.max(1, (Number(layer.style.zIndex) || 10) - 1));
  if (action === 'flip-x') layer.dataset.flipX = layer.dataset.flipX === 'true' ? 'false' : 'true';
  if (action === 'flip-y') layer.dataset.flipY = layer.dataset.flipY === 'true' ? 'false' : 'true';
  if (action === 'delete') {
    uploadState.layers = uploadState.layers.filter((item) => item.id !== layer.dataset.layerId);
    layer.remove();
    uploadState.activeId = null;
    renderOrderSummary();
    setDesignerStatus('Custom design layer deleted from the preview.');
    return;
  }
  if (action === 'duplicate') makeUploadLayer(layer.src, `${layer.alt.replace(' custom uploaded design', '')} copy`);
  applyLayerTransform(layer);
  renderOrderSummary();
}

function exportDesignerOrder() {
  const { data, product, character } = designerData();
  return {
    product: product.name,
    character: character.name,
    color: data.get('color'),
    size: data.get('size'),
    name: data.get('name'),
    number: data.get('number'),
    logoStyle: data.get('logo'),
    sleeveText: data.get('sleeve'),
    layout: data.get('layout'),
    quantity: Number(data.get('quantity') || 1),
    notes: data.get('notes') || '',
    uploads: uploadState.layers.map(({ id, name }) => ({ id, name })),
    preview: 'Live layered DOM merch preview'
  };
}

designerControls?.addEventListener('input', updatePreview);
designerControls?.addEventListener('change', updatePreview);
document.querySelector('#design-upload')?.addEventListener('change', handleDesignUpload);
document.querySelector('#upload-scale')?.addEventListener('input', (event) => {
  const layer = activeUploadLayer();
  if (!layer) return;
  layer.dataset.scale = String(Number(event.currentTarget.value) / 100);
  applyLayerTransform(layer);
});
document.querySelector('#upload-rotate')?.addEventListener('input', (event) => {
  const layer = activeUploadLayer();
  if (!layer) return;
  layer.dataset.rotate = event.currentTarget.value;
  applyLayerTransform(layer);
});
document.querySelectorAll('[data-layer-action]').forEach((button) => button.addEventListener('click', () => handleLayerAction(button.dataset.layerAction)));
document.querySelectorAll('[data-studio-jump]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.studioJump)?.scrollIntoView({ behavior: 'smooth', block: 'center' })));
document.querySelector('#upload-layer-zone')?.addEventListener('pointerdown', (event) => {
  const layer = event.target.closest('.uploaded-design-layer');
  if (!layer) return;
  selectUploadLayer(layer);
  layer.setPointerCapture(event.pointerId);
  const zone = document.querySelector('#upload-layer-zone').getBoundingClientRect();
  const move = (moveEvent) => {
    const snap = moveEvent.shiftKey ? 10 : 1;
    const x = Math.round(((moveEvent.clientX - zone.left) / zone.width) * 100 / snap) * snap;
    const y = Math.round(((moveEvent.clientY - zone.top) / zone.height) * 100 / snap) * snap;
    layer.style.left = `${Math.max(6, Math.min(94, x))}%`;
    layer.style.top = `${Math.max(6, Math.min(94, y))}%`;
  };
  const stop = () => {
    layer.removeEventListener('pointermove', move);
    layer.removeEventListener('pointerup', stop);
    setDesignerStatus('Layer placement updated. Hold Shift while dragging to snap to 10% placement zones.');
  };
  layer.addEventListener('pointermove', move);
  layer.addEventListener('pointerup', stop);
});
document.querySelector('#save-design')?.addEventListener('click', () => {
  uploadState.saved = exportDesignerOrder();
  localStorage.setItem('muzikazSavedDesign', JSON.stringify(uploadState.saved));
  setDesignerStatus('Design saved as a draft and ready to reload or edit before checkout.');
});
document.querySelector('#load-design')?.addEventListener('click', () => {
  uploadState.saved = JSON.parse(localStorage.getItem('muzikazSavedDesign') || 'null');
  setDesignerStatus(uploadState.saved ? `Loaded saved ${uploadState.saved.product} design summary.` : 'No saved design draft found yet.');
});
document.querySelector('#duplicate-design')?.addEventListener('click', () => {
  const layer = activeUploadLayer();
  if (layer) handleLayerAction('duplicate');
  setDesignerStatus('Design duplicated for reuse on another product template.');
});
document.querySelector('#edit-design')?.addEventListener('click', () => {
  document.querySelector('#product')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setDesignerStatus('Correction mode open: revise product options, text, upload layers, or order notes before finalizing.');
});
document.querySelector('[data-add-custom]')?.addEventListener('click', (event) => {
  const order = exportDesignerOrder();
  const title = `${order.character} ${order.product} custom order`;
  const product = designerProducts.find((item) => item.name === order.product) || { price: 74.99 };
  addCartLine(title, product.price * order.quantity, `Custom merch designer · ${order.uploads.length} upload(s) · ${order.logoStyle}`);
  updateCart(event.currentTarget, 'Design added');
  claimOwnedAsset(title, 'Designer save');
  setDesignerStatus('Checkout-ready custom order added with final summary, text, upload references, quantity, and notes.');
});
document.querySelector('#asset-upload')?.addEventListener('change', (event) => {
  const files = [...event.currentTarget.files].map((file) => `<li>${file.name} → thumbnails, tiles, cards, previews queued</li>`).join('');
  document.querySelector('#asset-list').innerHTML = files || '<li>No files selected</li>';
  [...event.currentTarget.files].forEach((file) => claimOwnedAsset(file.name, 'Uploaded graphic'));
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
  const qty = Math.max(1, Number(document.querySelector('#checkout-qty')?.value) || 1);
  for (let index = 0; index < qty; index += 1) addCartLine(`${character.name} ${product.name}`, product.price, `${document.querySelector('#checkout-size-select')?.value || ''} · ${document.querySelector('#checkout-color-select')?.value || ''}`);
  updateCart(event.currentTarget, 'Checkout added');
  claimOwnedAsset(`${character.name} ${product.name}`, 'Character checkout');
  alert(`${character.name} ${product.name} is in your cart and saved to ${currentMemberEmail || 'the active'} owned collection. Connect this demo checkout to Shopify, Stripe, WooCommerce, or your preferred product checkout.`);
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
syncCartCount();
seedDesigner();

const arCharacterSelect = document.querySelector('#ar-character-select');
const arCharacterStrip = document.querySelector('#ar-character-strip');
const arPreviewImg = document.querySelector('#ar-preview-img');
const arModelViewer = document.querySelector('#ar-model-viewer');
const arFileInput = document.querySelector('#ar-file-input');
const arFileMeta = document.querySelector('#ar-file-meta');
const arPopoutButton = document.querySelector('#ar-popout-button');
let customArFileUrl = '';

function selectedArCharacter() {
  return siteTwoCharacters[Number(arCharacterSelect?.value)] || siteTwoCharacters[0];
}

function updateArViewer(useCustomFile = Boolean(customArFileUrl)) {
  if (!arCharacterSelect) return;
  const character = selectedArCharacter();
  const characterSrc = characterImage(character);
  document.querySelector('#ar-character-name').textContent = `${character.name} AR viewer`;
  document.querySelector('#ar-character-copy').textContent = `${character.bio} Open the highlighted pop-out button to launch this character preview on iPhone Quick Look or Android Scene Viewer when a GLB/USDZ AR file is available.`;
  if (arPreviewImg) {
    arPreviewImg.src = characterSrc;
    arPreviewImg.hidden = useCustomFile && /\.(glb|gltf|usdz|reality)$/i.test(customArFileUrl);
  }
  if (arModelViewer) {
    const isModelFile = useCustomFile && /\.(glb|gltf|usdz|reality)$/i.test(customArFileUrl);
    arModelViewer.hidden = !isModelFile;
    if (isModelFile) {
      if (/\.usdz$/i.test(customArFileUrl) || /\.reality$/i.test(customArFileUrl)) {
        arModelViewer.setAttribute('ios-src', customArFileUrl);
      } else {
        arModelViewer.src = customArFileUrl;
      }
      arModelViewer.poster = characterSrc;
    }
  }
  document.querySelectorAll('[data-ar-character]').forEach((button) => button.classList.toggle('active', button.dataset.arCharacter === arCharacterSelect.value));
  if (arFileMeta && !customArFileUrl) arFileMeta.textContent = `Previewing ${character.name} from the built-in collection artwork.`;
}

function seedArViewer() {
  if (!arCharacterSelect || !arCharacterStrip) return;
  arCharacterSelect.innerHTML = siteTwoCharacters.map((character, index) => `<option value="${index}">${character.name}</option>`).join('');
  arCharacterStrip.innerHTML = siteTwoCharacters.map((character, index) => `
    <button class="ar-character-chip" type="button" data-ar-character="${index}">
      <img src="${characterImage(character)}" alt="${character.name}"><span>${character.name}</span>
    </button>`).join('');
  updateArViewer(false);
}

arCharacterSelect?.addEventListener('change', () => {
  customArFileUrl = '';
  updateArViewer(false);
});
arCharacterStrip?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-ar-character]');
  if (!button || !arCharacterSelect) return;
  arCharacterSelect.value = button.dataset.arCharacter;
  customArFileUrl = '';
  updateArViewer(false);
});
arFileInput?.addEventListener('change', (event) => {
  const [file] = event.currentTarget.files;
  if (!file) return;
  if (customArFileUrl) URL.revokeObjectURL(customArFileUrl);
  customArFileUrl = URL.createObjectURL(file);
  if (arFileMeta) arFileMeta.textContent = `${file.name} loaded for ${selectedArCharacter().name}.`;
  if (/^image\//.test(file.type)) {
    if (arPreviewImg) {
      arPreviewImg.hidden = false;
      arPreviewImg.src = customArFileUrl;
    }
    if (arModelViewer) arModelViewer.hidden = true;
  } else {
    updateArViewer(true);
  }
});
arPopoutButton?.addEventListener('click', () => {
  if (arModelViewer && !arModelViewer.hidden && typeof arModelViewer.activateAR === 'function') {
    arModelViewer.activateAR();
    return;
  }
  const character = selectedArCharacter();
  const popup = window.open('', `muzikaz-ar-${character.file}`, 'popup,width=430,height=740');
  if (!popup) {
    alert('Allow pop-ups to open the AR viewer window. Upload a GLB or USDZ file for native AR launch on mobile.');
    return;
  }
  popup.document.write(`<!doctype html><title>${character.name} AR Preview</title><style>body{margin:0;background:#020302;color:#9cff00;font-family:system-ui;text-align:center;text-transform:uppercase}main{min-height:100vh;display:grid;place-items:center;padding:18px}img{max-width:100%;max-height:72vh;object-fit:contain;filter:drop-shadow(0 20px 30px #000)}p{text-transform:none;color:#fff}</style><main><div><h1>${character.name}</h1><img src="${arPreviewImg?.src || characterImage(character)}" alt="${character.name}"><p>Upload a GLB, GLTF, USDZ, or Reality file in the main page to launch native AR on iPhone or Android.</p></div></main>`);
  popup.document.close();
});

function initBottleLogin() {
  const form = document.querySelector('#bottle-login-form');
  const lockedContent = document.querySelector('#member-locked-content');
  const status = document.querySelector('#bottle-login-status');
  if (!form || !lockedContent) return;
  const unlock = (message) => {
    lockedContent.dataset.locked = 'false';
    if (status) status.textContent = message;
  };
  if (window.localStorage.getItem('muzikazBottleMember') === 'true') {
    currentMemberEmail = normalizeMemberEmail(window.localStorage.getItem('muzikazBottleMemberEmail') || currentMemberEmail || 'crew@muzikaz.example');
    unlock(`Bottle member access is active for ${currentMemberEmail}. Subscriber tools are unlocked.`);
    renderOwnedCollection(currentMemberEmail);
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    currentMemberEmail = normalizeMemberEmail(data.get('email'));
    window.localStorage.setItem('muzikazBottleMember', 'true');
    window.localStorage.setItem('muzikazBottleMemberEmail', currentMemberEmail);
    renderOwnedCollection(currentMemberEmail);
    unlock(`${currentMemberEmail} is logged in. Owned assets are tied to this account, and shared member collections are viewable.`);
    scrollToSection('member-locked-content');
  });
}

marketQualityToggle?.addEventListener('change', () => renderMarketplace());
renderMarketplace();
seedCharacterCheckout();
seedArViewer();
document.querySelector('#owned-profile-select')?.addEventListener('change', (event) => renderOwnedCollection(event.currentTarget.value));
renderOwnedCollection();
initBottleLogin();

const checkoutItems = document.querySelector('#checkout-items');
const paymentForm = document.querySelector('#payment-form');

function formatCheckoutMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function renderCheckoutPage() {
  if (!checkoutItems) return;
  const items = readCart();
  if (!items.length) {
    checkoutItems.innerHTML = '<article class="empty-cart"><strong>Your cart is empty.</strong><span>Add models or merch before processing checkout.</span></article>';
  } else {
    checkoutItems.innerHTML = items.map((item) => `
      <article class="checkout-item">
        <div><strong>${item.name}</strong><span>${item.meta || 'MUZIKAZ store item'} · Qty ${item.quantity}</span></div>
        <b>${formatCheckoutMoney(item.price * item.quantity)}</b>
      </article>`).join('');
  }
  const subtotal = items.reduce((total, item) => total + (item.price * item.quantity), 0);
  const shipping = subtotal > 0 && subtotal < 75 ? 8.95 : 0;
  const tax = subtotal * 0.0825;
  const total = subtotal + shipping + tax;
  document.querySelector('#summary-subtotal').textContent = formatCheckoutMoney(subtotal);
  document.querySelector('#summary-shipping').textContent = subtotal ? (shipping ? formatCheckoutMoney(shipping) : 'Free') : '$0.00';
  document.querySelector('#summary-tax').textContent = formatCheckoutMoney(tax);
  document.querySelector('#summary-total').textContent = formatCheckoutMoney(total);
  document.querySelector('#pay-button-total').textContent = formatCheckoutMoney(total);
  document.querySelector('#pay-button').disabled = !items.length;
}

document.querySelector('#checkout-clear-cart')?.addEventListener('click', () => {
  writeCart([]);
  renderCheckoutPage();
  document.querySelector('#payment-status').textContent = 'Cart cleared. Add products to process a new payment.';
});

paymentForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const items = readCart();
  const status = document.querySelector('#payment-status');
  if (!items.length) {
    status.textContent = 'Add at least one item before processing payment.';
    return;
  }
  if (!paymentForm.reportValidity()) return;
  const data = new FormData(paymentForm);
  const orderId = `MZ-${Date.now().toString().slice(-6)}`;
  const total = document.querySelector('#summary-total').textContent;
  const receipt = { orderId, total, email: data.get('email'), items, paidAt: new Date().toISOString(), method: data.get('method') };
  window.localStorage.setItem('muzikazLastReceipt', JSON.stringify(receipt));
  items.forEach((item) => claimOwnedAsset(item.name, `Paid order ${orderId}`));
  writeCart([]);
  renderCheckoutPage();
  status.textContent = `Payment processed for ${total}. Receipt ${orderId} sent to ${data.get('email')}.`;
  document.querySelector('#confirmation-copy').textContent = `Receipt ${orderId} is confirmed for ${total} by ${data.get('method')}. Your ${items.length} cart line${items.length === 1 ? '' : 's'} are ready for fulfillment.`;
  document.querySelector('#confirmation-panel').hidden = false;
  document.querySelector('#confirmation-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
  paymentForm.reset();
});

renderCheckoutPage();

function initPublicModelExplorer() {
  const viewer = document.querySelector('#public-model-viewer');
  const fileInput = document.querySelector('#public-model-file');
  const status = document.querySelector('#public-model-status');
  const lockButton = document.querySelector('#lock-model-button');
  const unlockButton = document.querySelector('#unlock-model-button');
  const resetButton = document.querySelector('#reset-view-button');
  const centerButton = document.querySelector('#center-cursor-button');
  const summary = document.querySelector('#locked-model-summary');
  const environmentSelect = document.querySelector('#environment-select');
  const zoomRange = document.querySelector('#zoom-range');
  const scaleRange = document.querySelector('#scale-range');
  const scaleOutput = document.querySelector('#scale-output');
  const cursorSelect = document.querySelector('#cursor-select');
  const cursorModel = document.querySelector('#cursor-model');
  const floorGrid = document.querySelector('#floor-grid');
  const floorTarget = document.querySelector('#floor-target');
  if (!viewer || !floorGrid || !cursorModel) return;

  const lockKey = 'muzikazPublicLockedModel';
  const state = {
    name: 'Default Astronaut GLB/USDZ demo',
    source: viewer.getAttribute('src') || '',
    iosSource: viewer.getAttribute('ios-src') || '',
    zoom: 105,
    scale: 100,
    cursor: cursorModel.textContent || '🐺',
    cursorLabel: 'Legends wolf',
    cursorX: 50,
    cursorY: 64,
    environment: 'neutral',
  };

  function updateScaleZoom() {
    const scaleValue = Number(scaleRange?.value || state.scale);
    const zoomValue = Number(zoomRange?.value || state.zoom);
    state.scale = scaleValue;
    state.zoom = zoomValue;
    const modelScale = scaleValue / 100;
    viewer.setAttribute('scale', `${modelScale} ${modelScale} ${modelScale}`);
    viewer.setAttribute('camera-orbit', `0deg 75deg ${zoomValue}%`);
    cursorModel.style.setProperty('--cursor-scale', String(Math.max(.7, Math.min(1.5, modelScale))));
    if (scaleOutput) scaleOutput.textContent = `Scale ${scaleValue}% · Zoom ${zoomValue}%`;
  }

  function setCursorPosition(x, y) {
    state.cursorX = Math.max(4, Math.min(96, x));
    state.cursorY = Math.max(12, Math.min(88, y));
    cursorModel.style.setProperty('--cursor-x', `${state.cursorX}%`);
    cursorModel.style.setProperty('--cursor-y', `${state.cursorY}%`);
    floorTarget?.style.setProperty('--target-x', `${state.cursorX}%`);
    floorTarget?.style.setProperty('--target-y', `${state.cursorY}%`);
    if (status) status.textContent = `${state.cursorLabel} cursor moved to floor position ${Math.round(state.cursorX)}%, ${Math.round(state.cursorY)}%.`;
  }

  function setEnvironment(value) {
    state.environment = value;
    const maps = { neutral: 'neutral', legacy: 'legacy', moon: 'moon_1k' };
    viewer.setAttribute('environment-image', maps[value] || 'neutral');
    viewer.setAttribute('skybox-image', value === 'moon' ? 'moon_1k' : '');
    if (status) status.textContent = `${value} stage lighting selected.`;
  }

  function renderLockedSummary() {
    const locked = JSON.parse(window.localStorage.getItem(lockKey) || 'null');
    if (!summary) return;
    summary.textContent = locked ? `Locked: ${locked.name} with ${locked.cursorLabel} cursor, ${locked.scale}% scale, ${locked.zoom}% zoom, floor ${Math.round(locked.cursorX)}% / ${Math.round(locked.cursorY)}%.` : 'No public model is locked yet.';
  }

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    state.name = file.name;
    if (file.name.toLowerCase().endsWith('.usdz') || file.name.toLowerCase().endsWith('.reality')) {
      viewer.setAttribute('ios-src', url);
      state.iosSource = url;
      if (status) status.textContent = `${file.name} is loaded as an iOS AR file. Add a GLB too for full browser preview.`;
    } else {
      viewer.setAttribute('src', url);
      state.source = url;
      if (status) status.textContent = `${file.name} is loaded. Rotate, zoom, scale, walk the cursor, then lock it in.`;
    }
  });

  floorGrid.addEventListener('pointerdown', (event) => {
    const rect = floorGrid.getBoundingClientRect();
    setCursorPosition(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
  });

  cursorSelect?.addEventListener('change', () => {
    const selected = cursorSelect.selectedOptions[0];
    state.cursor = cursorSelect.value;
    state.cursorLabel = selected?.dataset.label || selected?.textContent || 'Selected model';
    cursorModel.textContent = state.cursor;
    if (status) status.textContent = `${state.cursorLabel} is now the floor cursor model.`;
  });

  scaleRange?.addEventListener('input', updateScaleZoom);
  zoomRange?.addEventListener('input', updateScaleZoom);
  environmentSelect?.addEventListener('change', () => setEnvironment(environmentSelect.value));
  centerButton?.addEventListener('click', () => setCursorPosition(50, 64));
  resetButton?.addEventListener('click', () => {
    if (scaleRange) scaleRange.value = '100';
    if (zoomRange) zoomRange.value = '105';
    updateScaleZoom();
    setCursorPosition(50, 64);
    viewer.cameraOrbit = '0deg 75deg 105%';
    viewer.jumpCameraToGoal?.();
  });
  lockButton?.addEventListener('click', () => {
    updateScaleZoom();
    window.localStorage.setItem(lockKey, JSON.stringify({ ...state, lockedAt: new Date().toISOString() }));
    renderLockedSummary();
    if (status) status.textContent = `${state.name} is locked in with ${state.cursorLabel} as the move cursor.`;
  });
  unlockButton?.addEventListener('click', () => {
    window.localStorage.removeItem(lockKey);
    renderLockedSummary();
    if (status) status.textContent = 'Public model selection unlocked. Pick or upload another model.';
  });

  updateScaleZoom();
  setCursorPosition(state.cursorX, state.cursorY);
  renderLockedSummary();
}

initPublicModelExplorer();

function initHouseExplorer() {
  const canvas = document.querySelector('#house-explorer-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext('2d');
  const status = document.querySelector('#house-status');
  const resetButton = document.querySelector('#house-reset');
  const avatarButton = document.querySelector('#add-avatar');
  const handButton = document.querySelector('#hand-toggle');
  const preview = document.querySelector('#hand-preview');
  const handStatus = document.querySelector('#hand-status');
  const keys = new Set();
  const defaultCamera = { x: 0, y: 1.55, z: -6.2, yaw: 0, pitch: -0.03, fov: 520 };
  const camera = { ...defaultCamera };
  const avatars = [{ x: 2.2, z: 1.4, hue: 92 }, { x: -2.7, z: 5.8, hue: 175 }];
  const walls = [
    [[-5, 0], [5, 0]], [[5, 0], [5, 9]], [[5, 9], [-5, 9]], [[-5, 9], [-5, 0]],
    [[-1.6, 0], [-1.6, 3.2]], [[1.8, 3.2], [5, 3.2]], [[-5, 5.9], [1.1, 5.9]], [[1.1, 5.9], [1.1, 9]],
  ];
  let dragging = false;
  let lastPointer = null;
  let handEnabled = false;
  let handStream = null;
  let handController = null;

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src=\"${src}\"]`);
      if (existing) { resolve(); return; }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  }

  async function startMediaPipeHands() {
    await Promise.all([
      loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js'),
      loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'),
    ]);
    if (!window.Hands || !window.Camera || !preview) return false;
    const hands = new window.Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: .65, minTrackingConfidence: .55 });
    hands.onResults((results) => {
      const tip = results.multiHandLandmarks?.[0]?.[8];
      if (!tip) return;
      camera.yaw += (tip.x - .5) * .035;
      camera.pitch = Math.max(-.8, Math.min(.55, camera.pitch + (tip.y - .5) * .025));
      if (tip.y < .34) move('forward', .08);
      if (tip.y > .72) move('back', .08);
    });
    handController = new window.Camera(preview, { onFrame: async () => hands.send({ image: preview }), width: 320, height: 180 });
    handController.start();
    return true;
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(320, Math.floor(rect.width * ratio));
    canvas.height = Math.max(240, Math.floor(rect.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function project(point) {
    const dx = point.x - camera.x;
    const dy = point.y - camera.y;
    const dz = point.z - camera.z;
    const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw);
    const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
    const x = dx * cy - dz * sy;
    const z = dx * sy + dz * cy;
    const y = dy * cp - z * sp;
    const depth = dy * sp + z * cp;
    if (depth <= 0.12) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.width / 2 + (x * camera.fov) / depth, y: rect.height / 2 - (y * camera.fov) / depth, d: depth };
  }

  function drawPolygon(points, fill, stroke = 'rgba(156,255,0,.22)') {
    const projected = points.map(project);
    if (projected.some((p) => !p)) return;
    ctx.beginPath();
    projected.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  }

  function drawLine(a, b, color, width = 2) {
    const pa = project(a), pb = project(b);
    if (!pa || !pb) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  function render() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
    gradient.addColorStop(0, '#06110c'); gradient.addColorStop(1, '#010201');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, rect.width, rect.height);
    drawPolygon([{x:-5,y:0,z:0},{x:5,y:0,z:0},{x:5,y:0,z:9},{x:-5,y:0,z:9}], 'rgba(12,24,16,.94)');
    drawPolygon([{x:-5,y:3,z:0},{x:-5,y:3,z:9},{x:5,y:3,z:9},{x:5,y:3,z:0}], 'rgba(4,12,10,.72)');
    for (let i = -5; i <= 5; i += 1) drawLine({x:i,y:.01,z:0},{x:i,y:.01,z:9}, 'rgba(156,255,0,.13)', 1);
    for (let z = 0; z <= 9; z += 1) drawLine({x:-5,y:.01,z},{x:5,y:.01,z}, 'rgba(156,255,0,.13)', 1);
    walls.forEach(([a, b]) => drawPolygon([{x:a[0],y:0,z:a[1]},{x:b[0],y:0,z:b[1]},{x:b[0],y:2.7,z:b[1]},{x:a[0],y:2.7,z:a[1]}], 'rgba(14,35,27,.82)', 'rgba(156,255,0,.45)'));
    avatars.forEach((avatar) => {
      const p = project({ x: avatar.x, y: .95, z: avatar.z });
      if (!p) return;
      const size = Math.max(10, 240 / p.d);
      ctx.fillStyle = `hsl(${avatar.hue} 100% 58%)`; ctx.shadowBlur = 18; ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(p.x, p.y - size * .6, size * .28, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(p.x - size * .22, p.y - size * .35, size * .44, size * .85); ctx.shadowBlur = 0;
    });
    requestAnimationFrame(render);
  }

  function move(direction, amount) {
    const forwardX = Math.sin(camera.yaw), forwardZ = Math.cos(camera.yaw);
    const rightX = Math.cos(camera.yaw), rightZ = -Math.sin(camera.yaw);
    if (direction === 'forward') { camera.x += forwardX * amount; camera.z += forwardZ * amount; }
    if (direction === 'back') { camera.x -= forwardX * amount; camera.z -= forwardZ * amount; }
    if (direction === 'right') { camera.x += rightX * amount; camera.z += rightZ * amount; }
    if (direction === 'left') { camera.x -= rightX * amount; camera.z -= rightZ * amount; }
    camera.x = Math.max(-4.5, Math.min(4.5, camera.x)); camera.z = Math.max(-.4, Math.min(8.5, camera.z));
  }

  function tickMovement() {
    const speed = .065;
    if (keys.has('w') || keys.has('arrowup')) move('forward', speed);
    if (keys.has('s') || keys.has('arrowdown')) move('back', speed);
    if (keys.has('a') || keys.has('arrowleft')) move('left', speed);
    if (keys.has('d') || keys.has('arrowright')) move('right', speed);
    if (keys.has('q')) camera.y = Math.max(.8, camera.y - .025);
    if (keys.has('e')) camera.y = Math.min(2.4, camera.y + .025);
    requestAnimationFrame(tickMovement);
  }

  canvas.addEventListener('pointerdown', (event) => { dragging = true; lastPointer = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging || !lastPointer) return;
    camera.yaw += (event.clientX - lastPointer.x) * .005;
    camera.pitch = Math.max(-.8, Math.min(.55, camera.pitch + (event.clientY - lastPointer.y) * .004));
    lastPointer = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', () => { dragging = false; lastPointer = null; });
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); camera.fov = Math.max(320, Math.min(760, camera.fov - event.deltaY * .25)); }, { passive: false });
  document.addEventListener('keydown', (event) => keys.add(event.key.toLowerCase()));
  document.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  document.querySelectorAll('[data-mobile-move]').forEach((button) => button.addEventListener('click', () => move(button.dataset.mobileMove, .42)));
  resetButton?.addEventListener('click', () => { Object.assign(camera, defaultCamera); avatars.splice(0, avatars.length, { x: 2.2, z: 1.4, hue: 92 }, { x: -2.7, z: 5.8, hue: 175 }); setStatus('Explorer reset to the default inside-camera view.'); });
  avatarButton?.addEventListener('click', () => { avatars.push({ x: (Math.random() * 8) - 4, z: Math.random() * 7.5 + .6, hue: Math.floor(Math.random() * 260) + 70 }); setStatus(`Avatar added. Total avatars: ${avatars.length}.`); });
  handButton?.addEventListener('click', async () => {
    handEnabled = !handEnabled; handButton.setAttribute('aria-pressed', String(handEnabled)); handButton.textContent = handEnabled ? 'Disable hand control' : 'Enable hand control';
    if (!handEnabled) { handController?.stop?.(); handStream?.getTracks().forEach((track) => track.stop()); handStream = null; if (handStatus) handStatus.textContent = 'Camera preview inactive. MediaPipe Hands loads only when enabled.'; return; }
    try {
      handStream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (preview) { preview.srcObject = handStream; await preview.play(); }
      const mediaPipeReady = await startMediaPipeHands();
      if (handStatus) handStatus.textContent = mediaPipeReady ? 'MediaPipe Hands active: move your index finger to steer the camera.' : 'Camera preview enabled; MediaPipe Hands could not be loaded, so manual controls remain active.';
    }
    catch (error) { handEnabled = false; handButton.setAttribute('aria-pressed', 'false'); if (handStatus) handStatus.textContent = 'Camera or MediaPipe unavailable; keyboard, mouse, and mobile controls still work.'; }
  });
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas(); render(); tickMovement();
}

initHouseExplorer();
