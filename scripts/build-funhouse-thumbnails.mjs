import {mkdir,writeFile} from 'node:fs/promises';
import {FUNHOUSE_ITEMS} from '../public/js/clown-funhouse-items.js';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palette=['#ed5278','#53d7cf','#ffd374','#bc7fdf','#8eb5ed'];
const circle=(x,y,r,color)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;
const rect=(x,y,w,h,color,rx=4)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${color}"/>`;
const line=(x1,y1,x2,y2,color,width=5)=>`<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
function face(x,y,r=35,color='#982340'){
 const point=(dx,dy)=>`${x+dx*r} ${y+dy*r}`;
 const eyes=[-1,1].map(side=>{
  const cx=x+side*r*.28;
  return `<path d="M${cx-r*.19} ${y-r*.43}L${cx+r*.2} ${y-r*.35}L${cx+r*.11} ${y+r*.08}L${cx-r*.09} ${y+r*.04}Z" fill="#17121f"/>`+
   line(cx-side*r*.2,y-r*.52,cx+side*r*.14,y-r*.39,'#17121f',r*.085)+
   circle(cx,y-r*.19,r*.045,'#e77973')+
   `<path d="M${cx-r*.08} ${y+r*.04}L${cx+r*.08} ${y+r*.04}L${cx+side*r*.04} ${y+r*.35}Z" fill="#68213e"/>`;
 }).join('');
 const teeth=Array.from({length:7},(_,index)=>{
  const dx=-.45+index*.15,cy=.35+.17*(1-(dx/.5)**2);
  return `<path d="M${point(dx-.05,cy)}L${point(dx+.05,cy)}L${point(dx+.038,cy+.14)}L${point(dx-.037,cy+.14)}Z" fill="#f8efd8"/>`;
 }).join('');
 return `<g data-creepy-clown="true">`+circle(x-r*.9,y,r*.44,color)+circle(x+r*.9,y,r*.44,color)+
  `<ellipse cx="${x}" cy="${y}" rx="${r*.83}" ry="${r}" fill="#e9e4d8"/>`+eyes+
  circle(x,y+r*.09,r*.18,'#a8213e')+circle(x-r*.05,y+r*.03,r*.045,'#eb8e88')+
  `<path d="M${point(-.58,.22)}Q${point(0,.63)} ${point(.58,.22)}Q${point(.48,.91)} ${point(0,.89)}Q${point(-.48,.91)} ${point(-.58,.22)}Z" fill="#15101c" stroke="#92213e" stroke-width="${r*.08}"/>`+teeth+`</g>`;
}
function hat(x=240,y=150){return `<path d="M${x-58} ${y}a58 56 0 0 1 116 0" fill="#53d7cf"/>`+rect(x-72,y-4,144,12,'#ffd374',6)+line(x,y-57,x,y-80,'#c4def0',5)+`<ellipse cx="${x}" cy="${y-81}" rx="56" ry="8" fill="#ed5278" transform="rotate(-12 ${x} ${y-81})"/>`+circle(x,y-81,7,'#ffd374');}
function shoes(x=240,y=195){return `<ellipse cx="${x-49}" cy="${y}" rx="63" ry="24" fill="#ffd374"/><ellipse cx="${x+55}" cy="${y}" rx="63" ry="24" fill="#ed5278"/>`+rect(x-84,y-41,41,42,'#ed5278',12)+rect(x+51,y-41,41,42,'#53d7cf',12)+[0,1,2].map(i=>line(x-72+i*9,y-25,x-79+i*9,y-6,'#fff4d6',4)+line(x+63+i*9,y-25,x+56+i*9,y-6,'#fff4d6',4)).join('');}
function stall(label,color){return rect(135,142,210,75,'#f5dfb4')+Array.from({length:8},(_,i)=>rect(139+i*26,142,12,75,'#ed5278',0)).join('')+rect(126,212,228,12,'#603b46')+line(131,210,131,94,'#ffd374')+line(349,210,349,94,'#ffd374')+`<path d="M115 106L240 45 365 106Z" fill="${color}"/>`+rect(147,105,186,36,'#261530')+`<text x="240" y="129" text-anchor="middle" fill="#ffe2a0" font-size="16" font-weight="700">${label}</text>`;}
function drawing(id){
 if(id.endsWith('-avatar')){
  const index=['ringmaster','juggler','greeter','driver','scare-clown'].findIndex(role=>id.includes(role)),color=['#7b203c','#3e294f','#632039','#28303f','#461e47'][(index+5)%5];
  let body=`<ellipse cx="240" cy="194" rx="39" ry="46" fill="${color}"/>`+line(208,171,187,210,color,17)+line(272,171,292,210,color,17)+circle(185,211,12,'#fff0d1')+circle(294,211,12,'#fff0d1')+line(224,221,218,248,'#53d7cf',17)+line(256,221,262,248,'#ed5278',17)+`<ellipse cx="205" cy="253" rx="26" ry="10" fill="#ffd374"/><ellipse cx="275" cy="253" rx="26" ry="10" fill="#ed5278"/>`+face(240,121,35,index===4?'#44213f':'#982340')+[174,190,206].map(y=>circle(240,y,4,'#ffd374')).join('');
  body+=`<g transform="translate(0 13) scale(1 .6)">${hat(240,119)}</g>`;
  if(index===1)body+=[[-65,10],[0,-7],[65,15]].map(([x,y],i)=>circle(240+x,55+y,10,palette[i])).join('');
  if(index===0)body+=line(306,185,320,115,'#ffd374',5)+circle(320,107,10,'#ed5278');
  return body;
 }
 if(id==='funhouse-horror-house')return rect(91,112,298,132,'#f7dfb5')+Array.from({length:15},(_,i)=>rect(95+i*20,112,9,132,'#ca3e68',0)).join('')+rect(122,69,236,33,'#21112c')+`<text x="240" y="91" text-anchor="middle" fill="#ffdc8f" font-size="16" font-weight="700">MIDNIGHT LAUGHS</text>`+face(240,123,58)+`<path d="M200 246v-42a40 40 0 0 1 80 0v42" fill="#1c1228" stroke="#ec5378" stroke-width="11"/>`;
 if(id==='funhouse-mirror-wall')return [0,1,2].map(i=>rect(119+i*79,77,74,160,'#ffd374')+rect(125+i*79,83,62,148,'#345e78')+`<path d="M${135+i*79} 211l42-105m-42 40 42-40" stroke="#8dece8" stroke-width="6" opacity=".65"/>`).join('');
 if(id==='funhouse-maze-bell')return line(202,243,202,66,'#ed5278',12)+line(202,73,285,73,'#ffd374',9)+`<path d="M249 98q28-26 56 0v54l15 13h-86l15-13z" fill="#ffd374" stroke="#c48d39" stroke-width="4"/>`+circle(277,179,10,'#c4def0')+rect(177,241,58,12,'#603b46');
 if(id==='funhouse-water-gallery')return stall('SPLASH THE CLOWNS','#8f4fa5')+[0,1,2,3,4,5].map(i=>face(158+i*33,166+(i%2)*8,12,palette[i%5])).join('')+line(142,202,338,202,'#53d7cf',7);
 if(id==='funhouse-water-gun')return rect(158,120,137,48,'#53d7cf',12)+rect(277,129,67,23,'#4f91b1')+rect(336,126,18,29,'#ffd374')+rect(187,159,32,67,'#ed5278',8)+circle(199,109,30,'#85e6e6')+`<path d="M233 171v23h28v-24" fill="none" stroke="#ffd374" stroke-width="7"/>`;
 if(id==='funhouse-clown-target')return line(240,189,240,251,'#8eaec5',8)+circle(240,143,74,'#2f6d76')+`<circle cx="240" cy="143" r="74" fill="none" stroke="#7bfff0" stroke-width="5"/>`+face(240,145,47)+`<path d="M210 100l30-58 30 58z" fill="#ffd374"/>`+circle(240,42,9,'#ed5278');
 if(id==='funhouse-clown-car')return circle(169,218,28,'#17132a')+circle(312,218,28,'#17132a')+circle(169,218,13,'#ffd374')+circle(312,218,13,'#ffd374')+rect(133,154,220,57,'#ed5278',20)+rect(225,133,105,33,'#ffd374')+`<path d="M168 154l28-52h76l33 52" fill="#53d7cf" stroke="#f8dfac" stroke-width="7"/>`+face(218,129,20)+circle(343,180,12,'#fff0bd')+circle(148,180,11,'#ffd374');
 if(id==='funhouse-dizzy-spinner')return `<ellipse cx="240" cy="211" rx="126" ry="45" fill="#9b527f" stroke="#ffd374" stroke-width="4"/>`+Array.from({length:6},(_,i)=>{const a=i/6*Math.PI*2,x=240+Math.cos(a)*104,y=208+Math.sin(a)*31;return line(240,194,x,y,'#ffd374',7)+`<ellipse cx="${x}" cy="${y}" rx="20" ry="16" fill="${palette[i%5]}"/>`;}).join('')+line(240,192,240,121,'#ffd374',12)+hat(240,117);
 if(id==='funhouse-dressing-room')return stall('CLOWN DRESSING ROOM','#9c5baa')+`<g transform="translate(83 64) scale(.45)">${hat()}</g><g transform="translate(151 100) scale(.45)">${shoes()}</g>`;
 if(id==='funhouse-propeller-hat')return hat(240,181);
 if(id==='funhouse-clown-shoes')return shoes(240,190);
 if(id==='funhouse-ball-pit')return `<ellipse cx="240" cy="181" rx="123" ry="61" fill="#452257" stroke="#ed5278" stroke-width="19"/>`+Array.from({length:27},(_,i)=>{const a=i*2.399,r=Math.sqrt((i+.5)/27);return circle(240+Math.cos(a)*103*r,180+Math.sin(a)*44*r,12,palette[i%5]);}).join('')+circle(209,109,20,'#f8dfb5')+circle(271,109,20,'#f8dfb5')+circle(209,109,9,'#241231')+circle(271,109,9,'#241231');
 if(id==='funhouse-jack-box')return rect(169,168,144,85,'#ffd374')+Array.from({length:6},(_,i)=>rect(178+i*23,168,11,85,'#ed5278',0)).join('')+`<path d="M222 169q48-15 0-30t22-32" fill="none" stroke="#9ebfd1" stroke-width="7"/>`+face(244,86,35)+`<path d="M169 164l-11-35 142-40 13 34z" fill="#53d7cf"/>`+line(314,207,335,207,'#9ebfd1')+line(335,207,335,185,'#9ebfd1')+circle(335,181,9,'#ed5278');
 if(id==='funhouse-popcorn-stall')return stall('FRESH POPCORN','#ed5278')+rect(209,148,64,60,'#478a98',2)+Array.from({length:12},(_,i)=>circle(215+(i%4)*15,180+Math.floor(i/4)*9,7,'#ffdc8f')).join('');
 if(id==='funhouse-ticket-booth')return stall('TICKETS','#53a9c0')+[0,1,2,3].map(i=>rect(168+i*38,184,26,15,palette[i])).join('');
 if(id==='funhouse-candy-stall')return stall('CANDY CARNIVAL','#bd69a6')+[0,1,2,3,4].map(i=>line(176+i*33,208,176+i*33,164,'#fff0c8',3)+circle(176+i*33,164,13,palette[i%5])+`<circle cx="${176+i*33}" cy="164" r="7" fill="none" stroke="#fff0c8" stroke-width="3"/>`).join('');
 if(id==='funhouse-circus-tent')return rect(151,150,178,94,'#563067')+`<path d="M121 155L240 58 359 155Z" fill="#e33f65"/>`+line(240,59,240,42,'#ffd374',4)+`<path d="M242 40l46 9-46 13z" fill="#ffd374"/>`+`<path d="M215 244v-64a25 25 0 0 1 50 0v64" fill="#261530"/>`+line(151,153,116,246,'#dcbfa1',2)+line(329,153,365,246,'#dcbfa1',2);
 if(id==='funhouse-fence')return [144,240,336].map(x=>rect(x-8,99,16,147,'#ed5278')+circle(x,100,11,'#ffd374')).join('')+rect(140,146,201,12,'#9a6454')+rect(140,204,201,12,'#9a6454');
 if(id==='funhouse-balloon-bunch')return [0,1,2,3,4].map(i=>{const x=174+i*33,y=94+(i%2)*26;return line(x,y+30,240,241,'#cbb4c7',2)+`<ellipse cx="${x}" cy="${y}" rx="27" ry="34" fill="${palette[i]}"/>`;}).join('')+rect(225,237,30,17,'#ffd374');
 if(id==='funhouse-bunting')return `<path d="M110 92Q240 181 370 92" fill="none" stroke="#cbb4c7" stroke-width="4"/>`+[0,1,2,3,4,5,6].map(i=>{const x=122+i*39,y=102+Math.sin(i/6*Math.PI)*39;return `<path d="M${x-14} ${y}h28l-14 37z" fill="${palette[i%5]}"/>`;}).join('');
 if(id==='funhouse-lamp')return rect(217,239,46,15,'#ffd374')+line(240,240,240,104,'#9890a8',10)+circle(240,98,28,'#fff0b8')+`<path d="M206 82h68l-7-22h-53z" fill="#955699"/>`;
 if(id==='funhouse-welcome-board')return line(240,249,240,182,'#ffd374',9)+rect(138,96,204,99,'#f6dfb3')+rect(145,103,190,85,'#321e44')+`<text x="240" y="137" text-anchor="middle" fill="#ffdb8a" font-size="19" font-weight="700">WELCOME</text><text x="240" y="166" text-anchor="middle" fill="#9af2e7" font-size="13">MAP &amp; ATTRACTIONS</text>`+rect(209,245,62,12,'#ed5278');
 if(id==='funhouse-midway-floor')return `<path d="M100 175l140-90 140 90-140 90z" fill="#704769" stroke="#e8ba66" stroke-width="4"/>`+[0,1,2,3,4].map(i=>line(125+i*28,191-i*18,265+i*28,101+i*18,'#a380a7',2)+line(125+i*28,159+i*18,265+i*28,249-i*18,'#a380a7',2)).join('')+`<path d="M214 188l26-17 26 17-26-43z" fill="#ffe2a5"/>`;
 return face(240,155,70);
}
const directory=new URL('../public/images/funhouse/items/',import.meta.url);await mkdir(directory,{recursive:true});
for(const [id,item]of Object.entries(FUNHOUSE_ITEMS)){
 const title=item.name.replace(/^Midnight /,'');const words=title.split(' '),lines=[''];for(const word of words){if((lines.at(-1)+' '+word).trim().length>29)lines.push(word);else lines[lines.length-1]=(lines.at(-1)+' '+word).trim();}
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360" role="img" aria-labelledby="title"><title id="title">${escape(item.name)}</title><defs><radialGradient id="bg"><stop stop-color="#543153"/><stop offset="1" stop-color="#1e142c"/></radialGradient></defs><rect width="480" height="360" rx="18" fill="url(#bg)"/><rect x="12" y="12" width="456" height="336" rx="12" fill="none" stroke="#b1875c" stroke-opacity=".5"/><text x="240" y="35" text-anchor="middle" fill="#e0b875" font-family="system-ui,sans-serif" font-size="11" letter-spacing="3">MIDNIGHT LAUGHS · FUNHOUSE</text><ellipse cx="240" cy="261" rx="126" ry="11" fill="#0d0a19" opacity=".48"/><g stroke-linejoin="round" font-family="system-ui,sans-serif">${drawing(id)}</g>${lines.slice(0,2).map((text,index)=>`<text x="240" y="${304+index*23}" text-anchor="middle" fill="#ffe6b1" font-family="system-ui,sans-serif" font-size="${title.length>40?18:20}" font-weight="650">${escape(text)}</text>`).join('')}</svg>\n`;
 await writeFile(new URL(id+'.svg',directory),svg);
}
console.log(`Generated ${Object.keys(FUNHOUSE_ITEMS).length} distinct funhouse item thumbnails.`);
