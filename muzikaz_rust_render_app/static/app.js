const data = {
  categories: [
    { id:'hoodies', name:'Hoodies', from:59.99, icon:'🧥' },
    { id:'shirts', name:'T-Shirts', from:29.99, icon:'👕' },
    { id:'headwear', name:'Headwear', from:24.99, icon:'🧢' },
    { id:'accessories', name:'Accessories', from:7.99, icon:'🔑' },
    { id:'drinkware', name:'Drinkware', from:19.99, icon:'🥤' },
    { id:'posters', name:'Posters & Art', from:12.99, icon:'🖼️' },
    { id:'stickers', name:'Stickers', from:4.99, icon:'⚡' },
    { id:'plush', name:'Plush Toys', from:24.99, icon:'🧸' },
    { id:'bags', name:'Bags', from:34.99, icon:'🎒' },
    { id:'tech', name:'Tech Gear', from:14.99, icon:'📱' },
    { id:'events', name:'Event Gear', from:9.99, icon:'🎟️' },
    { id:'drops', name:'Limited Drops', from:19.99, icon:'💎' }
  ],
  productTypes: [
    { id:'print', name:'Front Print', note:'Character artwork centered on the product.' },
    { id:'embroidered', name:'Embroidery', note:'Premium stitched logo or mascot patch.' },
    { id:'all-over', name:'All-Over Pattern', note:'Repeat character pattern across the merch.' },
    { id:'patch', name:'Patch / Charm', note:'Collectible mascot patch, pin, or charm finish.' },
    { id:'engraved', name:'Engraved', note:'Laser-style branding for metal and bottles.' },
    { id:'ar-ready', name:'AR Ready', note:'Previewable in the live 3D / AR display.' }
  ],
  characters: [
    { id:'fiona', name:'Fiona', avatar:'🦩', traits:['Drama','Fashion','Pink Energy','Stage'] },
    { id:'bax', name:'Bax', avatar:'🐂', traits:['Bold','Strong','Classic','Crew'] },
    { id:'luna', name:'Luna', avatar:'🌙', traits:['Warm','Soft','Premium','Classic'] },
    { id:'black-sheep', name:'Black Sheep', avatar:'🐑', traits:['Outsider','Legend','Rare','Chef'] },
    { id:'flick', name:'Flick', avatar:'🦎', traits:['Fast','Sneaky','Street','Collectible'] },
    { id:'byte', name:'Byte', avatar:'🤖', traits:['Tech','Glitch','Digital','Smart'] },
    { id:'wild', name:'Wild', avatar:'🦁', traits:['Loud','Untamed','Hype','Mascot'] },
    { id:'nexus', name:'Nexus', avatar:'🐺', traits:['Sentinel','Armored','Precise','Cyber'] },
    { id:'brutus', name:'Brutus', avatar:'🐶', traits:['Dog','Loyal','Pilot','Guard'] },
    { id:'ion-wolf', name:'Ion Wolf', avatar:'🐺', traits:['IonCore','Electric','Leader','Night'] },
    { id:'grump', name:'Grump', avatar:'😾', traits:['Grumpy','Funny','Classic','Meme'] },
    { id:'pixella', name:'Pixella', avatar:'🧚', traits:['Pixel','Bright','Magic','Creator'] },
    { id:'ronaldo', name:'Ronaldo', avatar:'⚽', traits:['Sport','Clown Energy','Soccer','Showman'] },
    { id:'grok', name:'Grok', avatar:'🧌', traits:['Beast','Strong','Loud','Chaos'] },
    { id:'buzz', name:'Buzz', avatar:'🐝', traits:['Hype','Bright','Friendly','Buzzing'] },
    { id:'inferno', name:'Inferno', avatar:'🔥', traits:['Fire','Chaos','Heat','Limited'] },
    { id:'dax', name:'Dax', avatar:'🐴', traits:['Comedy','Wildcard','Street','Loyal'] },
    { id:'muz-cat', name:'Muz Cat', avatar:'🐱', traits:['Studio','Creative','Focused','Craft'] },
    { id:'buzz-jr', name:'Buzz Jr.', avatar:'🐝', traits:['Youth','Bright','New','Sticker'] },
    { id:'rumble', name:'Rumble', avatar:'👹', traits:['Brute','Strong','Fearless','Beast'] },
    { id:'sparky', name:'Sparky', avatar:'🦍', traits:['Inventor','Chaotic','Creative','Original'] },
    { id:'ronaldo-jr', name:'Ronaldo Jr.', avatar:'🥅', traits:['Sport','New','Comic','Energy'] },
    { id:'sharko', name:'Sharko', avatar:'🦈', traits:['Ocean','Sharp','Fast','Crew'] },
    { id:'remix', name:'Remix', avatar:'🎧', traits:['DJ','Music','Party','Drop'] },
    { id:'chillz', name:'Chillz', avatar:'🐧', traits:['Penguin','Calm','Strategist','Cool'] }
  ],
  products: [
    { id:1, name:'MUZIKAZ Hoodie', category:'hoodies', price:59.99, icon:'🧥', tag:'Top Pick', model:'https://modelviewer.dev/shared-assets/models/Astronaut.glb' },
    { id:2, name:'Crew Graphic Tee', category:'shirts', price:29.99, icon:'👕', tag:'Classic', model:'https://modelviewer.dev/shared-assets/models/RobotExpressive.glb' },
    { id:3, name:'Muzikaz Snapback', category:'headwear', price:29.99, icon:'🧢', tag:'New', model:'https://modelviewer.dev/shared-assets/models/NeilArmstrong.glb' },
    { id:4, name:'IonCore Keychain', category:'accessories', price:12.99, icon:'🔑', tag:'Metal Logo', model:'https://modelviewer.dev/shared-assets/models/MaterialsVariantsShoe.glb' },
    { id:5, name:'IonCore Bottle', category:'drinkware', price:24.99, icon:'🥤', tag:'Best Seller', model:'https://modelviewer.dev/shared-assets/models/Chair.glb' },
    { id:6, name:'Character Poster', category:'posters', price:12.99, icon:'🖼️', tag:'Wall Art', model:'https://modelviewer.dev/shared-assets/models/GeometricShapes.glb' },
    { id:7, name:'Lightning Sticker Pack', category:'stickers', price:4.99, icon:'⚡', tag:'Pack', model:'https://modelviewer.dev/shared-assets/models/RobotExpressive.glb' },
    { id:8, name:'Mascot Plush', category:'plush', price:24.99, icon:'🧸', tag:'Soft Drop', model:'https://modelviewer.dev/shared-assets/models/Astronaut.glb' },
    { id:9, name:'Crew Backpack', category:'bags', price:39.99, icon:'🎒', tag:'Daily Carry', model:'https://modelviewer.dev/shared-assets/models/Chair.glb' },
    { id:10, name:'Phone Grip', category:'tech', price:14.99, icon:'📱', tag:'Tech', model:'https://modelviewer.dev/shared-assets/models/GeometricShapes.glb' },
    { id:11, name:'Event Lanyard', category:'events', price:9.99, icon:'🎟️', tag:'Event Ready', model:'https://modelviewer.dev/shared-assets/models/MaterialsVariantsShoe.glb' },
    { id:12, name:'Limited Drop Bundle', category:'drops', price:99.99, icon:'💎', tag:'Limited', model:'https://modelviewer.dev/shared-assets/models/RobotExpressive.glb' }
  ]
};

let cart = JSON.parse(localStorage.getItem('muzikazCart') || '[]');
let activeCategory = 'all';

const money = n => `$${Number(n).toFixed(2)}`;
const $ = id => document.getElementById(id);

function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); }
function saveCart(){ localStorage.setItem('muzikazCart', JSON.stringify(cart)); renderCart(); }

function renderCategories(){
  $('categoryGrid').innerHTML = data.categories.map(c => `
    <article class="category-card" data-cat="${c.id}">
      <div class="category-icon">${c.icon}</div>
      <h3>${c.name}</h3>
      <p class="price">From ${money(c.from)}</p>
      <button onclick="filterProducts('${c.id}')">Shop ${c.name}</button>
    </article>`).join('');
}

function renderFilters(){
  $('filters').innerHTML = [`<button class="${activeCategory==='all'?'active':''}" onclick="filterProducts('all')">All</button>`]
    .concat(data.categories.map(c=>`<button class="${activeCategory===c.id?'active':''}" onclick="filterProducts('${c.id}')">${c.name}</button>`)).join('');
}

function filterProducts(cat){ activeCategory = cat; renderFilters(); renderProducts(); location.hash = '#merch'; }

function renderProducts(){
  const list = activeCategory === 'all' ? data.products : data.products.filter(p=>p.category===activeCategory);
  $('productGrid').innerHTML = list.map(p => `
    <article class="product-card">
      <div class="product-img">${p.icon}</div>
      <small>${p.tag}</small>
      <h3>${p.name}</h3>
      <p class="price">${money(p.price)}</p>
      <button onclick="addToCart(${p.id})">Add to Cart</button>
    </article>`).join('');
}

function renderCharacters(){
  $('characterGrid').innerHTML = data.characters.map(c => `
    <article>
      <div class="char-img">${c.avatar}</div>
      <h3>${c.name}</h3>
      <div class="traits">${c.traits.map(t=>`<span>${t}</span>`).join('')}</div>
    </article>`).join('');
}

function renderTypeGuide(){
  $('typeGuide').innerHTML = data.productTypes.map(t => `<span title="${t.note}">${t.name}</span>`).join('');
}

function addToCart(id){
  const p = data.products.find(x=>x.id===id);
  cart.push({ name:p.name, price:p.price, icon:p.icon });
  saveCart(); toast(`${p.name} added`);
}

function renderCart(){
  $('cartCount').textContent = cart.length;
  $('cartItems').innerHTML = cart.length ? cart.map((item,i)=>`
    <div class="cart-row"><span>${item.icon} ${item.name}</span><strong>${money(item.price)}</strong><button onclick="removeCart(${i})">Remove</button></div>`).join('') : '<p>Your cart is empty.</p>';
  $('cartTotal').textContent = money(cart.reduce((s,i)=>s+i.price,0));
}
function removeCart(i){ cart.splice(i,1); saveCart(); }

function setupCustomizer(){
  $('customProduct').innerHTML = data.products.map(p=>`<option value="${p.id}">${p.icon} ${p.name}</option>`).join('');
  $('customCharacter').innerHTML = data.characters.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  $('customType').innerHTML = data.productTypes.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  ['customProduct','customCharacter','customType','customName','customNumber','customColor'].forEach(id => $(id).addEventListener('input', updatePreview));
  $('addCustom').addEventListener('click',()=>{
    const p=data.products.find(x=>x.id==$('customProduct').value);
    const t=data.productTypes.find(x=>x.id==$('customType').value);
    cart.push({name:`Custom ${p.name} - ${t.name} - ${$('customName').value} #${$('customNumber').value}`,price:p.price+15,icon:p.icon});
    saveCart(); toast('Custom item added');
  });
  updatePreview();
}
function updatePreview(){
  const c=data.characters.find(x=>x.id==$('customCharacter').value);
  const p=data.products.find(x=>x.id==$('customProduct').value);
  const t=data.productTypes.find(x=>x.id==$('customType').value);
  $('mockChar').textContent=c.avatar;
  $('mockName').textContent=$('customName').value || 'MUZIKAZ';
  $('mockNumber').textContent=$('customNumber').value || '00';
  $('mockProductName').textContent=p.name;
  $('mockType').textContent=t.name;
  $('mockProduct').style.setProperty('--neon', $('customColor').value);
  $('arViewer').src = p.model;
  $('arViewer').alt = `Live 3D AR preview for ${c.name} ${p.name}`;
  $('arProductLabel').textContent = `${c.name} × ${p.name} · ${t.name}`;
}

$('menuBtn').addEventListener('click',()=>$('nav').classList.toggle('open'));
$('newsletter').addEventListener('submit',e=>{e.preventDefault(); toast('Welcome to the crew'); e.target.reset();});
$('checkoutBtn').addEventListener('click',()=>toast('Demo checkout ready for Stripe connection'));
fetch('/api/health').then(r=>r.json()).then(console.log).catch(()=>{});

renderCategories(); renderFilters(); renderProducts(); renderCharacters(); renderTypeGuide(); setupCustomizer(); renderCart();
