import {MARKET_CATEGORIES} from './market-categories.js';
import {marketFacets} from './market-facets.js';
export const MARKET_SOURCES=[['','All items'],['upgrade','Game items'],['quarry','Quarry materials'],['native','Native items & functions'],['native-map','Native map templates'],['player','Member sales'],['custom','Custom items'],['builder','Builder assets'],['model','3D models'],['land','Land & deeds'],['care','Care supplies'],['bundle','Bundles']];
export function initialMarketSource(search=''){const source=new URLSearchParams(search).get('source')||'';return MARKET_SOURCES.some(([id])=>id===source)?source:'';}
export function matchesMarketSource(item,source){if(!source)return true;if(source==='native')return item.native===true;if(source==='custom')return item.itemType==='custom-item'||item.type==='custom-item'||item.asset?.asset_type==='custom';return item.source===source;}
export function mainMarketEntries(items){return items.map(item=>({item,facts:marketFacets(item)}));}
export function mainMarketOptions(entries,{source='',category=''}={}){
 const scoped=entries.filter(({item})=>matchesMarketSource(item,source)),categoryCounts=new Map(),subtypes=new Map();
 for(const {facts}of scoped){categoryCounts.set(facts.category,(categoryCounts.get(facts.category)||0)+1);if(!category||category===facts.category){const value=subtypes.get(facts.subcategory)||{id:facts.subcategory,label:facts.subcategoryLabel,count:0};value.count++;subtypes.set(value.id,value);}}
 return {categories:MARKET_CATEGORIES.filter(value=>categoryCounts.has(value.id)).map(value=>({...value,count:categoryCounts.get(value.id)})),subcategories:[...subtypes.values()].sort((a,b)=>a.label.localeCompare(b.label))};
}
export function filterMainMarket(entries,{source='',category='',subcategory='',uses=[],query=''}={}){
 const text=query.trim().toLowerCase();return entries.filter(({item,facts})=>matchesMarketSource(item,source)&&(!category||category===facts.category)&&(!subcategory||subcategory===facts.subcategory)&&(!uses.length||uses.some(use=>facts.uses.includes(use)))&&(!text||`${facts.search} ${item.seller||''} ${item.description||''} ${item.nativeFunction||''} ${(item.nativeMaps||[]).flatMap(map=>[map.name,...(map.aliases||[])]).join(' ')}`.toLowerCase().includes(text)));
}
