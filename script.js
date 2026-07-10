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
const productPrintTemplates = {
  'avatar-stickers': { shape: 'sheet', label: 'Sticker sheet cutlines · drag art onto any sticker' },
  hoodie: { shape: 'front', label: 'Hoodie front print zone · chest-safe placement' },
  cap: { shape: 'patch', label: 'Cap badge / patch print zone' },
  bottle: { shape: 'wrap', label: 'Bottle wrap label print zone' },
  keychain: { shape: 'patch', label: 'Keychain charm print zone' },
  wristband: { shape: 'wrap', label: 'Wristband repeat print zone' },
  lanyard: { shape: 'wrap', label: 'Lanyard repeat print zone' },
  'hero-banner': { shape: 'poster', label: 'Banner safe area · edge bleed visible' },
  'tagline-tee': { shape: 'front', label: 'Tee front print zone' },
  'event-pass': { shape: 'poster', label: 'Event pass safe area' },
  'logo-patch': { shape: 'patch', label: 'Patch embroidery / print shape' },
  'wordmark-print': { shape: 'poster', label: 'Wall art safe area' }
};
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
  const selectedShape = data.get('printShape') === 'auto' ? (productPrintTemplates[product.id]?.shape || 'front') : data.get('printShape');
  mockup?.setAttribute('data-product-template', product.id);
  mockup?.setAttribute('data-print-shape', selectedShape);
  document.querySelector('#print-template-label').textContent = productPrintTemplates[product.id]?.label || `${product.name} print zone`;
  document.querySelector('#sticker-stage')?.setAttribute('data-print-shape', selectedShape);
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
    printShape: data.get('printShape'),
    quantity: Number(data.get('quantity') || 1),
    notes: data.get('notes') || '',
    uploads: uploadState.layers.map(({ id, name }) => ({ id, name })),
    preview: 'Live product-specific print template with draggable layers'
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
function stagePercentPosition(pointerEvent, stage, dragStart, snap) {
  const stageRect = stage.getBoundingClientRect();
  const targetX = pointerEvent.clientX - dragStart.offsetX + dragStart.anchorX;
  const targetY = pointerEvent.clientY - dragStart.offsetY + dragStart.anchorY;
  const rawX = ((targetX - stageRect.left) / stageRect.width) * 100;
  const rawY = ((targetY - stageRect.top) / stageRect.height) * 100;
  return {
    x: Math.round(rawX / snap) * snap,
    y: Math.round(rawY / snap) * snap
  };
}

function enableStickerStageDragging() {
  const stage = document.querySelector('#sticker-stage');
  if (!stage) return;
  stage.addEventListener('pointerdown', (event) => {
    const layer = event.target.closest('.sticker-cutline');
    if (!layer || !stage.contains(layer)) return;
    event.preventDefault();
    const isUploadedLayer = layer.classList.contains('uploaded-design-layer');
    if (isUploadedLayer) selectUploadLayer(layer);
    layer.classList.add('active');
    layer.setPointerCapture?.(event.pointerId);
    layer.style.right = 'auto';
    layer.style.bottom = 'auto';
    const layerRect = layer.getBoundingClientRect();
    const dragStart = {
      offsetX: event.clientX - layerRect.left,
      offsetY: event.clientY - layerRect.top,
      anchorX: isUploadedLayer ? layerRect.width / 2 : 0,
      anchorY: isUploadedLayer ? layerRect.height / 2 : 0
    };
    const move = (moveEvent) => {
      const snap = moveEvent.shiftKey ? 10 : 1;
      const { x, y } = stagePercentPosition(moveEvent, stage, dragStart, snap);
      layer.style.left = `${Math.max(0, Math.min(94, x))}%`;
      layer.style.top = `${Math.max(0, Math.min(94, y))}%`;
    };
    const stop = () => {
      layer.releasePointerCapture?.(event.pointerId);
      layer.removeEventListener('pointermove', move);
      layer.removeEventListener('pointerup', stop);
      layer.removeEventListener('pointercancel', stop);
      if (!layer.classList.contains('uploaded-design-layer')) layer.classList.remove('active');
      setDesignerStatus('Sticker placement updated. Drag any sticker or upload again; hold Shift to snap to 10% zones.');
    };
    layer.addEventListener('pointermove', move);
    layer.addEventListener('pointerup', stop);
    layer.addEventListener('pointercancel', stop);
  });
}

enableStickerStageDragging();
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
  setDesignerStatus('Correction mode open: choose a product, print shape, text, uploads, and drag layers directly on the selected item template before finalizing.');
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
  const presenceCount = document.querySelector('#house-presence-count');
  const keys = new Set();
  const HOUSE_ID = 'ioncore-house';
  const API_BASE = window.MUZIKAZ_SHARED_AVATAR_API || '';
  const defaultCamera = { x: 0, y: 1.55, z: -6.2, yaw: 0, pitch: -0.03, fov: 520 };
  const camera = { ...defaultCamera };
  const demoAvatars = [{ x: 2.2, z: 1.4, hue: 92 }, { x: -2.7, z: 5.8, hue: 175 }];
  const walls = [[[-5, 0], [5, 0]], [[5, 0], [5, 9]], [[5, 9], [-5, 9]], [[-5, 9], [-5, 0]], [[-1.6, 0], [-1.6, 3.2]], [[1.8, 3.2], [5, 3.2]], [[-5, 5.9], [1.1, 5.9]], [[1.1, 5.9], [1.1, 9]]];
  const sharedAvatarObjects = new Map();
  const avatarPlacementState = { active: false, previewObject: null, selectedAvatar: null, position: { x: 0, y: 0, z: 2.5 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
  window.sharedAvatarObjects = sharedAvatarObjects;
  let dragging = false, lastPointer = null, handEnabled = false, handStream = null, handController = null, lastPresenceAt = 0;
  const sessionId = getSessionId();

  function getSessionId() { const key = 'muzikazHouseSessionId'; let id = window.localStorage.getItem(key); if (!id) { id = (crypto.randomUUID && crypto.randomUUID()) || 'session-' + Date.now() + '-' + Math.random().toString(16).slice(2); window.localStorage.setItem(key, id); } return id; }
  function setStatus(message) { if (status) status.textContent = message; }
  function showAvatarStatus(message) { setStatus(message); }
  function hideAvatarStatus() { setStatus('Ready: drag to look around, then move through the rooms.'); }
  function safeText(value, fallback = '') { return String(value || fallback).replace(/[<>]/g, '').slice(0, 140); }
  function calculateRoomId(position) { if (position.z < 3.2 && position.x < -1.6) return 'front-west'; if (position.z < 3.2) return 'front-hall'; if (position.z < 5.9) return 'middle-gallery'; return position.x < 1.1 ? 'back-lounge' : 'back-east'; }
  function clampPosition(position) { return { x: Math.max(-4.65, Math.min(4.65, Number(position.x) || 0)), y: 0, z: Math.max(.35, Math.min(8.65, Number(position.z) || 0)) }; }
  function sanitizeAvatarRecord(record) { if (!record || record.houseId !== HOUSE_ID) return null; const position = clampPosition(record.position || {}); const scaleValue = Math.max(.35, Math.min(2.4, Number(record.scale?.x) || 1)); const url = String(record.avatarUrl || ''); if (/^javascript:/i.test(url)) return null; return { id: safeText(record.id, (crypto.randomUUID && crypto.randomUUID()) || String(Date.now())), houseId: HOUSE_ID, ownerId: safeText(record.ownerId, sessionId), username: safeText(record.username, 'Guest'), avatarName: safeText(record.avatarName, 'Shared avatar'), avatarType: safeText(record.avatarType, 'image-sprite'), avatarUrl: url, thumbnailUrl: String(record.thumbnailUrl || ''), message: safeText(record.message, ''), position, rotation: { x: 0, y: 0, z: Number(record.rotation?.z) || 0 }, scale: { x: scaleValue, y: scaleValue, z: scaleValue }, roomId: safeText(record.roomId, calculateRoomId(position)), visibility: 'public', createdAt: record.createdAt || new Date().toISOString(), updatedAt: record.updatedAt || new Date().toISOString() }; }
  function validateAvatarPlacement() { const p = clampPosition(avatarPlacementState.position); avatarPlacementState.position = p; return Number.isFinite(p.x) && Number.isFinite(p.z); }
  function loadImage(url) { if (!url) return null; const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; return img; }
  function createAvatarSceneObject(record) { return { record, image: loadImage(record.avatarUrl), selected: false, kind: 'shared-avatar' }; }
  function renderSharedAvatar(record) { const safe = sanitizeAvatarRecord(record); if (!safe) return; if (sharedAvatarObjects.has(safe.id)) { updateSharedAvatar(safe); return; } sharedAvatarObjects.set(safe.id, createAvatarSceneObject(safe)); }
  function updateSharedAvatar(record) { const safe = sanitizeAvatarRecord(record); if (!safe) return; const existing = sharedAvatarObjects.get(safe.id); if (!existing) { renderSharedAvatar(safe); return; } existing.record = safe; if (existing.image?.src !== safe.avatarUrl) existing.image = loadImage(safe.avatarUrl); }
  function removeSharedAvatar(avatarId) { sharedAvatarObjects.delete(avatarId); closeAvatarInfoPanel(); }
  function focusCameraOnAvatar(avatarId) { const object = sharedAvatarObjects.get(avatarId); if (!object) return; camera.x = object.record.position.x; camera.z = Math.max(-.2, object.record.position.z - 2.2); camera.yaw = 0; camera.pitch = -.06; setStatus('Focused on ' + object.record.avatarName + '.'); }
  function drawAvatarObject(object, isPreview = false) { const record = object.record; const feet = project({ x: record.position.x, y: 0, z: record.position.z }); const head = project({ x: record.position.x, y: 1.85 * record.scale.y, z: record.position.z }); if (!feet || !head) return null; const height = Math.max(26, Math.abs(feet.y - head.y)); const width = height * .58; ctx.save(); ctx.translate(feet.x, feet.y); ctx.rotate(record.rotation.z || 0); ctx.globalAlpha = isPreview ? .72 : 1; ctx.shadowBlur = object.selected || isPreview ? 22 : 10; ctx.shadowColor = isPreview ? '#9cff00' : 'rgba(156,255,0,.65)'; if (object.image?.complete && object.image.naturalWidth) ctx.drawImage(object.image, -width / 2, -height, width, height); else { ctx.fillStyle = isPreview ? 'rgba(156,255,0,.9)' : '#9cff00'; ctx.beginPath(); ctx.arc(0, -height * .78, width * .24, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-width * .28, -height * .62, width * .56, height * .58); } ctx.restore(); if (object.selected || isPreview) { ctx.strokeStyle = '#9cff00'; ctx.lineWidth = 2; ctx.strokeRect(feet.x - width / 2, feet.y - height, width, height); } return { x: feet.x, y: feet.y - height / 2, width, height, depth: feet.d }; }
  function screenToFloor(clientX, clientY) { const rect = canvas.getBoundingClientRect(); const sx = clientX - rect.left - rect.width / 2, screenY = rect.height / 2 - (clientY - rect.top); const cy = Math.cos(camera.yaw), syaw = Math.sin(camera.yaw), cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch); const camX = sx / camera.fov, camY = screenY / camera.fov, camZ = 1; const ry = camY * cp + camZ * sp, rzPitch = -camY * sp + camZ * cp; const rx = camX * cy + rzPitch * syaw, rz = -camX * syaw + rzPitch * cy; if (Math.abs(ry) < .0001) return null; const t = -camera.y / ry; if (t <= 0) return null; return clampPosition({ x: camera.x + rx * t, y: 0, z: camera.z + rz * t }); }
  function openAvatarPlacementPanel() { ensureAvatarPanel(); document.querySelector('#avatar-placement-panel').hidden = false; setStatus('Choose or upload an avatar, then tap a valid floor location.'); }
  function createAvatarPreview() { const record = sanitizeAvatarRecord({ id: 'preview-avatar', houseId: HOUSE_ID, ownerId: sessionId, username: 'You', avatarName: avatarPlacementState.selectedAvatar?.name || 'Preview avatar', avatarType: 'image-sprite', avatarUrl: avatarPlacementState.selectedAvatar?.url || 'logo_symbol_crop_2x_transparent.png', position: avatarPlacementState.position, rotation: avatarPlacementState.rotation, scale: avatarPlacementState.scale }); avatarPlacementState.previewObject = createAvatarSceneObject(record); }
  function startAvatarPlacement() { avatarPlacementState.active = true; avatarPlacementState.selectedAvatar ||= { name: 'MUZIKAZ Bolt', url: 'logo_symbol_crop_2x_transparent.png' }; createAvatarPreview(); setStatus('Placement mode active: click or tap the house floor to position the avatar.'); }
  function updateAvatarPreviewPosition(position) { if (!avatarPlacementState.active) return; avatarPlacementState.position = clampPosition(position); if (avatarPlacementState.previewObject) { avatarPlacementState.previewObject.record.position = avatarPlacementState.position; avatarPlacementState.previewObject.record.roomId = calculateRoomId(avatarPlacementState.position); } }
  async function publishPlacedAvatar() { if (!validateAvatarPlacement()) { setStatus('Choose a floor location inside the house before publishing.'); return; } const payload = sanitizeAvatarRecord({ id: (crypto.randomUUID && crypto.randomUUID()) || 'avatar-' + Date.now(), houseId: HOUSE_ID, ownerId: sessionId, username: window.localStorage.getItem('muzikazBottleMemberEmail') || 'Guest', avatarName: avatarPlacementState.selectedAvatar?.name || 'Shared avatar', avatarType: 'image-sprite', avatarUrl: avatarPlacementState.selectedAvatar?.url || 'logo_symbol_crop_2x_transparent.png', message: document.querySelector('#avatar-caption')?.value || '', position: avatarPlacementState.position, rotation: avatarPlacementState.rotation, scale: avatarPlacementState.scale, roomId: calculateRoomId(avatarPlacementState.position) }); try { const response = await fetch(API_BASE + '/api/houses/' + HOUSE_ID + '/avatars', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': sessionId }, body: JSON.stringify(payload) }); if (!response.ok) throw new Error('publish failed'); renderSharedAvatar(await response.json()); setStatus('Avatar published and activated in the shared 3D House Explorer on the main page. Viewers can watch it live now.'); cancelAvatarPlacement(false); } catch (error) { setStatus('Shared avatars are temporarily offline. The house remains available.'); } }
  async function loadSharedAvatars(houseId) { const response = await fetch(API_BASE + '/api/houses/' + houseId + '/avatars', { headers: { 'X-MUZIKAZ-Session': sessionId } }); if (!response.ok) throw new Error('load failed'); return response.json(); }
  function subscribeToAvatarEvents(houseId) { try { const eventSource = new EventSource(API_BASE + '/api/houses/' + houseId + '/events?sessionId=' + encodeURIComponent(sessionId)); ['avatar-created', 'avatar-updated'].forEach((type) => eventSource.addEventListener(type, (event) => renderSharedAvatar(JSON.parse(event.data)))); eventSource.addEventListener('avatar-deleted', (event) => removeSharedAvatar(JSON.parse(event.data).id)); eventSource.addEventListener('house-presence-updated', (event) => { const data = JSON.parse(event.data); if (presenceCount) presenceCount.textContent = 'Live in the house: ' + (data.count || 1); }); eventSource.onerror = () => setStatus('Shared avatars are temporarily offline.'); } catch (error) { setStatus('Shared avatars are temporarily offline.'); } }
  async function initializeSharedHouseAvatars() { try { showAvatarStatus('Loading shared avatars…'); (await loadSharedAvatars(HOUSE_ID)).map(sanitizeAvatarRecord).filter(Boolean).forEach(renderSharedAvatar); subscribeToAvatarEvents(HOUSE_ID); initializeHousePresence(); hideAvatarStatus(); } catch (error) { setStatus('Shared avatars are temporarily offline.'); } }
  function initializeHousePresence() { const send = () => { const now = Date.now(); if (now - lastPresenceAt < 8000) return; lastPresenceAt = now; fetch(API_BASE + '/api/houses/' + HOUSE_ID + '/presence', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MUZIKAZ-Session': sessionId }, body: JSON.stringify({ roomId: calculateRoomId(camera), lastActiveAt: new Date().toISOString() }) }).catch(() => {}); }; send(); window.setInterval(send, 10000); window.addEventListener('beforeunload', () => navigator.sendBeacon?.(API_BASE + '/api/houses/' + HOUSE_ID + '/presence/leave?sessionId=' + encodeURIComponent(sessionId))); }
  function selectSharedAvatar(avatarId) { sharedAvatarObjects.forEach((object) => { object.selected = object.record.id === avatarId; }); const object = sharedAvatarObjects.get(avatarId); if (object) openAvatarInfoPanel(object.record); }
  function cancelAvatarPlacement(hide = true) { avatarPlacementState.active = false; avatarPlacementState.previewObject = null; if (hide) document.querySelector('#avatar-placement-panel')?.setAttribute('hidden', ''); setStatus('Avatar placement closed. Normal explorer controls restored.'); }
  function ensureAvatarPanel() { if (document.querySelector('#avatar-placement-panel')) return; const panel = document.createElement('div'); panel.id = 'avatar-placement-panel'; panel.className = 'avatar-placement-panel'; panel.hidden = true; panel.innerHTML = '<strong>Place shared avatar</strong><span>Publishing saves this avatar to the live shared 3D House Explorer on the home page and model explorer.</span><label>Avatar asset <select id="avatar-choice"><option value="logo_symbol_crop_2x_transparent.png">MUZIKAZ Bolt</option><option value="reference.png">Reference Character</option><option value="futuristic_armored_wolf_humanoid.png">Ion Wolf</option></select></label><label>Upload image <input id="avatar-upload" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"></label><label>Caption <input id="avatar-caption" maxlength="120" placeholder="Optional caption"></label><div class="avatar-placement-buttons"><button type="button" data-avatar-nudge="forward">Move Avatar</button><button type="button" data-avatar-rotate="-1">Rotate Left</button><button type="button" data-avatar-rotate="1">Rotate Right</button><button type="button" data-avatar-scale="1">Increase Size</button><button type="button" data-avatar-scale="-1">Decrease Size</button><button type="button" id="publish-avatar">Publish Live to Main Page</button><button type="button" id="cancel-avatar">Cancel Placement</button></div>'; canvas.closest('.house-stage')?.append(panel); panel.querySelector('#avatar-choice').addEventListener('change', (event) => { avatarPlacementState.selectedAvatar = { name: event.target.selectedOptions[0].textContent, url: event.target.value }; createAvatarPreview(); }); panel.querySelector('#avatar-upload').addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 3000000) { setStatus('Upload rejected. Use PNG, JPG, or WebP up to 3 MB.'); return; } const form = new FormData(); form.append('avatar', file); try { const response = await fetch(API_BASE + '/api/uploads/avatar', { method: 'POST', headers: { 'X-MUZIKAZ-Session': sessionId }, body: form }); if (!response.ok) throw new Error('upload failed'); const data = await response.json(); avatarPlacementState.selectedAvatar = { name: file.name.replace(/\.[^.]+$/, ''), url: data.avatarUrl }; createAvatarPreview(); } catch { const reader = new FileReader(); reader.onload = () => { avatarPlacementState.selectedAvatar = { name: file.name.replace(/\.[^.]+$/, ''), url: reader.result }; createAvatarPreview(); setStatus('Upload service offline; preview is local and cannot be published until backend returns.'); }; reader.readAsDataURL(file); } }); panel.addEventListener('click', (event) => { const target = event.target; if (!(target instanceof HTMLElement)) return; if (target.dataset.avatarRotate) { avatarPlacementState.rotation.z += Number(target.dataset.avatarRotate) * .18; createAvatarPreview(); } if (target.dataset.avatarScale) { const next = Math.max(.35, Math.min(2.4, avatarPlacementState.scale.x + Number(target.dataset.avatarScale) * .12)); avatarPlacementState.scale = { x: next, y: next, z: next }; createAvatarPreview(); } if (target.id === 'publish-avatar') publishPlacedAvatar(); if (target.id === 'cancel-avatar') cancelAvatarPlacement(); if (target.dataset.avatarNudge) updateAvatarPreviewPosition({ ...avatarPlacementState.position, z: avatarPlacementState.position.z + .25 }); }); }
  function openAvatarInfoPanel(record) { let panel = document.querySelector('#avatar-info-panel'); if (!panel) { panel = document.createElement('div'); panel.id = 'avatar-info-panel'; panel.className = 'avatar-info-panel'; canvas.closest('.house-stage')?.append(panel); } const own = record.ownerId === sessionId; panel.innerHTML = '<strong>' + record.avatarName + '</strong><span>Posted by ' + record.username + '</span><span>' + (record.message || 'No caption') + '</span><span>' + new Date(record.createdAt).toLocaleString() + '</span><button type="button" data-focus="' + record.id + '">Focus camera</button>' + (own ? '<button type="button" data-remove="' + record.id + '">Remove avatar</button>' : ''); panel.hidden = false; panel.onclick = async (event) => { const target = event.target; if (!(target instanceof HTMLElement)) return; if (target.dataset.focus) focusCameraOnAvatar(target.dataset.focus); if (target.dataset.remove) { await fetch(API_BASE + '/api/houses/' + HOUSE_ID + '/avatars/' + target.dataset.remove, { method: 'DELETE', headers: { 'X-MUZIKAZ-Session': sessionId } }).catch(() => {}); removeSharedAvatar(target.dataset.remove); } }; }
  function closeAvatarInfoPanel() { const panel = document.querySelector('#avatar-info-panel'); if (panel) panel.hidden = true; }
  Object.assign(window, { initializeSharedHouseAvatars, openAvatarPlacementPanel, startAvatarPlacement, createAvatarPreview, updateAvatarPreviewPosition, validateAvatarPlacement, publishPlacedAvatar, loadSharedAvatars, subscribeToAvatarEvents, renderSharedAvatar, updateSharedAvatar, removeSharedAvatar, selectSharedAvatar, focusCameraOnAvatar, cancelAvatarPlacement, initializeHousePresence, sanitizeAvatarRecord });
  function loadScriptOnce(src) { return new Promise((resolve, reject) => { const existing = document.querySelector('script[src="' + src + '"]'); if (existing) { resolve(); return; } const script = document.createElement('script'); script.src = src; script.async = true; script.onload = resolve; script.onerror = reject; document.head.append(script); }); }
  async function startMediaPipeHands() { await Promise.all([loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js'), loadScriptOnce('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js')]); if (!window.Hands || !window.Camera || !preview) return false; const hands = new window.Hands({ locateFile: (file) => 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + file }); hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: .65, minTrackingConfidence: .55 }); hands.onResults((results) => { const tip = results.multiHandLandmarks?.[0]?.[8]; if (!tip) return; camera.yaw += (tip.x - .5) * .035; camera.pitch = Math.max(-.8, Math.min(.55, camera.pitch + (tip.y - .5) * .025)); if (tip.y < .34) move('forward', .08); if (tip.y > .72) move('back', .08); }); handController = new window.Camera(preview, { onFrame: async () => hands.send({ image: preview }), width: 320, height: 180 }); handController.start(); return true; }
  function resizeCanvas() { const rect = canvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1; canvas.width = Math.max(320, Math.floor(rect.width * ratio)); canvas.height = Math.max(240, Math.floor(rect.height * ratio)); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); }
  function project(point) { const dx = point.x - camera.x, dy = point.y - camera.y, dz = point.z - camera.z; const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw), cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch); const x = dx * cy - dz * sy, z = dx * sy + dz * cy, y = dy * cp - z * sp, depth = dy * sp + z * cp; if (depth <= 0.12) return null; const rect = canvas.getBoundingClientRect(); return { x: rect.width / 2 + (x * camera.fov) / depth, y: rect.height / 2 - (y * camera.fov) / depth, d: depth }; }
  function drawPolygon(points, fill, stroke = 'rgba(156,255,0,.22)') { const projected = points.map(project); if (projected.some((p) => !p)) return; ctx.beginPath(); projected.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.fill(); ctx.stroke(); }
  function drawLine(a, b, color, width = 2) { const pa = project(a), pb = project(b); if (!pa || !pb) return; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke(); }
  function render() { const rect = canvas.getBoundingClientRect(); ctx.clearRect(0, 0, rect.width, rect.height); const gradient = ctx.createLinearGradient(0, 0, 0, rect.height); gradient.addColorStop(0, '#06110c'); gradient.addColorStop(1, '#010201'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, rect.width, rect.height); drawPolygon([{x:-5,y:0,z:0},{x:5,y:0,z:0},{x:5,y:0,z:9},{x:-5,y:0,z:9}], 'rgba(12,24,16,.94)'); drawPolygon([{x:-5,y:3,z:0},{x:-5,y:3,z:9},{x:5,y:3,z:9},{x:5,y:3,z:0}], 'rgba(4,12,10,.72)'); for (let i = -5; i <= 5; i += 1) drawLine({x:i,y:.01,z:0},{x:i,y:.01,z:9}, 'rgba(156,255,0,.13)', 1); for (let z = 0; z <= 9; z += 1) drawLine({x:-5,y:.01,z},{x:5,y:.01,z}, 'rgba(156,255,0,.13)', 1); walls.forEach(([a, b]) => drawPolygon([{x:a[0],y:0,z:a[1]},{x:b[0],y:0,z:b[1]},{x:b[0],y:2.7,z:b[1]},{x:a[0],y:2.7,z:a[1]}], 'rgba(14,35,27,.82)', 'rgba(156,255,0,.45)')); const hitboxes = []; demoAvatars.forEach((avatar) => { const p = project({ x: avatar.x, y: .95, z: avatar.z }); if (!p) return; const size = Math.max(10, 240 / p.d); ctx.fillStyle = 'hsl(' + avatar.hue + ' 100% 58%)'; ctx.shadowBlur = 18; ctx.shadowColor = ctx.fillStyle; ctx.beginPath(); ctx.arc(p.x, p.y - size * .6, size * .28, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(p.x - size * .22, p.y - size * .35, size * .44, size * .85); ctx.shadowBlur = 0; }); [...sharedAvatarObjects.values()].sort((a,b)=> (project(b.record.position)?.d || 0) - (project(a.record.position)?.d || 0)).forEach((object) => { const box = drawAvatarObject(object); if (box) hitboxes.push({ ...box, id: object.record.id }); }); if (avatarPlacementState.active && avatarPlacementState.previewObject) drawAvatarObject(avatarPlacementState.previewObject, true); canvas._avatarHitboxes = hitboxes; requestAnimationFrame(render); }
  function move(direction, amount) { const forwardX = Math.sin(camera.yaw), forwardZ = Math.cos(camera.yaw), rightX = Math.cos(camera.yaw), rightZ = -Math.sin(camera.yaw); if (direction === 'forward') { camera.x += forwardX * amount; camera.z += forwardZ * amount; } if (direction === 'back') { camera.x -= forwardX * amount; camera.z -= forwardZ * amount; } if (direction === 'right') { camera.x += rightX * amount; camera.z += rightZ * amount; } if (direction === 'left') { camera.x -= rightX * amount; camera.z -= rightZ * amount; } camera.x = Math.max(-4.5, Math.min(4.5, camera.x)); camera.z = Math.max(-.4, Math.min(8.5, camera.z)); }
  function tickMovement() { const speed = .065; if (avatarPlacementState.active) { if (keys.has('w') || keys.has('arrowup')) updateAvatarPreviewPosition({ ...avatarPlacementState.position, z: avatarPlacementState.position.z + speed }); if (keys.has('s') || keys.has('arrowdown')) updateAvatarPreviewPosition({ ...avatarPlacementState.position, z: avatarPlacementState.position.z - speed }); if (keys.has('a') || keys.has('arrowleft')) updateAvatarPreviewPosition({ ...avatarPlacementState.position, x: avatarPlacementState.position.x - speed }); if (keys.has('d') || keys.has('arrowright')) updateAvatarPreviewPosition({ ...avatarPlacementState.position, x: avatarPlacementState.position.x + speed }); if (keys.has('q')) avatarPlacementState.rotation.z -= .025; if (keys.has('e')) avatarPlacementState.rotation.z += .025; } else { if (keys.has('w') || keys.has('arrowup')) move('forward', speed); if (keys.has('s') || keys.has('arrowdown')) move('back', speed); if (keys.has('a') || keys.has('arrowleft')) move('left', speed); if (keys.has('d') || keys.has('arrowright')) move('right', speed); if (keys.has('q')) camera.y = Math.max(.8, camera.y - .025); if (keys.has('e')) camera.y = Math.min(2.4, camera.y + .025); } requestAnimationFrame(tickMovement); }
  canvas.addEventListener('pointerdown', (event) => { const rect = canvas.getBoundingClientRect(); const x = event.clientX - rect.left, y = event.clientY - rect.top; const hit = [...(canvas._avatarHitboxes || [])].reverse().find((box) => x >= box.x - box.width / 2 && x <= box.x + box.width / 2 && y >= box.y - box.height / 2 && y <= box.y + box.height / 2); if (hit && !avatarPlacementState.active) { selectSharedAvatar(hit.id); return; } if (avatarPlacementState.active) { const floor = screenToFloor(event.clientX, event.clientY); if (floor) updateAvatarPreviewPosition(floor); return; } dragging = true; lastPointer = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', (event) => { if (!dragging || !lastPointer || avatarPlacementState.active) return; camera.yaw += (event.clientX - lastPointer.x) * .005; camera.pitch = Math.max(-.8, Math.min(.55, camera.pitch + (event.clientY - lastPointer.y) * .004)); lastPointer = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener('pointerup', () => { dragging = false; lastPointer = null; }); canvas.addEventListener('wheel', (event) => { event.preventDefault(); camera.fov = Math.max(320, Math.min(760, camera.fov - event.deltaY * .25)); }, { passive: false });
  document.addEventListener('keydown', (event) => { if (avatarPlacementState.active && ['+','='].includes(event.key)) { const n = Math.min(2.4, avatarPlacementState.scale.x + .1); avatarPlacementState.scale = { x:n, y:n, z:n }; createAvatarPreview(); } if (avatarPlacementState.active && ['-','_'].includes(event.key)) { const n = Math.max(.35, avatarPlacementState.scale.x - .1); avatarPlacementState.scale = { x:n, y:n, z:n }; createAvatarPreview(); } if (avatarPlacementState.active && event.key === 'Enter') publishPlacedAvatar(); if (avatarPlacementState.active && event.key === 'Escape') cancelAvatarPlacement(); keys.add(event.key.toLowerCase()); }); document.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  document.querySelectorAll('[data-mobile-move]').forEach((button) => button.addEventListener('click', () => move(button.dataset.mobileMove, .42))); resetButton?.addEventListener('click', () => { Object.assign(camera, defaultCamera); setStatus('Explorer reset to the default inside-camera view.'); }); avatarButton?.addEventListener('click', () => { openAvatarPlacementPanel(); startAvatarPlacement(); });
  handButton?.addEventListener('click', async () => { handEnabled = !handEnabled; handButton.setAttribute('aria-pressed', String(handEnabled)); handButton.textContent = handEnabled ? 'Disable hand control' : 'Enable hand control'; if (!handEnabled) { handController?.stop?.(); handStream?.getTracks().forEach((track) => track.stop()); handStream = null; if (handStatus) handStatus.textContent = 'Camera preview inactive. MediaPipe Hands loads only when enabled.'; return; } try { handStream = await navigator.mediaDevices.getUserMedia({ video: true }); if (preview) { preview.srcObject = handStream; await preview.play(); } const mediaPipeReady = await startMediaPipeHands(); if (handStatus) handStatus.textContent = mediaPipeReady ? 'MediaPipe Hands active: move your index finger to steer the camera.' : 'Camera preview enabled; MediaPipe Hands could not be loaded, so manual controls remain active.'; } catch (error) { handEnabled = false; handButton.setAttribute('aria-pressed', 'false'); if (handStatus) handStatus.textContent = 'Camera or MediaPipe unavailable; keyboard, mouse, and mobile controls still work.'; } });
  window.addEventListener('resize', resizeCanvas); resizeCanvas(); render(); tickMovement(); initializeSharedHouseAvatars();
}

initHouseExplorer();

(function(){
  const dashboard=document.querySelector('[data-asset-dashboard]'); if(!dashboard) return;
  const userId=localStorage.getItem('muzikazUserId')||'demo-user'; localStorage.setItem('muzikazUserId',userId);
  const role=localStorage.getItem('muzikazRole')||'user';
  const auth={'x-user-id':userId,'x-user-role':role,'x-user-name':localStorage.getItem('muzikazName')||'MUZIKAZ Creator','Accept':'application/json'};
  const tabs=['My Uploads','Public Assets','Pending Approval','Approved','Rejected','Drafts','3D Models','Images','Thumbnails','Store Tiles','Product Previews','Archived'];
  let current='My Uploads', lastGraphic=null;
  const status=document.getElementById('asset-status'), grid=document.getElementById('asset-card-grid'), tabBox=document.getElementById('asset-tabs');
  tabBox.replaceChildren(...tabs.map(t=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.onclick=()=>{current=t;loadAssets();};return b;}));
  async function api(path,opts={}){const r=await fetch(path,{...opts,headers:{...auth,...(opts.headers||{})}});const j=await r.json();if(!r.ok||!j.success)throw new Error(j.message||'Request failed');return j.data;}
  function fileMeta(f){return `${f.name} · ${(f.size/1024).toFixed(1)} KB · ${f.type||f.name.split('.').pop()}`;}
  document.getElementById('asset-upload')?.addEventListener('change',e=>{const box=document.getElementById('graphic-preview');box.replaceChildren(...[...e.target.files].map(f=>{const d=document.createElement('div');d.className='asset-mini-preview';d.textContent=fileMeta(f); if(f.type.startsWith('image/')){const img=new Image();img.src=URL.createObjectURL(f);img.alt=f.name;d.prepend(img)} return d;}));});
  async function submitUpload(form,isModel,e){e.preventDefault(); const submit=e.submitter; const progress=document.getElementById(isModel?'model-upload-progress':'graphic-upload-progress'); progress&&(progress.value=15); const fd=new FormData(); [...form.querySelectorAll('input,textarea,select')].forEach(el=>{ if(el.type==='file'){[...(el.files||[])].forEach(f=>fd.append('file',f));} else if(el.name) fd.append(el.name,el.value); }); fd.set('status',submit?.value||'draft'); status.textContent=isModel?'Processing model':'Uploading files…'; try{lastGraphic=await api(isModel?'/api/models/upload':'/api/assets/upload',{method:'POST',body:fd,headers:{}}); progress&&(progress.value=100); status.textContent= isModel?'Processing model complete. Submitted for approval.':'Upload complete. Thumbnail generated.'; await loadAssets();}catch(err){progress&&(progress.value=0);status.textContent=err.message||'Upload failed';}}
  document.getElementById('graphic-upload-form')?.addEventListener('submit',e=>submitUpload(e.currentTarget,false,e));
  document.getElementById('model-upload-form')?.addEventListener('submit',e=>submitUpload(e.currentTarget,true,e));
  document.getElementById('preview-model-upload')?.addEventListener('click',()=>{const f=document.querySelector('#model-upload-form input[type=file]')?.files[0], mv=document.getElementById('model-upload-preview'); if(f&&mv){mv.src=URL.createObjectURL(f);mv.hidden=false;status.textContent='Preview ready';}});
  document.getElementById('cancel-graphic-upload')?.addEventListener('click',()=>status.textContent='Upload canceled.');
  document.getElementById('retry-graphic-upload')?.addEventListener('click',()=>document.getElementById('graphic-upload-form')?.requestSubmit());
  function filtered(list){return list.filter(a=> current==='My Uploads'||current==='Public Assets'&&a.visibility==='public'||current==='Pending Approval'&&a.status==='pending_review'||current==='Approved'&&a.status==='approved'||current==='Rejected'&&a.status==='rejected'||current==='Drafts'&&a.status==='draft'||current==='3D Models'&&a.fileType==='model'||current==='Images'&&a.fileType==='image'||current==='Thumbnails'&&a.intendedUse==='Model thumbnail'||current==='Store Tiles'&&a.intendedUse==='Marketplace tile'||current==='Product Previews'&&a.intendedUse==='Product preview'||current==='Archived'&&a.status==='archived');}
  async function loadAssets(){try{status.textContent='Loading assets…'; const list=await api(current==='Public Assets'?'/api/assets/public':'/api/assets/mine'); const view=filtered(list); grid.replaceChildren(...view.map(card)); status.textContent=`${view.length} assets loaded for ${current}.`; document.getElementById('metric-thumbnails').textContent=list.filter(a=>a.thumbnailUrl).length; document.getElementById('metric-store-tiles').textContent=list.filter(a=>a.intendedUse==='Marketplace tile').length; document.getElementById('metric-product-previews').textContent=list.filter(a=>a.intendedUse==='Product preview').length;}catch(e){status.textContent=e.message;}}
  function card(a){const el=document.createElement('article');el.className='asset-card'; const preview=a.fileType==='model'?`<model-viewer src="${a.publicUrl}" camera-controls></model-viewer>`:`<img src="${a.thumbnailUrl||a.publicUrl}" alt="${a.title}">`; el.innerHTML=`${preview}<h4>${a.title}</h4><p>${a.originalFilename}</p><p>Owner: ${a.ownerDisplayName}</p><p>${a.fileType} · ${a.fileSize} bytes · ${a.category||'uncategorized'}</p><p>Status: ${a.status} · ${a.visibility}</p><p>Related model: ${a.relatedModelId||'none'}</p><p>Uploaded: ${a.createdAt} Approved: ${a.approvedAt||'—'}</p><p>Published: ${a.publishLocation||a.publishedAt||'—'}</p><div class="button-row"></div><p>${a.moderatorNote||''}</p>`; const row=el.querySelector('.button-row'); [['Edit',()=>edit(a)],['Preview',()=>window.open(a.publicUrl,'_blank')],['Assign',()=>assign(a)],['Download',()=>window.open(a.publicUrl,'_blank')],['Archive',()=>action(a,'archive')],['Delete',()=>del(a)]].forEach(([t,fn])=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.onclick=fn;row.append(b);}); if(role==='admin')[['Approve','approve'],['Reject','reject'],['Feature','approve'],['Publish','publish'],['Unpublish','unpublish']].forEach(([t,act])=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.onclick=()=>action(a,act);row.append(b);}); return el;}
  async function action(a,act){const reason=act==='reject'?prompt('Reason required')||'Changes required':''; await api(`/api/assets/${a.id}/${act}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason})}); status.textContent= act==='publish'?'Published to live model space':'Asset updated'; loadAssets();}
  async function del(a){await api(`/api/assets/${a.id}`,{method:'DELETE'});loadAssets();}
  async function edit(a){const title=prompt('Title',a.title); if(title) await api(`/api/assets/${a.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})}); loadAssets();}
  async function assign(a){const modelId=prompt('Model ID for display assignment',a.relatedModelId||''); if(!modelId)return; const displayType=prompt('Display slot (thumbnail, poster texture, wall display, floor graphic, product mockup image, model information card, environment billboard, store tile, avatar badge, loading image, promotional overlay)','thumbnail'); await api(`/api/assets/${a.id}/assign-model`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelId,displayType,position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},opacity:1,repeatX:1,repeatY:1})}); status.textContent='Graphic assigned to model display';}
  async function metrics(){try{const m=await api('/api/admin/analytics'); document.getElementById('metric-orders').textContent=m.totalOrders||128;document.getElementById('metric-inventory').textContent=m.inventoryUnits||842;document.getElementById('metric-conversion').textContent=m.conversionRate||'7.4%';document.getElementById('metric-uploads').textContent=m.totalUploads||0;document.getElementById('metric-pending').textContent=m.pendingApprovals||0;document.getElementById('metric-storage').textContent=m.storageUsage||0;}catch{}}
  loadAssets(); metrics();
})();
