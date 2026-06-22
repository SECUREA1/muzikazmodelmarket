import { products, collections, characters } from './data.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function moneyToNumber(price){ return Number(price.replace(/[^0-9.]/g,'')); }
function cart(){ return JSON.parse(localStorage.getItem('muzikaz_cart') || '[]'); }
function saveCart(items){ localStorage.setItem('muzikaz_cart', JSON.stringify(items)); updateCartCount(); }
function updateCartCount(){ const count = cart().reduce((n,i)=>n+i.qty,0); $$('.cart-count').forEach(el=>el.textContent=count); }
window.addToCart = (slug) => {
  const items = cart();
  const existing = items.find(i => i.slug === slug);
  if(existing) existing.qty += 1; else items.push({slug, qty:1});
  saveCart(items);
  const product = products.find(p => p.slug === slug);
  toast(`${product?.name || 'Item'} added to cart`);
}
function toast(text){
  let t = $('.toast');
  if(!t){ t = document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent = text; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800);
}

function productCard(p, prefix=''){
  return `<article class="product-card">
    <a href="${prefix}products/${p.slug}.html" class="product-media"><span class="badge">NEW</span><img src="${prefix}${p.img}" alt="${p.name}"></a>
    <div class="product-info"><p>${p.category}</p><h3>${p.name}</h3><span>${p.tag}</span><strong>${p.price}</strong>
      <button onclick="addToCart('${p.slug}')">Add to cart</button>
    </div>
  </article>`;
}
function collectionCard(c, prefix=''){
  return `<article class="collection-card"><a href="${prefix}collections/${c.slug}.html"><img src="${prefix}${c.img}" alt="${c.name}"><div><h3>${c.name}</h3><p>${c.line}</p><button>View</button></div></a></article>`;
}
function characterCard(ch, prefix=''){
  return `<article class="character-card"><img src="${prefix}${ch[2]}" alt="${ch[0]}"><h3>${ch[0]}</h3><p>${ch[1]}</p></article>`;
}

const route = document.body.dataset.page;
const prefix = document.body.dataset.prefix || '';
if($('#new-arrivals')) $('#new-arrivals').innerHTML = products.map(p=>productCard(p,prefix)).join('');
if($('#product-grid')) $('#product-grid').innerHTML = products.map(p=>productCard(p,prefix)).join('');
if($('#collection-grid')) $('#collection-grid').innerHTML = collections.map(c=>collectionCard(c,prefix)).join('');
if($('#crew-grid')) $('#crew-grid').innerHTML = characters.map(c=>characterCard(c,prefix)).join('');

if(route === 'product'){
  const slug = document.body.dataset.slug;
  const p = products.find(x => x.slug === slug);
  if(p){
    document.title = `${p.name} | MUZIKAZ`;
    $('#product-detail').innerHTML = `<div class="product-shot"><img src="../${p.img}" alt="${p.name}"></div>
      <div class="detail-copy"><span class="badge big">NEW DROP</span><h1>${p.name}</h1><p class="tagline">${p.tag}</p><strong class="price">${p.price}</strong>
      <ul>${p.features.map(f=>`<li>ϟ ${f}</li>`).join('')}</ul>
      <div class="option"><b>Size / Type</b><div>${p.sizes.map(s=>`<span>${s}</span>`).join('')}</div></div>
      <div class="option"><b>Color</b><div><span>${p.color}</span></div></div>
      <button class="primary" onclick="addToCart('${p.slug}')">Add to cart 🛒</button>
      <a class="ghost" href="../merch.html">Shop all merch</a></div>`;
    $('#product-page-art').innerHTML = `<img src="../${p.page}" alt="Full product page graphic for ${p.name}">`;
  }
}

if(route === 'collection'){
  const slug = document.body.dataset.slug;
  const c = collections.find(x => x.slug === slug);
  if(c){
    document.title = `${c.name} Collection | MUZIKAZ`;
    $('#collection-detail').innerHTML = `<div class="collection-hero-img"><img src="../${c.img}" alt="${c.name}"></div><div><span class="badge big">COLLECTION</span><h1>${c.name}</h1><p class="tagline">${c.line}</p><p class="body-copy">Featured crew: ${c.items.join(', ')}. Built for loud merch drops, mascot art, accessories, banners, and collectible character cards.</p><a class="primary link-button" href="../merch.html">Shop merch</a></div>`;
  }
}

$('.menu-toggle')?.addEventListener('click', () => $('.nav')?.classList.toggle('open'));
$('.newsletter')?.addEventListener('submit', (e) => { e.preventDefault(); toast('You joined the MUZIKAZ crew'); e.target.reset(); });

updateCartCount();
