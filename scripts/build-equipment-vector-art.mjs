import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Source artwork only: the browser downloads these static vectors as ordinary
// thumbnails. No generator, renderer, effect loop or new texture enters gameplay.
export const EQUIPMENT_VECTOR_VERSION='portal-equipment-v1';
export const EQUIPMENT_VECTOR_DESIGNS=Object.freeze([
 ['tool:laser','Laser','#ff607c','Focused beam emitter'],
 ['tool:pulse-rifle','Pulse Rifle','#51dcff','Twin pulse receiver'],
 ['tool:rail-cannon','Rail Cannon','#c28aff','Precision rail assembly'],
 ['tool:pulse-pistol','Pulse Pistol','#f1dd78','Compact pulse sidearm'],
 ['tool:twin-blaster','Twin Blaster','#ff86dc','Paired energy barrels'],
 ['tool:heavy-bolt','Heavy Bolt','#ff9b72','Heavy bolt chamber'],
 ['tool:scatter-shot','Scatter Shot','#ffca70','Wide twin-bore receiver'],
 ['tool:marksman','Marksman','#81efb9','Long-range optic and barrel'],
 ['tool:arc-carbine','Arc Carbine','#80b6ff','Compact electric receiver'],
 ['tool:bat','Basic Bat','#dbb183','Walnut bat and wrapped grip'],
 ['tool:flamethrower','Flash Igniter','#ffb36e','Igniter reservoir and nozzle'],
 ['tool:taser','Taser','#92dcff','Compact electrical contact tool'],
 ['tool:toxin','Toxins Thrower','#a1ec77','Sealed canister and delivery nozzle'],
 ['tool:dynamite','Dynamite','#ff8c91','Paper sleeve, straps and fuse'],
 ['tool:medkit','Medkit','#85efbd','Medical field case'],
 ['tool:shield-kit','Shield Kit','#ef9cdd','Portable shield emitter'],
 ['tool:scanner','Scanner','#75d8ff','Handheld radar display'],
 ['tool:repair-tool','Repair Tool','#f3ca7a','Alloy repair hammer'],
 ['tool:recycler','Recycler','#b5ec86','Material recovery field case'],
 ['tool:supply-kit','Supply Kit','#f4b181','Latched supply field case'],
 ['tool:beacon','Beacon','#cbb0ff','Caged signal crystal'],
 ['tool:spray','Paint Gun','#e8a8df','Paint reservoir and spray nozzle'],
 ['tool:brick','Building Kit','#e6bd81','Stackable studded building block'],
 ['tool:jetpack','Jetpack','#8cddda','Twin tanks, straps and thrusters'],
 ['plasma-sword','Plasma Sword','#6be6ff','Luminous blade and alloy hilt'],
 ['battle-axe','Battle Axe','#c6d9e4','Forged double blade and wrapped haft'],
 ['arc-bow','Arc Bow','#ecc894','Curved limbs and energy string'],
 ['crystal-staff','Crystal Staff','#c7a5ff','Faceted crystal in an alloy crown'],
 ['funhouse-water-gun','Carnival Water Blaster','#81e4d9','Mint tank, orange collar and toy spray nozzle'],
].map(([id,name,color,description])=>Object.freeze({id,name,color,description,
 path:'public/images/native-designs/'+id.replace(':','-')+'.svg'})));

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const path=(d,fill='url(#alloy)',stroke='#89a0b2',width=1.2)=>`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const rect=(x,y,w,h,fill='url(#alloy)',r=3,stroke='#89a0b2')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
const line=(d,color='var(--accent)',width=2)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
const circle=(x,y,r,fill='var(--accent)',stroke='none')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
const screw=(x,y)=>circle(x,y,2.2,'#a7bdcc')+line(`M${x-1} ${y}h2`,'#344857',.8);
const ribs=(x,y,n=4,step=6)=>Array.from({length:n},(_,i)=>line(`M${x} ${y+i*step}h19`,'#6c8496',2)).join('');

function ranged(id){
 const pistol=['pulse-pistol','taser'].includes(id),long=['marksman','rail-cannon','heavy-bolt'].includes(id),twin=['twin-blaster','scatter-shot'].includes(id);
 const front=pistol?212:long?246:232,back=pistol?90:63,receiverEnd=pistol?190:194;
 let art=path(`M${back} 130H${receiverEnd-12}l12 11v37H${back+9}l-9-12Z`,'url(#receiver)')+
  path(`M${back+21} 171h31l-9 58h-24l-7-10Z`,'url(#grip)','#506779')+
  ribs(back+19,190,4,7)+path(`M${back+50} 177h35l-3 24h-29`,'none','#91a7b4',4)+
  rect(back+19,121,receiverEnd-back-40,8,'url(#alloy)',2)+
  rect(back+9,143,receiverEnd-back-24,24,'url(#alloy)',5)+
  line(`M${back+18} 151H${receiverEnd-26}`,'var(--accent)',5)+
  line(`M${back+18} 151H${receiverEnd-26}`,'#ecfbff',1)+screw(back+14,163)+screw(receiverEnd-20,163);
 if(!pistol)art+=path(`M${back} 136l-22 3-8 29 30-3Z`,'url(#grip)')+line(`M${back-24} 147l8-2`,'#98adbd',2);
 for(const y of twin?[139,159]:[149])art+=rect(receiverEnd-3,y-7,front-receiverEnd+7,14,'url(#alloy)',3)+rect(front,y-10,10,20,'url(#receiver)',3)+line(`M${front+2} ${y-6}v12`,'var(--accent)',3);
 if(id==='rail-cannon')art+=line('M185 133h62m-62 34h62','var(--accent)',3)+rect(145,100,47,17,'url(#receiver)',6)+circle(190,108,5,'var(--accent)');
 if(id==='marksman')art+=rect(125,99,72,19,'url(#grip)',8)+rect(136,94,14,28,'url(#receiver)',5)+rect(185,95,17,27,'url(#alloy)',5)+circle(196,108,7,'#213d40')+circle(197,107,4,'var(--accent)');
 if(id==='heavy-bolt')art+=rect(138,168,43,26,'url(#receiver)',7)+line('M147 178h24','var(--accent)',3);
 if(id==='scatter-shot')art+=rect(175,132,34,41,'url(#grip)',4)+[181,189,197].map(x=>line(`M${x} 137v31`,'#758b9b',2)).join('');
 if(id==='arc-carbine')art+=path('M148 141l-11 14h12l-7 10 22-17h-13l7-7Z','var(--accent)','none');
 if(id==='taser')art+=line(`M${front+10} 139h8m-8 19h8`,'#c5e9f1',4)+line(`M${front+14} 143l-3 6 7 2-5 6`,'var(--accent)',2);
 if(id==='pulse-rifle')art+=rect(144,173,28,26,'url(#grip)',3)+line('M149 183h16','var(--accent)',3);
 if(['flamethrower','toxin','spray','funhouse-water-gun'].includes(id)){
  const fill=id==='funhouse-water-gun'?'#7acfc7':id==='toxin'?'#729e52':id==='spray'?'#b980a5':'#b8824d';
  art+=rect(108,83,49,44,fill,15)+rect(111,93,43,24,'url(#tank)',10)+rect(119,77,25,8,'url(#alloy)',2)+line('M120 94v24','#e4fff4',2)+rect(front,139,15,20,id==='funhouse-water-gun'?'#e9a45c':'url(#alloy)',3);
 }
 return `<g transform="rotate(-14 160 156)">${art}</g>`;
}

function drawing(id){
 if(['laser','pulse-rifle','rail-cannon','pulse-pistol','twin-blaster','heavy-bolt','scatter-shot','marksman','arc-carbine','flamethrower','taser','toxin','spray','funhouse-water-gun'].includes(id))return ranged(id);
 if(id==='bat')return `<g transform="rotate(32 160 158)">`+path('M150 62Q160 55 170 62l-1 85-7 43v50h-5v-50l-8-43Z','url(#wood)','#bc9066')+line('M155 73v68m7-75 2 72','#e1bd8f',1.4)+rect(153,191,13,45,'url(#grip)',3)+ribs(153,197,6,6)+rect(150,238,20,6,'url(#alloy)',3)+'</g>';
 if(id==='dynamite')return `<g transform="rotate(-24 160 155)">`+rect(68,130,168,46,'#c65e68',17)+rect(83,135,137,33,'url(#paper)',8)+rect(107,129,12,48,'url(#grip)',2)+rect(184,129,12,48,'url(#grip)',2)+line('M237 150q31 0 18-28t15-20','#adb6a4',4)+line('M265 97l4-9m8 14 8-4m-14 11 3 7','var(--accent)',2)+line('M136 151h28','#f4d0bc',2)+'</g>';
 if(id==='brick')return path('M62 134l111-49 85 45-112 51Z','url(#alloy)')+path('M62 134v53l84 47v-53Z','url(#receiver)')+path('M146 181l112-51v53l-112 51Z','url(#tank)')+[[115,127],[155,109],[158,148],[198,130]].map(([x,y])=>`<ellipse cx="${x}" cy="${y+4}" rx="17" ry="10" fill="#526c7b"/><path d="M${x-17} ${y+4}v-8h34v8" fill="#91adbc"/><ellipse cx="${x}" cy="${y-4}" rx="17" ry="9" fill="#c6d5dd" stroke="#6a8798"/>`).join('');
 if(id==='repair-tool')return `<g transform="rotate(30 160 157)">`+rect(151,93,18,141,'url(#alloy)',4)+rect(148,156,24,81,'url(#grip)',6)+Array.from({length:9},(_,i)=>line(`M150 ${164+i*8}h20`,'#738a98',2)).join('')+path('M102 79h111l12 13-12 22H102l-10-10V88Z','url(#alloy)')+rect(100,80,17,34,'var(--accent)',2)+line('M127 86h68','#f0f5f8',1)+'</g>';
 if(id==='scanner')return `<g transform="rotate(12 160 160)">`+rect(104,66,112,180,'url(#receiver)',16)+rect(113,79,94,122,'#193844',9)+rect(120,87,80,104,'#142c38',5)+circle(160,138,31,'none','#74c6cf')+circle(160,138,17,'none','#4b8295')+line('M160 102v72m-36-36h72','#38616c',1)+path('M160 138l22-20a31 31 0 0 0-22-11Z','var(--accent)','none')+circle(176,151,3,'var(--accent)')+circle(143,126,2,'#d0fcff')+rect(124,216,17,7,'var(--accent)',2)+rect(152,216,17,7,'url(#alloy)',2)+rect(181,216,13,7,'url(#alloy)',2)+screw(114,75)+screw(205,237)+'</g>';
 if(id==='beacon'||id==='crystal-staff'){
  const staff=id==='crystal-staff';
  return (staff?rect(154,128,12,117,'url(#grip)',5)+line('M158 159v72','#c4b5d9',1):rect(128,205,64,15,'url(#receiver)',5)+rect(142,142,36,62,'url(#alloy)',6))+
   path('M160 58l22 34-8 42h-28l-8-42Z','var(--accent)','#d9e7f0')+path('M160 58l-2 40 16 36 8-42Z','#7581b3','none')+path('M160 58l-22 34 20 6Z','#eef5ff','none')+path('M146 134l-15-33m43 33 15-33','none','#98aebf',5)+rect(145,134,30,11,'url(#alloy)',3)+line('M145 151h30','var(--accent)',2)+(!staff?line('M116 91q-10 14 0 29m88-29q10 14 0 29','var(--accent)',2):rect(152,234,16,12,'url(#alloy)',2));
 }
 if(id==='jetpack')return rect(126,88,68,129,'url(#receiver)',13)+[101,219].map(x=>rect(x-19,81,38,125,'url(#tank)',17)+rect(x-22,109,44,11,'url(#alloy)',3)+rect(x-22,172,44,11,'url(#alloy)',3)+path(`M${x-16} 204h32l-5 28h-22Z`,'url(#alloy)')+rect(x-10,225,20,5,'var(--accent)',2)).join('')+path('M135 98h13v88h-13Zm37 0h13v88h-13Z','url(#grip)')+line('M155 112h10m-10 12h10m-10 12h10','var(--accent)',2)+path('M143 216l-10 21h54l-10-21Z','url(#receiver)');
 if(id==='plasma-sword')return `<g transform="rotate(32 160 160)">`+path('M160 48l12 30-6 99h-12l-6-99Z','var(--accent)','#a1e5f4',2)+path('M160 48v128h6l6-99Z','#c6fbff','none')+path('M125 177h70l-8 12h-54Z','url(#alloy)')+rect(153,189,14,45,'url(#grip)',3)+ribs(153,197,4,8)+path('M151 236h18l-3 9h-12Z','url(#alloy)')+'</g>';
 if(id==='battle-axe')return `<g transform="rotate(27 160 158)">`+rect(153,75,14,168,'url(#wood)',4)+path('M151 92q-21 10-49-9l-15 53q38 15 64-10Zm18 0q21 10 49-9l15 53q-38 15-64-10Z','url(#alloy)')+path('M102 83l-15 53 14 3 10-53Zm116 0 15 53-14 3-10-53Z','#d3e3ed','none')+rect(148,92,24,40,'url(#receiver)',4)+circle(160,111,5,'var(--accent)')+rect(150,183,20,55,'url(#grip)',4)+ribs(151,190,7,7)+'</g>';
 if(id==='arc-bow')return path('M152 63q-73 40-61 91-12 51 61 91l-17-31q-31-25-24-60-7-35 24-60Z','url(#wood)','#c9a371',2)+path('M151 64l48 90-48 90','none','var(--accent)',2)+rect(100,135,15,38,'url(#grip)',4)+line('M109 154h121','#ccd9e4',3)+path('M232 154l-17-6 2 6-2 6Z','#e5eff5','none')+line('M113 77l15 13m-16 141 16-13','url(#alloy)',5);
 let art=rect(83,110,154,106,'url(#receiver)',15)+path('M131 110v-15h58v15','none','#91a9ba',8)+rect(94,123,132,79,'url(#alloy)',10)+[106,214].map(x=>rect(x-6,108,12,30,'url(#grip)',3)+screw(x,117)).join('')+line('M101 190h118','#3c5567',2);
 if(id==='medkit')art+=rect(151,137,18,49,'var(--accent)',2)+rect(135,152,50,18,'var(--accent)',2);
 else if(id==='shield-kit')art+=path('M160 136l27 8v22q-1 15-27 25-26-10-27-25v-22Z','#243d4e','var(--accent)',2)+path('M160 145v33m-13-23 13-10 13 10','none','var(--accent)',2);
 else if(id==='recycler')art+=line('M143 146l17-9 17 10m-8-2 8 2-1-8m7 16v19l-17 9m8-1-8 1 3-8m-14 6-17-9v-20m-4 7 4-7 6 5','var(--accent)',3);
 else art+=Array.from({length:3},(_,i)=>rect(139,142+i*14,42-i*9,5,'var(--accent)',2));
 return `<g transform="rotate(-9 160 162)">${art}</g>`;
}

export function equipmentVectorSvg(design){
 const id=design.id.replace(/^tool:/,''),font=design.name.length>20?17:design.name.length>15?19:22;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320" role="img" aria-labelledby="title desc" data-native-vector="${EQUIPMENT_VECTOR_VERSION}" style="--accent:${design.color}"><title id="title">${esc(design.name)}</title><desc id="desc">${esc(design.description)}. Clean vector equipment illustration with portal-inspired luminous inlays.</desc><defs><radialGradient id="bg" cx=".5" cy=".42" r=".74"><stop stop-color="#20394c"/><stop offset="1" stop-color="#0a1421"/></radialGradient><radialGradient id="halo"><stop stop-color="${design.color}" stop-opacity=".12"/><stop offset="1" stop-color="${design.color}" stop-opacity="0"/></radialGradient><linearGradient id="alloy" x2=".3" y2="1"><stop stop-color="#c2d6e1"/><stop offset=".46" stop-color="#809aab"/><stop offset="1" stop-color="#3d566a"/></linearGradient><linearGradient id="receiver" x2=".2" y2="1"><stop stop-color="#566d80"/><stop offset=".43" stop-color="#304a60"/><stop offset="1" stop-color="#172b40"/></linearGradient><linearGradient id="grip" x2="1" y2=".25"><stop stop-color="#111e2b"/><stop offset=".5" stop-color="#2d3f4b"/><stop offset="1" stop-color="#152431"/></linearGradient><linearGradient id="tank" x2="1" y2=".1"><stop stop-color="#385e6c"/><stop offset=".4" stop-color="${design.color}"/><stop offset="1" stop-color="#3b5f70"/></linearGradient><linearGradient id="wood" x2="1"><stop stop-color="#75523c"/><stop offset=".5" stop-color="#cda278"/><stop offset="1" stop-color="#916446"/></linearGradient><linearGradient id="paper" x2="0" y2="1"><stop stop-color="#e3a08e"/><stop offset=".5" stop-color="#ca6c71"/><stop offset="1" stop-color="#8d3f56"/></linearGradient></defs><rect width="320" height="320" rx="22" fill="url(#bg)"/><rect x="10" y="10" width="300" height="300" rx="15" fill="none" stroke="#527288" stroke-opacity=".4"/><circle cx="160" cy="154" r="116" fill="url(#halo)"/><circle cx="160" cy="154" r="104" fill="none" stroke="${design.color}" stroke-opacity=".11"/><path d="M65 113a104 104 0 0 1 38-44m114 0a104 104 0 0 1 38 44M65 195a104 104 0 0 0 38 44m114 0a104 104 0 0 0 38-44" fill="none" stroke="${design.color}" stroke-opacity=".45" stroke-width="2"/><text x="160" y="34" text-anchor="middle" fill="#a2b8c9" font-family="system-ui,sans-serif" font-size="9" letter-spacing="3">MUZIKAZ · EQUIPMENT</text><g stroke-linejoin="round">${drawing(id)}</g><path d="M43 263h234" stroke="#6c8b9e" stroke-opacity=".3"/><text x="160" y="292" text-anchor="middle" fill="#e6f0f5" font-family="system-ui,sans-serif" font-weight="600" font-size="${font}">${esc(design.name)}</text></svg>\n`;
}

export async function buildEquipmentVectorArt({check=false}={}){
 let bytes=0;
 for(const design of EQUIPMENT_VECTOR_DESIGNS){
  const target=new URL('../'+design.path,import.meta.url),svg=equipmentVectorSvg(design);bytes+=Buffer.byteLength(svg);
  if(check){if(await readFile(target,'utf8')!==svg)throw Error('Outdated equipment artwork: '+design.id);}
  else{await mkdir(new URL('.',target),{recursive:true});await writeFile(target,svg);}
 }
 return {items:EQUIPMENT_VECTOR_DESIGNS.length,bytes};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const report=await buildEquipmentVectorArt({check:process.argv.includes('--check')});
 console.log(`${process.argv.includes('--check')?'Verified':'Generated'} ${report.items} clean equipment SVGs (${report.bytes.toLocaleString()} bytes total).`);
}
