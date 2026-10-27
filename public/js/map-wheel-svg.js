import {isProvingDestination,isCompoundDestination,isShippingDestination} from './atlas-destinations.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icons={basketball:'<circle r="13"/><path d="M-13 0h26M0-13v26M-9-9Q7 0-9 9M9-9Q-7 0 9 9"/>',hockey:'<path d="m-10-13 13 24h10v-5H6L-6-15m16 2L-3 11h-10V6h7L6-15"/>',range:'<circle r="14"/><circle r="9"/><circle r="3"/><path d="M0-19v9M0 10v9M-19 0h9M10 0h9"/>',arcade:'<circle cy="-3" r="12"/><path d="M0-15V9M-12-3h24M-9-12 9 6M9-12-9 6M0 9l-8 9m8-9 8 9M-10 18h20"/>',world:'<path d="M-14 0 0-12 14 0M-10-3v17h20V-3M-3 14V4h6v10"/>'};
icons.island='<path d="M-16 16q16-7 32 0M-3 13Q5-2 0-11M0-10q-12-8-17 4 10-3 17-4Zm0 0Q11-17 17-6 6-9 0-10ZM0-10Q-4-21-11-17M0-10Q8-20 13-15"/>';
icons.harbor='<circle cy="-10" r="4"/><path d="M0-6v22M-10 0h20M-15 5c0 15 30 15 30 0m-30 0-3 5m3-5 5 3m25-3 3 5m-3-5-5 3"/>';
icons.shipping='<path d="M-18 5h36l-5 10H-12L-18 5ZM-12 5V-6H9V5M-5-6V5M2-6V5M9-1h6v6M-17 19q5-4 10 0t10 0t10 0"/>';
icons.airport='<path d="m0-18 4 15 14 8v4L4 5l-1 10 5 3v3l-8-2-8 2v-3l5-3-1-10-14 4V5l14-8z"/>';
icons.ski='<path d="m-17 14 17-29 17 29zM-6-5 0 0l5-5M-8 9 7 17m-10-9 12 7"/>';
icons.proving='<path d="M0-18C8-12 10-3 8 8H-8C-10-3-8-12 0-18ZM-8 0-15 11h7m16-11 7 11H8M-4 12v7m8-7v7"/><circle cy="-4" r="3"/>';
icons.compound='<path d="m-18 10 8-18 8 10 8-18 12 26H-18Z"/><rect x="-7" y="2" width="14" height="14" rx="2"/><path d="M-4 2V-1a4 4 0 0 1 8 0v3M0 7v4"/>';
icons.factory='<path d="M-17 16V-2l10 5V-5l10 7V-10h7V3l7 4v9zM-11 10h3m6 0h3m6 0h3M5-14h7"/>';
icons.fitness='<path d="M-9 0H9M-14-10h5v20h-5zM9-10h5v20H9zM-18-5h4v10h-4zM14-5h4v10h-4z"/>';
icons.construction='<path d="M-9 17V-16h5v33M-17-11h34v5h-34zM-9-16l25 5M10-6v14m-3 0h6v4l-3 3-3-3M-13 17h13M-9 7l5-6-5-6 5-6"/>';
icons.prison='<path d="M-16 17V-14h32v31zM-10-8v18M-3-8v18M4-8v18M11-8v18M-16-1h32M-16 12h32"/>';
icons.funhouse='<circle r="14"/><circle cx="-5" cy="-4" r="1"/><circle cx="5" cy="-4" r="1"/><circle cy="1" r="3"/><path d="M-8 5q8 12 16 0M-10-10l10-9 10 9"/>';
export function mapSectorKind(env = {}) {
 if(isShippingDestination(env))return 'shipping';
 if(env.game==='tropical-island'||env.id==='tropical-island'||env.mapId==='tropical-island')return 'island';
 if(isCompoundDestination(env))return 'compound';
 if(isProvingDestination(env))return 'proving';
 const layout=env.builderScene?.sourceLayout||env.builderScene?.layout||env.layout;
 if(env.game==='prison'||env.prison?.enabled||env.id==='ironwood-prison'||layout==='prison')return 'prison';
 if(env.game==='funhouse'||env.id==='muzikaz-clown-funhouse'||layout==='clown-funhouse')return 'funhouse';
 if(['factory','missile-factory'].includes(env.game)||env.factory?.enabled||env.id==='muzikaz-missile-factory'||layout==='missile-factory'||env.builderScene?.sourceLayout==='missile-factory'||env.builderScene?.layoutMeta?.factory?.enabled)return 'factory';
 if(env.game==='fitness'||env.fitness?.enabled||env.id==='muzikaz-fitness-centre'||layout==='fitness-centre'||env.builderScene?.sourceLayout==='fitness-centre')return 'fitness';
 if(env.construction?.enabled||env.builderScene?.layoutMeta?.construction?.enabled||env.game==='construction'||env.id==='skyscraper-construction')return 'construction';
 return env.game==='ski'?'ski':env.builderScene?.layoutMeta?.harbor||env.id==='neon-docks'||env.atlasDistrict?.id==='neon-docks'&&!env.atlasDistrict?.page?'harbor':env.airport?.enabled||env.id==='muzikaz-airport'?'airport':env.basketball===true||env.basketballCourt===true||env.id==='basketball-arena'||['basketball-arena','basketball-stadium'].includes(layout)?'basketball'
  :env.game==='hockey'||env.id==='hockey-arena'||layout==='hockey-arena'?'hockey'
  :env.game==='firing-range'||env.id==='firing-range'||layout==='firing-range'?'range'
  :env.game==='arcade'||env.id==='neon-junction'||['arcade','neon-junction'].includes(layout)?'arcade':'world';
}
export function wheelSectorPath(index,count=6){const point=(angle,radius)=>[200+Math.cos(angle)*radius,200+Math.sin(angle)*radius].map(v=>v.toFixed(3)).join(' '),start=(index*360/count-120+1.5)*Math.PI/180,end=((index+1)*360/count-120-1.5)*Math.PI/180;return `M${point(start,184)} A184 184 0 0 1 ${point(end,184)} L${point(end,78)} A78 78 0 0 0 ${point(start,78)} Z`;}
export function mapWheelSvg(worlds,selectedId,prefix='map-wheel'){
 const palette={shipping:['#218ba5','#102c44'],prison:['#c68c43','#392f25'],island:['#2eaf96','#103c43'],proving:['#53c8d5','#183945'],compound:['#ad91e4','#302441'],funhouse:['#bd4b98','#2b103b'],factory:['#ef8b45','#482c1d'],fitness:['#d8ad45','#463415'],construction:['#96712e','#30291a'],ski:['#4788ab','#142e48'],basketball:['#7a451e','#291c12'],hockey:['#255c7a','#102836'],range:['#586f1d','#1b2b13'],arcade:['#5b3680','#231930'],world:['#235745','#10271d']};
 const pieces=worlds.slice(0,6).map(({env,count},index)=>{const kind=mapSectorKind(env),[light,dark]=(palette[kind]||({harbor:['#167f91','#102c36'],airport:['#376ea1','#142138']})[kind]),angle=(index*60-90)*Math.PI/180,x=200+Math.cos(angle)*132,y=200+Math.sin(angle)*132,id=prefix+'-'+index;const title=({shipping:'Hormuz Shipping',prison:'Ironwood Prison',island:'Island Adventure',proving:'Proving Grounds',compound:'Mountain Compound',funhouse:'Midnight Laughs',factory:'Missile Factory',fitness:'Fitness Centre',construction:'Construction',basketball:'Basketball',hockey:'Ice Hockey',range:'Firing Range',harbor:'Docks & Yacht',airport:'Airport',ski:'Pixel Peaks',arcade:'Neon Junction'})[kind]||String(env.name||env.id).replace(/^MUZIKAZ\s*/i,'').slice(0,17);return `<defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><g role="button" tabindex="0" class="world-map-sector world-map-sector-svg${count?' has-players':''}" data-world-id="${escape(env.id)}" data-kind="${kind}" aria-label="${escape(env.name||env.id)}, ${Number(count)||0} users live, ${Number(env.aiCount)||0} AI characters" aria-pressed="${env.id===selectedId}"><title>${escape(env.name||env.id)}</title><path class="world-sector-wedge" d="${wheelSectorPath(index)}" fill="url(#${id})"/><g class="world-sector-icon" transform="translate(${x.toFixed(2)} ${(y-17).toFixed(2)})" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[kind]||icons.world}</g><text class="world-sector-title" x="${x.toFixed(2)}" y="${(y+12).toFixed(2)}" text-anchor="middle">${escape(title)}</text><text class="world-sector-activity" x="${x.toFixed(2)}" y="${(y+28).toFixed(2)}" text-anchor="middle">${Number(count)||0} USERS LIVE</text></g>`;});
 return `<svg class="world-wheel-svg" viewBox="0 0 400 400" role="group" aria-label="Choose a map from the destination wheel"><circle class="world-wheel-orbit" cx="200" cy="200" r="194" fill="none"/><circle cx="200" cy="200" r="73" fill="#08170e" stroke="#9cff0066"/>${pieces.join('')}</svg>`;
}
