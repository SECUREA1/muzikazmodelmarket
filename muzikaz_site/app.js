const characters = [
  {name:'Sparky', role:'The Inventor', file:'sparky', group:'New Legends', traits:['Innovator','Chaotic','Creative','Tech Builder'], bio:'Brilliant, chaotic, unstoppable. Sparky builds the impossible and ignites new ideas.', slogan:'Innovate. Create. Ignite.'},
  {name:'Nexus', role:'The Sentinel', file:'nexus', group:'New Legends', traits:['Advanced','Precise','Unstoppable','Armor Core'], bio:'A futuristic guardian built for precision, protection, and high-impact brand drops.', slogan:'Advanced. Precise. Unstoppable.'},
  {name:'Inferno', role:'The Unleashed', file:'inferno', group:'New Legends', traits:['Chaos Heat','Hard Loyalty','Fire Energy','Power'], bio:'A heat-charged powerhouse for bold designs, gym gear, and high-volume drops.', slogan:'Chaos. Heat. Hard loyalty.'},
  {name:'Rumble', role:'The Brute', file:'rumble', group:'New Legends', traits:['Strength','Loyalty','No Fear','Heavy Hitter'], bio:'Big strength, big attitude, built for statement hoodies and event banners.', slogan:'Strength. Loyalty. No fear.'},
  {name:'Chillz', role:'The Strategist', file:'chillz', group:'New Legends', traits:['Cool Calm','Always Ahead','Planner','Ice Focus'], bio:'Cool, calm, and always three steps ahead. Perfect for caps, stickers, and calm-confidence apparel.', slogan:'Cool. Calm. Always 3 steps ahead.'},
  {name:'Bax', role:'The Rebel', file:'bax', group:'The Crew', traits:['Rebel','Street Edge','Bold','Loud'], bio:'A red-hot rebel mascot for loud streetwear and underground promo drops.', slogan:'Stand loud. Move different.'},
  {name:'Ion Wolf', role:'The Night Runner', file:'ion-wolf', group:'The Crew', traits:['Loyal','Night Crew','Fast','Sharp'], bio:'A neon wolf with night-runner style for jackets, hats, and limited drops.', slogan:'Run the night.'},
  {name:'Flick', role:'The Spark', file:'flick', group:'The Crew', traits:['Happy','Fast','Bright','Mascot'], bio:'Bright, fun, and fan-friendly. Flick is built for youth gear, stickers, and family-event marketing.', slogan:'Small spark. Big buzz.'},
  {name:'Byte', role:'The Signal', file:'byte', group:'The Crew', traits:['Signal','Tech','Core','Audio'], bio:'A tech duck mascot for audio culture, headphones, and digital drops.', slogan:'Tune in. Turn up.'},
  {name:'Fiona', role:'The Diva', file:'fiona', group:'The Crew', traits:['Drama','Fashion','Pink Energy','Stage'], bio:'A fashion-forward flamingo ready for bold women’s merch, glam stickers, and event posters.', slogan:'High style. Higher volume.'},
  {name:'Dax', role:'The Wild Card', file:'dax', group:'The Crew', traits:['Comedy','Wildcard','Street','Loyal'], bio:'Funny, rugged, and expressive. Dax brings personality to every product tile.', slogan:'All character. No filter.'},
  {name:'Luna', role:'The Soft Power', file:'luna', group:'The Crew', traits:['Warm','Soft','Premium','Classic'], bio:'A softer mascot for cozy hoodies, plush ideas, and premium lifestyle products.', slogan:'Soft look. Strong brand.'},
  {name:'Muz Cat', role:'The Producer', file:'muz-cat', group:'The Crew', traits:['Studio','Creative','Focused','Craft'], bio:'A studio cat built for creator merch, desk mats, posters, and music-themed drops.', slogan:'Make noise. Make art.'},
  {name:'Grump', role:'The Enforcer', file:'grump', group:'The Crew', traits:['Tough','Classic','Grounded','Boss'], bio:'A serious heavy-hitter for classic tees and tougher, no-nonsense campaign language.', slogan:'No games. Just grit.'},
  {name:'Remix', role:'The Mixer', file:'remix', group:'The Crew', traits:['DJ','Remix','Goggles','Beat'], bio:'A remix-ready mascot for music drops, club posters, and accessory bundles.', slogan:'Flip the beat.'},
  {name:'Sharko', role:'The Finisher', file:'sharko', group:'The Crew', traits:['Fast','Sharp','Leather','Bite'], bio:'A sharp mascot for performance gear, bold posters, and aggressive collection launches.', slogan:'Bite into the market.'},
  {name:'Ronaldo', role:'The Striker', file:'ronaldo', group:'The Crew', traits:['Sport','Clown Energy','Soccer','Showman'], bio:'A sporty showman mascot for game-day merch, jersey-style tees, and fan drops.', slogan:'Kick loud. Score proud.'},
  {name:'Buzz', role:'The Hype Bee', file:'buzz', group:'The Crew', traits:['Hype','Bright','Friendly','Buzzing'], bio:'A bright bee mascot for stickers, kid-friendly merch, and fast social campaigns.', slogan:'Create the buzz.'},
  {name:'Wild', role:'The Pilot Pug', file:'wild', group:'The Crew', traits:['Pilot','Brave','Loyal','Adventure'], bio:'A tough little adventure dog for hats, keychains, pins, and event mascots.', slogan:'Small dog. Wild mission.'},
  {name:'Pixella', role:'The Art Drop', file:'pixella', group:'New Additions', traits:['Color','Art','Fantasy','Collectible'], bio:'A colorful art mascot for posters, collectible cards, and limited-edition drops.', slogan:'Color outside the cage.'},
  {name:'Ronaldo Jr.', role:'The New Showman', file:'ronaldo-jr', group:'New Additions', traits:['Sport','New','Comic','Energy'], bio:'A fresh showman tile for youth sports merch, social clips, and fan-favorite drops.', slogan:'New legend. Same noise.'},
  {name:'Grok', role:'The Survivor', file:'grok', group:'New Additions', traits:['Survival','Strong','Primal','Gear'], bio:'A rugged mascot for outdoor-style apparel, patches, and tough accessories.', slogan:'Built from the ground up.'},
  {name:'Buzz Jr.', role:'The Mini Hype', file:'buzz-jr', group:'New Additions', traits:['Mini','Hype','Cute','Collectible'], bio:'A younger hype mascot for mini stickers, small accessories, and family bundles.', slogan:'Tiny mascot. Big drop.'},
  {name:'Black Sheep', role:'The Classic Favorite', file:'black-sheep', group:'Classic Favorites', traits:['Classic','Different','Chef','Favorite'], bio:'A classic favorite that stands apart. Great for limited retro collections.', slogan:'Different by design.'},
  {name:'Brutus', role:'The Loyal Guard', file:'brutus', group:'Classic Favorites', traits:['Dog','Loyal','Pilot','Guard'], bio:'A rugged dog mascot for pins, caps, and loyal-fan merch bundles.', slogan:'Loyal to the loud.'}
];

const products = [
  {name:'Graphic Tee', price:29.99, icon:'👕', desc:'Front character print with MUZIKAZ logo hit.'},
  {name:'Premium Hoodie', price:59.99, icon:'🧥', desc:'Oversized hoodie with back art and sleeve mark.'},
  {name:'Poster Print', price:19.99, icon:'🖼️', desc:'Campaign poster for rooms, booths, and events.'},
  {name:'Enamel Pin', price:9.99, icon:'⚡', desc:'Small collectible accessory for hats and bags.'},
  {name:'Sticker Pack', price:7.99, icon:'🏷️', desc:'Character, slogan, and logo sticker bundle.'},
  {name:'Figure Concept', price:34.99, icon:'🧸', desc:'Display figure concept tile for preorder testing.'}
];

let selected = characters[0];
let cart = [];
const grid = document.getElementById('characterGrid');
const filters = document.getElementById('filters');
const merchGrid = document.getElementById('merchGrid');
const groups = ['All', ...new Set(characters.map(c => c.group))];

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
    <article class="character-card" tabindex="0" data-name="${c.name}">
      <span class="tag">${c.group.includes('New') ? 'NEW!' : c.group.split(' ')[0]}</span>
      <img src="assets/characters/${c.file}.jpg" alt="${c.name} ${c.role}">
      <div class="content"><h3>${c.name}</h3><p>${c.role}</p></div>
    </article>`).join('');
  grid.querySelectorAll('.character-card').forEach(card=>{
    const activate=()=>selectCharacter(characters.find(c=>c.name===card.dataset.name), true);
    card.addEventListener('click', activate);
    card.addEventListener('keydown', e=>{ if(e.key==='Enter') activate(); });
  });
}
function selectCharacter(c, jump=false){
  selected = c;
  document.getElementById('detailImg').src = `assets/characters/${c.file}.jpg`;
  document.getElementById('detailCategory').textContent = c.group;
  document.getElementById('detailName').textContent = c.name;
  document.getElementById('detailRole').textContent = c.role;
  document.getElementById('detailBio').textContent = c.bio;
  document.getElementById('detailTraits').innerHTML = c.traits.map(t=>`<span class="trait">${t}</span>`).join('');
  renderMerch();
  if(jump) document.getElementById('characterDetail').scrollIntoView({behavior:'smooth', block:'center'});
}
function renderMerch(){
  merchGrid.innerHTML = products.map(p=>`
    <article class="product-card">
      <div class="product-art">${p.icon}</div>
      <h3>${selected.name} ${p.name}</h3>
      <div class="price">$${p.price.toFixed(2)}</div>
      <p>${p.desc}</p>
      <button class="btn primary add" data-product="${selected.name} ${p.name}" data-price="${p.price}">Add to Cart</button>
    </article>`).join('');
  merchGrid.querySelectorAll('.add').forEach(btn=>btn.addEventListener('click',()=>{
    cart.push({name:btn.dataset.product, price:Number(btn.dataset.price)});
    updateCart(true);
  }));
}
function updateCart(open=false){
  document.getElementById('cartCount').textContent = cart.length;
  const total = cart.reduce((s,i)=>s+i.price,0);
  document.getElementById('cartItems').innerHTML = cart.length ? cart.map(i=>`<div class="cart-row"><b>${i.name}</b><br>$${i.price.toFixed(2)}</div>`).join('') + `<h3>Total: $${total.toFixed(2)}</h3>` : '<p class="cart-note">No items yet.</p>';
  if(open) document.getElementById('cartDrawer').classList.add('open');
}
document.getElementById('copyCampaign').addEventListener('click', async()=>{
  const text = `${selected.name} — ${selected.role}\n${selected.slogan}\n${selected.bio}\nTraits: ${selected.traits.join(', ')}`;
  try{ await navigator.clipboard.writeText(text); alert('Campaign text copied.'); }
  catch{ prompt('Copy campaign text:', text); }
});
document.getElementById('cartButton').addEventListener('click',()=>document.getElementById('cartDrawer').classList.add('open'));
document.getElementById('closeCart').addEventListener('click',()=>document.getElementById('cartDrawer').classList.remove('open'));
document.getElementById('navToggle').addEventListener('click',()=>document.getElementById('nav').classList.toggle('open'));
renderFilters(); renderCharacters(); selectCharacter(selected); updateCart();
