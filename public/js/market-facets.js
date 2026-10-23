import {AIRCRAFT_TYPES} from './aircraft-types.js';
import {marketCategory} from './market-categories.js';
import {INTERACTIVE_DEVICES} from './interactive-devices.js';
import {ENTERABLE_BUILDINGS} from './building-districts.js';
export const MARKET_USE_CASES=Object.freeze({build:'Build & furnish',decorate:'Decorate spaces',play:'Play games',media:'Share video & music',trade:'Shop & trade',combat:'Combat & defence',drive:'Drive vehicles',fly:'Fly & travel',avatar:'Choose a character',wear:'Wear & equip',quest:'Quests & role play',restore:'Health & survival',travel:'Explore maps & portals'});
const label=id=>({boxing:'Boxing equipment',strength:'Weights & strength',cardio:'Cardio machines',movement:'Agility & rhythm',recovery:'Balance & recovery',gym:'Gym furnishings','card-games':'Card games','retro-games':'Retro action games',puzzles:'Puzzles & board games',slots:'Slot machines',trivia:'Trivia',video:'Video & camera screens',audio:'Music & audio',displays:'Images & noticeboards',shopping:'Market terminals',hospitality:'Taverns, cafes & hotels',commerce:'Shops & banks',industrial:'Garages & workshops',community:'Community & entertainment',services:'Civic & medical buildings',structures:'Building shells',nature:'Trees, plants & rocks',terrain:'Terrain & outdoor layouts',seating:'Seats & sofas',lighting:'Lights & lamps',storage:'Storage & workspaces',doors:'Doors, walls & elevators',furnishings:'Furniture & decor',ranged:'Ranged weapons',melee:'Melee weapons',explosives:'Explosives & hazards',weapons:'Other combat gear',construction:'Construction tools',utilities:'Utility equipment',healing:'Healing & recovery',food:'Food & hydration',characters:'Avatars & characters',creatures:'Pets, creatures & enemies',clothing:'Clothing & accessories',vehicles:'Ground vehicles',aircraft:'Aircraft & mobility',plots:'Land deeds & plots',maps:'Maps & environments',portals:'Portals & travel points',quests:'Quests & NPC interactions',materials:'Building supplies',props:'General props',mixed:'Mixed bundle',timber:'Wood & timber',metals:'Metals & alloys',glass:'Glass, crystal & ice',masonry:'Bricks, stone & cement','event-building':'Stages & event pieces',structural:'Walls, floors & stairs',fabric:'Fabric & soft materials',headwear:'Hats & headwear',jewelry:'Jewelry & accessories',outfits:'Clothing & outfits',beds:'Beds & resting places',watercraft:'Boats & watercraft'})[id]||id;
function metadata(item){const nested=item.asset||item.model||{},category=item.itemCategory||(['Builder assets','Player items','Custom items','Models'].includes(item.category)?nested.category||nested.builder_category||item.category:item.category);return {...nested,...item,category,configuration:{...item.asset?.configuration,...item.configuration},function_data:{...item.asset?.function_data,...item.function_data,...item.gameplay}};}
function nativeId(item){const explicit=item.function_data?.device||item.buildAssetId||item.function_data?.buildAssetId||item.configuration?.buildAssetId;if(explicit)return explicit;const sku=String(item.sku||item.economySku||item.itemId||item.id||'');return [...Object.keys(INTERACTIVE_DEVICES),...Object.keys(ENTERABLE_BUILDINGS)].find(id=>sku.endsWith(id))||sku.replace(/^economy:/,'').replace(/^backpack:(?:backpack-)?/,'');}
export function marketFacets(record={}){
 const item=metadata(record),id=nativeId(item),device=INTERACTIVE_DEVICES[id],building=ENTERABLE_BUILDINGS[id],category=marketCategory({...item,...((device||building)?{buildAssetId:id}:{})}),text=[id,item.name,item.itemName,item.description,item.sellerName,item.category,item.type,item.assetType,item.function_data?.behavior].filter(Boolean).join(' ').toLowerCase();
 const uses=new Set();let subcategory='props';
 const assign=(sub,...tags)=>{subcategory=sub;tags.forEach(tag=>uses.add(tag));};
 if(Array.isArray(item.entries)&&item.entries.length){const entries=item.entries.map(marketFacets),types=new Set(entries.map(entry=>entry.subcategory));assign(types.size===1?entries[0].subcategory:'mixed',...entries.flatMap(entry=>entry.uses));}
 else if(device){
  if(device.kind==='arcade')assign(['blackjack','highlow'].includes(device.game)?'card-games':['snake','pong','breakout','maze'].includes(device.game)?'retro-games':'puzzles','play','build');
  else if(['poker','slots','trivia'].includes(device.kind))assign(device.kind==='poker'?'card-games':device.kind,'play','build');
  else if(device.kind==='market')assign('shopping','trade','build');else assign(device.kind==='video'?'video':device.kind==='audio'?'audio':'displays','media','build');
 }else if(building)assign(({Hospitality:'hospitality',Commerce:'commerce',Industrial:'industrial',Community:'community',Entertainment:'community',Services:'services'})[building.category]||'structures','build','decorate','quest');
 else if(/teleport|portal|gateway/.test(text))assign('portals','travel','build');
 else if(/quest|dialogue|npc|patrol/.test(text)&&!['vehicles','flight'].includes(category))assign('quests','quest','build');
 else if(category==='fitness')assign(/boxing|heavy-bag/.test(text)?'boxing':/bench-press|deadlift|power-rack|dumbbell|plate-tree|barbell/.test(text)?'strength':/treadmill|rower|bike/.test(text)?'cardio':/agility|rope|cone|hurdle/.test(text)?'movement':/balance|recovery|roller/.test(text)?'recovery':'gym','build','decorate',...(/boxing|bench-press|deadlift|rower|rope|agility|balance/.test(text)?['play']:[]));
 else if(category==='weapons')assign(/dynamite|grenade|explos|mine|toxin|flame/.test(text)?'explosives':/sword|bat|blade|axe|melee/.test(text)?'melee':/laser|pistol|rifle|shotgun|sniper|blaster|bow|taser|gun/.test(text)?'ranged':'weapons','combat','wear');
 else if(category==='tools')assign(/brick|paint|spray|repair|recycler|build/.test(text)?'construction':'utilities','build',...(/heal|medkit|shield/.test(text)?['restore','combat']:[]));
 else if(category==='materials'&&item.buildingType==='entertainment')assign('event-building','build','decorate','play');
 else if(category==='materials')assign(/wall|floor|step|stair|door|window|roof|beam|column|truss|wedge|baseplate|plate/.test(text)?'structural':/wood|timber/.test(text)?'timber':/metal|copper|gold|steel|iron|chrome/.test(text)?'metals':/glass|crystal|ice/.test(text)?'glass':/fabric|cloth|rubber|wool/.test(text)?'fabric':/brick|stud|stone|cement|marble|granite|concrete/.test(text)?'masonry':'materials','build');
 else if(category==='care')assign(/food|water|drink|hydr|nutrition/.test(text)?'food':'healing','restore');
 else if(category==='avatars')assign('characters','avatar','quest');
 else if(category==='pets')assign('creatures','quest','decorate');
 else if(category==='wearables')assign(/hat|cap|helmet|hood|headphone/.test(text)?'headwear':/ring|necklace|chain|bracelet|jewel/.test(text)?'jewelry':/shirt|pant|trouser|dress|jacket|shoe|outfit/.test(text)?'outfits':'clothing','wear','avatar');
 else if(category==='flight'||category==='vehicles')assign(category==='flight'||!!AIRCRAFT_TYPES[id]||/aircraft|plane|helicopter|jetpack|rocket/.test(text)?'aircraft':/boat|ship|watercraft|yacht|skiff/.test(text)?'watercraft':'vehicles',category==='flight'||!!AIRCRAFT_TYPES[id]||/aircraft|plane|helicopter|jetpack|rocket/.test(text)?'fly':'drive','travel');
 else if(category==='lands')assign(/deed|plot|entitle/.test(text)?'plots':'maps','travel','build');
 else if(/tree|plant|flower|rock|mushroom|bush|cactus|pond|garden/.test(text))assign('nature','decorate','build');
 else if(/terrain|landscape/.test(text))assign('terrain','build','travel');
 else if(/bed/.test(text))assign('beds','build','decorate');
 else if(/chair|sofa|seat|pillow|bench/.test(text))assign('seating','build','decorate');
 else if(/lamp|light|beacon/.test(text))assign('lighting','build','decorate');
 else if(/shelf|wardrobe|crate|desk|storage/.test(text))assign('storage','build','decorate');
 else if(/door|wall|roof|window|elevator/.test(text))assign('doors','build');
 else if(category==='furniture')assign('furnishings','build','decorate');
 else if(category==='arcade')assign('mixed','play','build');
 else assign('props','decorate','build');
 return {category,subcategory,subcategoryLabel:label(subcategory),uses:[...uses],search:[text,label(subcategory),...[...uses].map(use=>MARKET_USE_CASES[use])].join(' ').toLowerCase()};
}
export function marketSubcategoryOptions(items,category=''){
 const counts=new Map();for(const item of items){const facet=marketFacets(item);if(category&&facet.category!==category)continue;const current=counts.get(facet.subcategory)||{id:facet.subcategory,label:facet.subcategoryLabel,count:0};current.count++;counts.set(current.id,current);}return [...counts.values()].sort((a,b)=>a.label.localeCompare(b.label));
}
export function matchesMarketFilters(item,{category='',subcategory='',uses=[],query='',ownership=''}={}){
 const facts=marketFacets(item);return (!category||facts.category===category)&&(!subcategory||facts.subcategory===subcategory)&&(!uses.length||uses.some(use=>facts.uses.includes(use)))&&(!query||facts.search.includes(query.toLowerCase()))&&(!ownership||(ownership==='owned'?Boolean(item.owned):!item.owned));
}
