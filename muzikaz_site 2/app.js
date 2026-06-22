const characters = [
  {name:'Sparky', role:'The Inventor', file:'sparky', group:'New Legends', traits:['Innovator','Chaotic','Creative','Tech Builder'], bio:'Brilliant, chaotic, and unstoppable. Sparky builds the impossible and ignites new ideas for merch, posters, and bold launch drops.', slogan:'Innovate. Create. Ignite.', focus:'Event merch, posters, collectibles', use:'Launch drops and inventor-themed campaigns'},
  {name:'Nexus', role:'The Sentinel', file:'nexus', group:'New Legends', traits:['Advanced','Precise','Unstoppable','Shielded'], bio:'A future-forward sentinel designed for premium apparel, sleek banners, and high-tech product presentation.', slogan:'Advanced. Precise. Unstoppable.', focus:'Premium apparel and limited drops', use:'High-tech collection launches'},
  {name:'Inferno', role:'The Unleashed', file:'inferno', group:'New Legends', traits:['Chaos','Heat','Loyalty','Power'], bio:'Inferno is raw heat and chaos. He powers aggressive campaign art, darker merch designs, gym gear, and high-volume drops.', slogan:'Chaos. Heat. Hard loyalty.', focus:'Gym gear and bold statement apparel', use:'High-energy release campaigns'},
  {name:'Rumble', role:'The Brute', file:'rumble', group:'New Legends', traits:['Strength','Loyalty','No Fear','Heavy Hitter'], bio:'Big strength, big attitude, built for statement hoodies, event banners, and oversized product visuals.', slogan:'Strength. Loyalty. No fear.', focus:'Hoodies, heavyweight tees, banners', use:'Streetwear drops and event backdrops'},
  {name:'Chillz', role:'The Strategist', file:'chillz', group:'New Legends', traits:['Cool Calm','Always Ahead','Planner','Ice Focus'], bio:'Cool, calm, and always three steps ahead. Perfect for caps, stickers, and calm-confidence apparel.', slogan:'Cool. Calm. Always 3 steps ahead.', focus:'Caps, stickers, and calm lifestyle gear', use:'Lifestyle marketing and cooler-toned campaigns'},
  {name:'Bax', role:'The Rebel', file:'bax', group:'The Crew', traits:['Rebel','Street Edge','Bold','Loud'], bio:'A red-hot rebel mascot for loud streetwear, attitude-heavy apparel, and underground promo drops.', slogan:'Stand loud. Move different.', focus:'Streetwear and attitude apparel', use:'Underground merch promos'},
  {name:'Ion Wolf', role:'The Night Runner', file:'ion-wolf', group:'The Crew', traits:['Loyal','Night Crew','Fast','Sharp'], bio:'A neon wolf with night-runner style for jackets, hats, and limited-edition drops.', slogan:'Run the night.', focus:'Jackets, caps, and premium patches', use:'Night-themed apparel launches'},
  {name:'Flick', role:'The Spark', file:'flick', group:'The Crew', traits:['Happy','Fast','Bright','Mascot'], bio:'Bright, fun, and fan-friendly. Flick is built for youth gear, stickers, and family-event marketing.', slogan:'Small spark. Big buzz.', focus:'Youth gear, stickers, and event handouts', use:'Family-friendly promo campaigns'},
  {name:'Byte', role:'The Signal', file:'byte', group:'The Crew', traits:['Signal','Tech','Core','Audio'], bio:'A tech duck mascot for audio culture, headphones, digital promos, and merch with a signal-themed edge.', slogan:'Tune in. Turn up.', focus:'Audio merch and tech accessories', use:'Music and signal-themed drops'},
  {name:'Fiona', role:'The Diva', file:'fiona', group:'The Crew', traits:['Drama','Fashion','Pink Energy','Stage'], bio:'A fashion-forward flamingo ready for bold women’s merch, glam stickers, and event posters.', slogan:'High style. Higher volume.', focus:'Fashion merch and glam promo pieces', use:'Style-led launches and event promo'},
  {name:'Dax', role:'The Wild Card', file:'dax', group:'The Crew', traits:['Comedy','Wildcard','Street','Loyal'], bio:'Funny, rugged, and expressive. Dax brings strong personality to every product tile and every marketing post.', slogan:'All character. No filter.', focus:'Comedy merch and crowd-friendly drops', use:'Social engagement campaigns'},
  {name:'Luna', role:'The Soft Power', file:'luna', group:'The Crew', traits:['Warm','Soft','Premium','Classic'], bio:'A softer mascot for cozy hoodies, plush ideas, premium lifestyle products, and calmer campaign visuals.', slogan:'Soft look. Strong brand.', focus:'Cozy apparel and premium lifestyle items', use:'Soft-brand and comfort-led campaigns'},
  {name:'Muz Cat', role:'The Producer', file:'muz-cat', group:'The Crew', traits:['Studio','Creative','Focused','Craft'], bio:'A studio cat built for creator merch, desk mats, posters, and music-themed drops.', slogan:'Make noise. Make art.', focus:'Creator merch and studio accessories', use:'Artist collabs and studio promos'},
  {name:'Grump', role:'The Enforcer', file:'grump', group:'The Crew', traits:['Tough','Classic','Grounded','Boss'], bio:'A serious heavy-hitter for classic tees and tougher, no-nonsense campaign language.', slogan:'No games. Just grit.', focus:'Classic tees and strong statement pieces', use:'Hard-edge merch campaigns'},
  {name:'Remix', role:'The Mixer', file:'remix', group:'The Crew', traits:['DJ','Remix','Goggles','Beat'], bio:'A remix-ready mascot for music drops, club posters, and accessory bundles.', slogan:'Flip the beat.', focus:'Music drops and club poster graphics', use:'DJ promos and nightlife merch'},
  {name:'Sharko', role:'The Finisher', file:'sharko', group:'The Crew', traits:['Fast','Sharp','Leather','Bite'], bio:'A sharp mascot for performance gear, bold posters, and aggressive collection launches.', slogan:'Bite into the market.', focus:'Performance gear and sharper graphics', use:'Aggressive promo pushes'},
  {name:'Ronaldo', role:'The Striker', file:'ronaldo', group:'The Crew', traits:['Sport','Clown Energy','Soccer','Showman'], bio:'A sporty showman mascot for game-day merch, jersey-style tees, and fan drops.', slogan:'Kick loud. Score proud.', focus:'Sports merch and jersey-style products', use:'Game-day campaigns'},
  {name:'Buzz', role:'The Hype Bee', file:'buzz', group:'The Crew', traits:['Hype','Bright','Friendly','Buzzing'], bio:'A bright bee mascot for stickers, kid-friendly merch, and fast social campaigns.', slogan:'Create the buzz.', focus:'Stickers, youth merch, and social assets', use:'Fast buzz-building launches'},
  {name:'Wild', role:'The Pilot Pug', file:'wild', group:'The Crew', traits:['Pilot','Brave','Loyal','Adventure'], bio:'A tough little adventure dog for hats, keychains, pins, and event mascots.', slogan:'Small dog. Wild mission.', focus:'Adventure accessories and pins', use:'Event and travel-themed drops'},
  {name:'Pixella', role:'The Art Drop', file:'pixella', group:'New Additions', traits:['Color','Art','Fantasy','Collectible'], bio:'A colorful art mascot for posters, collectible cards, and limited-edition drops.', slogan:'Color outside the cage.', focus:'Posters, cards, and colorful collectibles', use:'Art-led launch kits'},
  {name:'Ronaldo Jr.', role:'The New Showman', file:'ronaldo-jr', group:'New Additions', traits:['Sport','New','Comic','Energy'], bio:'A fresh showman tile for youth sports merch, social clips, and fan-favorite drops.', slogan:'New legend. Same noise.', focus:'Youth sports merch and social teasers', use:'Youth fan engagement'},
  {name:'Grok', role:'The Survivor', file:'grok', group:'New Additions', traits:['Survival','Strong','Primal','Gear'], bio:'A rugged mascot for outdoor-style apparel, patches, and tough accessories.', slogan:'Built from the ground up.', focus:'Outdoor gear and rugged accessories', use:'Utility merch campaigns'},
  {name:'Buzz Jr.', role:'The Mini Hype', file:'buzz-jr', group:'New Additions', traits:['Mini','Hype','Cute','Collectible'], bio:'A younger hype mascot for mini stickers, small accessories, and family bundles.', slogan:'Tiny mascot. Big drop.', focus:'Mini accessories and family bundles', use:'Kid-focused promo kits'},
  {name:'Black Sheep', role:'The Classic Favorite', file:'black-sheep', group:'Classic Favorites', traits:['Classic','Different','Chef','Favorite'], bio:'A classic favorite that stands apart. Great for retro collections and limited-edition drops.', slogan:'Different by design.', focus:'Retro collections and niche accessories', use:'Classic fan merch'},
  {name:'Brutus', role:'The Loyal Guard', file:'brutus', group:'Classic Favorites', traits:['Dog','Loyal','Pilot','Guard'], bio:'A rugged dog mascot for pins, caps, and loyal-fan merch bundles.', slogan:'Loyal to the loud.', focus:'Pins, hats, and fan bundles', use:'Fan-club merchandise'}
];

const products = [
  {
    id:'tee',
    name:'Graphic Tee',
    basePrice:29.99,
    desc:'Front print tee with character art, MUZIKAZ mark, and optional back hit.',
    specs:['Apparel','Front / Back Print','Everyday Seller'],
    colors:['Black','Acid Green','White','Stone Grey'],
    sizes:['XS','S','M','L','XL','2XL','3XL'],
    placements:['Full Front','Left Chest + Back','Front + Sleeve'],
    finishes:['Standard Print','Puff Print','Glow Ink']
  },
  {
    id:'hoodie',
    name:'Premium Hoodie',
    basePrice:59.99,
    desc:'Heavy fleece hoodie with oversized artwork and sleeve logo detailing.',
    specs:['Apparel','Heavyweight','Event Favorite'],
    colors:['Black','Shadow Purple','Army Green','Ash Grey'],
    sizes:['S','M','L','XL','2XL','3XL'],
    placements:['Front + Back','Left Chest + Full Back','Front + Both Sleeves'],
    finishes:['Standard Print','Embroidery + Print','Puff Print']
  },
  {
    id:'poster',
    name:'Poster Print',
    basePrice:19.99,
    desc:'Promotional art poster for booths, launch drops, and room decor.',
    specs:['Print','Campaign Art','11x17 / 18x24'],
    colors:['Full Color','Monochrome Green','Blackout Edition'],
    sizes:['11x17','18x24','24x36'],
    placements:['Single-Sided','Alt Variant'],
    finishes:['Gloss','Matte','Holographic']
  },
  {
    id:'hat',
    name:'Snapback Cap',
    basePrice:27.99,
    desc:'Structured cap with front mascot logo or icon mark and optional side detail.',
    specs:['Headwear','Embroidery','Event Seller'],
    colors:['Black','Charcoal','Neon Green','Cream'],
    sizes:['One Size'],
    placements:['Front Logo','Front + Side Hit','Front + Back Hit'],
    finishes:['Embroidery','Rubber Patch','Puff Embroidery']
  },
  {
    id:'bottle',
    name:'Water Bottle',
    basePrice:24.99,
    desc:'Matte bottle with vertical graphic, slogan placement, and accessory appeal.',
    specs:['Accessory','Matte Finish','Utility Item'],
    colors:['Black','Lime Fade','Steel Grey','Purple Haze'],
    sizes:['20 oz','24 oz'],
    placements:['Wrap Print','Front Graphic + Logo','Minimal Vertical Mark'],
    finishes:['Matte Print','Gloss Print','Laser Etch']
  },
  {
    id:'lanyard',
    name:'Lanyard',
    basePrice:12.99,
    desc:'Event-ready woven lanyard with repeat logos and mascot color cues.',
    specs:['Accessory','Event Tool','Repeat Pattern'],
    colors:['Black / Green','Purple / Lime','Grey / Green'],
    sizes:['Standard'],
    placements:['Full Strap Pattern','Pattern + Badge','Pattern + Charm'],
    finishes:['Woven','Silk Print','Rubber Charm Add-On']
  },
  {
    id:'pin',
    name:'Enamel Pin',
    basePrice:9.99,
    desc:'Collectible character icon pin for jackets, hats, and accessories.',
    specs:['Accessory','Collectible','Impulse Item'],
    colors:['Signature Colors','Blackout Metal','Glow Green'],
    sizes:['1.25 in','1.5 in'],
    placements:['Face Icon','Logo + Character','Slogan Badge'],
    finishes:['Soft Enamel','Hard Enamel','Glow Finish']
  },
  {
    id:'sticker',
    name:'Sticker Pack',
    basePrice:7.99,
    desc:'Mascot sticker bundle with logo hits, slogans, and collectible extras.',
    specs:['Accessory','Bundle','Low Price Add-On'],
    colors:['Mixed Set','Green Monochrome','Character Palette'],
    sizes:['5-Pack','8-Pack','12-Pack'],
    placements:['Character Set','Character + Logo','Character + Slogan'],
    finishes:['Matte','Gloss','Holographic']
  }
];

const finishCosts = {
  'Standard Print':0,
  'Puff Print':4,
  'Glow Ink':5,
  'Embroidery + Print':8,
  'Embroidery':5,
  'Rubber Patch':4,
  'Puff Embroidery':6,
  'Gloss':2,
  'Matte':0,
  'Holographic':6,
  'Matte Print':0,
  'Gloss Print':3,
  'Laser Etch':5,
  'Woven':0,
  'Silk Print':2,
  'Rubber Charm Add-On':4,
  'Soft Enamel':0,
  'Hard Enamel':2,
  'Glow Finish':3,
  'Glossy':2
};

const placementCosts = {
  'Full Front':0,
  'Left Chest + Back':6,
  'Front + Sleeve':4,
  'Front + Back':6,
  'Left Chest + Full Back':7,
  'Front + Both Sleeves':8,
  'Single-Sided':0,
  'Alt Variant':3,
  'Front Logo':0,
  'Front + Side Hit':3,
  'Front + Back Hit':4,
  'Wrap Print':3,
  'Front Graphic + Logo':2,
  'Minimal Vertical Mark':0,
  'Full Strap Pattern':0,
  'Pattern + Badge':2,
  'Pattern + Charm':4,
  'Face Icon':0,
  'Logo + Character':2,
  'Slogan Badge':1,
  'Character Set':0,
  'Character + Logo':1,
  'Character + Slogan':1
};

const sizeCosts = {
  '2XL':3,
  '3XL':5,
  '18x24':4,
  '24x36':8,
  '24 oz':3,
  '1.5 in':2,
  '8-Pack':3,
  '12-Pack':6
};

const marketingTemplates = [
  {title:'Drop Post', make:(c,p)=>`Meet ${c.name}, ${c.role}. ${c.slogan} Built for ${p.name.toLowerCase()} drops and fan-ready launch energy.`},
  {title:'Booth Pitch', make:(c,p)=>`${c.name} leads this booth with ${p.name.toLowerCase()} customization, clean tile visuals, and campaign-ready copy for fans, mascots, and merch buyers.`},
  {title:'Sales Angle', make:(c,p)=>`${c.name} works best for ${c.focus.toLowerCase()}. Push this product through ${c.use.toLowerCase()} and character-first storytelling.`}
];

let selected = characters[0];
let activeProduct = products[0];
let cart = [];
const customization = {
  productId: activeProduct.id,
  color: activeProduct.colors[0],
  size: activeProduct.sizes[0],
  placement: activeProduct.placements[0],
  finish: activeProduct.finishes[0],
  qty: 1,
  note: ''
};

const grid = document.getElementById('characterGrid');
const filters = document.getElementById('filters');
const merchGrid = document.getElementById('merchGrid');
const marketingGrid = document.getElementById('marketingGrid');
const groups = ['All', ...new Set(characters.map(c => c.group))];

const productSelect = document.getElementById('productSelect');
const colorSelect = document.getElementById('colorSelect');
const sizeSelect = document.getElementById('sizeSelect');
const placementSelect = document.getElementById('placementSelect');
const finishSelect = document.getElementById('finishSelect');
const qtyInput = document.getElementById('qtyInput');
const noteInput = document.getElementById('noteInput');

function slugify(text){
  return text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
}

function productById(id){
  return products.find(p=>p.id===id) || products[0];
}

function renderFilters(){
  filters.innerHTML = groups.map((g,i)=>`<button class="filter ${i===0?'active':''}" data-group="${g}">${g}</button>`).join('');
  filters.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{
    filters.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    renderCharacters(btn.dataset.group);
  }));
}

function renderCharacters(group='All'){
  const list = group === 'All' ? characters : characters.filter(c=>c.group===group);
  grid.innerHTML = list.map(c=>`
    <article class="character-card ${c.name===selected.name ? 'active' : ''}" tabindex="0" data-name="${c.name}">
      <span class="tag">${c.group.includes('New') ? 'NEW!' : c.group.split(' ')[0]}</span>
      <div class="character-art">
        <img src="assets/characters/${c.file}.jpg" alt="${c.name} ${c.role}">
      </div>
      <div class="content">
        <h3>${c.name}</h3>
        <p>${c.role}</p>
      </div>
    </article>`).join('');

  grid.querySelectorAll('.character-card').forEach(card=>{
    const activate=()=>selectCharacter(characters.find(c=>c.name===card.dataset.name), true);
    card.addEventListener('click', activate);
    card.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); activate(); } });
  });
}

function fillStats(c){
  document.getElementById('detailStats').innerHTML = [
    ['Collection', c.group],
    ['Product Focus', c.focus],
    ['Recommended Use', c.use],
    ['Tile Style', 'Unified 4:5 product card fit']
  ].map(([label,value])=>`<article><span class="stat-label">${label}</span><span class="stat-value">${value}</span></article>`).join('');
}

function headlineFor(c){
  return `${c.name} by MUZIKAZ — ${c.slogan}`;
}
function captionFor(c){
  return `${c.name} just hit the lineup. ${c.bio} #Muzikaz #${slugify(c.name)} #LoudProudMuzikaz`;
}
function launchCopyFor(c){
  return `${c.name} is positioned for ${c.focus.toLowerCase()}. Use this mascot in ${c.use.toLowerCase()}, build out matching apparel and accessories, and keep the campaign language centered on: “${c.slogan}”`;
}

function selectCharacter(c, jump=false){
  selected = c;
  document.getElementById('detailImg').src = `assets/characters/${c.file}.jpg`;
  document.getElementById('customPreviewImg').src = `assets/characters/${c.file}.jpg`;
  document.getElementById('detailCategory').textContent = c.group;
  document.getElementById('detailName').textContent = c.name;
  document.getElementById('detailRole').textContent = c.role;
  document.getElementById('detailBio').textContent = c.bio;
  document.getElementById('detailSlogan').textContent = `“${c.slogan}”`;
  document.getElementById('detailTraits').innerHTML = c.traits.map(t=>`<span class="trait">${t}</span>`).join('');
  document.getElementById('headlineCopy').textContent = headlineFor(c);
  document.getElementById('captionCopy').textContent = captionFor(c);
  document.getElementById('launchCopy').textContent = launchCopyFor(c);
  document.getElementById('configCharacter').textContent = c.name;
  document.getElementById('configFocus').textContent = c.focus;
  document.getElementById('configUse').textContent = c.use;
  fillStats(c);
  renderCharacters(document.querySelector('.filter.active')?.dataset.group || 'All');
  renderMerch();
  renderMarketing();
  updateCustomizer();
  if(jump) document.getElementById('characterDetail').scrollIntoView({behavior:'smooth', block:'start'});
}

function renderMerch(){
  merchGrid.innerHTML = products.map(p=>`
    <article class="product-card">
      <div class="product-art-shell">
        <img src="assets/characters/${selected.file}.jpg" alt="${selected.name} ${p.name}">
        <span class="product-pill">${p.name}</span>
      </div>
      <div class="product-meta">
        <div>
          <h3>${selected.name} ${p.name}</h3>
          <div class="price">From $${p.basePrice.toFixed(2)}</div>
        </div>
      </div>
      <p>${p.desc}</p>
      <div class="product-specs">${p.specs.map(spec=>`<span class="spec-chip">${spec}</span>`).join('')}</div>
      <div class="product-actions">
        <button class="btn ghost customize-product" data-product-id="${p.id}">Customize</button>
        <button class="btn primary quick-add" data-product-id="${p.id}">Add Default</button>
      </div>
    </article>`).join('');

  merchGrid.querySelectorAll('.customize-product').forEach(btn=>btn.addEventListener('click',()=>{
    setActiveProduct(btn.dataset.productId);
    document.querySelector('.customizer-panel').scrollIntoView({behavior:'smooth', block:'start'});
  }));

  merchGrid.querySelectorAll('.quick-add').forEach(btn=>btn.addEventListener('click',()=>{
    const p = productById(btn.dataset.productId);
    const item = `${selected.name} ${p.name} — ${p.colors[0]} / ${p.sizes[0]} / ${p.placements[0]} / ${p.finishes[0]}`;
    cart.push({name:item, price:p.basePrice});
    updateCart(true);
  }));
}

function renderMarketing(){
  marketingGrid.innerHTML = marketingTemplates.map(t=>`
    <article class="marketing-card">
      <h3>${t.title}</h3>
      <p>${t.make(selected, activeProduct)}</p>
    </article>`).join('');
}

function populateSelect(select, values, selectedValue){
  select.innerHTML = values.map(v=>`<option value="${v}" ${v===selectedValue?'selected':''}>${v}</option>`).join('');
}

function setActiveProduct(productId){
  activeProduct = productById(productId);
  customization.productId = activeProduct.id;
  customization.color = activeProduct.colors[0];
  customization.size = activeProduct.sizes[0];
  customization.placement = activeProduct.placements[0];
  customization.finish = activeProduct.finishes[0];
  customization.qty = Number(qtyInput?.value || 1);
  updateCustomizer();
}

function buildProductControls(){
  populateSelect(productSelect, products.map(p=>p.name), activeProduct.name);
  productSelect.addEventListener('change',()=>{
    const match = products.find(p=>p.name===productSelect.value);
    setActiveProduct(match.id);
  });

  colorSelect.addEventListener('change',()=>{customization.color = colorSelect.value; updateCustomizer();});
  sizeSelect.addEventListener('change',()=>{customization.size = sizeSelect.value; updateCustomizer();});
  placementSelect.addEventListener('change',()=>{customization.placement = placementSelect.value; updateCustomizer();});
  finishSelect.addEventListener('change',()=>{customization.finish = finishSelect.value; updateCustomizer();});
  qtyInput.addEventListener('input',()=>{
    const value = Math.max(1, Math.min(250, Number(qtyInput.value || 1)));
    qtyInput.value = value;
    customization.qty = value;
    updateCustomizer();
  });
  noteInput.addEventListener('input',()=>{ customization.note = noteInput.value.trim(); updateCustomizer(false); });
}

function calculatePrice(){
  const base = activeProduct.basePrice;
  const finish = finishCosts[customization.finish] || 0;
  const placement = placementCosts[customization.placement] || 0;
  const size = sizeCosts[customization.size] || 0;
  const colorPremium = customization.color.includes('Green') || customization.color.includes('Glow') ? 2 : 0;
  const unit = base + finish + placement + size + colorPremium;
  return unit * customization.qty;
}

function updateCustomizer(updateMarkup = true){
  if(updateMarkup){
    populateSelect(productSelect, products.map(p=>p.name), activeProduct.name);
    populateSelect(colorSelect, activeProduct.colors, customization.color);
    populateSelect(sizeSelect, activeProduct.sizes, customization.size);
    populateSelect(placementSelect, activeProduct.placements, customization.placement);
    populateSelect(finishSelect, activeProduct.finishes, customization.finish);
  }
  document.getElementById('customizerTitle').textContent = `${selected.name} ${activeProduct.name}`;
  document.getElementById('customPreviewBadge').textContent = activeProduct.name;
  document.getElementById('customPreviewImg').src = `assets/characters/${selected.file}.jpg`;
  const total = calculatePrice();
  document.getElementById('customPrice').textContent = `$${total.toFixed(2)}`;
  document.getElementById('customSummary').textContent = `${selected.name} on a ${activeProduct.name.toLowerCase()} with ${customization.color.toLowerCase()}, ${customization.placement.toLowerCase()}, and ${customization.finish.toLowerCase()} finishing. ${customization.note ? 'Note: ' + customization.note : 'Use this as a launch-ready merch spec.'}`;
  renderMarketing();
}

function customSpecText(){
  return [
    `${selected.name} — ${selected.role}`,
    `${activeProduct.name}`,
    `Colorway: ${customization.color}`,
    `Size / Format: ${customization.size}`,
    `Placement: ${customization.placement}`,
    `Finish: ${customization.finish}`,
    `Quantity: ${customization.qty}`,
    `Estimated Total: $${calculatePrice().toFixed(2)}`,
    `Product Focus: ${selected.focus}`,
    `Recommended Use: ${selected.use}`,
    customization.note ? `Personalization Note: ${customization.note}` : ''
  ].filter(Boolean).join('\n');
}

function updateCart(open=false){
  document.getElementById('cartCount').textContent = cart.length;
  const total = cart.reduce((s,i)=>s+i.price,0);
  document.getElementById('cartItems').innerHTML = cart.length
    ? cart.map(i=>`<div class="cart-row"><b>${i.name}</b><br>$${i.price.toFixed(2)}</div>`).join('') + `<h3 class="cart-total">Total: $${total.toFixed(2)}</h3>`
    : '<p class="cart-note">No items yet.</p>';
  if(open) document.getElementById('cartDrawer').classList.add('open');
}

async function copyText(text, fallbackLabel){
  try{
    await navigator.clipboard.writeText(text);
    alert(`${fallbackLabel} copied.`);
  }catch{
    prompt(`Copy ${fallbackLabel.toLowerCase()}:`, text);
  }
}

buildProductControls();
renderFilters();
renderCharacters();
selectCharacter(selected);
updateCart();

customization.qty = 1;
qtyInput.value = 1;

setActiveProduct(activeProduct.id);

const addCustomToCart = document.getElementById('addCustomToCart');
addCustomToCart.addEventListener('click',()=>{
  cart.push({
    name:`${selected.name} ${activeProduct.name} — ${customization.color} / ${customization.size} / ${customization.placement} / ${customization.finish}${customization.note ? ` / Note: ${customization.note}` : ''}`,
    price:calculatePrice()
  });
  updateCart(true);
});

document.getElementById('copyCampaign').addEventListener('click',()=>{
  const text = `${selected.name} — ${selected.role}\n${selected.slogan}\n${selected.bio}\nTraits: ${selected.traits.join(', ')}\nFocus: ${selected.focus}\nRecommended Use: ${selected.use}`;
  copyText(text, 'Campaign text');
});

document.getElementById('copyMarketing').addEventListener('click',()=>{
  const text = `Headline: ${headlineFor(selected)}\nSocial Caption: ${captionFor(selected)}\nLaunch Notes: ${launchCopyFor(selected)}`;
  copyText(text, 'Marketing copy');
});

document.getElementById('copyCustomization').addEventListener('click',()=>{
  copyText(customSpecText(), 'Product spec');
});

document.getElementById('cartButton').addEventListener('click',()=>document.getElementById('cartDrawer').classList.add('open'));
document.getElementById('closeCart').addEventListener('click',()=>document.getElementById('cartDrawer').classList.remove('open'));
document.getElementById('navToggle').addEventListener('click',()=>document.getElementById('nav').classList.toggle('open'));
