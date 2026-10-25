import {RANGED_WEAPONS} from './game-weapons.js';
import {UTILITY_TOOLS} from './game-utilities.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// These are tool illustrations, not substitutes for a placeable model. Distinct
// silhouettes make equipment recognisable even without reading its label.
const shapes=Object.freeze({
 laser:'<path d="M6 24h33l9 6v10H27l-6 17H11l4-17H6Z"/><path d="M39 26h8v11h-8" fill="#24372e"/><path d="M48 31h13" stroke="currentColor" stroke-width="4"/><circle cx="25" cy="31" r="4" fill="#fff"/>',
 bat:'<path d="M11 55c-3-3-2-8 1-11L40 8c4-5 10-5 14-1s4 10-1 14L19 55c-2 2-6 2-8 0Z"/><path d="m18 39 8 8-7 8c-2 2-6 2-8 0-3-3-2-7 0-9Z" fill="#24372e"/><path d="m16 42 8 8m-12-3 8 8" stroke="#fff1d4"/>',
 spray:'<path d="M7 26h37v14H24l-5 16H9l5-16H7Z"/><path d="M19 26V13h17v13" fill="#f87dc8"/><path d="M23 13V8h9v5M44 30l14-9m-14 14 17 1m-17 4 14 9" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="58" cy="12" r="3" fill="#f5c851"/>',
 brick:'<path d="m5 31 22-11 25 12-22 11Z"/><path d="M5 31v17l25 12V43M30 43l22-11v17L30 60" fill="#926344"/><path d="m16 17 20-10 22 10-21 11Z"/><path d="M16 17v15l21 10V28m0 0 21-11v15L37 42" fill="#db9a67"/><path d="m5 31 25 12 22-11M30 43v17m-14-43 21 11 21-11M37 28v14" fill="none" stroke="#fff2d6"/>',
 flamethrower:'<path d="M5 26h33v12H21v16H9V38H5Z"/><rect x="5" y="7" width="15" height="18" rx="5" fill="#ffb13b"/><path d="M43 38c-7-12 10-14 6-30 15 12 20 32 6 38-7 3-15-1-12-8Z" fill="#ff481d"/><path d="M49 40c-3-6 5-8 5-14 8 9 5 19 0 18Z" fill="#fff3a0"/>',
 taser:'<path d="M8 16h39v25H29v17H14V41H8Z"/><path d="M47 22h10v13H47Z" fill="#39e8ff"/><path d="m35 19-10 12h8l-8 10 17-15h-9Z" fill="#ffdf45"/><circle cx="17" cy="25" r="4" fill="#ff4fb3"/>',
 toxin:'<path d="M13 42V17h31l12 12v13Z" fill="#8e33d7"/><path d="M22 42h17v16H22Z"/><path d="M43 23h11v14H43Z"/><circle cx="33" cy="29" r="8"/><path d="m29 25 8 8m0-8-8 8" stroke="#172818"/><circle cx="7" cy="23" r="3"/><circle cx="4" cy="34" r="2"/>',
 dynamite:'<rect x="12" y="24" width="14" height="32" rx="6"/><rect x="26" y="20" width="14" height="38" rx="6"/><rect x="40" y="24" width="14" height="32" rx="6"/><path d="M12 34h42v7H12zm0 14h42v5H12Z" fill="#241411"/><path d="M33 20C31 9 45 14 45 5" fill="none" stroke="#d9ac68" stroke-width="3"/><path d="m48 3 4-3 1 6 7 1-6 3 1 6-5-4-6 3 2-7-4-4Z" fill="#ffdf45"/>',
 jetpack:'<path d="M17 13h30v33H17Z" fill="#25382b"/><rect x="8" y="17" width="14" height="32" rx="6"/><rect x="42" y="17" width="14" height="32" rx="6"/><path d="m10 49 5 13 5-13m24 0 5 13 5-13" fill="#39e8ff"/><path d="M25 22h14M25 31h14M25 40h14" stroke="#ffdf45" stroke-width="3"/>',
 'pulse-rifle':'<path d="M4 28h36v-6h16v20H28l-5 15H13l5-15H4Z"/><path d="M32 26h25m-25 6h25m-25 6h25" stroke="#e8ffff" stroke-width="2"/><path d="M14 28v-7h16v7" fill="#24372e"/><path d="M59 28h4m-4 9h4" stroke="currentColor" stroke-width="3"/>',
 'rail-cannon':'<path d="M3 25h24v21H15l-4 12H3l4-15Z"/><path d="M24 17h36v8H24zm0 22h36v8H24Z" fill="#d59cfa"/><path d="M28 31h34" stroke="currentColor" stroke-width="4"/><path d="M38 25v14m12-14v14" stroke="#edf0ff" stroke-width="2"/>',
 'pulse-pistol':'<path d="M10 21h30l9 8v14H29l-7 16H10l5-16H10Z"/><rect x="13" y="16" width="22" height="6" rx="2" fill="#e5ebd6"/><path d="M51 24q12 7 0 14m7-18q12 12 0 23" fill="none" stroke="currentColor" stroke-width="2"/>',
 'twin-blaster':'<path d="M8 25h24v23H22l-4 11H8l5-17H8Z"/><rect x="27" y="14" width="29" height="12" rx="4"/><rect x="27" y="35" width="29" height="12" rx="4"/><circle cx="53" cy="20" r="3" fill="#fff"/><circle cx="53" cy="41" r="3" fill="#fff"/><path d="M36 26v9m13-9v9" stroke="#efd8ff" stroke-width="3"/>',
 'heavy-bolt':'<path d="M4 24h29l4-7h16l7 13v16H27l-5 13H10l5-17H4Z"/><path d="M40 22h9l6 12H40Z" fill="#fff0d9"/><rect x="9" y="28" width="20" height="10" rx="3" fill="#643928"/><path d="m41 49 5 8 5-8" stroke="currentColor" fill="none"/>',
 'scatter-shot':'<path d="M3 24h36v19H25l-6 15H8l5-15H3Z"/><path d="M31 27h10v5H31zm0 9h10v5H31Z" fill="#e6f1dc"/><path d="m44 31 16-17M45 34h17m-18 3 16 17m-14-22 16-9m-16 13 16 9" fill="none" stroke="currentColor" stroke-width="2"/>',
 marksman:'<path d="M3 30h32v12H21l-5 16H6l5-16H3Z"/><path d="M32 32h29v6H32Z"/><rect x="21" y="15" width="24" height="10" rx="4"/><path d="M30 25v5m6-5v5M5 42l-3 10m36-14 10 17m-10-17L29 55" fill="none" stroke="#d3fce3" stroke-width="3"/>',
 'arc-carbine':'<path d="M4 28h32l8-8h13v22H27l-6 16H10l5-16H4Z"/><path d="m40 23-9 12h9l-9 13 21-21H40Z" fill="#e8f8ff"/><path d="M58 24q6 3 2 7l3 5-6 5" fill="none" stroke="currentColor" stroke-width="2"/>',
 medkit:'<rect x="8" y="20" width="48" height="36" rx="7"/><path d="M23 20v-8h18v8" fill="none" stroke="currentColor" stroke-width="4"/><path d="M27 26h10v8h8v10h-8v8H27v-8h-8V34h8Z" fill="#173a2d"/>',
 'shield-kit':'<path d="m32 5 23 9v18c0 15-13 23-23 28C22 55 9 47 9 32V14Z"/><path d="m32 14 14 6v13c0 8-6 14-14 19-8-5-14-11-14-19V20Z" fill="#24372e"/><path d="m32 20 8 12-8 13-8-13Z" fill="#ffc3ed"/>',
 scanner:'<rect x="9" y="12" width="46" height="44" rx="7"/><rect x="14" y="18" width="36" height="31" rx="4" fill="#152d2b"/><circle cx="32" cy="34" r="13" fill="none" stroke="currentColor"/><circle cx="32" cy="34" r="6" fill="none" stroke="currentColor"/><path d="m32 34 9-10M32 21v26m-13-13h26" stroke="currentColor" fill="none"/><circle cx="26" cy="39" r="2" fill="#ffdf45"/><path d="M42 12V4" stroke="currentColor" stroke-width="3"/>',
 'repair-tool':'<path d="m20 27 10-10 9 9-10 10Z" fill="#7c5535"/><path d="m21 31 9 9-19 20-9-9Z"/><path d="m26 13 8-8 24 24-8 8-6-7-8 8-12-12 8-8Z"/><path d="m38 9 16 16" stroke="#fff2ca" stroke-width="3"/>',
 recycler:'<path d="m25 7 8 1 9 14-8 5-7-11-6 10-8-4Z"/><path d="m49 26 8 14-6 10H37v-9h12l-7-11Z"/><path d="m28 52-17-1-6-11 8-13 8 5-7 11h14Z"/><path d="m30 7 10-3-1 11m17 28 7 6-12 5M12 50l-8 8-1-12" fill="none" stroke="#def9b3" stroke-width="3"/><path d="m31 29 8 4v9l-8 4-8-4v-9Z" fill="#263c28"/>',
 'supply-kit':'<path d="M14 20h36l5 7v30H9V27Z"/><path d="M19 20V9h25v11M21 9l17 11" stroke="currentColor" stroke-width="4" fill="none"/><path d="M32 27c-2 7-10 13-10 19a10 10 0 0 0 20 0c0-6-8-12-10-19Z" fill="#24372e"/><path d="m28 45 3 4 6-7" fill="none" stroke="#ffe3b5" stroke-width="2"/>',
 beacon:'<path d="m18 51 14-8 14 8v8H18Z"/><path d="M32 44V16" stroke="currentColor" stroke-width="5"/><circle cx="32" cy="15" r="5"/><path d="M23 8a13 13 0 0 0 0 16m18-16a13 13 0 0 1 0 16M15 3a23 23 0 0 0 0 27M49 3a23 23 0 0 1 0 27" stroke="currentColor" stroke-width="3" fill="none"/>',
});
const colors={bat:0xd9a468,spray:0x4cdcc7,brick:0xe0a264,flamethrower:0xff751f,taser:0xdfff75,toxin:0xb8ff35,dynamite:0xd81f32,jetpack:0x9cff00};
export const TOOL_PREVIEW_IDS=Object.freeze(Object.keys(shapes));
export function toolPreviewArt(toolId,{name,color}={}){
 if(!Object.hasOwn(shapes,toolId))return '';
 const profile=RANGED_WEAPONS[toolId]||UTILITY_TOOLS[toolId],fill=/^#[\da-f]{6}$/i.test(color||'')?color:'#'+Number(profile?.color??colors[toolId]??0x9cff69).toString(16).padStart(6,'0');
 return `<svg viewBox="0 0 64 64" data-tool-illustration="${escape(toolId)}" role="img" aria-label="${escape(name||profile?.label||toolId)} tool illustration" style="color:${fill};fill:currentColor" stroke-linejoin="round" stroke-linecap="round">${shapes[toolId]}</svg>`;
}
