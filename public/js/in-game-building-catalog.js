import {NATIVE_BUILDER_ITEMS} from './native-builder-items.js';

const ROOM_IDS=new Set(['grand-floor','open-studio','connected-suite','garden-courtyard']);
const CATEGORY_LABELS={
 rooms:'Foundations & rooms',materials:'Building materials','scene-layouts':'Maps & layouts',
 buildings:'Buildings',interior:'Furniture & interiors',landscape:'Landscape & gardens',
 plants:'Trees & plants',terrain:'Terrain & water',props:'Props & utilities',
 interactive:'Interactive devices',sports:'Sports',arcade:'Arcade & games',
 fitness:'Fitness & gym',factory:'Factory & engineering',vehicles:'Vehicles',
 characters:'Characters',creatures:'Creatures',weapons:'Weapons & pickups',wearables:'Wearables'
};
const categoryFor=item=>item.materialId?'materials':ROOM_IDS.has(item.id)?'rooms':item.category==='seating'?'seats':item.category||'props';
const isSeat=item=>(item.behavior||item.function_data?.behavior)==='seat';
const readable=value=>String(value||'').replace(/[-_]/g,' ');
const labelFor=category=>category==='seats'?'Seats & benches':CATEGORY_LABELS[category]||readable(category);

// Use the same native identities and settings as the editor and server economy.
// Browsing this catalogue never creates an owned item or copies a live actor.
export const IN_GAME_BUILDING_ITEMS=Object.freeze(Object.values(NATIVE_BUILDER_ITEMS).map(item=>{
 const catalogCategory=categoryFor(item),catalogCategoryLabel=labelFor(catalogCategory);
 return Object.freeze({...item,catalogCategory,catalogCategoryLabel,
  thumbnailUrl:item.thumbnailUrl||item.thumbnail_url||item.image||'',
  catalogDescription:item.description||`${catalogCategoryLabel} · ${isSeat(item)?'Place a seat in your world.':'Place and configure this item in your world.'}`});
}));

const populated=new Set(IN_GAME_BUILDING_ITEMS.map(item=>item.catalogCategory));
const categoryIds=[...Object.keys(CATEGORY_LABELS).filter(id=>populated.has(id)),
 ...[...populated].filter(id=>id!=='seats'&&!Object.hasOwn(CATEGORY_LABELS,id)).sort()];
export const BUILDING_CATALOG_CATEGORIES=Object.freeze([
 Object.freeze({id:'all',label:'All native items',count:IN_GAME_BUILDING_ITEMS.length}),
 Object.freeze({id:'seats',label:'Seats & benches',count:IN_GAME_BUILDING_ITEMS.filter(isSeat).length}),
 ...categoryIds.map(id=>Object.freeze({id,label:labelFor(id),count:IN_GAME_BUILDING_ITEMS.filter(item=>item.catalogCategory===id).length}))
]);

export function matchesBuildingCatalogItem(item,category='all',query=''){
 if(!item)return false;
 const matchesCategory=category==='all'||category==='seats'&&isSeat(item)
  ||category==='map'&&item.id==='grand-floor'
  ||category==='room'&&ROOM_IDS.has(item.id)&&item.id!=='grand-floor'
  ||category!=='seats'&&categoryFor(item)===category;
 if(!matchesCategory)return false;
 const words=String(query||'').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 if(!words.length)return true;
 const text=[item.name,item.description,item.catalogDescription,item.catalogCategoryLabel,
  labelFor(categoryFor(item)),item.category,item.type,item.behavior,item.action,item.id,
  item.function_data?.prompt,...(Array.isArray(item.tags)?item.tags:[]),...(Array.isArray(item.keywords)?item.keywords:[])].filter(Boolean).join(' ').toLocaleLowerCase();
 return words.every(word=>text.includes(word));
}
