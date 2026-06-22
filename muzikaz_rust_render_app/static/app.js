const data = {
  categories: [
    { id:'hoodies', name:'Hoodies', from:59.99, icon:'🧥' },
    { id:'shirts', name:'T-Shirts', from:29.99, icon:'👕' },
    { id:'headwear', name:'Headwear', from:24.99, icon:'🧢' },
    { id:'accessories', name:'Accessories', from:7.99, icon:'🔑' },
    { id:'drinkware', name:'Drinkware', from:19.99, icon:'🥤' },
    { id:'posters', name:'Posters & Art', from:12.99, icon:'🖼️' },
    { id:'stickers', name:'Stickers', from:4.99, icon:'⚡' },
    { id:'drops', name:'Limited Drops', from:19.99, icon:'💎' }
  ],
  characters: [
    { id:'ape', name:'Ion Ape', avatar:'🦍', traits:['Neon','Wild','Crew Lead'] },
    { id:'penguin', name:'Drop Penguin', avatar:'🐧', traits:['Cool','Collector','Rare'] },
    { id:'inferno', name:'Inferno', avatar:'🔥', traits:['Fire','Chaos','Limited'] },
    { id:'doge', name:'Doge', avatar:'🐶', traits:['Loyal','Meme','Bold'] },
    { id:'sheep', name:'Black Sheep', avatar:'🐑', traits:['Outsider','Legend','Rare'] }
  ],
  products: [
    { id:1, name:'MUZIKAZ Hoodie', category:'hoodies', price:59.99, icon:'🧥', tag:'Top Pick' },
    { id:2, name:'IonCore Bottle', category:'drinkware', price:24.99, icon:'🥤', tag:'Best Seller' },
    { id:3, name:'Muzikaz Snapback', category:'headwear', price:29.99, icon:'🧢', tag:'New' },
    { id:4, name:'IonCore Keychain', category:'accessories', price:12.99, icon:'🔑', tag:'Metal Logo' },
    { id:5, name:'Crew Tee', category:'shirts', price:29.99, icon:'👕', tag:'Classic' },
    { id:6, name:'Character Poster', category:'posters', price:12.99, icon:'🖼️', tag:'Wall Art' },
    { id:7, name:'Lightning Sticker Pack', category:'stickers', price:4.99, icon:'⚡', tag:'Pack' },
    { id:8, name:'Limited Drop Bundle', category:'drops', price:99.99, icon:'💎', tag:'Limited' }
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
  $('customProduct').innerHTML = data.products.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  $('customCharacter').innerHTML = data.characters.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  ['customProduct','customCharacter','customName','customNumber','customColor'].forEach(id => $(id).addEventListener('input', updatePreview));
  $('addCustom').addEventListener('click',()=>{
    const p=data.products.find(x=>x.id==$('customProduct').value);
    cart.push({name:`Custom ${p.name} - ${$('customName').value} #${$('customNumber').value}`,price:p.price+15,icon:p.icon});
    saveCart(); toast('Custom item added');
  });
  updatePreview();
}
function updatePreview(){
  const c=data.characters.find(x=>x.id==$('customCharacter').value);
  $('mockChar').textContent=c.avatar;
  $('mockName').textContent=$('customName').value || 'MUZIKAZ';
  $('mockNumber').textContent=$('customNumber').value || '00';
  $('mockProduct').style.setProperty('--neon', $('customColor').value);
}

$('menuBtn').addEventListener('click',()=>$('nav').classList.toggle('open'));
$('newsletter').addEventListener('submit',e=>{e.preventDefault(); toast('Welcome to the crew'); e.target.reset();});
$('checkoutBtn').addEventListener('click',()=>toast('Demo checkout ready for Stripe connection'));
fetch('/api/health').then(r=>r.json()).then(console.log).catch(()=>{});

renderCategories(); renderFilters(); renderProducts(); renderCharacters(); setupCustomizer(); renderCart();
